import "server-only";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { sendDocument, miniAppButton } from "@/lib/telegram/bot";
import type { DbProjectTask, DbProjectSubtask, DbUser } from "@/types/db";

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000; // East Africa Time (UTC+3, fixed year-round)

export function getEatDateString(date: Date = new Date()): string {
  const eat = new Date(date.getTime() + EAT_OFFSET_MS);
  return eat.toISOString().slice(0, 10);
}

/**
 * Normalizes Postgres DATE / ISO timestamp values (e.g. "2026-11-17T21:00:00.000Z" or Date objects)
 * into clean "YYYY-MM-DD" calendar dates in East Africa Time (UTC+3).
 */
export function normalizeDueDateEat(raw?: string | Date | null): string {
  if (!raw) return "";
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return getEatDateString(parsed);
    return trimmed.slice(0, 10);
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return getEatDateString(raw);
  }
  return "";
}

export function formatEatDateTime(date: Date = new Date()): string {
  const eat = new Date(date.getTime() + EAT_OFFSET_MS);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[eat.getUTCMonth()];
  const day = eat.getUTCDate();
  const year = eat.getUTCFullYear();
  let hours = eat.getUTCHours();
  const minutes = String(eat.getUTCMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm} EAT`;
}

export function formatEatTimeOnly(iso?: string | null): string {
  if (!iso) return "Today";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Today";
  const eat = new Date(parsed.getTime() + EAT_OFFSET_MS);
  let hours = eat.getUTCHours();
  const minutes = String(eat.getUTCMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

export function formatPrettyDate(yyyyMmDd: string): string {
  const parts = yyyyMmDd.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return yyyyMmDd;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function daysBetweenDates(earlierYmd: string, laterYmd: string): number {
  const a = new Date(`${earlierYmd}T00:00:00Z`).getTime();
  const b = new Date(`${laterYmd}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

const ETHIOPIC_CONSONANTS: Record<number, string> = {
  0x1200: "h", 0x1208: "l", 0x1210: "h", 0x1218: "m", 0x1220: "s", 0x1228: "r",
  0x1230: "s", 0x1238: "sh", 0x1240: "q", 0x1260: "b", 0x1268: "v", 0x1270: "t",
  0x1278: "ch", 0x1280: "h", 0x1290: "n", 0x1298: "ny", 0x12a0: "", 0x12a8: "k",
  0x12b8: "h", 0x12c8: "w", 0x12d0: "", 0x12d8: "z", 0x12e0: "zh", 0x12e8: "y",
  0x12f0: "d", 0x1300: "j", 0x1308: "g", 0x1320: "t", 0x1328: "ch", 0x1330: "p",
  0x1338: "ts", 0x1340: "ts", 0x1348: "f", 0x1350: "p"
};
const ETHIOPIC_VOWELS = ["e", "u", "i", "a", "e", "", "o", "wa"];

function transliterateEthiopic(input: string): string {
  // Known brand/project names first for natural capitalization
  let out = input.replace(/ነዳጅ\s*አለ/g, "Nedaj Ale");
  out = out.replace(/[\u1200-\u1357]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code - (code % 8);
    const vowelIdx = code % 8;
    const cons = ETHIOPIC_CONSONANTS[base];
    if (cons === undefined) return "";
    // Special case: አ (0x12a0) and ዐ (0x12d0) base form sounds like "a"
    if ((base === 0x12a0 || base === 0x12d0) && vowelIdx === 0) return "a";
    return cons + (ETHIOPIC_VOWELS[vowelIdx] ?? "");
  });
  return out;
}

