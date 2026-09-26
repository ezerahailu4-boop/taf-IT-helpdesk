import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
    const { data } = await db.from("system_settings").select("*");
    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) settings[row.key] = row.value;
    return NextResponse.json({ settings });
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({
  itGroupChatId: z.union([z.string(), z.number(), z.null()]).optional(),
  employeesCanSetCritical: z.boolean().optional()
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const body = schema.parse(await req.json());
    const db = supabaseAdmin();

    if (body.itGroupChatId !== undefined) {
      await db.from("system_settings").upsert({ key: "it_group_chat_id", value: body.itGroupChatId, updated_at: new Date().toISOString() });
    }
    if (body.employeesCanSetCritical !== undefined) {
      await db.from("system_settings").upsert({ key: "employees_can_set_critical", value: body.employeesCanSetCritical, updated_at: new Date().toISOString() });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
