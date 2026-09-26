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
    const { data, error } = await db.from("departments").select("*").order("name");
    if (error) throw new Error(error.message);
    return NextResponse.json({ departments: data });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  name: z.string().min(2).max(100)
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const body = createSchema.parse(await req.json());
    const db = supabaseAdmin();

    const { data, error } = await db
      .from("departments")
      .insert({ name: body.name.trim(), is_active: true })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(db, {
      actorId: user.id,
      action: "CREATE_DEPARTMENT",
      objectType: "department",
      objectId: data.id,
      newValue: data
    });

    return NextResponse.json({ department: data }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(100).optional(),
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
    if (body.isActive !== undefined) update.is_active = body.isActive;

    const { data, error } = await db
      .from("departments")
      .update(update)
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(db, {
      actorId: user.id,
      action: "UPDATE_DEPARTMENT",
      objectType: "department",
      objectId: body.id,
      newValue: data
    });

    return NextResponse.json({ department: data });
  } catch (err) {
    return errorResponse(err);
  }
}
