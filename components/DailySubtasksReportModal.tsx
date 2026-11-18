"use client";

import { useEffect, useState, useCallback } from "react";
import { api, getInitData } from "@/lib/apiClient";

interface DailySubtaskPreviewItem {
  id: string;
  title: string;
  dueDate: string;
  completedTimeLabel: string;
  rolloverLabel: string;
  rolloverDays: number;
  taskTitle: string;
  taskPriority: string;
  taskProgress: number;
  assigneeName: string;
  completedByName: string;
}

interface DailyReportPreviewResponse {
  ok: boolean;
  adminCount: number;
  adminNames: string[];
  reportData: {
    reportDate: string;
    prettyDate: string;
    generatedAtEat: string;
    completedItems: DailySubtaskPreviewItem[];
    rolloverItems: DailySubtaskPreviewItem[];
    metrics: {
      totalCompleted: number;
      totalRollover: number;
      totalActionable: number;
      completionRate: number;
      projectsProgressed: number;
      activeTechnicians: number;
    };
    technicianSummary: Array<{
      name: string;
      username: string | null;
      completedCount: number;
      rolloverCount: number;
    }>;
  };
}

function getEatDateOffset(daysOffset = 0): string {
  const eatOffsetMs = 3 * 60 * 60 * 1000;
  const d = new Date(Date.now() + eatOffsetMs + daysOffset * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

interface DailySubtasksReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DailySubtasksReportModal({ isOpen, onClose }: DailySubtasksReportModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() => getEatDateOffset(0));
  const [preview, setPreview] = useState<DailyReportPreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadPreview = useCallback(async (dateStr: string) => {
    try {
      setLoadingPreview(true);
      setFeedback(null);
      const res = await api<DailyReportPreviewResponse>(
        `/api/cron/daily-subtasks-report?mode=preview&date=${encodeURIComponent(dateStr)}`
      );
      setPreview(res);
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Could not load daily preview." });
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPreview(selectedDate);
    }
  }, [isOpen, selectedDate, loadPreview]);

  if (!isOpen) return null;

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      setFeedback(null);
      const initData = getInitData();
      const demoRole =
        typeof window !== "undefined" ? localStorage.getItem("it_helpdesk_demo_role") || "" : "";

      const res = await fetch(
        `/api/cron/daily-subtasks-report?mode=download&date=${encodeURIComponent(selectedDate)}`,
        {
          method: "GET",
          headers: {
            "x-telegram-init-data": initData,
            ...(demoRole ? { "x-demo-role": demoRole } : {})
          }
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Failed to generate PDF");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TAF_Daily_Subtasks_Report_${selectedDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setFeedback({
        type: "success",
        text: `PDF downloaded: TAF_Daily_Subtasks_Report_${selectedDate}.pdf`
      });
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "PDF download failed." });
    } finally {
      setDownloading(false);
    }
  };

  const handleSendToTelegram = async () => {
    try {
      setSendingTelegram(true);
      setFeedback(null);
      const res = await api<{
        ok: boolean;
        adminsNotified: number;
        totalAdminsFound: number;
        completedCount: number;
        rolloverCount: number;
        filename: string;
      }>("/api/cron/daily-subtasks-report", {
        method: "POST",
        body: JSON.stringify({ mode: "send", date: selectedDate })
      });

      if (res.adminsNotified > 0) {
        setFeedback({
          type: "success",
          text: `PDF sent to ${res.adminsNotified}/${res.totalAdminsFound} Admin Telegram${res.adminsNotified > 1 ? "s" : ""} (${res.completedCount} completed, ${res.rolloverCount} roll for next day).`
        });
      } else {
        setFeedback({
          type: "error",
          text: `Generated PDF, but 0/${res.totalAdminsFound} Admin Telegram deliveries succeeded. Verify TELEGRAM_BOT_TOKEN & admin Telegram IDs.`
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to send PDF via Telegram." });
    } finally {
      setSendingTelegram(false);
    }
  };

  const todayEat = getEatDateOffset(0);
  const yesterdayEat = getEatDateOffset(-1);
  const metrics = preview?.reportData.metrics;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modern Dark Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 border-b border-indigo-500/20 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                Executive PDF Brief
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ⏰ Auto-sends daily at 5:00 PM EAT
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight">
              Daily Sub-Tasks PDF Report
            </h2>
            <p className="text-xs text-slate-300">
              Completed daily sub-tasks + <span className="text-amber-300 font-semibold">Roll for the Next Day</span> delivered to Admin Telegrams.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold shrink-0 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Date Picker Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">📅 Report Date (EAT):</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedDate(todayEat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  selectedDate === todayEat
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(yesterdayEat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  selectedDate === yesterdayEat
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300"
                }`}
              >
                Yesterday
              </button>
            </div>
          </div>

          {/* Live Preview Metrics */}
          {loadingPreview ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-7 h-7 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-semibold">Loading daily sub-tasks summary...</p>
            </div>
          ) : preview ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                  <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Completed Today</p>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {metrics?.totalCompleted ?? 0}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                  <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Roll for Next Day</p>
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-0.5">
                    {metrics?.totalRollover ?? 0}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60">
                  <p className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-400">Execution Rate</p>
                  <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300 mt-0.5">
                    {(metrics?.totalActionable ?? 0) > 0 ? `${metrics?.completionRate}%` : "N/A"}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60">
                  <p className="text-[10px] font-bold uppercase text-sky-700 dark:text-sky-400">Admin Recipients</p>
                  <p className="text-2xl font-black text-sky-700 dark:text-sky-300 mt-0.5">
                    {preview.adminCount}
                  </p>
                </div>
              </div>

              {/* Admin Telegram Recipients */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  ✈️ Telegram Admins ({preview.adminCount}):
                </span>
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {preview.adminNames.length > 0
                    ? preview.adminNames.join(", ")
                    : "No active Admin Telegram IDs configured"}
                </span>
              </div>

              {/* Quick Preview Lists */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Completed List */}
                <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-white dark:bg-slate-900/80 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                      ✅ Completed ({preview.reportData.completedItems.length})
                    </span>
                  </div>
                  {preview.reportData.completedItems.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic py-2">No sub-tasks completed on this date.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {preview.reportData.completedItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 text-[11px]"
                        >
                          <p className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1">{item.title}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            {item.completedByName} • {item.completedTimeLabel} • {item.taskTitle}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Roll for the Next Day List */}
                <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-white dark:bg-slate-900/80 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                      🔁 Roll for the Next Day ({preview.reportData.rolloverItems.length})
                    </span>
                  </div>
                  {preview.reportData.rolloverItems.length === 0 ? (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold py-2">
                      Zero items rolling over!
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {preview.reportData.rolloverItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-2 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1">{item.title}</p>
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200 shrink-0">
                              {item.rolloverLabel}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            {item.assigneeName} • Due {item.dueDate} • {item.taskTitle}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold border flex items-center gap-2 ${
                feedback.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                  : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700"
              }`}
            >
              <span>{feedback.type === "success" ? "✅" : "⚠️"}</span>
              <span>{feedback.text}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Tip: Admins can also type <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-bold text-indigo-600 dark:text-indigo-400">/dailyreport</code> in Telegram anytime.
          </span>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading || loadingPreview}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>{downloading ? "⏳" : "📥"}</span>
              <span>{downloading ? "Building PDF..." : "Download PDF"}</span>
            </button>
            <button
              type="button"
              onClick={handleSendToTelegram}
              disabled={sendingTelegram || loadingPreview}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-lg shadow-indigo-600/25 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>{sendingTelegram ? "⏳" : "✈️"}</span>
              <span>{sendingTelegram ? "Sending..." : "Send PDF to Admin Telegrams"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

