import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/getUser";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateTicketNumber } from "@/lib/tickets/ticketNumber";
import { getSlaPolicy, addMinutes } from "@/lib/sla";
import { recordStatusChange, writeAudit } from "@/lib/tickets/audit";
import { assertCanSetPriority } from "@/lib/permissions";
import { notifyNewTicketToItGroup, notifyCriticalToAdmins } from "@/lib/notifications";
import { errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const createTicketSchema = z.object({
  categoryKey: z.string().min(1),
  subject: z.string().min(3).max(150),
  description: z.string().min(3).max(4000),
  locationId: z.string().uuid().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM")
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const db = supabaseAdmin();
    const scope = req.nextUrl.searchParams.get("scope") ?? "mine";
    const status = req.nextUrl.searchParams.get("status");
    const priority = req.nextUrl.searchParams.get("priority");
    const categoryId = req.nextUrl.searchParams.get("categoryId");
    const departmentId = req.nextUrl.searchParams.get("departmentId");
    const technicianId = req.nextUrl.searchParams.get("technicianId");
    const q = req.nextUrl.searchParams.get("q")?.trim();

    let query = db.from("tickets").select("*").order("created_at", { ascending: false }).limit(100);

    if (user.role === "EMPLOYEE") {
      query = query.eq("requester_id", user.id);
    } else if (user.role === "TECHNICIAN") {
      if (scope === "unassigned") query = query.is("assigned_technician_id", null);
      else if (scope === "mine") query = query.eq("assigned_technician_id", user.id);
    }
    // ADMIN can see every ticket or filter by scope

    if (status) query = query.eq("status", status);
    if (priority) query = query.eq("priority", priority);
    if (categoryId) query = query.eq("category_id", categoryId);
    if (departmentId) query = query.eq("department_id", departmentId);
    if (technicianId) query = query.eq("assigned_technician_id", technicianId);
    if (q) query = query.or(`subject.ilike.%${q}%,ticket_number.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const tickets = (data ?? []) as any[];
    if (user.role !== "EMPLOYEE" && tickets.length > 0) {
      const requesterIds = Array.from(new Set(tickets.map((t) => t.requester_id).filter(Boolean)));
      const deptIds = Array.from(new Set(tickets.map((t) => t.department_id).filter(Boolean)));

      const [{ data: usersList }, { data: deptList }] = await Promise.all([
        db.from("users").select("id, first_name, last_name, telegram_username").in("id", requesterIds),
        db.from("departments").select("id, name").in("id", deptIds)
      ]);

      const userMap = new Map((usersList ?? []).map((u: any) => [u.id, u]));
      const deptMap = new Map((deptList ?? []).map((d: any) => [d.id, d.name]));

      for (const t of tickets) {
        const reqUser: any = userMap.get(t.requester_id);
        if (reqUser) {
          t.requester_name = `${reqUser.first_name ?? ""} ${reqUser.last_name ?? ""}`.trim() || "Employee";
          t.requester_username = reqUser.telegram_username;
        }
        if (t.department_id) {
          t.department_name = deptMap.get(t.department_id);
        }
      }
    }

    return NextResponse.json({ tickets });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = createTicketSchema.parse(await req.json());
    const db = supabaseAdmin();

    assertCanSetPriority(user, body.priority, await employeesCanSetCritical(db));

    const { data: category, error: catErr } = await db
      .from("categories")
      .select("*")
      .eq("key", body.categoryKey)
      .single();
    if (catErr || !category) return NextResponse.json({ error: "Unknown category" }, { status: 400 });

    // Evaluate automation rules for routing
    let routedGroupId = category.default_support_group_id;
    let shouldNotifyAdmin = body.priority === "CRITICAL";

    const { data: autoRules } = await db.from("automation_rules").select("*").eq("is_active", true);
    for (const rule of autoRules ?? []) {
      const matchCat = !rule.match_category_id || rule.match_category_id === category.id;
      const matchPri = !rule.match_priority || rule.match_priority === body.priority;
      if (matchCat && matchPri) {
        if (rule.route_support_group_id) routedGroupId = rule.route_support_group_id;
        if (rule.notify_role === "ADMIN") shouldNotifyAdmin = true;
      }
    }

    const slaPolicy = await getSlaPolicy(db, body.priority);
    const now = new Date();
    const ticketNumber = await generateTicketNumber(db);

    // Auto-route to primary triage technician (@tinsu2025 / ID 6319536255)
    const { data: dispatcher } = await db
      .from("users")
      .select("id, telegram_id, first_name, last_name, telegram_username")
      .or("telegram_username.ilike.tinsu2025,telegram_id.eq.6319536255")
      .maybeSingle();

    const assignedTechId = dispatcher?.id ?? null;
    const initialStatus = assignedTechId ? "ASSIGNED" : "NEW";

    const { data: ticket, error } = await db
      .from("tickets")
      .insert({
        ticket_number: ticketNumber,
        requester_id: user.id,
        department_id: user.department_id,
        category_id: category.id,
        support_group_id: routedGroupId,
        subject: body.subject,
        description: body.description,
        location_id: body.locationId ?? user.location_id,
        asset_id: body.assetId ?? null,
        priority: body.priority,
        status: initialStatus,
        assigned_technician_id: assignedTechId,
        sla_policy_id: slaPolicy.id,
        response_due_at: addMinutes(now, slaPolicy.response_minutes).toISOString(),
        resolution_due_at: addMinutes(now, slaPolicy.resolution_minutes).toISOString()
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await recordStatusChange(db, {
      ticketId: ticket.id,
      changedBy: user.id,
      from: null,
      to: initialStatus,
      note: assignedTechId ? "Assigned to @tinsu2025 for primary triage" : undefined
    });
    await writeAudit(db, { actorId: user.id, action: "CREATE", objectType: "ticket", objectId: ticket.id, newValue: ticket });

    const [{ data: dept }, { data: loc }] = await Promise.all([
      user.department_id ? db.from("departments").select("name").eq("id", user.department_id).single() : Promise.resolve({ data: null }),
      (body.locationId ?? user.location_id)
        ? db.from("locations").select("name").eq("id", body.locationId ?? user.location_id!).single()
        : Promise.resolve({ data: null })
    ]);

    await notifyNewTicketToItGroup(db, ticket, user, `${category.icon ?? ""} ${category.label}`.trim(), dept?.name ?? "—", loc?.name ?? "—");
    if (shouldNotifyAdmin) await notifyCriticalToAdmins(db, ticket);

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

async function employeesCanSetCritical(db: ReturnType<typeof supabaseAdmin>) {
  const { data } = await db.from("system_settings").select("value").eq("key", "employees_can_set_critical").single();
  return data?.value === true;
}

