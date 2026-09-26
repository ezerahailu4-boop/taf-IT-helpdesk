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

    const [{ data: groups, error }, { data: users }] = await Promise.all([
      db.from("support_groups").select("*").order("name"),
      db.from("users").select("id, support_group_id, first_name, last_name, role").eq("is_active", true)
    ]);
    if (error) throw new Error(error.message);

    const enriched = (groups ?? []).map((g: any) => ({
      ...g,
      technicians: (users ?? []).filter((u: any) => u.support_group_id === g.id)
    }));

    return NextResponse.json({ supportGroups: enriched });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional()
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const body = createSchema.parse(await req.json());
    const db = supabaseAdmin();

    const { data, error } = await db
      .from("support_groups")
      .insert({ name: body.name.trim(), description: body.description?.trim() || null, is_active: true })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(db, {
      actorId: user.id,
      action: "CREATE_SUPPORT_GROUP",
      objectType: "support_group",
      objectId: data.id,
      newValue: data
    });

    return NextResponse.json({ supportGroup: data }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
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
    if (body.description !== undefined) update.description = body.description.trim();
    if (body.isActive !== undefined) update.is_active = body.isActive;

    const { data, error } = await db
      .from("support_groups")
      .update(update)
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(db, {
      actorId: user.id,
      action: "UPDATE_SUPPORT_GROUP",
      objectType: "support_group",
      objectId: body.id,
      newValue: data
    });

    return NextResponse.json({ supportGroup: data });
  } catch (err) {
    return errorResponse(err);
  }
}
