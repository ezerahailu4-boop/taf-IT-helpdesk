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
  category: z.enum(["PLANNED", "UNPLANNED"]).default("PLANNED"),
  assignedToId: z.string().uuid("Invalid technician ID").nullable().optional(),
  assignedTechnicianIds: z.array(z.string().uuid("Invalid technician ID")).optional()
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const techIdFilter = searchParams.get("techId");
    const categoryFilter = searchParams.get("category");

    let query = db
      .from("project_tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "ALL") {
      query = query.eq("status", statusFilter);
    }

    if (categoryFilter && categoryFilter !== "ALL") {
      query = query.eq("category", categoryFilter);
    }

    const { data: rawTasks, error } = await query;
    if (error) throw new Error(error.message);

    // Fetch users for relations and technician dropdown
    const { data: rawUsers } = await db.from("users").select("*");
    const usersMap = new Map((rawUsers ?? []).map((u: any) => [u.id, u]));

    let tasks = (rawTasks ?? []).map((t: any) => {
      const assignedTechIds: string[] = (t.assigned_technician_ids && t.assigned_technician_ids.length > 0)
        ? t.assigned_technician_ids
        : (t.assigned_to_id ? [t.assigned_to_id] : []);
      const assignedTechnicians = assignedTechIds.map((id: string) => usersMap.get(id)).filter(Boolean);

      return {
        ...t,
        assigned_to: t.assigned_to_id ? usersMap.get(t.assigned_to_id) || null : (assignedTechnicians[0] || null),
        assigned_technicians: assignedTechnicians,
        created_by: t.created_by_id ? usersMap.get(t.created_by_id) || null : null
      };
    });

    if (techIdFilter && techIdFilter !== "ALL") {
      tasks = tasks.filter((t: any) =>
        t.assigned_to_id === techIdFilter ||
        (t.assigned_technician_ids && t.assigned_technician_ids.includes(techIdFilter))
      );
    }

    // Calculate metrics
    const now = new Date().getTime();
    const total = tasks.length;
    const completed = tasks.filter((t: any) => t.status === "COMPLETED").length;
    const inProgress = tasks.filter((t: any) => t.status === "IN_PROGRESS").length;
    const pending = tasks.filter((t: any) => t.status === "PENDING").length;
    const overdue = tasks.filter((t: any) => t.status !== "COMPLETED" && new Date(t.deadline).getTime() < now).length;

    // Active tasks count by technician
    const activeTasksByTech = new Map<string, number>();
    for (const t of tasks) {
      if (t.status !== "COMPLETED" && t.status !== "CANCELLED") {
        const ids: string[] = (t.assigned_technician_ids && t.assigned_technician_ids.length > 0)
          ? t.assigned_technician_ids
          : (t.assigned_to_id ? [t.assigned_to_id] : []);
        for (const techId of ids) {
          activeTasksByTech.set(techId, (activeTasksByTech.get(techId) || 0) + 1);
        }
      }
    }

    // Query active tickets to compute technician ticket workload
    const { data: rawActiveTickets } = await db
      .from("tickets")
      .select("id, assigned_technician_id")
      .not("status", "in", '("RESOLVED","CLOSED","CANCELLED")')
      .not("assigned_technician_id", "is", null);

    const activeTicketsByTech = new Map<string, number>();
    for (const t of rawActiveTickets ?? []) {
      if (t.assigned_technician_id) {
        activeTicketsByTech.set(
          t.assigned_technician_id,
          (activeTicketsByTech.get(t.assigned_technician_id) || 0) + 1
        );
      }
    }

    // Query ratings to compute CSAT for technicians
    const { data: ratedTickets } = await db
      .from("tickets")
      .select("assigned_technician_id, rating")
      .not("rating", "is", null)
      .not("assigned_technician_id", "is", null);

    const ratingsByTech = new Map<string, { sum: number; count: number }>();
    for (const rt of ratedTickets ?? []) {
      if (rt.assigned_technician_id && rt.rating) {
        const cur = ratingsByTech.get(rt.assigned_technician_id) || { sum: 0, count: 0 };
        ratingsByTech.set(rt.assigned_technician_id, {
          sum: cur.sum + rt.rating,
          count: cur.count + 1
        });
      }
    }

    interface CandidateTech {
      id: string;
      first_name: string | null;
      last_name: string | null;
      telegram_username: string | null;
      photo_url: string | null;
      role: string;
      activeTasksCount: number;
      activeTicketsCount: number;
      workloadScore: number;
      avgRating: number | null;
      ratingCount: number;
      capacityStatus: "OPTIMAL" | "LIGHT" | "MODERATE" | "BUSY";
      isRecommended: boolean;
    }

    // Smart Capacity-Aware Dispatch candidates
    const candidateTechs: CandidateTech[] = (rawUsers ?? [])
      .filter((u: any) => (u.role === "TECHNICIAN" || u.role === "ADMIN") && u.is_active !== false)
      .map((u: any): CandidateTech => {
        const activeTasks = activeTasksByTech.get(u.id) || 0;
        const activeTickets = activeTicketsByTech.get(u.id) || 0;
        const ratingData = ratingsByTech.get(u.id);
        const avgRating = ratingData && ratingData.count > 0 ? Number((ratingData.sum / ratingData.count).toFixed(1)) : null;
        const workloadScore = (activeTasks * 2) + activeTickets;

        let capacityStatus: "OPTIMAL" | "LIGHT" | "MODERATE" | "BUSY" = "OPTIMAL";
        if (workloadScore > 5) capacityStatus = "BUSY";
        else if (workloadScore > 2) capacityStatus = "MODERATE";
        else if (workloadScore > 0) capacityStatus = "LIGHT";

        return {
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          telegram_username: u.telegram_username,
          photo_url: u.photo_url,
          role: u.role,
          activeTasksCount: activeTasks,
          activeTicketsCount: activeTickets,
          workloadScore,
          avgRating,
          ratingCount: ratingData?.count || 0,
          capacityStatus,
          isRecommended: false
        };
      });

    // Rank candidates for recommendation:
    // 1. prefer role === 'TECHNICIAN'
    // 2. lowest workloadScore
    // 3. highest avgRating
    // 4. alphabetical
    const sortedForRecommendation = [...candidateTechs].sort((a: CandidateTech, b: CandidateTech) => {
      if (a.role === "TECHNICIAN" && b.role !== "TECHNICIAN") return -1;
      if (b.role === "TECHNICIAN" && a.role !== "TECHNICIAN") return 1;
      if (a.workloadScore !== b.workloadScore) return a.workloadScore - b.workloadScore;
      if ((b.avgRating || 0) !== (a.avgRating || 0)) return (b.avgRating || 0) - (a.avgRating || 0);
      return (a.first_name || "").localeCompare(b.first_name || "");
    });

    if (sortedForRecommendation.length > 0) {
      const best = sortedForRecommendation[0];
      const match = candidateTechs.find((t: CandidateTech) => t.id === best.id);
      if (match) match.isRecommended = true;
    }

    // Sort technicians list: recommended first, then technicians, then admins, alphabetically
    candidateTechs.sort((a: CandidateTech, b: CandidateTech) => {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (b.isRecommended && !a.isRecommended) return 1;
      if (a.role === "TECHNICIAN" && b.role !== "TECHNICIAN") return -1;
      if (b.role === "TECHNICIAN" && a.role !== "TECHNICIAN") return 1;
      return (a.first_name || "").localeCompare(b.first_name || "");
    });

    const recommendedTech = candidateTechs.find((t: CandidateTech) => t.isRecommended) || candidateTechs[0] || null;

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
      technicians: candidateTechs,
      smartDispatch: {
        recommendedTechId: recommendedTech?.id || null,
        recommendedTechName: recommendedTech ? `${recommendedTech.first_name || ""} ${recommendedTech.last_name || ""}`.trim() : null,
        recommendedReason: recommendedTech
          ? `${recommendedTech.first_name} has the lowest workload (${recommendedTech.activeTasksCount} active tasks, ${recommendedTech.activeTicketsCount} tickets${recommendedTech.avgRating ? ` • ${recommendedTech.avgRating}★ CSAT` : ""})`
          : "No active technicians available"
      }
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

    const assignedIds: string[] = (body.assignedTechnicianIds && body.assignedTechnicianIds.length > 0)
      ? body.assignedTechnicianIds
      : (body.assignedToId ? [body.assignedToId] : []);
    const primaryLeadId = assignedIds[0] || null;

    const { data: task, error } = await db
      .from("project_tasks")
      .insert({
        title: body.title.trim(),
        goal: body.goal.trim(),
        deadline: new Date(body.deadline).toISOString(),
        priority: body.priority,
        category: body.category || "PLANNED",
        status: "PENDING",
        progress: 0,
        assigned_to_id: primaryLeadId,
        assigned_technician_ids: assignedIds,
        created_by_id: assigner.id
      })
      .select("*")
      .single();

    if (error || !task) throw new Error(error?.message || "Failed to create task");

    // Send instant Telegram alert to ALL assigned technicians!
    for (const techId of assignedIds) {
      const { data: tech } = await db.from("users").select("*").eq("id", techId).single();
      if (tech) {
        await notifyProjectTaskAssigned(db, task as DbProjectTask, tech as DbUser, assigner);
      }
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
