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
  title: z.string().min(3, "Task title must be at least 3 characters").max(200),
  goal: z.string().min(5, "Task goal/description must be at least 5 characters").max(3000),
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
      .select(`
        *,
        assigned_to:users!project_tasks_assigned_to_id_fkey(id, first_name, last_name, telegram_username, photo_url, role),
        created_by:users!project_tasks_created_by_id_fkey(id, first_name, last_name, telegram_username)
      `)
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "ALL") {
      query = query.eq("status", statusFilter);
    }

    if (techIdFilter && techIdFilter !== "ALL") {
      query = query.eq("assigned_to_id", techIdFilter);
    }

    const { data: tasks, error } = await query;
    if (error) throw new Error(error.message);

    // Calculate metrics
    const now = new Date().getTime();
    const total = tasks?.length ?? 0;
    const completed = tasks?.filter((t: any) => t.status === "COMPLETED").length ?? 0;
    const inProgress = tasks?.filter((t: any) => t.status === "IN_PROGRESS").length ?? 0;
    const pending = tasks?.filter((t: any) => t.status === "PENDING").length ?? 0;
    const overdue = tasks?.filter((t: any) => t.status !== "COMPLETED" && new Date(t.deadline).getTime() < now).length ?? 0;

    // Fetch technicians list for assignment dropdown
    const { data: technicians } = await db
      .from("users")
      .select("id, first_name, last_name, telegram_username, photo_url, role")
      .in("role", ["TECHNICIAN", "ADMIN"])
      .eq("is_active", true)
      .order("first_name", { ascending: true });

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
    assertIsAdmin(user);
    const db = supabaseAdmin();

    const body = createTaskSchema.parse(await req.json());

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
        created_by_id: user.id
      })
      .select("*")
      .single();

    if (error || !task) throw new Error(error?.message || "Failed to create task");

    // If assigned to a technician, send them an instant Telegram alert
    if (task.assigned_to_id) {
      const { data: tech } = await db.from("users").select("*").eq("id", task.assigned_to_id).single();
      if (tech) {
        await notifyProjectTaskAssigned(db, task as DbProjectTask, tech as DbUser, user);
      }
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
