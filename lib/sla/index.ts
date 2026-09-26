import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketPriority } from "@/types/db";

export async function getSlaPolicy(db: SupabaseClient, priority: TicketPriority) {
  const { data, error } = await db.from("sla_policies").select("*").eq("priority", priority).single();
  if (error) throw new Error(error.message);
  return data as { id: string; response_minutes: number; resolution_minutes: number };
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export type SlaState = "ON_TRACK" | "AT_RISK" | "BREACHED" | "MET";

/**
 * AT_RISK once less than 20% of the resolution window remains.
 * BREACHED once the deadline has passed and the ticket isn't resolved.
 */
export function computeSlaState(params: {
  createdAt: string;
  resolutionDueAt: string | null;
  resolvedAt: string | null;
  status: string;
}): { state: SlaState; label: string } {
  const { createdAt, resolutionDueAt, resolvedAt } = params;
  if (!resolutionDueAt) return { state: "ON_TRACK", label: "No SLA" };

  const due = new Date(resolutionDueAt).getTime();
  const now = Date.now();

  if (resolvedAt) {
    const resolvedMs = new Date(resolvedAt).getTime();
    return resolvedMs <= due
      ? { state: "MET", label: "Met SLA" }
      : { state: "BREACHED", label: "Resolved late" };
  }

  if (now > due) {
    return { state: "BREACHED", label: "SLA breached" };
  }

  const created = new Date(createdAt).getTime();
  const totalWindow = due - created;
  const remaining = due - now;
  const pctRemaining = totalWindow > 0 ? remaining / totalWindow : 1;

  if (pctRemaining <= 0.2) {
    return { state: "AT_RISK", label: formatRemaining(remaining) + " left" };
  }
  return { state: "ON_TRACK", label: formatRemaining(remaining) + " left" };
}

function formatRemaining(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
