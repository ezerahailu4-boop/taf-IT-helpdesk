import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/getUser";
import {
  getDailySubtasksReportData,
  buildDailySubtasksPdfBuffer,
  sendDailySubtasksPdfReport
} from "@/lib/reports/dailySubtasksReport";
import type { DbUser } from "@/types/db";

export const dynamic = "force-dynamic";

async function isAuthorized(req: NextRequest): Promise<{ ok: boolean; triggeredBy: string }> {
  const secret =
    req.nextUrl.searchParams.get("secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) {
    return { ok: true, triggeredBy: "cron-secret" };
  }

  if (req.headers.get("x-vercel-cron")) {
    return { ok: true, triggeredBy: "vercel-cron" };
  }

  try {
    const user = await requireUser(req);
    if (user && user.role === "ADMIN") {
      return {
        ok: true,
        triggeredBy: `${user.first_name ?? "Admin"} ${user.last_name ?? ""}`.trim()
      };
    }
  } catch {
    // Unauthenticated
  }

  return { ok: false, triggeredBy: "" };
}

async function handleReportRequest(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Unauthorized — Admin access or Cron secret required." },
      { status: 401 }
    );
  }

  let bodyMode: string | undefined;
  let bodyDate: string | undefined;
  if (req.method === "POST") {
    try {
      const json = await req.json();
      bodyMode = typeof json?.mode === "string" ? json.mode : undefined;
      bodyDate = typeof json?.date === "string" ? json.date : undefined;
    } catch {
      // Empty POST body is fine
    }
  }

  const mode = (req.nextUrl.searchParams.get("mode") || bodyMode || "send").toLowerCase();
  const targetDate = req.nextUrl.searchParams.get("date") || bodyDate || undefined;

  const db = supabaseAdmin();

  try {
    if (mode === "preview") {
      const [reportData, adminsRes] = await Promise.all([
        getDailySubtasksReportData(db, targetDate),
        db.from("users").select("*").eq("role", "ADMIN").eq("is_active", true)
      ]);

      const validAdmins = ((adminsRes.data ?? []) as DbUser[]).filter(
        (a) => a.telegram_id && Number(a.telegram_id) > 100000 && Number(a.telegram_id) !== 2025001
      );

      return NextResponse.json({
        ok: true,
        reportData,
        adminCount: validAdmins.length,
        adminNames: validAdmins.map((a) =>
          `${a.first_name ?? "Admin"} ${a.last_name ?? ""}`.trim()
        )
      });
    }

    if (mode === "download") {
      const reportData = await getDailySubtasksReportData(db, targetDate);
      const pdfBuffer = buildDailySubtasksPdfBuffer(reportData);
      const filename = `TAF_Daily_Subtasks_Report_${reportData.reportDate}.pdf`;

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store"
        }
      });
    }

    // Default: "send" -> Build PDF and deliver via Telegram to all active Admins
    const result = await sendDailySubtasksPdfReport(db, {
      targetDate,
      triggeredBy: auth.triggeredBy
    });

    return NextResponse.json({
      ok: result.ok,
      reportDate: result.reportData.reportDate,
      prettyDate: result.reportData.prettyDate,
      filename: result.filename,
      completedCount: result.reportData.metrics.totalCompleted,
      rolloverCount: result.reportData.metrics.totalRollover,
      completionRate: result.reportData.metrics.completionRate,
      adminsNotified: result.adminsNotified,
      totalAdminsFound: result.totalAdminsFound ?? result.adminsNotified,
      recipients: result.recipients,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error("[daily-subtasks-report] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate daily sub-tasks PDF report" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleReportRequest(req);
}

export async function POST(req: NextRequest) {
  return handleReportRequest(req);
}

