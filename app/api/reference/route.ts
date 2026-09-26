import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();

    const isStaff = user.role === "TECHNICIAN" || user.role === "ADMIN";

    let assetQuery = db.from("assets").select("id, asset_tag, type, brand, model, status, assigned_user_id");
    if (!isStaff) {
      // For employees, show their assigned devices + general unassigned devices
      assetQuery = assetQuery.or(`assigned_user_id.eq.${user.id},assigned_user_id.is.null`);
    }

    const [{ data: categories }, { data: locations }, { data: departments }, { data: assets }, { data: articles }] =
      await Promise.all([
        db.from("categories").select("*").eq("is_active", true).order("sort_order"),
        db.from("locations").select("*").eq("is_active", true).order("name"),
        db.from("departments").select("*").eq("is_active", true).order("name"),
        assetQuery.limit(50),
        db.from("knowledge_articles").select("id, title, category_id, keywords").eq("is_published", true).limit(30)
      ]);

    return NextResponse.json({
      categories,
      locations,
      departments,
      assets: assets ?? [],
      articles: articles ?? []
    });
  } catch (err) {
    return errorResponse(err);
  }
}
