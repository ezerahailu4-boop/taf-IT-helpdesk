import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertCanManageTicket, assertIsAdmin } from "@/lib/permissions";
import { notifyProjectTaskAssigned } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";
import type { DbProjectTask, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

const createTaskSchema = z.object({
  title: z.string().min(1, "Task title is required").max(200),
  goal: z.string().min(1, "Task goal/description is required").max(3000),
  deadline: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid deadline date format"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  assignedToId: z.string().uuid("Invalid technician ID").nullable().optional()
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const techIdFilter = searchParams.get("techId");

    let query = db
      .from("project_tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "ALL") {
      query = query.eq("status", statusFilter);
    }

    if (techIdFilter && techIdFilter !== "ALL") {
      query = query.eq("assigned_to_id", techIdFilter);
    }

    const { data: rawTasks, error } = await query;
    if (error) throw new Error(error.message);

    // Fetch users for relations and technician dropdown
    const { data: rawUsers } = await db.from("users").select("*");
    const usersMap = new Map((rawUsers ?? []).map((u: any) => [u.id, u]));

    const tasks = (rawTasks ?? []).map((t: any) => ({
      ...t,
      assigned_to: t.assigned_to_id ? usersMap.get(t.assigned_to_id) || null : null,
      created_by: t.created_by_id ? usersMap.get(t.created_by_id) || null : null
    }));

    // Calculate metrics
    const now = new Date().getTime();
    const total = tasks.length;
    const completed = tasks.filter((t: any) => t.status === "COMPLETED").length;
    const inProgress = tasks.filter((t: any) => t.status === "IN_PROGRESS").length;
    const pending = tasks.filter((t: any) => t.status === "PENDING").length;
    const overdue = tasks.filter((t: any) => t.status !== "COMPLETED" && new Date(t.deadline).getTime() < now).length;

    // Filter technicians list for assignment dropdown
    const technicians = (rawUsers ?? [])
      .filter((u: any) => (u.role === "TECHNICIAN" || u.role === "ADMIN") && u.is_active !== false)
      .map((u: any) => ({
        id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        telegram_username: u.telegram_username,
        photo_url: u.photo_url,
        role: u.role
      }))
      .sort((a: any, b: any) => (a.first_name || "").localeCompare(b.first_name || ""));

    return NextResponse.json({
      tasks: tasks ?? [],
      metrics: {
        total,
        completed,
        inProgress,
        pending,
        overdue,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
      },
      technicians: technicians ?? []
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const body = createTaskSchema.parse(await req.json());

    // Tasks are dispatched by Admin (default to Adonay @not_adonay, never Tinsu)
    let assigner = user;
    if (user.role !== "ADMIN" || user.telegram_username?.toLowerCase() === "tinsu2025") {
      const { data: adonay } = await db
        .from("users")
        .select("*")
        .eq("telegram_username", "not_adonay")
        .maybeSingle();
      if (adonay) assigner = adonay;
    }

    const { data: task, error } = await db
      .from("project_tasks")
      .insert({
        title: body.title.trim(),
        goal: body.goal.trim(),
        deadline: new Date(body.deadline).toISOString(),
        priority: body.priority,
        status: "PENDING",
        progress: 0,
        assigned_to_id: body.assignedToId ?? null,
        created_by_id: assigner.id
      })
      .select("*")
      .single();

    if (error || !task) throw new Error(error?.message || "Failed to create task");

    // If assigned to a technician, send them an instant Telegram alert
    if (task.assigned_to_id) {
      const { data: tech } = await db.from("users").select("*").eq("id", task.assigned_to_id).single();
      if (tech) {
        await notifyProjectTaskAssigned(db, task as DbProjectTask, tech as DbUser, assigner);
      }
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
