import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanResolve } from "@/lib/permissions";
import { recordStatusChange, writeAudit } from "@/lib/tickets/audit";
import { notifyResolved } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbTicket } from "@/types/db";

const schema = z.object({ resolutionNote: z.string().min(3, "Describe how it was resolved").max(2000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    assertCanResolve(user);
    const { resolutionNote } = schema.parse(await req.json());
    const db = supabaseAdmin();

    const { data: ticket, error } = await db.from("tickets").select("*").eq("id", params.id).single();
    if (error || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await db
      .from("tickets")
      .update({ status: "RESOLVED", resolution_note: resolutionNote, resolved_at: now, updated_at: now })
      .eq("id", ticket.id)
      .select("*")
      .single();
    if (updateErr) throw new Error(updateErr.message);

    await recordStatusChange(db, { ticketId: ticket.id, changedBy: user.id, from: ticket.status, to: "RESOLVED", note: resolutionNote });
    await writeAudit(db, { actorId: user.id, action: "RESOLVE", objectType: "ticket", objectId: ticket.id, newValue: { resolutionNote } });

    const { data: requester } = await db.from("users").select("*").eq("id", ticket.requester_id).single();
    if (requester) await notifyResolved(db, updated as DbTicket, requester, resolutionNote);

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
