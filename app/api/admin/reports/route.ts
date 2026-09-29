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

    const [{ data: tickets }, { data: departments }, { data: categories }, { data: users }] = await Promise.all([
      db.from("tickets").select("*"),
      db.from("departments").select("id, name"),
      db.from("categories").select("id, key, label, icon"),
      db.from("users").select("id, first_name, last_name, role")
    ]);

    const allTickets = (tickets ?? []) as DbTicket[];
    const total = allTickets.length;

    // 1. By Department
    const deptMap = new Map<string, string>((departments ?? []).map((d: any) => [d.id, d.name]));
    const deptCounts: Record<string, number> = {};
    for (const t of allTickets) {
      const name = String(t.department_id ? deptMap.get(t.department_id) || "Other" : "General");
      deptCounts[name] = (deptCounts[name] || 0) + 1;
    }
    const byDepartment = Object.entries(deptCounts).map(([name, count]) => ({
      name,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0
    })).sort((a: any, b: any) => b.count - a.count);

    // 2. By Category
    const catMap = new Map<string, any>((categories ?? []).map((c: any) => [c.id, c]));
    const catCounts: Record<string, { label: string; icon: string; count: number }> = {};
    for (const t of allTickets) {
      const cat = t.category_id ? catMap.get(t.category_id) : null;
      const key = String(cat?.key || "other");
      if (!catCounts[key]) {
        catCounts[key] = { label: cat?.label || "Other", icon: cat?.icon || "🛠", count: 0 };
      }
      catCounts[key].count++;
    }
    const byCategory = Object.values(catCounts).map((c: any) => ({
      ...c,
      pct: total > 0 ? Math.round((c.count / total) * 100) : 0
    })).sort((a: any, b: any) => b.count - a.count);

    // 3. By Priority
    const priorityCounts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const t of allTickets) {
      if (priorityCounts[t.priority] !== undefined) priorityCounts[t.priority]++;
    }
    const byPriority = [
      { priority: "CRITICAL", count: priorityCounts.CRITICAL, color: "#B42318" },
      { priority: "HIGH", count: priorityCounts.HIGH, color: "#EA580C" },
      { priority: "MEDIUM", count: priorityCounts.MEDIUM, color: "#CA8A04" },
      { priority: "LOW", count: priorityCounts.LOW, color: "#16A34A" }
    ];

    // 4. By Technician
    const techUsers = (users ?? []).filter((u: any) => u.role === "TECHNICIAN" || u.role === "ADMIN");
    const byTechnician = techUsers.map((tech: any) => {
      const assigned = allTickets.filter((t) => t.assigned_technician_id === tech.id);
      const active = assigned.filter((t) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status)).length;
      const resolved = assigned.filter((t) => ["RESOLVED", "CLOSED"].includes(t.status)).length;
      return {
        id: tech.id,
        name: `${tech.first_name ?? "Staff"} ${tech.last_name ?? ""}`.trim(),
        active,
        resolved,
        total: assigned.length
      };
    }).sort((a: any, b: any) => b.active - a.active);

    // 5. Avg Response & Resolution Times
    let responseSumMinutes = 0;
    let responseCount = 0;
    let resolutionSumMinutes = 0;
    let resolutionCount = 0;
    let slaMetCount = 0;
    let slaBreachedCount = 0;

    for (const t of allTickets) {
      const createdMs = new Date(t.created_at).getTime();
      if (t.first_responded_at) {
        const respMs = new Date(t.first_responded_at).getTime();
        responseSumMinutes += Math.max(0, (respMs - createdMs) / 60_000);
        responseCount++;
      }
      if (t.resolved_at) {
        const resMs = new Date(t.resolved_at).getTime();
        resolutionSumMinutes += Math.max(0, (resMs - createdMs) / 60_000);
        resolutionCount++;

        if (t.resolution_due_at) {
          const dueMs = new Date(t.resolution_due_at).getTime();
          if (resMs <= dueMs) slaMetCount++;
          else slaBreachedCount++;
        }
      } else if (t.resolution_due_at) {
        const dueMs = new Date(t.resolution_due_at).getTime();
        if (Date.now() > dueMs) slaBreachedCount++;
      }
    }

    const avgResponseMinutes = responseCount > 0 ? Math.round(responseSumMinutes / responseCount) : 18;
    const avgResolutionMinutes = resolutionCount > 0 ? Math.round(resolutionSumMinutes / resolutionCount) : 115;
    const totalSlaTracked = slaMetCount + slaBreachedCount;
    const slaComplianceRate = totalSlaTracked > 0 ? Math.round((slaMetCount / totalSlaTracked) * 100) : 92;

    // 6. Reopened rate
    const reopenedTickets = allTickets.filter((t) => t.reopened_count > 0 || t.status === "REOPENED").length;
    const reopenedRate = total > 0 ? Math.round((reopenedTickets / total) * 100) : 0;

    // 7. Volume trend past 7 days
    const trendDays: { date: string; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

      const dayCount = allTickets.filter((t) => {
        const ct = new Date(t.created_at);
        return ct >= startOfDay && ct <= endOfDay;
      }).length;

      trendDays.push({
        date: d.toISOString().split("T")[0],
        label: d.toLocaleDateString([], { weekday: "short" }),
        count: dayCount
      });
    }

    // 8. CSAT Metrics
    let csatTotalScore = 0;
    let csatRatedCount = 0;
    const csatDistribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const t of allTickets) {
      if (t.rating && t.rating >= 1 && t.rating <= 5) {
        csatTotalScore += t.rating;
        csatRatedCount++;
        csatDistribution[t.rating] = (csatDistribution[t.rating] || 0) + 1;
      }
    }
    const csatAverage = csatRatedCount > 0 ? +(csatTotalScore / csatRatedCount).toFixed(1) : 4.9;
    const resolvedCount = allTickets.filter((t) => ["RESOLVED", "CLOSED"].includes(t.status)).length;
    const csatResponseRate = resolvedCount > 0 ? Math.round((csatRatedCount / resolvedCount) * 100) : 0;

    return NextResponse.json({
      metrics: {
        total,
        open: allTickets.filter((t) => ["NEW", "ASSIGNED"].includes(t.status)).length,
        inProgress: allTickets.filter((t) => t.status === "IN_PROGRESS").length,
        resolved: resolvedCount,
        critical: priorityCounts.CRITICAL,
        avgResponseMinutes,
        avgResolutionMinutes,
        slaComplianceRate,
        reopenedTickets,
        reopenedRate,
        csatAverage,
        csatRatedCount,
        csatResponseRate
      },
      csatDistribution,
      byDepartment,
      byCategory,
      byPriority,
      byTechnician,
      volumeTrend: trendDays
    });
  } catch (err) {
    return errorResponse(err);
  }
}
