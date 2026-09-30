import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeSlaState } from "@/lib/sla";
import {
  notifySlaWarning,
  notifySlaBreach,
  notifyProjectTaskDeadlineWarning,
  notifyProjectTaskDeadlineBreach
} from "@/lib/notifications";
import { requireUser } from "@/lib/auth/getUser";
import type { DbTicket, DbUser, DbProjectTask } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * Validates request authorization:
 * - CRON_SECRET via query param or Authorization header
 * - Vercel Cron header (x-vercel-cron)
 * - Authenticated ADMIN/TECHNICIAN session from Web UI
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) {
    return true;
  }

  // Vercel Cron header
  if (req.headers.get("x-vercel-cron")) {
    return true;
  }

  // Authenticated Admin or Tech triggering sweep on-demand
  try {
    const user = await requireUser(req);
    if (user && (user.role === "ADMIN" || user.role === "TECHNICIAN")) {
      return true;
    }
  } catch {
    // User session not valid or unauthenticated
  }

  return false;
}

async function runSlaSweep(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized SLA sweep invocation" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = Date.now();

  // ==========================================
  // 1. SWEEP ACTIVE TICKETS
  // ==========================================
  const { data: tickets } = await db
    .from("tickets")
    .select("*")
    .not("status", "in", '("RESOLVED","CLOSED","CANCELLED")')
    .not("resolution_due_at", "is", null);

  let ticketWarnings = 0;
  let ticketBreaches = 0;

  for (const ticket of (tickets ?? []) as DbTicket[]) {
    const sla = computeSlaState({
      createdAt: ticket.created_at,
      resolutionDueAt: ticket.resolution_due_at,
      resolvedAt: ticket.resolved_at,
      status: ticket.status
    });

    const { data: existingEvents } = await db
      .from("sla_events")
      .select("event_type")
      .eq("ticket_id", ticket.id);
    const already = new Set((existingEvents ?? []).map((e: any) => e.event_type));

    if (!ticket.assigned_technician_id) continue;
    const { data: tech } = await db.from("users").select("*").eq("id", ticket.assigned_technician_id).single();
    if (!tech) continue;

    if (sla.state === "AT_RISK" && !already.has("RESOLUTION_WARNING")) {
      await notifySlaWarning(db, ticket, tech as DbUser, sla.label);
      await db.from("sla_events").insert({ ticket_id: ticket.id, event_type: "RESOLUTION_WARNING" });
      ticketWarnings++;
    }
    if (sla.state === "BREACHED" && !already.has("RESOLUTION_BREACH")) {
      await notifySlaBreach(db, ticket, tech as DbUser);
      await db.from("sla_events").insert({ ticket_id: ticket.id, event_type: "RESOLUTION_BREACH" });
      ticketBreaches++;
    }
  }

  // ==========================================
  // 2. SWEEP ACTIVE PROJECT TASKS
  // ==========================================
  const { data: rawTasks } = await db
    .from("project_tasks")
    .select("*")
    .not("status", "in", '("COMPLETED","CANCELLED")')
    .not("deadline", "is", null);

  let taskWarnings = 0;
  let taskBreaches = 0;

  const tasks = (rawTasks ?? []) as DbProjectTask[];

  for (const task of tasks) {
    if (!task.assigned_to_id || !task.deadline) continue;

    const dueMs = new Date(task.deadline).getTime();
    if (isNaN(dueMs)) continue;

    // Check existing events for this task
    const { data: existingTaskEvents } = await db
      .from("sla_events")
      .select("event_type")
      .eq("task_id", task.id);
    const alreadyTask = new Set((existingTaskEvents ?? []).map((e: any) => e.event_type));

    const { data: tech } = await db.from("users").select("*").eq("id", task.assigned_to_id).single();
    if (!tech) continue;

    // A. Deadline Breached (now > dueMs)
    if (now > dueMs) {
      if (!alreadyTask.has("TASK_DEADLINE_BREACH")) {
        await notifyProjectTaskDeadlineBreach(db, task, tech as DbUser);
        await db.from("sla_events").insert({ task_id: task.id, event_type: "TASK_DEADLINE_BREACH" });
        taskBreaches++;
      }
    }
    // B. Deadline Approaching (within 24 hours: 0 < dueMs - now <= 24h)
    else if (dueMs - now <= 24 * 60 * 60 * 1000) {
      if (!alreadyTask.has("TASK_DEADLINE_WARNING")) {
        const hoursRemaining = (dueMs - now) / (3600 * 1000);
        await notifyProjectTaskDeadlineWarning(db, task, tech as DbUser, hoursRemaining);
        await db.from("sla_events").insert({ task_id: task.id, event_type: "TASK_DEADLINE_WARNING" });
        taskWarnings++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    tickets: {
      checked: tickets?.length ?? 0,
      warnings: ticketWarnings,
      breaches: ticketBreaches
    },
    tasks: {
      checked: tasks.length,
      warnings: taskWarnings,
      breaches: taskBreaches
    },
    summary: `Sweep completed: ${ticketWarnings} ticket warnings, ${ticketBreaches} ticket breaches, ${taskWarnings} task warnings, ${taskBreaches} task breaches.`
  });
}

export async function GET(req: NextRequest) {
  return runSlaSweep(req);
}

export async function POST(req: NextRequest) {
  return runSlaSweep(req);
}
