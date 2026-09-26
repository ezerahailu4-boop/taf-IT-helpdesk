import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanCloseOrReopen } from "@/lib/permissions";
import { recordStatusChange, writeAudit } from "@/lib/tickets/audit";
import { errorResponse } from "@/lib/apiError";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();
    const { data: ticket, error } = await db.from("tickets").select("*").eq("id", params.id).single();
    if (error || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    assertCanCloseOrReopen(user, ticket);

    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await db
      .from("tickets")
      .update({ status: "CLOSED", closed_at: now, closed_by: user.id, updated_at: now })
      .eq("id", ticket.id)
      .select("*")
      .single();
    if (updateErr) throw new Error(updateErr.message);

    await recordStatusChange(db, { ticketId: ticket.id, changedBy: user.id, from: ticket.status, to: "CLOSED" });
    await writeAudit(db, { actorId: user.id, action: "CLOSE", objectType: "ticket", objectId: ticket.id });

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
