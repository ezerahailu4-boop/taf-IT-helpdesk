import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordStatusChange, writeAudit } from "@/lib/tickets/audit";
import { notifyTicketRated } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().nullable()
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const body = rateSchema.parse(await req.json());
    const db = supabaseAdmin();

    const { data: ticket, error } = await db.from("tickets").select("*").eq("id", params.id).single();
    if (error || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    // Requester or Admin can submit rating
    const isOwner = ticket.requester_id === user.id;
    const isAdmin = user.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Only the ticket requester can submit a satisfaction rating" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const shouldClose = ticket.status === "RESOLVED";
    const updatePayload: Record<string, unknown> = {
      rating: body.rating,
      rating_comment: body.comment?.trim() || null,
      rated_at: now,
      updated_at: now
    };

    if (shouldClose) {
      updatePayload.status = "CLOSED";
      updatePayload.closed_at = now;
      updatePayload.closed_by = user.id;
    }

    const { data: updated, error: updateErr } = await db
      .from("tickets")
      .update(updatePayload)
      .eq("id", ticket.id)
      .select("*")
      .single();

    if (updateErr) throw new Error(updateErr.message);

    if (shouldClose) {
      await recordStatusChange(db, {
        ticketId: ticket.id,
        changedBy: user.id,
        from: ticket.status,
        to: "CLOSED",
        note: `Closed with ${body.rating}-star rating`
      });
    }

    await writeAudit(db, {
      actorId: user.id,
      action: "RATE",
      objectType: "ticket",
      objectId: ticket.id,
      newValue: { rating: body.rating, comment: body.comment }
    });

    // Notify assigned technician of their CSAT score
    if (ticket.assigned_technician_id) {
      const { data: tech } = await db.from("users").select("*").eq("id", ticket.assigned_technician_id).single();
      if (tech) {
        const requesterName = `${user.first_name ?? "Employee"} ${user.last_name ?? ""}`.trim() || "User";
        await notifyTicketRated(db, updated, body.rating, body.comment || null, requesterName, tech);
      }
    }

    return NextResponse.json({ success: true, ticket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
