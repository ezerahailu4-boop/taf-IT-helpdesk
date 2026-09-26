import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();

    let counts: Record<string, number> = {};
    if (user.role === "EMPLOYEE") {
      const { data } = await db.from("tickets").select("status").eq("requester_id", user.id);
      counts = tally(data ?? []);
    } else if (user.role === "TECHNICIAN") {
      const { data } = await db.from("tickets").select("status").eq("assigned_technician_id", user.id);
      counts = tally(data ?? []);
    } else if (user.role === "ADMIN") {
      const { data } = await db.from("tickets").select("status");
      counts = tally(data ?? []);
    }

    return NextResponse.json({ user, counts });
  } catch (err) {
    return errorResponse(err);
  }
}

function tally(rows: { status: string }[]) {
  const c: Record<string, number> = {};
  for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
}
