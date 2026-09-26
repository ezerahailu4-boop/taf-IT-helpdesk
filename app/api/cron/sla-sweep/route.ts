import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeSlaState } from "@/lib/sla";
import { notifySlaWarning, notifySlaBreach } from "@/lib/notifications";
import type { DbTicket, DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * Protects against public invocation: set CRON_SECRET and configure your
 * scheduler (e.g. Vercel Cron) to call this with `?secret=...` or the
 * Authorization header. Run every 5-10 minutes.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: tickets } = await db
    .from("tickets")
    .select("*")
    .not("status", "in", '("RESOLVED","CLOSED","CANCELLED")')
    .not("resolution_due_at", "is", null);

  let warnings = 0, breaches = 0;

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
      await notifySlaWarning(db, ticket, tech as DbUser);
      await db.from("sla_events").insert({ ticket_id: ticket.id, event_type: "RESOLUTION_WARNING" });
      warnings++;
    }
    if (sla.state === "BREACHED" && !already.has("RESOLUTION_BREACH")) {
      await notifySlaBreach(db, ticket, tech as DbUser);
      await db.from("sla_events").insert({ ticket_id: ticket.id, event_type: "RESOLUTION_BREACH" });
      breaches++;
    }
  }

  return NextResponse.json({ ok: true, checked: tickets?.length ?? 0, warnings, breaches });
}
