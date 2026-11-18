import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanManageTicket } from "@/lib/permissions";
import { notifyProjectSubtaskCompleted } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbProjectTask, DbProjectSubtask, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

const patchSubtaskSchema = z.object({
  status: z.enum(["PENDING", "COMPLETED"]).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional(),
  progressWeight: z.coerce.number().int().min(0).max(100).optional()
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; subtaskId: string } }
) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const body = patchSubtaskSchema.parse(await req.json());

    // 1. Fetch subtask & parent task
    const { data: subtask, error: fetchErr } = await db
      .from("project_subtasks")
      .select("*")
      .eq("id", params.subtaskId)
      .eq("task_id", params.id)
      .single();

    if (fetchErr || !subtask) {
      return NextResponse.json({ error: "Sub-task not found" }, { status: 404 });
    }

    const { data: task } = await db
      .from("project_tasks")
      .select("*")
      .eq("id", params.id)
      .single();

    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now
    };

    const wasCompleted = subtask.status === "COMPLETED";
    const nextStatus = body.status ?? subtask.status;
    const isNowCompleted = nextStatus === "COMPLETED";
    const newlyCompleted = !wasCompleted && isNowCompleted;

    const oldWeight = Number(subtask.progress_weight ?? 10);
    const newWeight = body.progressWeight !== undefined ? body.progressWeight : oldWeight;

    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "COMPLETED") {
        updates.completed_at = now;
        updates.completed_by_id = user.id;
      } else {
        updates.completed_at = null;
        updates.completed_by_id = null;
      }
    }

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.assignedToId !== undefined) updates.assigned_to_id = body.assignedToId;
    if (body.dueDate !== undefined) updates.due_date = body.dueDate;
    if (body.progressWeight !== undefined) updates.progress_weight = newWeight;

    const { data: updatedSubtask, error: updateErr } = await db
      .from("project_subtasks")
      .update(updates)
      .eq("id", params.subtaskId)
      .select("*")
      .single();

    if (updateErr || !updatedSubtask) {
      throw new Error(updateErr?.message || "Failed to update sub-task");
    }

    // 1b. Apply weight delta to parent project_tasks.progress automatically
    let updatedTask = task;
    if (task) {
      let progressDelta = 0;
      if (!wasCompleted && isNowCompleted) {
        progressDelta = newWeight;
      } else if (wasCompleted && !isNowCompleted) {
        progressDelta = -oldWeight;
      } else if (wasCompleted && isNowCompleted && body.progressWeight !== undefined) {
        progressDelta = newWeight - oldWeight;
      }

      if (progressDelta !== 0) {
        const currentProgress = Number(task.progress ?? 0);
        const maxCap = user.role === "ADMIN" ? 100 : 90;
        const nextProgress =
          progressDelta > 0
            ? Math.max(currentProgress, Math.min(maxCap, currentProgress + progressDelta))
            : Math.max(0, currentProgress + progressDelta);

        const taskUpdates: Record<string, any> = {
          progress: nextProgress,
          updated_at: now
        };
        if (task.status === "PENDING" && nextProgress > 0) {
          taskUpdates.status = "IN_PROGRESS";
        }

        const { data: savedTask } = await db
          .from("project_tasks")
          .update(taskUpdates)
          .eq("id", params.id)
          .select("*")
          .single();

        if (savedTask) {
          updatedTask = savedTask;
        }
      }
    }

    // 2. Fetch all subtasks for stats
    const { data: allSubtasks } = await db
      .from("project_subtasks")
      .select("id, status")
      .eq("task_id", params.id);

    const totalSubtasks = (allSubtasks ?? []).length;
    const completedSubtasks = (allSubtasks ?? []).filter((s: any) => s.status === "COMPLETED").length;
    const completionPercentage = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

    // Send completion notification to admins if completed by technician
    if (newlyCompleted && updatedTask) {
      await notifyProjectSubtaskCompleted(db, updatedTask as DbProjectTask, updatedSubtask as DbProjectSubtask, user);
    }

    // Enrich assignee and completed_by
    const userIds = [updatedSubtask.assigned_to_id, updatedSubtask.completed_by_id].filter(Boolean);
    let usersMap = new Map();
    if (userIds.length > 0) {
      const { data: users } = await db.from("users").select("*").in("id", userIds);
      usersMap = new Map((users ?? []).map((u: any) => [u.id, u]));
    }

    const enriched = {
      ...updatedSubtask,
      assigned_to: updatedSubtask.assigned_to_id ? usersMap.get(updatedSubtask.assigned_to_id) || null : null,
      completed_by: updatedSubtask.completed_by_id ? usersMap.get(updatedSubtask.completed_by_id) || null : null
    };

    return NextResponse.json({
      subtask: enriched,
      task: updatedTask,
      stats: {
        total: totalSubtasks,
        completed: completedSubtasks,
        percentage: completionPercentage
      }
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; subtaskId: string } }
) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const { error } = await db
      .from("project_subtasks")
      .delete()
      .eq("id", params.subtaskId)
      .eq("task_id", params.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

