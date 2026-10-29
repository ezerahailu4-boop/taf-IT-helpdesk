import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanManageTicket } from "@/lib/permissions";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

// Maximum file size: 20 MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    // Verify task exists
    const { data: task, error: taskErr } = await db
      .from("project_tasks")
      .select("id")
      .eq("id", params.id)
      .single();

    if (taskErr || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const reportId = formData.get("reportId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Fallback file type checking using file extension if mime type is empty or generic octet-stream
    let fileType = file.type;
    const fileName = file.name || "attachment";
    const ext = fileName.split(".").pop()?.toLowerCase();

    if (!fileType || fileType === "application/octet-stream") {
      if (ext === "pdf") fileType = "application/pdf";
      else if (ext === "docx") fileType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      else if (ext === "doc") fileType = "application/msword";
      else if (ext === "jpg" || ext === "jpeg") fileType = "image/jpeg";
      else if (ext === "png") fileType = "image/png";
      else if (ext === "webp") fileType = "image/webp";
      else if (ext === "gif") fileType = "image/gif";
    }

    if (!ALLOWED_MIME_TYPES.has(fileType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF, DOCX/DOC, or photo (JPG/PNG/WEBP)." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 20MB limit. Please compress or select a smaller file." },
        { status: 400 }
      );
    }

    // Convert arrayBuffer to base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Data = buffer.toString("base64");

    const { data: inserted, error: insertErr } = await db
      .from("project_task_attachments")
      .insert({
        task_id: params.id,
        report_id: typeof reportId === "string" ? reportId : null,
        uploaded_by: user.id,
        file_name: fileName,
        file_type: fileType,
        file_size: file.size,
        file_data: base64Data
      })
      .select("id, task_id, report_id, uploaded_by, file_name, file_type, file_size, created_at")
      .single();

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message || "Failed to save attachment");
    }

    const attachmentPayload = {
      id: inserted.id,
      name: inserted.file_name,
      type: inserted.file_type,
      size: inserted.file_size,
      url: `/api/tasks/attachments/${inserted.id}`
    };

    return NextResponse.json({ attachment: attachmentPayload }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

