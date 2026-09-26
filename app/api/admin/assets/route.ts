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
    const { data, error } = await db.from("assets").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ assets: data });
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({
  assetTag: z.string().min(1),
  type: z.string().min(1),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  warrantyExpiresOn: z.string().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable()
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    assertIsAdmin(user);
    const body = schema.parse(await req.json());
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("assets")
      .insert({
        asset_tag: body.assetTag,
        type: body.type,
        brand: body.brand,
        model: body.model,
        serial_number: body.serialNumber,
        warranty_expires_on: body.warrantyExpiresOn || null,
        assigned_user_id: body.assignedUserId ?? null
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ asset: data }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
