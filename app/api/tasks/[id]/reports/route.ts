import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanManageTicket } from "@/lib/permissions";
import { notifyProjectTaskUpdated } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbProjectTask, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

const submitReportSchema = z.object({
  reportText: z.string().min(3, "Report text must be at least 3 characters").max(4000),
  progress: z.number().min(0).max(100),
  status: z.enum(["PENDING", "IN_PROGRESS", "BLOCKED", "COMPLETED"]).default("IN_PROGRESS")
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const body = submitReportSchema.parse(await req.json());

    // 1. Fetch task
    const { data: task, error: fetchErr } = await db
      .from("project_tasks")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchErr || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const isCompleted = body.status === "COMPLETED" || body.progress === 100;
    const finalProgress = isCompleted ? 100 : body.progress;
    const finalStatus = isCompleted ? "COMPLETED" : body.status;
    const now = new Date().toISOString();

    // 2. Insert report entry
    const { data: report, error: reportErr } = await db
      .from("project_task_reports")
      .insert({
        task_id: task.id,
        technician_id: user.id,
        report_text: body.reportText.trim(),
        progress: finalProgress,
        status: finalStatus
      })
      .select(`
        *,
        technician:users!project_task_reports_technician_id_fkey(id, first_name, last_name, telegram_username, photo_url)
      `)
      .single();

    if (reportErr) throw new Error(reportErr.message);

    // 3. Update task
    const taskUpdates: Record<string, unknown> = {
      progress: finalProgress,
      status: finalStatus,
      updated_at: now
    };

    if (isCompleted) {
      taskUpdates.completed_at = now;
      taskUpdates.completion_note = body.reportText.trim();
    }

    const { data: updatedTask, error: updateErr } = await db
      .from("project_tasks")
      .update(taskUpdates)
      .eq("id", task.id)
      .select("*")
      .single();

    if (updateErr) throw new Error(updateErr.message);

    // 4. Notify Admin(s) via Telegram
    await notifyProjectTaskUpdated(db, updatedTask as DbProjectTask, user, body.reportText.trim(), isCompleted);

    return NextResponse.json({ report, task: updatedTask }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
