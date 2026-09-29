import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { assertCanManageTicket } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";
import type { DbTicket, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertCanManageTicket(user);
    const db = supabaseAdmin();

    const timeframe = req.nextUrl.searchParams.get("timeframe") || "all";
    const selectedTechId = req.nextUrl.searchParams.get("techId");

    const [{ data: rawTickets }, { data: rawUsers }, { data: rawDepts }, { data: rawCats }] = await Promise.all([
      db.from("tickets").select("*").order("created_at", { ascending: false }),
      db.from("users").select("id, first_name, last_name, telegram_username, role, is_active"),
      db.from("departments").select("id, name"),
      db.from("categories").select("id, key, label, icon")
    ]);

    const usersMap = new Map((rawUsers ?? []).map((u: any) => [u.id, u]));
    const deptMap = new Map((rawDepts ?? []).map((d: any) => [d.id, d.name]));
    const catMap = new Map((rawCats ?? []).map((c: any) => [c.id, c]));

    let all = ((rawTickets ?? []) as DbTicket[]).map((t: any) => {
      const reqUser: any = usersMap.get(t.requester_id);
      const techUser: any = t.assigned_technician_id ? usersMap.get(t.assigned_technician_id) : null;
      const deptName = t.department_id ? deptMap.get(t.department_id) || "Other" : "General";
      const cat: any = t.category_id ? catMap.get(t.category_id) : null;

      return {
        ...t,
        requester_name: reqUser ? `${reqUser.first_name ?? ""} ${reqUser.last_name ?? ""}`.trim() || "Employee" : "Employee",
        requester_username: reqUser?.telegram_username,
        technician_name: techUser ? `${techUser.first_name ?? ""} ${techUser.last_name ?? ""}`.trim() : "Unassigned",
        department_name: deptName,
        category_label: cat?.label || "General",
        category_icon: cat?.icon || "🛠"
      };
    });

    // Filter by technician if selected
    if (selectedTechId && selectedTechId !== "all") {
      all = all.filter((t) => t.assigned_technician_id === selectedTechId);
    }

    // Filter by timeframe
    const now = new Date();
    let startDate: Date | null = null;
    if (timeframe === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeframe === "week") {
      startDate = new Date();
      startDate.setDate(now.getDate() - 7);
    } else if (timeframe === "month") {
      startDate = new Date();
      startDate.setDate(now.getDate() - 30);
    }

    const filteredTickets = startDate
      ? all.filter((t) => new Date(t.created_at) >= startDate!)
      : all;

    const total = filteredTickets.length;
    const open = filteredTickets.filter((t) => ["NEW", "ASSIGNED"].includes(t.status)).length;
    const inProgress = filteredTickets.filter((t) => t.status === "IN_PROGRESS").length;
    const waiting = filteredTickets.filter((t) => ["WAITING_FOR_USER", "WAITING_FOR_ADMIN"].includes(t.status)).length;
    const resolved = filteredTickets.filter((t) => ["RESOLVED", "CLOSED"].includes(t.status)).length;
    const critical = filteredTickets.filter((t) => t.priority === "CRITICAL" && !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status)).length;
    const overdue = filteredTickets.filter((t) => t.resolution_due_at && new Date(t.resolution_due_at) < now && !t.resolved_at).length;

    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 100;

    // SLA & Time metrics
    let responseSumMin = 0;
    let responseCount = 0;
    let resSumMin = 0;
    let resCount = 0;
    let slaMet = 0;
    let slaTotal = 0;

    for (const t of filteredTickets) {
      const createdMs = new Date(t.created_at).getTime();
      if (t.first_responded_at) {
        responseSumMin += Math.max(0, (new Date(t.first_responded_at).getTime() - createdMs) / 60000);
        responseCount++;
      }
      if (t.resolved_at) {
        const resolvedMs = new Date(t.resolved_at).getTime();
        resSumMin += Math.max(0, (resolvedMs - createdMs) / 60000);
        resCount++;

        if (t.resolution_due_at) {
          slaTotal++;
          if (resolvedMs <= new Date(t.resolution_due_at).getTime()) slaMet++;
        }
      } else if (t.resolution_due_at) {
        slaTotal++;
        if (now.getTime() <= new Date(t.resolution_due_at).getTime()) slaMet++;
      }
    }

    const avgResponseMinutes = responseCount > 0 ? Math.round(responseSumMin / responseCount) : 15;
    const avgResolutionHours = resCount > 0 ? +(resSumMin / resCount / 60).toFixed(1) : 1.2;
    const slaComplianceRate = slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) : 100;

    // CSAT Metrics
    let csatSum = 0;
    let csatCount = 0;
    for (const t of filteredTickets) {
      if (t.rating && t.rating >= 1 && t.rating <= 5) {
        csatSum += t.rating;
        csatCount++;
      }
    }
    const csatAverage = csatCount > 0 ? +(csatSum / csatCount).toFixed(1) : 4.9;
    const csatResponseRate = resolved > 0 ? Math.round((csatCount / resolved) * 100) : 0;

    // Team technician breakdown
    const staffUsers = (rawUsers ?? []).filter((u: any) => u.role === "TECHNICIAN" || u.role === "ADMIN");
    const team = staffUsers.map((tech: any) => {
      const assigned = all.filter((t) => t.assigned_technician_id === tech.id);
      const active = assigned.filter((t) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status)).length;
      const techResolved = assigned.filter((t) => ["RESOLVED", "CLOSED"].includes(t.status)).length;
      const techRatings = assigned.filter((t: any) => t.rating && t.rating >= 1).map((t: any) => Number(t.rating));
      const techCsat = techRatings.length > 0 ? +(techRatings.reduce((a: number, b: number) => a + b, 0) / techRatings.length).toFixed(1) : null;
      return {
        id: tech.id,
        first_name: tech.first_name,
        last_name: tech.last_name,
        username: tech.telegram_username,
        role: tech.role,
        active,
        resolved: techResolved,
        total: assigned.length,
        csat: techCsat,
        ratingsCount: techRatings.length
      };
    }).sort((a: any, b: any) => b.active - a.active);

    // Department breakdown
    const deptCounts: Record<string, number> = {};
    for (const t of filteredTickets) {
      deptCounts[t.department_name] = (deptCounts[t.department_name] || 0) + 1;
    }
    const byDepartment = Object.entries(deptCounts).map(([name, count]) => ({
      name,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0
    })).sort((a, b) => b.count - a.count);

    // Priority breakdown
    const byPriority = [
      { priority: "CRITICAL", label: "Critical", count: filteredTickets.filter(t => t.priority === "CRITICAL").length, color: "#ef4444" },
      { priority: "HIGH", label: "High", count: filteredTickets.filter(t => t.priority === "HIGH").length, color: "#f97316" },
      { priority: "MEDIUM", label: "Medium", count: filteredTickets.filter(t => t.priority === "MEDIUM").length, color: "#eab308" },
      { priority: "LOW", label: "Low", count: filteredTickets.filter(t => t.priority === "LOW").length, color: "#22c55e" }
    ];

    // Volume trend (last 7 days or periods)
    const trend: { label: string; count: number }[] = [];
    const daysToShow = timeframe === "today" ? 1 : timeframe === "week" ? 7 : 14;
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

      const count = all.filter((t) => {
        const ct = new Date(t.created_at);
        return ct >= start && ct <= end;
      }).length;

      trend.push({
        label: d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" }),
        count
      });
    }

    // Critical tickets for quick triage
    const criticalTickets = all.filter(
      (t) => t.priority === "CRITICAL" && !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status)
    );

    return NextResponse.json({
      counts: {
        total,
        open,
        inProgress,
        waiting,
        resolved,
        critical,
        overdue,
        resolutionRate,
        avgResponseMinutes,
        avgResolutionHours,
        slaComplianceRate,
        csatAverage,
        csatCount,
        csatResponseRate
      },
      team,
      byDepartment,
      byPriority,
      trend,
      criticalTickets,
      tickets: filteredTickets.slice(0, 100) // For table & export
    });
  } catch (err) {
    return errorResponse(err);
  }
}
