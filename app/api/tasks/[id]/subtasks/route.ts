import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanManageTicket } from "@/lib/permissions";
import { notifyProjectSubtaskAssigned } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbProjectTask, DbProjectSubtask, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

const createSubtaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().max(2000).optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional() // YYYY-MM-DD
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const { data: subtasks, error } = await db
      .from("project_subtasks")
      .select("*")
      .eq("task_id", params.id)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    // Fetch assignees
    const userIds = Array.from(
      new Set(
        (subtasks ?? [])
          .flatMap((s: any) => [s.assigned_to_id, s.completed_by_id, s.created_by_id])
          .filter(Boolean)
      )
    );

    let usersMap = new Map();
    if (userIds.length > 0) {
      const { data: users } = await db.from("users").select("*").in("id", userIds);
      usersMap = new Map((users ?? []).map((u: any) => [u.id, u]));
    }

    const enriched = (subtasks ?? []).map((s: any) => ({
      ...s,
      assigned_to: s.assigned_to_id ? usersMap.get(s.assigned_to_id) || null : null,
      completed_by: s.completed_by_id ? usersMap.get(s.completed_by_id) || null : null,
      created_by: s.created_by_id ? usersMap.get(s.created_by_id) || null : null
    }));

    return NextResponse.json({ subtasks: enriched });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const body = createSubtaskSchema.parse(await req.json());

    // Verify task exists
    const { data: task, error: taskErr } = await db
      .from("project_tasks")
      .select("*")
      .eq("id", params.id)
      .single();

    if (taskErr || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Default assignee to task's assigned technician if not specified
    let targetAssigneeId = body.assignedToId;
    if (!targetAssigneeId) {
      if (task.assigned_to_id) {
        targetAssigneeId = task.assigned_to_id;
      } else if (task.assigned_technician_ids && task.assigned_technician_ids.length > 0) {
        targetAssigneeId = task.assigned_technician_ids[0];
      }
    }

    // Default due date to today (YYYY-MM-DD)
    const todayStr = new Date().toISOString().split("T")[0];
    const finalDueDate = body.dueDate && body.dueDate.trim().length > 0 ? body.dueDate.trim() : todayStr;

    const { data: subtask, error: insertErr } = await db
      .from("project_subtasks")
      .insert({
        task_id: task.id,
        title: body.title,
        description: body.description || null,
        assigned_to_id: targetAssigneeId || null,
        due_date: finalDueDate,
        status: "PENDING",
        created_by_id: user.id
      })
      .select("*")
      .single();

    if (insertErr || !subtask) {
      throw new Error(insertErr?.message || "Failed to create sub-task");
    }

    let assignedTechUser: DbUser | null = null;
    if (targetAssigneeId) {
      const { data: tech } = await db.from("users").select("*").eq("id", targetAssigneeId).single();
      if (tech) {
        assignedTechUser = tech as DbUser;
        // Send Telegram notification to assigned technician
        await notifyProjectSubtaskAssigned(db, task as DbProjectTask, subtask as DbProjectSubtask, assignedTechUser, user);
      }
    }

    const enrichedSubtask = {
      ...subtask,
      assigned_to: assignedTechUser,
      created_by: user
    };

    return NextResponse.json({ subtask: enrichedSubtask }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

