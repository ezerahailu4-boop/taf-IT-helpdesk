import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanManageTicket } from "@/lib/permissions";
import { recordStatusChange, writeAudit } from "@/lib/tickets/audit";
import { notifyTicketAssigned } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbTicket } from "@/types/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const { data: ticket, error } = await db.from("tickets").select("*").eq("id", params.id).single();
    if (error || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    if (ticket.assigned_technician_id && ticket.assigned_technician_id !== user.id) {
      return NextResponse.json({ error: "This ticket is already taken" }, { status: 409 });
    }

    const newStatus = ticket.status === "NEW" ? "ASSIGNED" : ticket.status;
    const { data: updated, error: updateErr } = await db
      .from("tickets")
      .update({ assigned_technician_id: user.id, status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", ticket.id)
      .select("*")
      .single();
    if (updateErr) throw new Error(updateErr.message);

    if (newStatus !== ticket.status) {
      await recordStatusChange(db, { ticketId: ticket.id, changedBy: user.id, from: ticket.status, to: newStatus });
    }
    await writeAudit(db, { actorId: user.id, action: "TAKE", objectType: "ticket", objectId: ticket.id, newValue: { assigned_technician_id: user.id } });

    const { data: requester } = await db.from("users").select("*").eq("id", ticket.requester_id).single();
    if (requester) await notifyTicketAssigned(db, updated as DbTicket, requester, user);

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
