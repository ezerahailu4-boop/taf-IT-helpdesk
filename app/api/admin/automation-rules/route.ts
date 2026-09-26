import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { assertIsAdmin } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/tickets/audit";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const db = supabaseAdmin();

    const [{ data: rules, error }, { data: categories }, { data: supportGroups }] = await Promise.all([
      db.from("automation_rules").select("*").order("created_at"),
      db.from("categories").select("id, key, label"),
      db.from("support_groups").select("id, name")
    ]);
    if (error) throw new Error(error.message);

    const catMap = new Map((categories ?? []).map((c: any) => [c.id, c]));
    const sgMap = new Map((supportGroups ?? []).map((sg: any) => [sg.id, sg]));

    const enriched = (rules ?? []).map((r: any) => ({
      ...r,
      category: r.match_category_id ? catMap.get(r.match_category_id) : null,
      supportGroup: r.route_support_group_id ? sgMap.get(r.route_support_group_id) : null
    }));

    return NextResponse.json({ automationRules: enriched, categories, supportGroups });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  name: z.string().min(2).max(100),
  matchCategoryId: z.string().uuid().nullable().optional(),
  matchPriority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable().optional(),
  routeSupportGroupId: z.string().uuid().nullable().optional(),
  notifyRole: z.enum(["EMPLOYEE", "TECHNICIAN", "ADMIN"]).nullable().optional()
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const body = createSchema.parse(await req.json());
    const db = supabaseAdmin();

    const { data, error } = await db
      .from("automation_rules")
      .insert({
        name: body.name.trim(),
        match_category_id: body.matchCategoryId || null,
        match_priority: body.matchPriority || null,
        route_support_group_id: body.routeSupportGroupId || null,
        notify_role: body.notifyRole || null,
        is_active: true
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(db, {
      actorId: user.id,
      action: "CREATE_AUTOMATION_RULE",
      objectType: "automation_rule",
      objectId: data.id,
      newValue: data
    });

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(100).optional(),
  matchCategoryId: z.string().uuid().nullable().optional(),
  matchPriority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable().optional(),
  routeSupportGroupId: z.string().uuid().nullable().optional(),
  notifyRole: z.enum(["EMPLOYEE", "TECHNICIAN", "ADMIN"]).nullable().optional(),
  isActive: z.boolean().optional()
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const body = updateSchema.parse(await req.json());
    const db = supabaseAdmin();

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.matchCategoryId !== undefined) update.match_category_id = body.matchCategoryId;
    if (body.matchPriority !== undefined) update.match_priority = body.matchPriority;
    if (body.routeSupportGroupId !== undefined) update.route_support_group_id = body.routeSupportGroupId;
    if (body.notifyRole !== undefined) update.notify_role = body.notifyRole;
    if (body.isActive !== undefined) update.is_active = body.isActive;

    const { data, error } = await db
      .from("automation_rules")
      .update(update)
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(db, {
      actorId: user.id,
      action: "UPDATE_AUTOMATION_RULE",
      objectType: "automation_rule",
      objectId: body.id,
      newValue: data
    });

    return NextResponse.json({ rule: data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing rule id" }, { status: 400 });

    const db = supabaseAdmin();
    const { error } = await db.from("automation_rules").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await writeAudit(db, {
      actorId: user.id,
      action: "DELETE_AUTOMATION_RULE",
      objectType: "automation_rule",
      objectId: id
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
