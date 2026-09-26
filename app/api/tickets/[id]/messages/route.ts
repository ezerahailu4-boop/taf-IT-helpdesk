import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanComment, assertCanSeeInternalNotes } from "@/lib/permissions";
import { notifyReply } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbTicket } from "@/types/db";

const schema = z.object({
  message: z.string().min(1).max(4000),
  internal: z.boolean().default(false)
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();
    const body = schema.parse(await req.json());

    const { data: ticket, error } = await db.from("tickets").select("*").eq("id", params.id).single();
    if (error || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    if (body.internal) {
      assertCanSeeInternalNotes(user); // only technicians/admins may write internal notes
      const { data: note, error: noteErr } = await db
        .from("ticket_internal_notes")
        .insert({ ticket_id: ticket.id, author_id: user.id, note: body.message })
        .select("*")
        .single();
      if (noteErr) throw new Error(noteErr.message);
      return NextResponse.json({ note }, { status: 201 });
    }

    assertCanComment(user, ticket as DbTicket);
    const senderRole = user.role === "EMPLOYEE" ? "EMPLOYEE" : user.role === "TECHNICIAN" ? "TECHNICIAN" : "ADMIN";

    const { data: comment, error: commentErr } = await db
      .from("ticket_comments")
      .insert({ ticket_id: ticket.id, sender_id: user.id, sender_role: senderRole, message: body.message })
      .select("*")
      .single();
    if (commentErr) throw new Error(commentErr.message);

    // Notify the "other side" of the conversation.
    if (senderRole === "EMPLOYEE" && ticket.assigned_technician_id) {
      const { data: tech } = await db.from("users").select("*").eq("id", ticket.assigned_technician_id).single();
      if (tech) await notifyReply(db, ticket as DbTicket, tech, "Employee", body.message);
    } else if (senderRole !== "EMPLOYEE") {
      const { data: requester } = await db.from("users").select("*").eq("id", ticket.requester_id).single();
      if (requester) await notifyReply(db, ticket as DbTicket, requester, user.first_name ?? "IT Support", body.message);
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
