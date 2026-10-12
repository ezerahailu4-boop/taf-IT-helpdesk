import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanManageTicket } from "@/lib/permissions";
import {
  notifyProjectTaskUpdated,
  notifyProjectTaskAwaitingSignOff,
  notifyProjectTaskApproved100
} from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbProjectTask, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

const submitReportSchema = z.object({
  reportText: z.string().max(4000).optional().nullable(),
  progress: z.number().min(0).max(100),
  status: z.enum(["PENDING", "IN_PROGRESS", "BLOCKED", "WAITING_FOR_ADMIN", "COMPLETED"]).default("IN_PROGRESS")
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

    const isAdmin = user.role === "ADMIN";
    const wantsCompleted = body.status === "COMPLETED" || body.progress === 100;
    const wantsWaitingForAdmin = body.status === "WAITING_FOR_ADMIN";

    let finalStatus = body.status;
    let finalProgress = body.progress;
    let isTechnicianCompletion = false;
    let isManagerApproved = false;

    if (wantsWaitingForAdmin) {
      finalStatus = "WAITING_FOR_ADMIN";
      finalProgress = 90;
      isTechnicianCompletion = true;
    } else if (wantsCompleted) {
      if (isAdmin) {
        // Admin confirms/approves completed -> 100% Complete!
        finalStatus = "COMPLETED";
        finalProgress = 100;
        isManagerApproved = true;
      } else {
        // Technician says it is completed -> Task reaches 90% and awaits Admin review
        finalStatus = "WAITING_FOR_ADMIN";
        finalProgress = 90;
        isTechnicianCompletion = true;
      }
    } else {
      // Normal in-progress updates
      if (!isAdmin && finalProgress >= 100) {
        finalStatus = "WAITING_FOR_ADMIN";
        finalProgress = 90;
        isTechnicianCompletion = true;
      }
    }

    const now = new Date().toISOString();
    const effectiveReportText =
      body.reportText && body.reportText.trim().length > 0
        ? body.reportText.trim()
        : isManagerApproved
        ? "Admin verified deliverables and confirmed task is 100% completed."
        : isTechnicianCompletion
        ? "Technician completed all deliverables. Submitted to Admin for review (Is it completed? Yes/No)."
        : `Progress updated to ${finalProgress}% (${finalStatus.replace(/_/g, " ")})`;

    const initData = req.headers.get("x-telegram-init-data") || new URL(req.url).searchParams.get("initData");
    let reportingUser = user;

    // In browser demo mode (outside Telegram), if task is assigned to a technician and current user is not admin,
    // attribute the report to the assigned technician so progress updates match the assigned lead!
    if (!initData && task.assigned_to_id && !isAdmin) {
      const { data: assignedTech } = await db.from("users").select("*").eq("id", task.assigned_to_id).single();
      if (assignedTech) {
        reportingUser = assignedTech;
      }
    }

    // 2. Prevent duplicate rapid submissions (e.g. user clicked submit 4 or 5 times)
    const { data: recentDuplicate } = await db
      .from("project_task_reports")
      .select("*")
      .eq("task_id", task.id)
      .eq("progress", finalProgress)
      .eq("status", finalStatus)
      .eq("report_text", effectiveReportText)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentDuplicate) {
      const createdMs = new Date(recentDuplicate.created_at).getTime();
      if (Date.now() - createdMs < 10000) {
        return NextResponse.json({
          report: {
            ...recentDuplicate,
            technician: {
              id: reportingUser.id,
              first_name: reportingUser.first_name,
              last_name: reportingUser.last_name,
              telegram_username: reportingUser.telegram_username,
              photo_url: reportingUser.photo_url
            }
          },
          task,
          duplicatePrevented: true
        });
      }
    }

    // 3. Insert report entry
    const { data: report, error: reportErr } = await db
      .from("project_task_reports")
      .insert({
        task_id: task.id,
        technician_id: reportingUser.id,
        report_text: effectiveReportText,
        progress: finalProgress,
        status: finalStatus
      })
      .select("*")
      .single();

    if (reportErr) throw new Error(reportErr.message);

    const enrichedReport = {
      ...report,
      technician: {
        id: reportingUser.id,
        first_name: reportingUser.first_name,
        last_name: reportingUser.last_name,
        telegram_username: reportingUser.telegram_username,
        photo_url: reportingUser.photo_url
      }
    };

    // 4. Update task
    const taskUpdates: Record<string, unknown> = {
      progress: finalProgress,
      status: finalStatus,
      updated_at: now
    };

    if (isManagerApproved) {
      taskUpdates.completed_at = now;
      taskUpdates.completion_note = effectiveReportText;
    } else if (isTechnicianCompletion) {
      taskUpdates.completion_note = effectiveReportText;
    }

    const { data: updatedTask, error: updateErr } = await db
      .from("project_tasks")
      .update(taskUpdates)
      .eq("id", task.id)
      .select("*")
      .single();

    if (updateErr) throw new Error(updateErr.message);

    // 5. Send appropriate Telegram Notifications
    if (isManagerApproved) {
      // IT Manager finalized 100% completion -> Notify assigned technician(s)
      await notifyProjectTaskApproved100(db, updatedTask as DbProjectTask, user, effectiveReportText);
    } else if (isTechnicianCompletion) {
      // Technician submitted completion -> Notify IT Manager(s) to sign off
      await notifyProjectTaskAwaitingSignOff(db, updatedTask as DbProjectTask, reportingUser, effectiveReportText);
    } else {
      // Regular in-progress update
      await notifyProjectTaskUpdated(db, updatedTask as DbProjectTask, reportingUser, effectiveReportText, false);
    }

    return NextResponse.json({
      report: enrichedReport,
      task: updatedTask,
      awaitingSignOff: isTechnicianCompletion,
      isCompleted: isManagerApproved
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
