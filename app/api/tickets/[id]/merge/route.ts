import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { assertIsAdmin } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordStatusChange, writeAudit } from "@/lib/tickets/audit";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const schema = z.object({
  targetTicketNumber: z.string().min(3)
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireUser(req);
    assertIsAdmin(admin);
    const body = schema.parse(await req.json());
    const db = supabaseAdmin();

    const { data: sourceTicket, error: sErr } = await db.from("tickets").select("*").eq("id", params.id).single();
    if (sErr || !sourceTicket) return NextResponse.json({ error: "Source ticket not found" }, { status: 404 });

    // Look up target ticket by number or id
    const { data: targetTicket, error: tErr } = await db
      .from("tickets")
      .select("*")
      .or(`ticket_number.eq.${body.targetTicketNumber.trim()},id.eq.${body.targetTicketNumber.trim()}`)
      .single();

    if (tErr || !targetTicket) {
      return NextResponse.json({ error: "Target ticket to merge into was not found" }, { status: 404 });
    }

    if (targetTicket.id === sourceTicket.id) {
      return NextResponse.json({ error: "Cannot merge a ticket into itself" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 1. Close source ticket as CANCELLED/DUPLICATE
    const { data: updatedSource } = await db
      .from("tickets")
      .update({
        status: "CANCELLED",
        resolution_note: `Merged into ${targetTicket.ticket_number}`,
        closed_at: now,
        closed_by: admin.id,
        updated_at: now
      })
      .eq("id", sourceTicket.id)
      .select("*")
      .single();

    // 2. Add an internal note to the target ticket documenting the merge
    await db.from("ticket_internal_notes").insert({
      ticket_id: targetTicket.id,
      author_id: admin.id,
      note: `Merged duplicate ticket ${sourceTicket.ticket_number} ("${sourceTicket.subject}") into this ticket.`
    });

    // 3. Record status change and audit logs
    await recordStatusChange(db, {
      ticketId: sourceTicket.id,
      changedBy: admin.id,
      from: sourceTicket.status,
      to: "CANCELLED",
      note: `Merged into ${targetTicket.ticket_number}`
    });

    await writeAudit(db, {
      actorId: admin.id,
      action: "MERGE_TICKET",
      objectType: "ticket",
      objectId: sourceTicket.id,
      previousValue: { targetTicketId: targetTicket.id, targetTicketNumber: targetTicket.ticket_number }
    });

    return NextResponse.json({ success: true, source: updatedSource, target: targetTicket });
  } catch (err) {
    return errorResponse(err);
  }
}
