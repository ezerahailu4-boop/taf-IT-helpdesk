import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanManageTicket, assertIsAdmin } from "@/lib/permissions";
import {
  notifyProjectTaskAssigned,
  notifyProjectTaskAwaitingSignOff,
  notifyProjectTaskApproved100,
  notifyProjectTaskRevisionsRequested
} from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbProjectTask, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

const patchTaskSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  goal: z.string().min(5).max(3000).optional(),
  deadline: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  category: z.enum(["PLANNED", "UNPLANNED"]).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "BLOCKED", "WAITING_FOR_ADMIN", "COMPLETED", "CANCELLED"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  assignedTechnicianIds: z.array(z.string().uuid()).optional(),
  completionNote: z.string().max(2000).optional(),
  adminAnswer: z.enum(["yes", "no"]).optional()
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const { data: task, error } = await db
      .from("project_tasks")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Fetch reports
    const { data: rawReports } = await db
      .from("project_task_reports")
      .select("*")
      .eq("task_id", params.id)
      .order("created_at", { ascending: false });

    const assignedTechIds: string[] = (task.assigned_technician_ids && task.assigned_technician_ids.length > 0)
      ? task.assigned_technician_ids
      : (task.assigned_to_id ? [task.assigned_to_id] : []);

    // Fetch all involved users
    const userIds = Array.from(
      new Set(
        [
          task.assigned_to_id,
          ...assignedTechIds,
          task.created_by_id,
          ...(rawReports ?? []).map((r: any) => r.technician_id)
        ].filter(Boolean)
      )
    );

    let usersMap = new Map();
    if (userIds.length > 0) {
      const { data: users } = await db.from("users").select("*").in("id", userIds);
      usersMap = new Map((users ?? []).map((u: any) => [u.id, u]));
    }

    const assignedTechnicians = assignedTechIds.map((id) => usersMap.get(id)).filter(Boolean);

    const enrichedTask = {
      ...task,
      assigned_to: task.assigned_to_id ? usersMap.get(task.assigned_to_id) || null : (assignedTechnicians[0] || null),
      assigned_technicians: assignedTechnicians,
      created_by: task.created_by_id ? usersMap.get(task.created_by_id) || null : null
    };

    const reports = (rawReports ?? []).map((r: any) => {
      let attachments: any[] = [];
      try {
        attachments = typeof r.attachments === "string" ? JSON.parse(r.attachments) : (r.attachments || []);
      } catch {
        attachments = [];
      }
      return {
        ...r,
        attachments,
        technician: r.technician_id ? usersMap.get(r.technician_id) || null : null
      };
    });

    return NextResponse.json({ task: enrichedTask, reports });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const body = patchTaskSchema.parse(await req.json());

    const { data: existing, error: fetchErr } = await db
      .from("project_tasks")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const isAdmin = user.role === "ADMIN";
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.goal !== undefined) updates.goal = body.goal.trim();
    if (body.deadline !== undefined) updates.deadline = new Date(body.deadline).toISOString();
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.category !== undefined) updates.category = body.category;

    let isManagerApprovingCompletion = false;
    let isTechnicianRequestingCompletion = false;
    let isManagerRequestingRevisions = false;

    // Check status & progress requests
    const requestedStatus = body.status;
    const requestedProgress = body.progress;
    const adminAnswer = body.adminAnswer;

    if (adminAnswer === "yes") {
      assertIsAdmin(user);
      updates.status = "COMPLETED";
      updates.progress = 100;
      updates.completed_at = new Date().toISOString();
      if (body.completionNote) updates.completion_note = body.completionNote;
      isManagerApprovingCompletion = true;
    } else if (adminAnswer === "no") {
      assertIsAdmin(user);
      updates.status = "IN_PROGRESS";
      updates.progress = body.progress !== undefined ? body.progress : 70;
      if (body.completionNote) updates.completion_note = body.completionNote;
      isManagerRequestingRevisions = true;
    } else if (requestedStatus === "WAITING_FOR_ADMIN") {
      updates.status = "WAITING_FOR_ADMIN";
      updates.progress = 90;
      if (body.completionNote) updates.completion_note = body.completionNote;
      isTechnicianRequestingCompletion = true;
    } else if (requestedStatus === "COMPLETED" || requestedProgress === 100) {
      if (isAdmin) {
        updates.status = "COMPLETED";
        updates.progress = 100;
        updates.completed_at = new Date().toISOString();
        if (body.completionNote) updates.completion_note = body.completionNote;
        isManagerApprovingCompletion = true;
      } else {
        // Assigned technician or tech role cannot mark completed directly! Must go through Admin review!
        updates.status = "WAITING_FOR_ADMIN";
        updates.progress = 90;
        if (body.completionNote) updates.completion_note = body.completionNote;
        isTechnicianRequestingCompletion = true;
      }
    } else {
      if (requestedStatus !== undefined) {
        updates.status = requestedStatus;
        if (isAdmin && requestedStatus === "IN_PROGRESS" && existing.status === "WAITING_FOR_ADMIN") {
          isManagerRequestingRevisions = true;
        }
      }
      if (requestedProgress !== undefined) {
        if (!isAdmin && requestedProgress >= 100) {
          updates.status = "WAITING_FOR_ADMIN";
          updates.progress = 90;
          isTechnicianRequestingCompletion = true;
        } else {
          updates.progress = requestedProgress;
        }
      }
    }

    let newlyAssignedIds: string[] = [];
    if (body.assignedTechnicianIds !== undefined) {
      updates.assigned_technician_ids = body.assignedTechnicianIds;
      updates.assigned_to_id = body.assignedTechnicianIds[0] || null;
      const prevIds: string[] = existing.assigned_technician_ids || (existing.assigned_to_id ? [existing.assigned_to_id] : []);
      newlyAssignedIds = body.assignedTechnicianIds.filter((id: string) => !prevIds.includes(id));
    } else if (body.assignedToId !== undefined) {
      updates.assigned_to_id = body.assignedToId;
      updates.assigned_technician_ids = body.assignedToId ? [body.assignedToId] : [];
      if (body.assignedToId && body.assignedToId !== existing.assigned_to_id) {
        newlyAssignedIds = [body.assignedToId];
      }
    }
    if (body.completionNote !== undefined) {
      updates.completion_note = body.completionNote;
    }

    const { data: updated, error: updateErr } = await db
      .from("project_tasks")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();

    if (updateErr) throw new Error(updateErr.message);

    // Record report entry and send notifications
    if (isManagerApprovingCompletion) {
      const note = body.completionNote?.trim() || "Admin verified deliverables and answered YES: marked 100% completed.";
      await db.from("project_task_reports").insert({
        task_id: updated.id,
        technician_id: user.id,
        report_text: `[Admin Review: YES] ${note}`,
        progress: 100,
        status: "COMPLETED"
      });
      await notifyProjectTaskApproved100(db, updated as DbProjectTask, user, note);
    } else if (isTechnicianRequestingCompletion) {
      const note = body.completionNote?.trim() || "Technician marked task as completed. Submitted for Admin review (Yes/No).";
      await db.from("project_task_reports").insert({
        task_id: updated.id,
        technician_id: user.id,
        report_text: `[Technician Done] ${note}`,
        progress: 90,
        status: "WAITING_FOR_ADMIN"
      });
      await notifyProjectTaskAwaitingSignOff(db, updated as DbProjectTask, user, note);
    } else if (isManagerRequestingRevisions) {
      const note = body.completionNote?.trim() || "Admin answered NO: task is not completed yet. Revisions required.";
      await db.from("project_task_reports").insert({
        task_id: updated.id,
        technician_id: user.id,
        report_text: `[Admin Review: NO] ${note}`,
        progress: (updates.progress as number) ?? existing.progress ?? 70,
        status: "IN_PROGRESS"
      });
      await notifyProjectTaskRevisionsRequested(db, updated as DbProjectTask, user, note);
    }

    // Notify any newly assigned technicians
    for (const newTechId of newlyAssignedIds) {
      const { data: newTech } = await db.from("users").select("*").eq("id", newTechId).single();
      if (newTech) {
        await notifyProjectTaskAssigned(db, updated as DbProjectTask, newTech as DbUser, user);
      }
    }

    return NextResponse.json({ task: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const db = supabaseAdmin();

    const { error } = await db.from("project_tasks").delete().eq("id", params.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
