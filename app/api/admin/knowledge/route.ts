import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { assertIsAdmin } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/tickets/audit";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(10000),
  categoryName: z.string().optional(),
  keywords: z.array(z.string()).optional()
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const body = createSchema.parse(await req.json());
    const db = supabaseAdmin();

    const { data: article, error } = await db
      .from("knowledge_articles")
      .insert({
        title: body.title.trim(),
        body: body.body.trim(),
        category_name: body.categoryName || "General",
        keywords: body.keywords ?? [],
        is_published: true,
        view_count: 0
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await writeAudit(db, {
      actorId: user.id,
      action: "CREATE_KNOWLEDGE_ARTICLE",
      objectType: "knowledge_article",
      objectId: article.id,
      newValue: article
    });

    return NextResponse.json({ article }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
