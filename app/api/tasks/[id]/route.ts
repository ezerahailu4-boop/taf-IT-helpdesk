import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanManageTicket, assertIsAdmin } from "@/lib/permissions";
import { notifyProjectTaskAssigned } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbProjectTask, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

const patchTaskSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  goal: z.string().min(5).max(3000).optional(),
  deadline: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  completionNote: z.string().max(2000).optional()
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

    // Fetch all involved users
    const userIds = Array.from(
      new Set(
        [
          task.assigned_to_id,
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

    const enrichedTask = {
      ...task,
      assigned_to: task.assigned_to_id ? usersMap.get(task.assigned_to_id) || null : null,
      created_by: task.created_by_id ? usersMap.get(task.created_by_id) || null : null
    };

    const reports = (rawReports ?? []).map((r: any) => ({
      ...r,
      technician: r.technician_id ? usersMap.get(r.technician_id) || null : null
    }));

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

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.goal !== undefined) updates.goal = body.goal.trim();
    if (body.deadline !== undefined) updates.deadline = new Date(body.deadline).toISOString();
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "COMPLETED") {
        updates.completed_at = new Date().toISOString();
        updates.progress = 100;
        if (body.completionNote) updates.completion_note = body.completionNote;
      }
    }
    if (body.progress !== undefined) {
      updates.progress = body.progress;
      if (body.progress === 100 && updates.status !== "COMPLETED") {
        updates.status = "COMPLETED";
        updates.completed_at = new Date().toISOString();
      }
    }
    if (body.assignedToId !== undefined) {
      updates.assigned_to_id = body.assignedToId;
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

    // If reassigned to a new technician, notify the new technician
    if (body.assignedToId && body.assignedToId !== existing.assigned_to_id) {
      const { data: newTech } = await db.from("users").select("*").eq("id", body.assignedToId).single();
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
