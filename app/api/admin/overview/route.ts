import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { assertIsAdmin } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";
import type { DbTicket } from "@/types/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const db = supabaseAdmin();

    const { data: tickets } = await db.from("tickets").select("*");
    const all = (tickets ?? []) as DbTicket[];

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const counts = {
      total: all.length,
      open: all.filter((t) => ["NEW", "ASSIGNED"].includes(t.status)).length,
      inProgress: all.filter((t) => t.status === "IN_PROGRESS").length,
      waiting: all.filter((t) => ["WAITING_FOR_USER", "WAITING_FOR_ADMIN"].includes(t.status)).length,
      resolved: all.filter((t) => ["RESOLVED", "CLOSED"].includes(t.status)).length,
      overdue: all.filter((t) => t.resolution_due_at && new Date(t.resolution_due_at) < new Date() && !t.resolved_at).length,
      critical: all.filter((t) => t.priority === "CRITICAL" && !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status)).length,
      todayNew: all.filter((t) => new Date(t.created_at) >= startOfToday).length,
      todayResolved: all.filter((t) => t.resolved_at && new Date(t.resolved_at) >= startOfToday).length,
      todayReopened: all.filter((t) => t.status === "REOPENED" && new Date(t.updated_at) >= startOfToday).length
    };

    const { data: techs } = await db.from("users").select("id, first_name, last_name").eq("role", "TECHNICIAN").eq("is_active", true);
    const team = (techs ?? []).map((t: any) => ({
      ...t,
      active: all.filter((tk) => tk.assigned_technician_id === t.id && !["RESOLVED", "CLOSED", "CANCELLED"].includes(tk.status)).length
    }));

    const criticalTickets = all
      .filter((t) => t.priority === "CRITICAL" && !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status))
      .slice(0, 5);

    return NextResponse.json({ counts, team, criticalTickets });
  } catch (err) {
    return errorResponse(err);
  }
}
