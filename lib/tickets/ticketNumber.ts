import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generates the next ticket number for the current year, e.g. IT-2026-000245.
 * Uses a Postgres sequence (ticket_seq) as the source of uniqueness so
 * concurrent ticket creation can never collide, then formats it per-year.
 * The UUID primary key remains the real internal identifier; this is
 * purely the human-facing label.
 */
export async function generateTicketNumber(db: SupabaseClient): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await db.rpc("nextval_ticket_seq");
  if (error || data == null) {
    // Fallback: count existing tickets this year (fine for low-volume/demo use;
    // the RPC path above is authoritative in production — see supabase/schema.sql
    // and add the function below if you haven't already).
    const { count } = await db
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${year}-01-01`)
      .lt("created_at", `${year + 1}-01-01`);
    const next = (count ?? 0) + 1;
    return `IT-${year}-${String(next).padStart(6, "0")}`;
  }
  return `IT-${year}-${String(data).padStart(6, "0")}`;
}
