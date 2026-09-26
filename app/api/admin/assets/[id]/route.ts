import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();

    const { data: asset, error } = await db.from("assets").select("*").eq("id", params.id).single();
    if (error || !asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    // Check permissions: Staff or the assigned employee can view
    const isStaff = user.role === "TECHNICIAN" || user.role === "ADMIN";
    if (!isStaff && asset.assigned_user_id !== user.id) {
      return NextResponse.json({ error: "You cannot view this asset" }, { status: 403 });
    }

    const [userRes, deptRes, locRes, ticketsRes] = await Promise.all([
      asset.assigned_user_id
        ? db.from("users").select("id, first_name, last_name, telegram_username, photo_url").eq("id", asset.assigned_user_id).single()
        : Promise.resolve({ data: null }),
      asset.department_id
        ? db.from("departments").select("id, name").eq("id", asset.department_id).single()
        : Promise.resolve({ data: null }),
      asset.location_id
        ? db.from("locations").select("id, name").eq("id", asset.location_id).single()
        : Promise.resolve({ data: null }),
      db.from("tickets").select("*").eq("asset_id", asset.id).order("created_at", { ascending: false })
    ]);

    return NextResponse.json({
      asset,
      assignedUser: userRes.data,
      department: deptRes.data,
      location: locRes.data,
      relatedTickets: ticketsRes.data ?? []
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const updateSchema = z.object({
  status: z.enum(["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED"]).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  warrantyExpiresOn: z.string().nullable().optional()
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    if (user.role !== "ADMIN" && user.role !== "TECHNICIAN") {
      return NextResponse.json({ error: "Only staff can update assets" }, { status: 403 });
    }

    const body = updateSchema.parse(await req.json());
    const db = supabaseAdmin();

    const update: Record<string, unknown> = {};
    if (body.status !== undefined) update.status = body.status;
    if (body.assignedUserId !== undefined) update.assigned_user_id = body.assignedUserId;
    if (body.departmentId !== undefined) update.department_id = body.departmentId;
    if (body.locationId !== undefined) update.location_id = body.locationId;
    if (body.warrantyExpiresOn !== undefined) update.warranty_expires_on = body.warrantyExpiresOn;

    const { data: updated, error } = await db.from("assets").update(update).eq("id", params.id).select("*").single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ asset: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
