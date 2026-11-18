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

function cleanPdfText(value?: string | null): string {
  if (!value) return "";
  // Strip emojis & non-WinAnsi characters so built-in Helvetica renders crisply without garbled glyphs
  return String(value)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
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

  const completedItems: DailySubtaskReportItem[] = [];
  const rolloverItems: DailySubtaskReportItem[] = [];

  for (const s of allSubtasks) {
    const task = tasksMap.get(s.task_id);
    if (!task) continue;

    const assignee = s.assigned_to_id ? usersMap.get(s.assigned_to_id) ?? null : null;
    const completedBy = s.completed_by_id
      ? usersMap.get(s.completed_by_id) ?? assignee
      : assignee;

    if (s.status === "COMPLETED") {
      const completedDateEat = s.completed_at
        ? getEatDateString(new Date(s.completed_at))
        : s.due_date;

      if (completedDateEat === reportDate) {
        completedItems.push({
          id: s.id,
          title: s.title,
          description: s.description ?? null,
          dueDate: s.due_date,
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
          assigneeName: formatUserName(assignee),
          assigneeUsername: assignee?.telegram_username ?? null,
          completedByName: formatUserName(completedBy),
          completedByUsername: completedBy?.telegram_username ?? null
        });
      }
    } else if (s.status === "PENDING") {
      // Include pending sub-tasks scheduled for today or earlier whose parent goal is still active
      const parentInactive = task.status === "COMPLETED" || task.status === "CANCELLED";
      if (!parentInactive && s.due_date && s.due_date <= reportDate) {
        const lagDays = daysBetweenDates(s.due_date, reportDate);
        rolloverItems.push({
          id: s.id,
          title: s.title,
          description: s.description ?? null,
          dueDate: s.due_date,
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
          assigneeName: formatUserName(assignee),
          assigneeUsername: assignee?.telegram_username ?? null,
          completedByName: formatUserName(assignee),
          completedByUsername: assignee?.telegram_username ?? null
        });
      }
    }
  }

  // Sort completed chronologically, rollover by oldest due_date first then priority
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

  // Technician breakdown
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
 * Generates a sleek, modern, executive-grade Landscape A4 PDF buffer for the daily sub-tasks report.
 */
export function buildDailySubtasksPdfBuffer(data: DailySubtasksReportData): Buffer {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 269

  // =========================================================================
  // 1. MODERN EXECUTIVE HEADER BANNER
  // =========================================================================
  doc.setFillColor(15, 23, 42); // Slate-900 (#0F172A)
  doc.rect(0, 0, pageWidth, 35, "F");

  // Dual-tone top accent bar (Indigo + Cyan)
  doc.setFillColor(79, 70, 229); // Indigo-600
  doc.rect(0, 0, pageWidth * 0.68, 2.4, "F");
  doc.setFillColor(6, 182, 212); // Cyan-500
  doc.rect(pageWidth * 0.68, 0, pageWidth * 0.32, 2.4, "F");

  // Kicker badge pill (auto-sized to hug text cleanly)
  const kickerText = "TAF IT HELPDESK  |  DAILY OPERATIONS BRIEF";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  const kickerW = doc.getTextWidth(kickerText) + 7;
  doc.setFillColor(30, 27, 75); // Indigo-950
  doc.setDrawColor(99, 102, 241); // Indigo-500
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, 6.5, kickerW, 5.8, 1.8, 1.8, "FD");
  doc.setTextColor(165, 180, 252); // Indigo-300
  doc.text(kickerText, marginX + 3.5, 10.4);

  // Main Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17.5);
  doc.setTextColor(255, 255, 255);
  doc.text("Daily Sub-Tasks Execution Report", marginX, 21.5);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.setTextColor(203, 213, 225); // Slate-300
  doc.text(
    `${cleanPdfText(data.prettyDate)}   |   Completed Today & Roll for the Next Day   |   5:00 PM EAT Dispatch`,
    marginX,
    28.5
  );

  // Right-side Execution Rate Glass Card
  const rateBoxW = 62;
  const rateBoxX = pageWidth - marginX - rateBoxW;
  const rateBoxY = 6.5;
  const rateBoxH = 22.5;
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.setDrawColor(51, 65, 85); // Slate-700
  doc.setLineWidth(0.3);
  doc.roundedRect(rateBoxX, rateBoxY, rateBoxW, rateBoxH, 2.5, 2.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.6);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text("DAILY COMPLETION RATE", rateBoxX + 4.5, rateBoxY + 5.6);

  const rate = data.metrics.completionRate;
  const rateRgb: [number, number, number] =
    data.metrics.totalActionable === 0
      ? [148, 163, 184]
      : rate >= 75
      ? [52, 211, 153] // Emerald-400
      : rate >= 45
      ? [251, 191, 36] // Amber-400
      : [251, 113, 133]; // Rose-400

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(rateRgb[0], rateRgb[1], rateRgb[2]);
  doc.text(
    data.metrics.totalActionable === 0 ? "N/A" : `${rate}%`,
    rateBoxX + 4.5,
    rateBoxY + 14.5
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `${data.metrics.totalCompleted} of ${data.metrics.totalActionable} done`,
    rateBoxX + rateBoxW - 4.5,
    rateBoxY + 14.3,
    { align: "right" }
  );

  // Progress bar inside rate card
  const barX = rateBoxX + 4.5;
  const barY = rateBoxY + 17.5;
  const barW = rateBoxW - 9;
  doc.setFillColor(51, 65, 85);
  doc.roundedRect(barX, barY, barW, 2.2, 1, 1, "F");
  if (data.metrics.totalActionable > 0 && rate > 0) {
    doc.setFillColor(rateRgb[0], rateRgb[1], rateRgb[2]);
    doc.roundedRect(barX, barY, Math.max(2, (barW * Math.min(100, rate)) / 100), 2.2, 1, 1, "F");
  }

  // =========================================================================
  // 2. FOUR MODERN KPI METRIC CARDS WITH ACCENT STRIPS
  // =========================================================================
  let cursorY = 41;
  const kpiGap = 4.5;
  const kpiW = (contentWidth - kpiGap * 3) / 4;
  const kpiH = 20;

  const kpiCards: Array<{
    label: string;
    value: string;
    subtext: string;
    accent: [number, number, number];
    valueColor: [number, number, number];
    bgTint: [number, number, number];
  }> = [
    {
      label: "COMPLETED TODAY",
      value: String(data.metrics.totalCompleted),
      subtext: "Daily action items finished",
      accent: [16, 185, 129], // Emerald-500
      valueColor: [6, 95, 70],
      bgTint: [236, 253, 245]
    },
    {
      label: "ROLL FOR THE NEXT DAY",
      value: String(data.metrics.totalRollover),
      subtext: "Pending items carried forward",
      accent: [245, 158, 11], // Amber-500
      valueColor: [180, 83, 9],
      bgTint: [255, 251, 235]
    },
    {
      label: "PROJECTS PROGRESSED",
      value: String(data.metrics.projectsProgressed),
      subtext: "Parent goals advanced today",
      accent: [79, 70, 229], // Indigo-600
      valueColor: [55, 48, 163],
      bgTint: [238, 242, 255]
    },
    {
      label: "ACTIVE TECHNICIANS",
      value: String(data.metrics.activeTechnicians),
      subtext: "Contributors with completions",
      accent: [2, 132, 199], // Sky-600
      valueColor: [7, 89, 133],
      bgTint: [240, 249, 255]
    }
  ];

  kpiCards.forEach((card, i) => {
    const x = marginX + i * (kpiW + kpiGap);
    // Card background
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, cursorY, kpiW, kpiH, 2.5, 2.5, "FD");

    // Soft tinted top-right badge circle
    doc.setFillColor(card.bgTint[0], card.bgTint[1], card.bgTint[2]);
    doc.roundedRect(x + kpiW - 11, cursorY + 3.2, 7.5, 7.5, 2, 2, "F");
    doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.circle(x + kpiW - 7.25, cursorY + 6.95, 1.8, "F");

    // Left colored vertical accent strip
    doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.roundedRect(x, cursorY, 2.3, kpiH, 1.2, 1.2, "F");

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + 5.5, cursorY + 5.8);

    // Big value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16.5);
    doc.setTextColor(card.valueColor[0], card.valueColor[1], card.valueColor[2]);
    doc.text(card.value, x + 5.5, cursorY + 13.5);

    // Subtext
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.9);
    doc.setTextColor(148, 163, 184);
    doc.text(card.subtext, x + 5.5, cursorY + 17.8);
  });

  cursorY += kpiH + 5.5;

  // =========================================================================
  // 3. TEAM OUTPUT SUMMARY STRIP (COMPACT PILLS)
  // =========================================================================
  if (data.technicianSummary.length > 0) {
    const stripH = 12;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.roundedRect(marginX, cursorY, contentWidth, stripH, 2.2, 2.2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text("TEAM OUTPUT:", marginX + 4, cursorY + 7.2);

    let pillX = marginX + 30;
    const maxPillRight = marginX + contentWidth - 4;

    for (const tech of data.technicianSummary.slice(0, 7)) {
      const nameStr = cleanPdfText(tech.name).slice(0, 18);
      const countStr =
        tech.rolloverCount > 0
          ? `${tech.completedCount} done / ${tech.rolloverCount} roll`
          : `${tech.completedCount} done`;
      const fullChipText = `${nameStr}: ${countStr}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      const chipW = doc.getTextWidth(fullChipText) + 7;

      if (pillX + chipW > maxPillRight) break;

      const hasDone = tech.completedCount > 0;
      doc.setFillColor(hasDone ? 236 : 255, hasDone ? 253 : 251, hasDone ? 245 : 235);
      doc.setDrawColor(hasDone ? 167 : 253, hasDone ? 243 : 230, hasDone ? 208 : 138);
      doc.setLineWidth(0.22);
      doc.roundedRect(pillX, cursorY + 2.4, chipW, 7.2, 1.8, 1.8, "FD");

      doc.setTextColor(hasDone ? 6 : 146, hasDone ? 95 : 64, hasDone ? 70 : 14);
      doc.text(fullChipText, pillX + 3.5, cursorY + 7.1);
      pillX += chipW + 2.8;
    }

    cursorY += stripH + 6.5;
  } else {
    cursorY += 2;
  }

  // Helper to draw a sleek section header
  const drawSectionHeader = (
    y: number,
    title: string,
    badgeText: string,
    rightCaption: string,
    accentRgb: [number, number, number],
    badgeBgRgb: [number, number, number],
    badgeTextRgb: [number, number, number]
  ) => {
    doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.roundedRect(marginX, y, 2.6, 6.8, 1, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX + 5.2, y + 5.2);

    const titleW = doc.getTextWidth(title);
    const badgeX = marginX + 5.2 + titleW + 3.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const badgeW = doc.getTextWidth(badgeText) + 6;

    doc.setFillColor(badgeBgRgb[0], badgeBgRgb[1], badgeBgRgb[2]);
    doc.roundedRect(badgeX, y + 0.8, badgeW, 5.3, 1.8, 1.8, "F");
    doc.setTextColor(badgeTextRgb[0], badgeTextRgb[1], badgeTextRgb[2]);
    doc.text(badgeText, badgeX + 3, y + 4.4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(rightCaption, pageWidth - marginX, y + 4.9, { align: "right" });
  };

  // Helper to draw modern inline progress bar inside a table cell
  const drawProgressCell = (cell: any, progressVal: number, fillRgb: [number, number, number]) => {
    const pct = Math.max(0, Math.min(100, Number(progressVal) || 0));
    const padX = 3;
    const trackW = cell.width - padX * 2 - 9;
    const trackH = 2.4;
    const trackX = cell.x + padX;
    const trackY = cell.y + cell.height / 2 - trackH / 2;

    doc.setFillColor(226, 232, 240);
    doc.roundedRect(trackX, trackY, trackW, trackH, 1, 1, "F");

    if (pct > 0) {
      doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
      doc.roundedRect(trackX, trackY, Math.max(1.8, (trackW * pct) / 100), trackH, 1, 1, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(51, 65, 85);
    doc.text(`${pct}%`, cell.x + cell.width - 2.5, cell.y + cell.height / 2 + 1.1, {
      align: "right"
    });
  };

  // =========================================================================
  // 4. SECTION 1: COMPLETED SUB-TASKS TODAY
  // =========================================================================
  drawSectionHeader(
    cursorY,
    "COMPLETED SUB-TASKS",
    `${data.metrics.totalCompleted} COMPLETED`,
    `Daily action items finished on ${data.reportDate}`,
    [16, 185, 129],
    [209, 250, 229],
    [6, 95, 70]
  );
  cursorY += 9.5;

  if (data.completedItems.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.roundedRect(marginX, cursorY, contentWidth, 14, 2.2, 2.2, "FD");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `No daily sub-tasks were marked completed on ${data.prettyDate}.`,
      pageWidth / 2,
      cursorY + 8.3,
      { align: "center" }
    );
    cursorY += 20;
  } else {
    const completedBody = data.completedItems.map((item, idx) => {
      const actionLine = item.description
        ? `${cleanPdfText(item.title)}\n${cleanPdfText(item.description).slice(0, 110)}`
        : cleanPdfText(item.title);
      const goalLine = `[${item.taskPriority}] ${cleanPdfText(item.taskTitle)}`;
      const techLine = item.completedByUsername
        ? `${cleanPdfText(item.completedByName)}\n@${cleanPdfText(item.completedByUsername)}`
        : cleanPdfText(item.completedByName);

      return [
        String(idx + 1),
        actionLine,
        goalLine,
        techLine,
        item.dueDate,
        item.completedTimeLabel,
        ""
      ];
    });

    autoTable(doc, {
      startY: cursorY,
      head: [[
        "#",
        "Sub-Task Action Item",
        "Parent Project Goal",
        "Completed By",
        "Due Date",
        "Completed At",
        "Goal Progress"
      ]],
      body: completedBody,
      theme: "plain",
      margin: { left: marginX, right: marginX, bottom: 18 },
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: { top: 3, right: 2.8, bottom: 3, left: 2.8 },
        overflow: "linebreak",
        valign: "middle",
        lineColor: [226, 232, 240],
        lineWidth: { bottom: 0.2 }
      },
      headStyles: {
        fillColor: [6, 78, 59], // Deep Emerald-900 (#064E3B)
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.4,
        halign: "left",
        cellPadding: { top: 3.2, right: 2.8, bottom: 3.2, left: 2.8 }
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center", fontStyle: "bold", textColor: [5, 150, 105] },
        1: { cellWidth: 80, fontStyle: "bold", textColor: [15, 23, 42] },
        2: { cellWidth: 64, textColor: [51, 65, 85] },
        3: { cellWidth: 37, textColor: [30, 41, 59] },
        4: { cellWidth: 24, halign: "center", textColor: [71, 85, 105] },
        5: { cellWidth: 24, halign: "center", fontStyle: "bold", textColor: [5, 150, 105] },
        6: { cellWidth: 30, halign: "center" }
      },
      didDrawCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 6) {
          const item = data.completedItems[hookData.row.index];
          if (item) {
            drawProgressCell(hookData.cell, item.taskProgress, [16, 185, 129]);
          }
        }
      }
    });

    cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY + 20) + 10;
  }

  // =========================================================================
  // 5. SECTION 2: ROLL FOR THE NEXT DAY
  // =========================================================================
  if (cursorY > pageHeight - 46) {
    doc.addPage();
    cursorY = 18;
  }

  drawSectionHeader(
    cursorY,
    "ROLL FOR THE NEXT DAY",
    `${data.metrics.totalRollover} ROLLING OVER`,
    "Pending daily sub-tasks carried forward to tomorrow's action queue",
    [245, 158, 11],
    [254, 243, 199],
    [146, 64, 14]
  );
  cursorY += 9.5;

  if (data.rolloverItems.length === 0) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.setLineWidth(0.28);
    doc.roundedRect(marginX, cursorY, contentWidth, 14, 2.2, 2.2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(6, 95, 70);
    doc.text(
      "All scheduled daily sub-tasks were completed today! Zero items rolling over to the next day.",
      pageWidth / 2,
      cursorY + 8.3,
      { align: "center" }
    );
  } else {
    const rolloverBody = data.rolloverItems.map((item, idx) => {
      const actionLine = item.description
        ? `${cleanPdfText(item.title)}\n${cleanPdfText(item.description).slice(0, 110)}`
        : cleanPdfText(item.title);
      const goalLine = `[${item.taskPriority}] ${cleanPdfText(item.taskTitle)}`;
      const techLine = item.assigneeUsername
        ? `${cleanPdfText(item.assigneeName)}\n@${cleanPdfText(item.assigneeUsername)}`
        : cleanPdfText(item.assigneeName);

      return [
        String(idx + 1),
        actionLine,
        goalLine,
        techLine,
        item.dueDate,
        "",
        ""
      ];
    });

    autoTable(doc, {
      startY: cursorY,
      head: [[
        "#",
        "Sub-Task Action Item",
        "Parent Project Goal",
        "Assigned Technician",
        "Target Date",
        "Roll Status",
        "Goal Progress"
      ]],
      body: rolloverBody,
      theme: "plain",
      margin: { left: marginX, right: marginX, bottom: 18 },
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: { top: 3, right: 2.8, bottom: 3, left: 2.8 },
        overflow: "linebreak",
        valign: "middle",
        lineColor: [253, 230, 138],
        lineWidth: { bottom: 0.2 }
      },
      headStyles: {
        fillColor: [146, 64, 14], // Deep Amber-800 (#92400E)
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.4,
        halign: "left",
        cellPadding: { top: 3.2, right: 2.8, bottom: 3.2, left: 2.8 }
      },
      alternateRowStyles: {
        fillColor: [255, 251, 235] // Soft Amber-50
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center", fontStyle: "bold", textColor: [180, 83, 9] },
        1: { cellWidth: 78, fontStyle: "bold", textColor: [15, 23, 42] },
        2: { cellWidth: 60, textColor: [51, 65, 85] },
        3: { cellWidth: 37, textColor: [30, 41, 59] },
        4: { cellWidth: 24, halign: "center", textColor: [120, 53, 15] },
        5: { cellWidth: 30, halign: "center" },
        6: { cellWidth: 30, halign: "center" }
      },
      didDrawCell: (hookData) => {
        if (hookData.section !== "body") return;
        const item = data.rolloverItems[hookData.row.index];
        if (!item) return;

        if (hookData.column.index === 5) {
          const isCarriedOver = item.rolloverDays > 0;
          const pillW = hookData.cell.width - 4;
          const pillH = 5.4;
          const pillX = hookData.cell.x + 2;
          const pillY = hookData.cell.y + hookData.cell.height / 2 - pillH / 2;

          doc.setFillColor(isCarriedOver ? 254 : 254, isCarriedOver ? 226 : 243, isCarriedOver ? 226 : 199);
          doc.setDrawColor(isCarriedOver ? 252 : 252, isCarriedOver ? 165 : 211, isCarriedOver ? 165 : 77);
          doc.setLineWidth(0.2);
          doc.roundedRect(pillX, pillY, pillW, pillH, 1.8, 1.8, "FD");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.6);
          doc.setTextColor(isCarriedOver ? 185 : 146, isCarriedOver ? 28 : 64, isCarriedOver ? 28 : 14);
          doc.text(item.rolloverLabel, hookData.cell.x + hookData.cell.width / 2, pillY + 3.7, {
            align: "center"
          });
        }

        if (hookData.column.index === 6) {
          drawProgressCell(hookData.cell, item.taskProgress, [245, 158, 11]);
        }
      }
    });
  }

  // =========================================================================
  // 6. MODERN FOOTER ON ALL PAGES (Page X of Y)
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageHeight - 12.5, pageWidth - marginX, pageHeight - 12.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text("TAF IT Helpdesk & Project Operations", marginX, pageHeight - 7.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated ${data.generatedAtEat}  |  Automated 5:00 PM Daily Executive Brief`,
      pageWidth / 2,
      pageHeight - 7.5,
      { align: "center" }
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 7.5, {
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
    `\n<i>Full modern PDF report is attached above.</i>`
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

  // Single-chat dispatch (e.g., admin typed /dailyreport in Telegram)
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

  // Broadcast to all active Admins with valid Telegram IDs
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

  const adminsNotified = recipients.filter((r) => r.ok).length;

  return {
    ok: true,
    reportData,
    filename,
    adminsNotified,
    totalAdminsFound: validAdmins.length,
    recipients
  };
}

