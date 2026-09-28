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

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();
    const body = await req.json();

    const updates: Record<string, any> = {
      last_active_at: new Date().toISOString()
    };

    if (typeof body.firstName === "string" && body.firstName.trim()) {
      updates.first_name = body.firstName.trim();
    }
    if (typeof body.lastName === "string") {
      updates.last_name = body.lastName.trim();
    }
    if (typeof body.phone === "string") {
      updates.phone = body.phone.trim();
    }
    if (body.departmentId) {
      updates.department_id = body.departmentId;
    }
    updates.is_registered = true;

    const { data: updated, error } = await db
      .from("users")
      .update(updates)
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ user: updated, success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

function tally(rows: { status: string }[]) {
  const c: Record<string, number> = {};
  for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
}