function cleanPdfText(value?: string | null): string {
  if (!value) return "";
  return transliterateEthiopic(String(value))
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatUserName(u?: DbUser | null): string {
  if (!u) return "Unassigned";
  const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  if (full) return full;
  if (u.telegram_username) return `@${u.telegram_username}`;
  return "Technician";
}

function getInitials(name: string): string {
  const parts = cleanPdfText(name)
    .replace(/^@/, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarPalette(seed: string): { bg: [number, number, number]; fg: [number, number, number] } {
  const palettes: Array<{ bg: [number, number, number]; fg: [number, number, number] }> = [
    { bg: [224, 231, 255], fg: [55, 48, 163] },   // Indigo
    { bg: [209, 250, 229], fg: [6, 95, 70] },     // Emerald
    { bg: [224, 242, 254], fg: [7, 89, 133] },    // Sky
    { bg: [243, 232, 255], fg: [107, 33, 168] },  // Violet
    { bg: [254, 243, 199], fg: [146, 64, 14] },   // Amber
    { bg: [255, 228, 230], fg: [159, 18, 57] }    // Rose
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  return palettes[Math.abs(hash) % palettes.length];
}

function getPriorityStyle(priority: string): {
  bg: [number, number, number];
  border: [number, number, number];
  fg: [number, number, number];
} {
  switch (String(priority).toUpperCase()) {
    case "CRITICAL":
      return { bg: [254, 226, 226], border: [252, 165, 165], fg: [185, 28, 28] };
    case "HIGH":
      return { bg: [255, 237, 213], border: [253, 186, 116], fg: [194, 65, 12] };
    case "LOW":
      return { bg: [209, 250, 229], border: [167, 243, 208], fg: [6, 95, 70] };
    default: // MEDIUM
      return { bg: [254, 243, 199], border: [252, 211, 77], fg: [146, 64, 14] };
  }
}

/**
 * Draws a razor-sharp vector circular arc ring (donut chart) using dense line segments.
 */
function drawArcRing(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  startDeg: number,
  sweepDeg: number,
  rgb: [number, number, number]
) {
  if (sweepDeg <= 0.5) return;
  const steps = Math.max(24, Math.ceil((sweepDeg / 360) * 140));
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(thickness);
  doc.setLineCap("round");

  let prevX = cx + radius * Math.cos((startDeg * Math.PI) / 180);
  let prevY = cy + radius * Math.sin((startDeg * Math.PI) / 180);

  for (let i = 1; i <= steps; i++) {
    const angleRad = ((startDeg + (sweepDeg * i) / steps) * Math.PI) / 180;
    const x = cx + radius * Math.cos(angleRad);
    const y = cy + radius * Math.sin(angleRad);
    doc.line(prevX, prevY, x, y);
    prevX = x;
    prevY = y;
  }

  doc.setLineCap("butt");
}

export interface DailySubtaskReportItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: "COMPLETED" | "PENDING";
  completedAt: string | null;
  completedTimeLabel: string;
  rolloverDays: number;
  rolloverLabel: string;
  taskId: string;
  taskTitle: string;
  taskPriority: string;
  taskStatus: string;
  taskProgress: number;
  progressWeight: number;
  assigneeName: string;
  assigneeUsername: string | null;
  completedByName: string;
  completedByUsername: string | null;
}

export interface TechnicianDaySummary {
  userId: string;
  name: string;
  username: string | null;
  completedCount: number;
  rolloverCount: number;
}

export interface DailySubtasksReportData {
  reportDate: string; // YYYY-MM-DD (EAT)
  prettyDate: string;
  generatedAtEat: string;
  adminNames?: string[];
  completedItems: DailySubtaskReportItem[];
  rolloverItems: DailySubtaskReportItem[];
  metrics: {
    totalCompleted: number;
    totalRollover: number;
    totalActionable: number;
    completionRate: number;
    projectsProgressed: number;
    activeTechnicians: number;
  };
  technicianSummary: TechnicianDaySummary[];
}

export async function getDailySubtasksReportData(
  db: any,
  targetDate?: string
): Promise<DailySubtasksReportData> {
  const reportDate =
    targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())
      ? targetDate.trim()
      : getEatDateString();

  const [subtasksRes, tasksRes, usersRes] = await Promise.all([
    db.from("project_subtasks").select("*"),
    db.from("project_tasks").select("*"),
    db.from("users").select("*")
  ]);

  const allSubtasks = (subtasksRes.data ?? []) as DbProjectSubtask[];
  const allTasks = (tasksRes.data ?? []) as DbProjectTask[];
  const allUsers = (usersRes.data ?? []) as DbUser[];

  const tasksMap = new Map<string, DbProjectTask>(allTasks.map((t) => [t.id, t]));
  const usersMap = new Map<string, DbUser>(allUsers.map((u) => [u.id, u]));

  const adminNames = allUsers
    .filter(
      (u) =>
        u.role === "ADMIN" &&
        u.is_active &&
        u.telegram_id &&
        Number(u.telegram_id) > 100000 &&
        Number(u.telegram_id) !== 2025001
    )
    .map((u) => formatUserName(u));

  const completedItems: DailySubtaskReportItem[] = [];
  const rolloverItems: DailySubtaskReportItem[] = [];

  for (const s of allSubtasks) {
    const task = tasksMap.get(s.task_id);
    if (!task) continue;

    const assignee = s.assigned_to_id ? usersMap.get(s.assigned_to_id) ?? null : null;
    const completedBy = s.completed_by_id
      ? usersMap.get(s.completed_by_id) ?? assignee
      : assignee;
    const dueDateYmd = normalizeDueDateEat(s.due_date as unknown as string | Date | null);

    if (s.status === "COMPLETED") {
      const completedDateEat = s.completed_at
        ? getEatDateString(new Date(s.completed_at))
        : dueDateYmd;

      if (completedDateEat === reportDate) {
        completedItems.push({
          id: s.id,
          title: s.title,
          description: s.description ?? null,
          dueDate: dueDateYmd || reportDate,
          status: "COMPLETED",
          completedAt: s.completed_at ?? null,
          completedTimeLabel: formatEatTimeOnly(s.completed_at),
          rolloverDays: 0,
          rolloverLabel: "Completed",
          taskId: task.id,
          taskTitle: task.title,
          taskPriority: task.priority,
          taskStatus: task.status,
          taskProgress: Number(task.progress ?? 0),
          progressWeight: Number(s.progress_weight ?? 0),
          assigneeName: formatUserName(assignee),
          assigneeUsername: assignee?.telegram_username ?? null,
          completedByName: formatUserName(completedBy),
          completedByUsername: completedBy?.telegram_username ?? null
        });
      }
    } else if (s.status === "PENDING") {
      const parentInactive =
        task.status === "COMPLETED" ||
        task.status === "CANCELLED" ||
        task.status === "BLOCKED";
      if (!parentInactive && dueDateYmd && dueDateYmd <= reportDate) {
        const lagDays = daysBetweenDates(dueDateYmd, reportDate);
        rolloverItems.push({
          id: s.id,
          title: s.title,
          description: s.description ?? null,
          dueDate: dueDateYmd,
          status: "PENDING",
          completedAt: null,
          completedTimeLabel: "-",
          rolloverDays: lagDays,
          rolloverLabel: lagDays > 0 ? `Roll (+${lagDays}d)` : "Roll to Next Day",
          taskId: task.id,
          taskTitle: task.title,
          taskPriority: task.priority,
          taskStatus: task.status,
          taskProgress: Number(task.progress ?? 0),
          progressWeight: Number(s.progress_weight ?? 0),
          assigneeName: formatUserName(assignee),
          assigneeUsername: assignee?.telegram_username ?? null,
          completedByName: formatUserName(assignee),
          completedByUsername: assignee?.telegram_username ?? null
        });
      }
    }
  }

  completedItems.sort((a, b) => {
    const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return ta - tb;
  });

  const priorityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  rolloverItems.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return (priorityRank[a.taskPriority] ?? 2) - (priorityRank[b.taskPriority] ?? 2);
  });

  const techMap = new Map<string, TechnicianDaySummary>();
  const ensureTech = (key: string, name: string, username: string | null) => {
    if (!techMap.has(key)) {
      techMap.set(key, {
        userId: key,
        name,
        username,
        completedCount: 0,
        rolloverCount: 0
      });
    }
    return techMap.get(key)!;
  };

  for (const item of completedItems) {
    const key = item.completedByUsername || item.completedByName;
    const entry = ensureTech(key, item.completedByName, item.completedByUsername);
    entry.completedCount += 1;
  }
  for (const item of rolloverItems) {
    const key = item.assigneeUsername || item.assigneeName;
    const entry = ensureTech(key, item.assigneeName, item.assigneeUsername);
    entry.rolloverCount += 1;
  }

  const technicianSummary = Array.from(techMap.values()).sort(
    (a, b) => b.completedCount - a.completedCount || b.rolloverCount - a.rolloverCount
  );

  const totalCompleted = completedItems.length;
  const totalRollover = rolloverItems.length;
  const totalActionable = totalCompleted + totalRollover;
  const completionRate =
    totalActionable > 0 ? Math.round((totalCompleted / totalActionable) * 100) : 0;
  const projectsProgressed = new Set(completedItems.map((i) => i.taskId)).size;
  const activeTechnicians = new Set(
    completedItems.map((i) => i.completedByUsername || i.completedByName)
  ).size;

  return {
    reportDate,
    prettyDate: formatPrettyDate(reportDate),
    generatedAtEat: formatEatDateTime(new Date()),
    adminNames,
    completedItems,
    rolloverItems,
    metrics: {
      totalCompleted,
      totalRollover,
      totalActionable,
      completionRate,
      projectsProgressed,
      activeTechnicians
    },
    technicianSummary
  };
}

