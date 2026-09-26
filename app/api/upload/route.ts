import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain"
]);
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const BUCKET = "ticket-attachments";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const form = await req.formData();
    const file = form.get("file");
    const ticketId = form.get("ticketId");
    const commentId = form.get("commentId");

    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (typeof ticketId !== "string") return NextResponse.json({ error: "ticketId is required" }, { status: 400 });

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "That file type isn't supported" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large (15MB max)" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: ticket } = await db.from("tickets").select("id, requester_id, assigned_technician_id").eq("id", ticketId).single();
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    const allowed = ticket.requester_id === user.id || ticket.assigned_technician_id === user.id || user.role === "ADMIN" || user.role === "TECHNICIAN";
    if (!allowed) return NextResponse.json({ error: "You cannot attach files to this ticket" }, { status: 403 });

    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${ticketId}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: attachment, error: insertErr } = await db
      .from("ticket_attachments")
      .insert({
        ticket_id: ticketId,
        comment_id: typeof commentId === "string" ? commentId : null,
        uploaded_by: user.id,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: path
      })
      .select("*")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
