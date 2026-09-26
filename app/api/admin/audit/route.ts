import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { assertIsAdmin } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const db = supabaseAdmin();

    const objectType = req.nextUrl.searchParams.get("objectType");
    const action = req.nextUrl.searchParams.get("action");

    let query = db.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
    if (objectType) query = query.eq("object_type", objectType);
    if (action) query = query.eq("action", action);

    const { data: logs, error } = await query;
    if (error) throw new Error(error.message);

    const { data: users } = await db.from("users").select("id, first_name, last_name, telegram_username, role");
    const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    const enriched = (logs ?? []).map((log: any) => ({
      ...log,
      actor: log.actor_id ? userMap.get(log.actor_id) ?? null : null
    }));

    return NextResponse.json({ logs: enriched });
  } catch (err) {
    return errorResponse(err);
  }
}