/**
 * Generates an editorial, boardroom-grade Landscape A4 PDF buffer for the daily sub-tasks report.
 */
export function buildDailySubtasksPdfBuffer(data: DailySubtasksReportData): Buffer {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210
  const marginX = 13;
  const contentWidth = pageWidth - marginX * 2; // 271
  const docRefId = `TAF-OPS-${data.reportDate.replace(/-/g, "")}`;

  // Paint soft alabaster canvas helper
  const paintPageCanvas = (startY = 0) => {
    doc.setFillColor(248, 250, 252); // #F8FAFC
    doc.rect(0, startY, pageWidth, pageHeight - startY, "F");
  };

  // Elevated white card helper with soft architectural shadow
  const drawElevatedCard = (
    x: number,
    y: number,
    w: number,
    h: number,
    radius = 2.6,
    borderRgb: [number, number, number] = [226, 232, 240]
  ) => {
    // Subtle drop shadow
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(x + 0.5, y + 0.65, w, h, radius, radius, "F");
    // Pure white elevated surface
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, radius, radius, "FD");
  };

  // =========================================================================
  // 1. EDITORIAL HERO HEADER BANNER (Deep Midnight Slate + Geometric Rings + Donut Chart)
  // =========================================================================
  const heroH = 34.5;
  doc.setFillColor(15, 23, 42); // #0F172A
  doc.rect(0, 0, pageWidth, heroH, "F");

  // Subtle geometric decorative rings inside hero background
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  doc.circle(pageWidth - 36, 17, 30, "S");
  doc.circle(pageWidth - 36, 17, 20, "S");
  doc.setDrawColor(49, 46, 129);
  doc.setLineWidth(0.25);
  doc.circle(pageWidth - 90, 34, 22, "S");

  // Clip rings cleanly at hero bottom edge by painting the alabaster page canvas below heroH
  paintPageCanvas(heroH);

  // Precision dual-tone top ribbon
  doc.setFillColor(79, 70, 229); // Indigo-600
  doc.rect(0, 0, pageWidth * 0.72, 2.2, "F");
  doc.setFillColor(14, 165, 233); // Sky-500
  doc.rect(pageWidth * 0.72, 0, pageWidth * 0.28, 2.2, "F");

  // Brand Monogram Icon Box (Left)
  const logoX = marginX;
  const logoY = 8.2;
  const logoSize = 13.5;
  doc.setFillColor(67, 56, 202); // Indigo-700
  doc.setDrawColor(129, 140, 248); // Indigo-400
  doc.setLineWidth(0.3);
  doc.roundedRect(logoX, logoY, logoSize, logoSize, 3, 3, "FD");
  // Subtle inner accent bar inside monogram
  doc.setFillColor(56, 189, 248); // Sky-400
  doc.roundedRect(logoX + 2.4, logoY + 10.2, logoSize - 4.8, 1.2, 0.6, 0.6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.3);
  doc.setTextColor(255, 255, 255);
  doc.text("TAF", logoX + logoSize / 2, logoY + 7.8, { align: "center" });

  // Title & Metadata Block
  const titleX = logoX + logoSize + 5;
  // Micro-label + Doc Ref Pill
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(129, 140, 248); // Indigo-400
  doc.text("TAF IT OPERATIONS  /  EXECUTIVE DAILY BRIEF", titleX, 10.6);

  // Subtle Ref Pill beside micro-label
  const refPillX = titleX + 60;
  doc.setFillColor(30, 41, 59);
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.2);
  doc.roundedRect(refPillX, 7.1, 31, 4.6, 1.4, 1.4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.1);
  doc.setTextColor(148, 163, 184);
  doc.text(docRefId, refPillX + 15.5, 10.2, { align: "center" });

  // Main Headline
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text("Daily Sub-Tasks Execution Report", titleX, 19.3);

  // Crisp Subtitle Line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.3);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${cleanPdfText(data.prettyDate)}   •   Completed Action Items & Roll for the Next Day   •   5:00 PM EAT Dispatch`,
    titleX,
    25.8
  );

  // Subtle bottom metadata strip inside hero
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${data.generatedAtEat}`, titleX, 30.8);

  // Right-Side Executive Donut Ring Card
  const donutCardW = 72;
  const donutCardH = 24;
  const donutCardX = pageWidth - marginX - donutCardW;
  const donutCardY = 5.8;

  doc.setFillColor(30, 41, 59); // Slate-800
  doc.setDrawColor(51, 65, 85); // Slate-700
  doc.setLineWidth(0.3);
  doc.roundedRect(donutCardX, donutCardY, donutCardW, donutCardH, 3, 3, "FD");

  const rate = data.metrics.completionRate;
  const hasActionable = data.metrics.totalActionable > 0;
  const ringRgb: [number, number, number] = !hasActionable
    ? [148, 163, 184]
    : rate >= 75
    ? [52, 211, 153] // Emerald-400
    : rate >= 45
    ? [251, 191, 36] // Amber-400
    : [251, 113, 133]; // Rose-400

  const healthLabel = !hasActionable
    ? "NO ACTIVITY"
    : rate >= 75
    ? "ON TRACK"
    : rate >= 45
    ? "IN PROGRESS"
    : "ATTENTION";

  // Donut Ring Center
  const ringCx = donutCardX + 14;
  const ringCy = donutCardY + 12;
  const ringR = 7.8;

  // Base Track Ring (full 360)
  drawArcRing(doc, ringCx, ringCy, ringR, 2.1, 0, 360, [51, 65, 85]);
  // Progress Arc Ring starting at 12 o'clock (-90 deg)
  if (hasActionable && rate > 0) {
    drawArcRing(doc, ringCx, ringCy, ringR, 2.2, -90, (Math.min(100, rate) / 100) * 360, ringRgb);
  }
  // Center % label inside donut
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.0);
  doc.setTextColor(255, 255, 255);
  doc.text(hasActionable ? `${rate}%` : "N/A", ringCx, ringCy + 1.0, { align: "center" });

  // Right text inside Donut Card
  const ringTextX = donutCardX + 26.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.3);
  doc.setTextColor(148, 163, 184);
  doc.text("EXECUTION SCORE", ringTextX, donutCardY + 6.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.8);
  doc.setTextColor(255, 255, 255);
  doc.text(`${data.metrics.totalCompleted} / ${data.metrics.totalActionable}`, ringTextX, donutCardY + 13.0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.7);
  doc.setTextColor(148, 163, 184);
  doc.text("sub-tasks closed", ringTextX + 15.5, donutCardY + 12.8);

  // Health Status Pill inside Donut Card
  doc.setFillColor(15, 23, 42);
  doc.setDrawColor(ringRgb[0], ringRgb[1], ringRgb[2]);
  doc.setLineWidth(0.22);
  doc.roundedRect(ringTextX, donutCardY + 15.8, 28, 4.8, 1.5, 1.5, "FD");
  doc.setFillColor(ringRgb[0], ringRgb[1], ringRgb[2]);
  doc.circle(ringTextX + 3.2, donutCardY + 18.2, 1.0, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.9);
  doc.setTextColor(ringRgb[0], ringRgb[1], ringRgb[2]);
  doc.text(healthLabel, ringTextX + 6, donutCardY + 19.0);

  // =========================================================================
  // 2. FOUR ELEVATED EXECUTIVE KPI CARDS
  // =========================================================================
  let cursorY = 39.2;
  const kpiGap = 4.5;
  const kpiW = (contentWidth - kpiGap * 3) / 4;
  const kpiH = 19.5;

  const multiDayRollCount = data.rolloverItems.filter((i) => i.rolloverDays > 0).length;
  const avgGoalProgress =
    data.completedItems.length > 0
      ? Math.round(
          data.completedItems.reduce((sum, i) => sum + i.taskProgress, 0) /
            data.completedItems.length
        )
      : 0;

  const kpiCards: Array<{
    label: string;
    value: string;
    detail: string;
    accent: [number, number, number];
    tint: [number, number, number];
    tag: string;
  }> = [
    {
      label: "COMPLETED TODAY",
      value: String(data.metrics.totalCompleted),
      detail: "Daily action items closed",
      accent: [5, 150, 105], // Emerald-600
      tint: [236, 253, 245],
      tag: "CLOSED"
    },
    {
      label: "ROLL FOR THE NEXT DAY",
      value: String(data.metrics.totalRollover),
      detail:
        multiDayRollCount > 0
          ? `${multiDayRollCount} multi-day carry-over`
          : "Carrying into tomorrow's queue",
      accent: [217, 119, 6], // Amber-600
      tint: [255, 251, 235],
      tag: multiDayRollCount > 0 ? "PRIORITY" : "QUEUED"
    },
    {
      label: "PROJECTS PROGRESSED",
      value: String(data.metrics.projectsProgressed),
      detail:
        avgGoalProgress > 0
          ? `Avg ${avgGoalProgress}% parent goal progress`
          : "Parent IT goals advanced",
      accent: [67, 56, 202], // Indigo-700
      tint: [238, 242, 255],
      tag: "GOALS"
    },
    {
      label: "ACTIVE CONTRIBUTORS",
      value: String(data.metrics.activeTechnicians),
      detail:
        data.technicianSummary.length > 0
          ? `Of ${data.technicianSummary.length} assigned today`
          : "Technicians closing tasks",
      accent: [2, 132, 199], // Sky-600
      tint: [240, 249, 255],
      tag: "TEAM"
    }
  ];

  kpiCards.forEach((card, i) => {
    const x = marginX + i * (kpiW + kpiGap);
    drawElevatedCard(x, cursorY, kpiW, kpiH, 2.6);

    // Sleek top colored hairline accent inside card
    doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.roundedRect(x + 4, cursorY, kpiW - 8, 1.3, 0.6, 0.6, "F");

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + 4.8, cursorY + 6.4);

    // Top-right micro status pill
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    const tagW = doc.getTextWidth(card.tag) + 4.8;
    doc.setFillColor(card.tint[0], card.tint[1], card.tint[2]);
    doc.roundedRect(x + kpiW - tagW - 4.2, cursorY + 3.2, tagW, 4.4, 1.3, 1.3, "F");
    doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.text(card.tag, x + kpiW - tagW / 2 - 4.2, cursorY + 6.1, { align: "center" });

    // Large authoritative tabular figure
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16.5);
    doc.setTextColor(15, 23, 42);
    doc.text(card.value, x + 4.8, cursorY + 13.5);

    // Subtle contextual sub-metric
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(card.detail, x + 4.8, cursorY + 17.5);
  });

  cursorY += kpiH + 4.5;

  // =========================================================================
  // 3. TEAM ACCOUNTABILITY STRIP (Avatars + Stacked Emerald/Amber Ratio Bars)
  // =========================================================================
  if (data.technicianSummary.length > 0) {
    const stripH = 16.5;
    drawElevatedCard(marginX, cursorY, contentWidth, stripH, 2.6);

    // Left vertical label area
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(marginX + 1.5, cursorY + 1.5, 34, stripH - 3, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    doc.setTextColor(51, 65, 85);
    doc.text("TEAM OUTPUT", marginX + 18.5, cursorY + 7.4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.1);
    doc.setTextColor(100, 116, 139);
    doc.text("Done vs. Roll", marginX + 18.5, cursorY + 11.4, { align: "center" });

    const visibleTechs = data.technicianSummary.slice(0, 5);
    const slotAreaX = marginX + 38.5;
    const slotAreaW = contentWidth - 41;
    const slotGap = 3.5;
    const slotW = Math.min(76, (slotAreaW - slotGap * (visibleTechs.length - 1)) / visibleTechs.length);

    visibleTechs.forEach((tech, idx) => {
      const sx = slotAreaX + idx * (slotW + slotGap);
      const sy = cursorY + 2.0;
      const sh = stripH - 4.0;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.roundedRect(sx, sy, slotW, sh, 2, 2, "FD");

      // Initials Avatar Circle
      const pal = getAvatarPalette(tech.name);
      const avCx = sx + 5.6;
      const avCy = sy + sh / 2;
      doc.setFillColor(pal.bg[0], pal.bg[1], pal.bg[2]);
      doc.circle(avCx, avCy, 3.4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.2);
      doc.setTextColor(pal.fg[0], pal.fg[1], pal.fg[2]);
      doc.text(getInitials(tech.name), avCx, avCy + 0.85, { align: "center" });

      // Name + Stats
      const tx = sx + 10.8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.4);
      doc.setTextColor(15, 23, 42);
      doc.text(cleanPdfText(tech.name).slice(0, 18), tx, sy + 4.5);

      const statText = `${tech.completedCount} done  |  ${tech.rolloverCount} roll`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.2);
      doc.setTextColor(100, 116, 139);
      doc.text(statText, tx, sy + 7.8);

      // Mini stacked ratio bar (emerald vs amber)
      const totalT = tech.completedCount + tech.rolloverCount;
      const barW = slotW - 13.5;
      const barY = sy + 9.4;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(tx, barY, barW, 1.7, 0.85, 0.85, "F");
      if (totalT > 0) {
        const doneW = (barW * tech.completedCount) / totalT;
        const rollW = barW - doneW;
        if (doneW > 0.5) {
          doc.setFillColor(16, 185, 129);
          doc.roundedRect(tx, barY, doneW, 1.7, 0.85, 0.85, "F");
        }
        if (rollW > 0.5) {
          doc.setFillColor(245, 158, 11);
          doc.roundedRect(tx + doneW, barY, rollW, 1.7, 0.85, 0.85, "F");
        }
      }
    });

    cursorY += stripH + 5.2;
  } else {
    cursorY += 2;
  }

  // =========================================================================
  // REUSABLE ARCHITECTURAL SECTION HEADER + CUSTOM CELL RENDERERS
  // =========================================================================
  const drawSectionBar = (
    y: number,
    title: string,
    countBadge: string,
    rightNote: string,
    accentRgb: [number, number, number],
    badgeBgRgb: [number, number, number],
    badgeFgRgb: [number, number, number],
    iconType: "check" | "roll"
  ) => {
    // Crisp circular icon badge
    const icx = marginX + 3.2;
    const icy = y + 3.4;
    doc.setFillColor(badgeBgRgb[0], badgeBgRgb[1], badgeBgRgb[2]);
    doc.circle(icx, icy, 3.2, "F");

    // Draw crisp vector checkmark or arrow inside circle
    doc.setDrawColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.setLineWidth(0.55);
    if (iconType === "check") {
      doc.line(icx - 1.3, icy + 0.1, icx - 0.3, icy + 1.1);
      doc.line(icx - 0.3, icy + 1.1, icx + 1.5, icy - 1.1);
    } else {
      // Forward rollover arrow
      doc.line(icx - 1.4, icy, icx + 1.3, icy);
      doc.line(icx + 0.3, icy - 1.1, icx + 1.4, icy);
      doc.line(icx + 0.3, icy + 1.1, icx + 1.4, icy);
    }

    // Section Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.8);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX + 8.5, y + 4.7);

    // Count Pill
    const titleW = doc.getTextWidth(title);
    const pillX = marginX + 8.5 + titleW + 3.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    const pillW = doc.getTextWidth(countBadge) + 5.8;
    doc.setFillColor(badgeBgRgb[0], badgeBgRgb[1], badgeBgRgb[2]);
    doc.roundedRect(pillX, y + 0.7, pillW, 5.2, 1.8, 1.8, "F");
    doc.setTextColor(badgeFgRgb[0], badgeFgRgb[1], badgeFgRgb[2]);
    doc.text(countBadge, pillX + pillW / 2, y + 4.1, { align: "center" });

    // Right Caption
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(100, 116, 139);
    doc.text(rightNote, pageWidth - marginX, y + 4.5, { align: "right" });
  };

  // Custom cell renderer: Two-tone Sub-Task Action Item (Bold Title + Muted Description)
  const drawActionItemCell = (cell: any, title: string, description: string | null) => {
    const padL = 3;
    const maxW = cell.width - padL * 2;
    const cleanTitle = cleanPdfText(title);
    const cleanDesc = description ? cleanPdfText(description).slice(0, 105) : "";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.1);
    const titleLines = doc.splitTextToSize(cleanTitle, maxW).slice(0, 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.0);
    const descLines = cleanDesc ? doc.splitTextToSize(cleanDesc, maxW).slice(0, 1) : [];

    const lineHTitle = 3.6;
    const lineHDesc = 3.3;
    const totalTextH =
      titleLines.length * lineHTitle + (descLines.length > 0 ? 1.1 + descLines.length * lineHDesc : 0);
    let ty = cell.y + (cell.height - totalTextH) / 2 + 2.7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.1);
    doc.setTextColor(15, 23, 42);
    for (const line of titleLines) {
      doc.text(line, cell.x + padL, ty);
      ty += lineHTitle;
    }

    if (descLines.length > 0) {
      ty += 0.6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.0);
      doc.setTextColor(100, 116, 139);
      doc.text(descLines[0], cell.x + padL, ty);
    }
  };

  // Custom cell renderer: Project Goal + Colored Priority Pill Badge
  const drawProjectGoalCell = (cell: any, priority: string, taskTitle: string) => {
    const padL = 2.8;
    const pStyle = getPriorityStyle(priority);
    const pLabel = String(priority).toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    const badgeW = doc.getTextWidth(pLabel) + 4.4;
    const badgeH = 4.2;

    const cleanGoal = cleanPdfText(taskTitle);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.7);
    const goalLines = doc.splitTextToSize(cleanGoal, cell.width - padL * 2).slice(0, 2);

    const totalH = badgeH + 1.4 + goalLines.length * 3.4;
    const topY = cell.y + (cell.height - totalH) / 2;

    // Priority Pill
    doc.setFillColor(pStyle.bg[0], pStyle.bg[1], pStyle.bg[2]);
    doc.setDrawColor(pStyle.border[0], pStyle.border[1], pStyle.border[2]);
    doc.setLineWidth(0.18);
    doc.roundedRect(cell.x + padL, topY, badgeW, badgeH, 1.3, 1.3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(pStyle.fg[0], pStyle.fg[1], pStyle.fg[2]);
    doc.text(pLabel, cell.x + padL + badgeW / 2, topY + 2.95, { align: "center" });

    // Project Title underneath
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.7);
    doc.setTextColor(51, 65, 85);
    let gy = topY + badgeH + 3.4;
    for (const line of goalLines) {
      doc.text(line, cell.x + padL, gy);
      gy += 3.4;
    }
  };

  // Custom cell renderer: Technician Initials Avatar + Bold Name + Muted @username
  const drawTechnicianCell = (cell: any, name: string, username: string | null) => {
    const cleanName = cleanPdfText(name);
    const pal = getAvatarPalette(cleanName);
    const cx = cell.x + 5.8;
    const cy = cell.y + cell.height / 2;

    doc.setFillColor(pal.bg[0], pal.bg[1], pal.bg[2]);
    doc.circle(cx, cy, 3.3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(pal.fg[0], pal.fg[1], pal.fg[2]);
    doc.text(getInitials(cleanName), cx, cy + 0.85, { align: "center" });

    const tx = cell.x + 10.8;
    if (username) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.7);
      doc.setTextColor(15, 23, 42);
      doc.text(cleanName.slice(0, 17), tx, cy - 0.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.7);
      doc.setTextColor(100, 116, 139);
      doc.text(`@${cleanPdfText(username).slice(0, 17)}`, tx, cy + 2.9);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.7);
      doc.setTextColor(15, 23, 42);
      doc.text(cleanName.slice(0, 17), tx, cy + 1.0);
    }
  };

  // Custom cell renderer: Modern Progress Bar + Sub-Task Weight Contribution
  const drawProgressCell = (
    cell: any,
    progressVal: number,
    fillRgb: [number, number, number],
    weightLabel?: string,
    weightColor?: [number, number, number]
  ) => {
    const pct = Math.max(0, Math.min(100, Number(progressVal) || 0));
    const padX = 2.6;
    const trackW = cell.width - padX * 2 - 9.2;
    const trackH = 2.3;
    const trackX = cell.x + padX;
    const hasSubLabel = Boolean(weightLabel);
    const barCenterY = hasSubLabel ? cell.y + cell.height / 2 - 1.6 : cell.y + cell.height / 2;
    const trackY = barCenterY - trackH / 2;

    doc.setFillColor(226, 232, 240);
    doc.roundedRect(trackX, trackY, trackW, trackH, 1.1, 1.1, "F");

    if (pct > 0) {
      doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
      doc.roundedRect(trackX, trackY, Math.max(2, (trackW * pct) / 100), trackH, 1.1, 1.1, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(30, 41, 59);
    doc.text(`${pct}%`, cell.x + cell.width - 2.4, barCenterY + 1.0, {
      align: "right"
    });

    if (hasSubLabel && weightLabel) {
      const c = weightColor ?? [100, 116, 139];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.1);
      doc.setTextColor(c[0], c[1], c[2]);
      doc.text(weightLabel, trackX, barCenterY + 4.3);
    }
  };

  // =========================================================================
  // 4. SECTION 1: COMPLETED SUB-TASKS (Elevated Card Table, Architectural Slate Header)
  // =========================================================================
  drawSectionBar(
    cursorY,
    "COMPLETED SUB-TASKS",
    `${data.metrics.totalCompleted} CLOSED`,
    `Daily action items completed on ${data.reportDate}`,
    [5, 150, 105],
    [209, 250, 229],
    [6, 95, 70],
    "check"
  );
  cursorY += 7.8;

  if (data.completedItems.length === 0) {
    drawElevatedCard(marginX, cursorY, contentWidth, 14, 2.4);
    doc.setFillColor(5, 150, 105);
    doc.roundedRect(marginX, cursorY, 2.2, 14, 1.1, 1.1, "F");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.4);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `No daily sub-tasks were marked completed on ${data.prettyDate}.`,
      pageWidth / 2,
      cursorY + 8.3,
      { align: "center" }
    );
    cursorY += 19;
  } else {
    const completedStartPage = doc.getNumberOfPages();
    const completedStartY = cursorY;
    // Top crisp emerald accent rule above table
    doc.setFillColor(16, 185, 129);
    doc.rect(marginX, cursorY, contentWidth, 0.9, "F");
    cursorY += 0.9;

    const completedBody = data.completedItems.map((item, idx) => [
      String(idx + 1).padStart(2, "0"),
      "", // custom two-tone Action Item + Notes
      "", // custom Priority Pill + Parent Goal
      "", // custom Avatar + Technician Name
      item.dueDate,
      item.completedTimeLabel,
      "" // custom Progress Bar
    ]);

    autoTable(doc, {
      startY: cursorY,
      head: [[
        "#",
        "ACTION ITEM & FIELD NOTES",
        "PROJECT GOAL & PRIORITY",
        "COMPLETED BY",
        "DUE DATE",
        "CLOSED AT",
        "GOAL PROGRESS"
      ]],
      body: completedBody,
      theme: "plain",
      margin: { left: marginX, right: marginX, bottom: 16 },
      styles: {
        font: "helvetica",
        fontSize: 7.7,
        minCellHeight: 12.2,
        cellPadding: { top: 2.2, right: 2.4, bottom: 2.2, left: 2.4 },
        valign: "middle",
        fillColor: [255, 255, 255],
        lineColor: [226, 232, 240],
        lineWidth: { bottom: 0.22 }
      },
      headStyles: {
        fillColor: [241, 245, 249], // Crisp Architectural Slate-100
        textColor: [71, 85, 105], // Slate-600
        fontStyle: "bold",
        fontSize: 6.6,
        minCellHeight: 7.6,
        halign: "left",
        lineColor: [203, 213, 225],
        lineWidth: { bottom: 0.35 }
      },
      alternateRowStyles: {
        fillColor: [250, 252, 255]
      },
      columnStyles: {
        0: { cellWidth: 11, halign: "center", fontStyle: "bold", textColor: [5, 150, 105] },
        1: { cellWidth: 82 },
        2: { cellWidth: 64 },
        3: { cellWidth: 40 },
        4: { cellWidth: 22, halign: "center", textColor: [71, 85, 105], fontSize: 7.4 },
        5: { cellWidth: 22, halign: "center", fontStyle: "bold", textColor: [5, 150, 105], fontSize: 7.4 },
        6: { cellWidth: 30, halign: "center" }
      },
      willDrawPage: (hookData) => {
        if (hookData.pageNumber > 1) {
          paintPageCanvas(0);
        }
      },
      didDrawCell: (hookData) => {
        if (hookData.section !== "body") return;
        const item = data.completedItems[hookData.row.index];
        if (!item) return;

        if (hookData.column.index === 1) {
          drawActionItemCell(hookData.cell, item.title, item.description);
        } else if (hookData.column.index === 2) {
          drawProjectGoalCell(hookData.cell, item.taskPriority, item.taskTitle);
        } else if (hookData.column.index === 3) {
          drawTechnicianCell(hookData.cell, item.completedByName, item.completedByUsername);
        } else if (hookData.column.index === 6) {
          drawProgressCell(
            hookData.cell,
            item.taskProgress,
            [16, 185, 129],
            item.progressWeight > 0 ? `+${item.progressWeight}% added` : undefined,
            [5, 150, 105]
          );
        }
      }
    });

    const tableEndY = (doc as any).lastAutoTable?.finalY ?? cursorY + 20;
    if (doc.getNumberOfPages() === completedStartPage) {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(marginX, completedStartY, marginX, tableEndY);
      doc.line(marginX + contentWidth, completedStartY, marginX + contentWidth, tableEndY);
    }
    cursorY = tableEndY + 6.5;
  }

  // =========================================================================
  // 5. SECTION 2: ROLL FOR THE NEXT DAY (Refined Amber Architectural Table)
  // =========================================================================
  if (cursorY > pageHeight - 44) {
    doc.addPage();
    paintPageCanvas(0);
    cursorY = 15;
  }

  drawSectionBar(
    cursorY,
    "ROLL FOR THE NEXT DAY",
    `${data.metrics.totalRollover} ROLLING OVER`,
    "Unfinished daily sub-tasks queued for tomorrow's morning standup",
    [217, 119, 6],
    [254, 243, 199],
    [146, 64, 14],
    "roll"
  );
  cursorY += 7.8;

  if (data.rolloverItems.length === 0) {
    drawElevatedCard(marginX, cursorY, contentWidth, 14, 2.4, [167, 243, 208]);
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(marginX, cursorY, 2.2, 14, 1.1, 1.1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.setTextColor(6, 95, 70);
    doc.text(
      "All scheduled daily sub-tasks were closed today. Zero items rolling over to tomorrow.",
      pageWidth / 2,
      cursorY + 8.3,
      { align: "center" }
    );
    cursorY += 18;
  } else {
    const rollStartPage = doc.getNumberOfPages();
    const rollStartY = cursorY;
    // Top crisp amber accent rule above table
    doc.setFillColor(245, 158, 11);
    doc.rect(marginX, cursorY, contentWidth, 0.9, "F");
    cursorY += 0.9;

    const rolloverBody = data.rolloverItems.map((item, idx) => [
      String(idx + 1).padStart(2, "0"),
      "", // custom two-tone Action Item + Notes
      "", // custom Priority Pill + Parent Goal
      "", // custom Avatar + Assigned Tech
      item.dueDate,
      "", // custom Roll Status Pill
      "" // custom Progress Bar
    ]);

    autoTable(doc, {
      startY: cursorY,
      head: [[
        "#",
        "ACTION ITEM & FIELD NOTES",
        "PROJECT GOAL & PRIORITY",
        "ASSIGNED TO",
        "TARGET DATE",
        "ROLL STATUS",
        "GOAL PROGRESS"
      ]],
      body: rolloverBody,
      theme: "plain",
      margin: { left: marginX, right: marginX, bottom: 16 },
      styles: {
        font: "helvetica",
        fontSize: 7.7,
        minCellHeight: 12.2,
        cellPadding: { top: 2.2, right: 2.4, bottom: 2.2, left: 2.4 },
        valign: "middle",
        fillColor: [255, 255, 255],
        lineColor: [226, 232, 240],
        lineWidth: { bottom: 0.22 }
      },
      headStyles: {
        fillColor: [255, 251, 235], // Refined Warm Amber-50 Header (Clean & Modern)
        textColor: [146, 64, 14], // Amber-800
        fontStyle: "bold",
        fontSize: 6.6,
        minCellHeight: 7.6,
        halign: "left",
        lineColor: [253, 230, 138],
        lineWidth: { bottom: 0.35 }
      },
      alternateRowStyles: {
        fillColor: [255, 253, 247]
      },
      columnStyles: {
        0: { cellWidth: 11, halign: "center", fontStyle: "bold", textColor: [217, 119, 6] },
        1: { cellWidth: 78 },
        2: { cellWidth: 60 },
        3: { cellWidth: 40 },
        4: { cellWidth: 22, halign: "center", textColor: [120, 53, 15], fontSize: 7.4 },
        5: { cellWidth: 30, halign: "center" },
        6: { cellWidth: 30, halign: "center" }
      },
      willDrawPage: (hookData) => {
        if (hookData.pageNumber > 1) {
          paintPageCanvas(0);
        }
      },
      didDrawCell: (hookData) => {
        if (hookData.section !== "body") return;
        const item = data.rolloverItems[hookData.row.index];
        if (!item) return;

        if (hookData.column.index === 1) {
          drawActionItemCell(hookData.cell, item.title, item.description);
        } else if (hookData.column.index === 2) {
          drawProjectGoalCell(hookData.cell, item.taskPriority, item.taskTitle);
        } else if (hookData.column.index === 3) {
          drawTechnicianCell(hookData.cell, item.assigneeName, item.assigneeUsername);
        } else if (hookData.column.index === 5) {
          const isCarried = item.rolloverDays > 0;
          const pillW = hookData.cell.width - 3.6;
          const pillH = 5.6;
          const pillX = hookData.cell.x + 1.8;
          const pillY = hookData.cell.y + hookData.cell.height / 2 - pillH / 2;

          doc.setFillColor(isCarried ? 254 : 254, isCarried ? 226 : 243, isCarried ? 226 : 199);
          doc.setDrawColor(isCarried ? 252 : 252, isCarried ? 165 : 211, isCarried ? 165 : 77);
          doc.setLineWidth(0.2);
          doc.roundedRect(pillX, pillY, pillW, pillH, 2.0, 2.0, "FD");

          // Small status indicator dot inside pill
          doc.setFillColor(isCarried ? 220 : 217, isCarried ? 38 : 119, isCarried ? 38 : 6);
          doc.circle(pillX + 3.0, pillY + pillH / 2, 0.9, "F");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(isCarried ? 185 : 146, isCarried ? 28 : 64, isCarried ? 28 : 14);
          doc.text(item.rolloverLabel, pillX + pillW / 2 + 1.2, pillY + 3.8, { align: "center" });
        } else if (hookData.column.index === 6) {
          drawProgressCell(
            hookData.cell,
            item.taskProgress,
            [245, 158, 11],
            item.progressWeight > 0 ? `Weight: +${item.progressWeight}%` : undefined,
            [180, 83, 9]
          );
        }
      }
    });

    const tableEndY = (doc as any).lastAutoTable?.finalY ?? cursorY + 20;
    if (doc.getNumberOfPages() === rollStartPage) {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(marginX, rollStartY, marginX, tableEndY);
      doc.line(marginX + contentWidth, rollStartY, marginX + contentWidth, tableEndY);
    }
    cursorY = tableEndY + 5.5;
  }

  // =========================================================================
  // 6. EXECUTIVE DISTRIBUTION & GOVERNANCE STRIP (End of Report)
  // =========================================================================
  if (cursorY < pageHeight - 24) {
    const govH = 11.5;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.22);
    doc.roundedRect(marginX, cursorY, contentWidth, govH, 2.2, 2.2, "FD");

    const recipientsLabel =
      data.adminNames && data.adminNames.length > 0
        ? data.adminNames.map(cleanPdfText).join(", ")
        : "IT Management Admins";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    doc.setTextColor(51, 65, 85);
    doc.text("EXECUTIVE DISTRIBUTION:", marginX + 4, cursorY + 4.8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.0);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Delivered via TAF IT Helpdesk Telegram Bot to ${recipientsLabel}`,
      marginX + 38.5,
      cursorY + 4.8
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Next Scheduled Automated Dispatch: Tomorrow at 5:00 PM EAT (Africa/Addis_Ababa, UTC+3)",
      marginX + 4,
      cursorY + 9.0
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.setTextColor(67, 56, 202);
    doc.text(`OFFICIAL RECORD  |  ${docRefId}`, pageWidth - marginX - 4, cursorY + 6.9, {
      align: "right"
    });
  }

  // =========================================================================
  // 7. CRISP EDITORIAL FOOTER ON ALL PAGES (Page X of Y)
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.22);
    doc.line(marginX, pageHeight - 11.5, pageWidth - marginX, pageHeight - 11.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.0);
    doc.setTextColor(51, 65, 85);
    doc.text("TAF IT Helpdesk & Infrastructure Operations", marginX, pageHeight - 6.8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.9);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Confidential Internal Operations Brief  •  ${data.generatedAtEat}`,
      pageWidth / 2,
      pageHeight - 6.8,
      { align: "center" }
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.0);
    doc.setTextColor(51, 65, 85);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 6.8, {
      align: "right"
    });
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

/**
 * Formats a concise executive Telegram caption to accompany the attached PDF report.
 */
export function buildDailySubtasksTelegramCaption(data: DailySubtasksReportData): string {
  const highlights = data.technicianSummary
    .slice(0, 5)
    .map((t) => {
      const parts: string[] = [];
      if (t.completedCount > 0) parts.push(`<b>${t.completedCount}</b> done`);
      if (t.rolloverCount > 0) parts.push(`<b>${t.rolloverCount}</b> roll`);
      return `• ${t.name}: ${parts.join(", ")}`;
    })
    .join("\n");

  const rateText =
    data.metrics.totalActionable > 0 ? `${data.metrics.completionRate}%` : "N/A";

  return (
    `📊 <b>DAILY SUB-TASKS REPORT (PDF)</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📅 <b>Date:</b> <code>${data.reportDate}</code> (${data.prettyDate})\n` +
    `✅ <b>Completed Today:</b> <b>${data.metrics.totalCompleted}</b>\n` +
    `🔁 <b>Roll for the Next Day:</b> <b>${data.metrics.totalRollover}</b>\n` +
    `📈 <b>Execution Rate:</b> <b>${rateText}</b>\n` +
    `🏗 <b>Projects Progressed:</b> <b>${data.metrics.projectsProgressed}</b>\n` +
    (highlights ? `\n👨‍💻 <b>Team Summary:</b>\n${highlights}\n` : "") +
    `\n<i>Full executive PDF report is attached above.</i>`
  );
}

export async function sendDailySubtasksPdfReport(
  db: any,
  opts: {
    targetDate?: string;
    singleChatId?: number | string;
    triggeredBy?: string;
  } = {}
) {
  const reportData = await getDailySubtasksReportData(db, opts.targetDate);
  const pdfBuffer = buildDailySubtasksPdfBuffer(reportData);
  const filename = `TAF_Daily_Subtasks_Report_${reportData.reportDate}.pdf`;
  const caption = buildDailySubtasksTelegramCaption(reportData);
  const buttons = [[miniAppButton("📋 Open Project Tasks", "/admin/tasks")]];

  if (opts.singleChatId) {
    const res = await sendDocument(opts.singleChatId, pdfBuffer, filename, {
      caption,
      parseMode: "HTML",
      buttons
    });
    return {
      ok: Boolean(res?.ok),
      reportData,
      filename,
      adminsNotified: res?.ok ? 1 : 0,
      recipients: [{ chatId: String(opts.singleChatId), ok: Boolean(res?.ok), error: res?.description }]
    };
  }

  const { data: admins } = await db
    .from("users")
    .select("*")
    .eq("role", "ADMIN")
    .eq("is_active", true);

  const validAdmins = ((admins ?? []) as DbUser[]).filter(
    (a) => a.telegram_id && Number(a.telegram_id) > 100000 && Number(a.telegram_id) !== 2025001
  );

  const recipients: Array<{
    userId: string;
    name: string;
    telegramId: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const admin of validAdmins) {
    try {
      const res = await sendDocument(admin.telegram_id, pdfBuffer, filename, {
        caption,
        parseMode: "HTML",
        buttons
      });
      const ok = Boolean(res?.ok);
      recipients.push({
        userId: admin.id,
        name: formatUserName(admin),
        telegramId: String(admin.telegram_id),
        ok,
        error: ok ? undefined : res?.description || "Telegram delivery failed"
      });

      if (ok) {
        try {
          await db.from("notifications").insert({
            user_id: admin.id,
            ticket_id: null,
            type: "DAILY_SUBTASKS_PDF",
            title: `Daily Sub-Tasks PDF (${reportData.reportDate})`,
            body: `Completed: ${reportData.metrics.totalCompleted}, Roll for Next Day: ${reportData.metrics.totalRollover}`,
            sent_at: new Date().toISOString()
          });
        } catch {
          // Non-blocking audit log
        }
      }
    } catch (err: any) {
      recipients.push({
        userId: admin.id,
        name: formatUserName(admin),
        telegramId: String(admin.telegram_id),
        ok: false,
        error: err?.message || "Unexpected send error"
      });
    }
  }

  const adminsNotified = recipients.filter((r) => r.ok && r.userId !== "group").length;

  // Also dispatch to IT Support / Followup Group chat if configured in system_settings
  const { data: groupSetting } = await db
    .from("system_settings")
    .select("value")
    .eq("key", "it_group_chat_id")
    .maybeSingle();

  const groupChatId = groupSetting?.value;
  if (groupChatId) {
    try {
      const res = await sendDocument(groupChatId, pdfBuffer, filename, {
        caption,
        parseMode: "HTML",
        buttons
      });
      const ok = Boolean(res?.ok);
      recipients.push({
        userId: "group",
        name: "IT Followup Group",
        telegramId: String(groupChatId),
        ok,
        error: ok ? undefined : res?.description || "Telegram group delivery failed"
      });
    } catch (err: any) {
      recipients.push({
        userId: "group",
        name: "IT Followup Group",
        telegramId: String(groupChatId),
        ok: false,
        error: err?.message || "Unexpected group send error"
      });
    }
  }

  return {
    ok: true,
    reportData,
    filename,
    adminsNotified,
    totalAdminsFound: validAdmins.length,
    recipients
  };
}
