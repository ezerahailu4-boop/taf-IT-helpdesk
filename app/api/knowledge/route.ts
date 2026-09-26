import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const db = supabaseAdmin();
    const q = req.nextUrl.searchParams.get("q");

    let query = db.from("knowledge_articles").select("*").eq("is_published", true).order("view_count", { ascending: false }).limit(20);
    if (q) query = query.ilike("title", `%${q}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ articles: data });
  } catch (err) {
    return errorResponse(err);
  }
}
