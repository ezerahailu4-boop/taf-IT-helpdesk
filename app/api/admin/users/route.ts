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
    const { data, error } = await db.from("users").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ users: data });
  } catch (err) {
    return errorResponse(err);
  }
}
