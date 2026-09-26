import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();
    const query = req.nextUrl.searchParams.get("q")?.trim() || "";

    if (!query) {
      return NextResponse.json({ tickets: [], articles: [], assets: [], users: [] });
    }

    const isStaff = user.role === "TECHNICIAN" || user.role === "ADMIN";

    // 1. Search tickets (Employees only see their own tickets, Staff see all)
    let ticketQuery = db
      .from("tickets")
      .select("id, ticket_number, subject, priority, status, created_at, requester_id")
      .or(`subject.ilike.%${query}%,ticket_number.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(10);

    if (user.role === "EMPLOYEE") {
      ticketQuery = ticketQuery.eq("requester_id", user.id);
    }

    // 2. Search knowledge articles
    const articleQuery = db
      .from("knowledge_articles")
      .select("id, title, body, keywords, view_count")
      .eq("is_published", true)
      .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
      .limit(10);

    // 3. Search assets (Staff see all assets, Employees see their assigned assets)
    let assetQuery = db
      .from("assets")
      .select("id, asset_tag, type, brand, model, status, assigned_user_id")
      .or(`asset_tag.ilike.%${query}%,type.ilike.%${query}%,brand.ilike.%${query}%,model.ilike.%${query}%`)
      .limit(10);

    if (user.role === "EMPLOYEE") {
      assetQuery = assetQuery.eq("assigned_user_id", user.id);
    }

    // 4. Search users (Staff only)
    const userPromise = isStaff
      ? db
          .from("users")
          .select("id, first_name, last_name, telegram_username, role, photo_url")
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,telegram_username.ilike.%${query}%`)
          .limit(10)
      : Promise.resolve({ data: [] });

    const [{ data: tickets }, { data: articles }, { data: assets }, { data: users }] = await Promise.all([
      ticketQuery,
      articleQuery,
      assetQuery,
      userPromise
    ]);

    return NextResponse.json({
      tickets: tickets ?? [],
      articles: articles ?? [],
      assets: assets ?? [],
      users: users ?? []
    });
  } catch (err) {
    return errorResponse(err);
  }
}
