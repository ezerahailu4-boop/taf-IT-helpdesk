import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { assertIsAdmin } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/tickets/audit";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const schema = z.object({
  role: z.enum(["EMPLOYEE", "TECHNICIAN", "ADMIN"]).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  supportGroupId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional()
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireUser(req);
    assertIsAdmin(admin);
    const body = schema.parse(await req.json());
    const db = supabaseAdmin();

    const { data: before } = await db.from("users").select("*").eq("id", params.id).single();
    if (!before) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const update: Record<string, unknown> = {};
    if (body.role !== undefined) update.role = body.role;
    if (body.departmentId !== undefined) update.department_id = body.departmentId;
    if (body.locationId !== undefined) update.location_id = body.locationId;
    if (body.supportGroupId !== undefined) update.support_group_id = body.supportGroupId;
    if (body.isActive !== undefined) update.is_active = body.isActive;

    const { data: updated, error } = await db.from("users").update(update).eq("id", params.id).select("*").single();
    if (error) throw new Error(error.message);

    await writeAudit(db, { actorId: admin.id, action: "UPDATE_USER", objectType: "user", objectId: params.id, previousValue: before, newValue: updated });

    return NextResponse.json({ user: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
