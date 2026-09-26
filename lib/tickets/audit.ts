import type { SupabaseClient } from "@supabase/supabase-js";

export async function writeAudit(
  db: SupabaseClient,
  params: {
    actorId: string | null;
    action: string;
    objectType: string;
    objectId: string;
    previousValue?: unknown;
    newValue?: unknown;
  }
) {
  await db.from("audit_logs").insert({
    actor_id: params.actorId,
    action: params.action,
    object_type: params.objectType,
    object_id: params.objectId,
    previous_value: params.previousValue ?? null,
    new_value: params.newValue ?? null
  });
}

export async function recordStatusChange(
  db: SupabaseClient,
  params: { ticketId: string; changedBy: string | null; from: string | null; to: string; note?: string }
) {
  await db.from("ticket_status_history").insert({
    ticket_id: params.ticketId,
    changed_by: params.changedBy,
    from_status: params.from,
    to_status: params.to,
    note: params.note ?? null
  });
}
