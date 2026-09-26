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
    const { data: policies, error } = await db.from("sla_policies").select("*");
    if (error) throw new Error(error.message);

    // Order logically: CRITICAL -> HIGH -> MEDIUM -> LOW
    const orderMap: Record<string, number> = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
    const sorted = [...(policies ?? [])].sort((a, b) => (orderMap[a.priority] ?? 99) - (orderMap[b.priority] ?? 99));

    return NextResponse.json({ slaPolicies: sorted });
  } catch (err) {
    return errorResponse(err);
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  responseMinutes: z.number().int().min(1).max(43200),
  resolutionMinutes: z.number().int().min(1).max(43200)
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const body = updateSchema.parse(await req.json());
    const db = supabaseAdmin();

    const { data: before } = await db.from("sla_policies").select("*").eq("id", body.id).single();
    if (!before) return NextResponse.json({ error: "SLA policy not found" }, { status: 404 });

    const { data: updated, error } = await db
      .from("sla_policies")
      .update({
        response_minutes: body.responseMinutes,
        resolution_minutes: body.resolutionMinutes,
        updated_at: new Date().toISOString()
      })
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(db, {
      actorId: user.id,
      action: "UPDATE_SLA_POLICY",
      objectType: "sla_policy",
      objectId: body.id,
      previousValue: before,
      newValue: updated
    });

    return NextResponse.json({ policy: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
