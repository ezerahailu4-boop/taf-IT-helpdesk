import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  assertCanViewTicket, assertCanManageTicket, assertCanSeeInternalNotes, assertCanSetPriority
} from "@/lib/permissions";
import { recordStatusChange, writeAudit } from "@/lib/tickets/audit";
import { notifyStatusChange, notifyTicketAssigned, notifyResolved } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbTicket, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();

    const { data: ticket, error } = await db.from("tickets").select("*").eq("id", params.id).single();
    if (error || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    assertCanViewTicket(user, ticket as DbTicket);

    const isStaff = user.role === "TECHNICIAN" || user.role === "ADMIN";

    const [
      { data: comments },
      { data: attachments },
      { data: history },
      { data: requester },
      { data: technician },
      { data: asset },
      techsRes,
      catsRes
    ] = await Promise.all([
      db.from("ticket_comments").select("*").eq("ticket_id", ticket.id).order("created_at"),
      db.from("ticket_attachments").select("*").eq("ticket_id", ticket.id),
      db.from("ticket_status_history").select("*").eq("ticket_id", ticket.id).order("created_at"),
      db.from("users").select("id, telegram_id, first_name, last_name, photo_url, telegram_username, department_id, location_id, phone").eq("id", ticket.requester_id).single(),
      ticket.assigned_technician_id
        ? db.from("users").select("id, first_name, last_name, photo_url").eq("id", ticket.assigned_technician_id).single()
        : Promise.resolve({ data: null }),
      ticket.asset_id
        ? db.from("assets").select("id, asset_tag, type, brand, model").eq("id", ticket.asset_id).single()
        : Promise.resolve({ data: null }),
      isStaff ? db.from("users").select("id, first_name, last_name, role").in("role", ["TECHNICIAN", "ADMIN"]).eq("is_active", true) : Promise.resolve({ data: [] }),
      isStaff ? db.from("categories").select("id, key, label, icon").eq("is_active", true) : Promise.resolve({ data: [] })
    ]);

    let internalNotes: unknown[] = [];
    try {
      assertCanSeeInternalNotes(user);
      const { data } = await db.from("ticket_internal_notes").select("*").eq("ticket_id", ticket.id).order("created_at");
      internalNotes = data ?? [];
    } catch {
      internalNotes = [];
    }

    return NextResponse.json({
      ticket,
      comments: comments ?? [],
      attachments: attachments ?? [],
      history: history ?? [],
      internalNotes,
      requester,
      technician,
      asset: asset ?? null,
      availableTechnicians: techsRes.data ?? [],
      categories: catsRes.data ?? []
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const patchSchema = z.object({
  status: z.enum(["NEW","ASSIGNED","IN_PROGRESS","WAITING_FOR_USER","WAITING_FOR_ADMIN","RESOLVED","CLOSED","REOPENED","CANCELLED"]).optional(),
  priority: z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).optional(),
  assignedTechnicianId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().optional(),
  categoryKey: z.string().optional(),
  resolutionNote: z.string().optional()
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();
    const body = patchSchema.parse(await req.json());

    const { data: ticket, error } = await db.from("tickets").select("*").eq("id", params.id).single();
    if (error || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    assertCanManageTicket(user);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.priority) {
      assertCanSetPriority(user, body.priority, true);
      update.priority = body.priority;
    }
    if (body.categoryId) {
      update.category_id = body.categoryId;
    }
    if (body.assignedTechnicianId !== undefined) {
      update.assigned_technician_id = body.assignedTechnicianId;
      if (body.assignedTechnicianId && ticket.status === "NEW") update.status = "ASSIGNED";
    }
    if (body.status) {
      update.status = body.status;
      if (body.status === "RESOLVED") {
        update.resolved_at = new Date().toISOString();
        if (body.resolutionNote) update.resolution_note = body.resolutionNote;
      }
    }

    const { data: updated, error: updateErr } = await db
      .from("tickets").update(update).eq("id", ticket.id).select("*").single();
    if (updateErr) throw new Error(updateErr.message);

    if (body.status && body.status !== ticket.status) {
      await recordStatusChange(db, { ticketId: ticket.id, changedBy: user.id, from: ticket.status, to: body.status });
      const { data: requester } = await db.from("users").select("*").eq("id", ticket.requester_id).single();
      if (requester) {
        if (body.status === "RESOLVED") {
          await notifyResolved(db, updated as DbTicket, requester, (body.resolutionNote as string) || "Your issue has been marked resolved by our IT technician.");
        } else {
          await notifyStatusChange(db, updated as DbTicket, requester, ticket.status, body.status);
        }
      }
    }

    if (body.assignedTechnicianId && body.assignedTechnicianId !== ticket.assigned_technician_id) {
      const [{ data: requester }, { data: tech }] = await Promise.all([
        db.from("users").select("*").eq("id", ticket.requester_id).single(),
        db.from("users").select("*").eq("id", body.assignedTechnicianId).single()
      ]);
      if (requester && tech) await notifyTicketAssigned(db, updated as DbTicket, requester, tech);
    }

    await writeAudit(db, {
      actorId: user.id, action: "UPDATE", objectType: "ticket", objectId: ticket.id,
      previousValue: ticket, newValue: updated
    });

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
