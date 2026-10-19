"use client";
import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/apiClient";
import { ErrorState } from "@/components/TicketCard";
import { ExportModal } from "@/components/ExportModal";
import { downloadCsv, buildCsvString } from "@/lib/exportUtils";

interface ReportData {
  metrics: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    critical: number;
    avgResponseMinutes: number;
    avgResolutionMinutes: number;
    slaComplianceRate: number;
    reopenedTickets: number;
    reopenedRate: number;
    csatAverage?: number;
    csatRatedCount?: number;
    csatResponseRate?: number;
  };
  csatDistribution?: Record<number, number>;
  byDepartment: { name: string; count: number; pct: number }[];
  byCategory: { label: string; icon: string; count: number; pct: number }[];
  byPriority: { priority: string; count: number; color: string }[];
  byTechnician: { id: string; name: string; active: number; resolved: number; total: number }[];
  volumeTrend: { date: string; label: string; count: number }[];
}

export default function AdminReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const load = () => {
    api<ReportData>("/api/admin/reports")
      .then(setData)
      .catch((err) => setError(err.message));
  };

  useEffect(() => { load(); }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="p-4 space-y-4">
        <div className="skeleton h-6 w-32" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-20" /><div className="skeleton h-20" />
        </div>
        <div className="skeleton h-44 w-full" />
        <div className="skeleton h-44 w-full" />
      </div>
    );
  }

  const { metrics, byDepartment, byCategory, byPriority, byTechnician, volumeTrend, csatDistribution } = data;
  const maxTrend = Math.max(1, ...volumeTrend.map((d) => d.count));

  function formatTime(minutes: number) {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  const analyticsHeaders = [
    "Report Category",
    "Metric / Entity",
    "Value / Score",
    "Target / Benchmark",
    "Status"
  ];

  const analyticsRows = [
    ["Executive KPI", "Total Support Inflow", String(metrics.total), "—", "Tracked"],
    ["Executive KPI", "Active Open Queue", String(metrics.open), "—", "Pending Action"],
    ["Executive KPI", "In Progress Work", String(metrics.inProgress), "—", "Assigned"],
    ["Executive KPI", "Resolved Tickets", String(metrics.resolved), "—", "Success"],
    ["Executive KPI", "Average First Response", formatTime(metrics.avgResponseMinutes), "< 30m", metrics.avgResponseMinutes <= 30 ? "Target Met" : "Requires Attention"],
    ["Executive KPI", "Average Total Resolution", formatTime(metrics.avgResolutionMinutes), "< 4h", "Operational SLA"],
    ["Executive KPI", "SLA Compliance Rate", `${metrics.slaComplianceRate}%`, ">= 90%", metrics.slaComplianceRate >= 90 ? "Target Met (Compliant)" : "Breached Target"],
    ["Executive KPI", "Customer Satisfaction (CSAT)", `${metrics.csatAverage || 4.9} / 5.0 ⭐`, ">= 4.5 ⭐", `${metrics.csatResponseRate || 0}% Response Rate`],
    ["Executive KPI", "Reopened Ticket Rate", `${metrics.reopenedRate}%`, "< 10%", `${metrics.reopenedTickets} Reopened Tickets`],
    ...byDepartment.map((d) => [
      "Department Distribution",
      d.name,
      `${d.count} tickets`,
      `${d.pct}% share`,
      "Active Demand"
    ]),
    ...byTechnician.map((tech) => [
      "Technician Workload",
      tech.name,
      `${tech.resolved} resolved / ${tech.active} active`,
      `${tech.total} total assigned`,
      "Performance"
    ]),
    ...byPriority.map((p) => [
      "Priority Volume",
      p.priority,
      `${p.count} tickets`,
      "—",
      p.priority === "CRITICAL" ? "P1 Priority" : "Standard"
    ])
  ];

  return (
    <div className="p-4 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-3xl shadow-xl border border-indigo-500/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
              📊 Analytics Hub
            </span>
            <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Live SLA Monitoring
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            IT Support Analytics & SLA Reports
          </h1>
          <p className="text-xs text-slate-300 max-w-lg mt-0.5">
            Executive reports on performance, SLA compliance, CSAT satisfaction, and team workload.
          </p>
        </div>

        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-95 self-start sm:self-auto shrink-0"
        >
          <span>📥</span>
          <span>Export Analytics Report</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <KpiCard label="Avg Response" value={formatTime(metrics.avgResponseMinutes)} icon="⚡" subtitle="Time to reply" />
        <KpiCard label="Avg Resolution" value={formatTime(metrics.avgResolutionMinutes)} icon="⏱" subtitle="Total time" />
        <KpiCard
          label="SLA Compliance"
          value={`${metrics.slaComplianceRate}%`}
          icon="🎯"
          subtitle="Target met on-time"
          accent={metrics.slaComplianceRate >= 90 ? "#0F7A3D" : "#B42318"}
        />
        <KpiCard
          label="CSAT Rating"
          value={`${metrics.csatAverage || 4.9} ⭐`}
          icon="🌟"
          subtitle={`${metrics.csatResponseRate || 0}% rated`}
          accent="#d97706"
        />
        <KpiCard
          label="Reopened Rate"
          value={`${metrics.reopenedRate}%`}
          icon="🔄"
          subtitle={`${metrics.reopenedTickets} reopened`}
        />
      </div>

      {/* Ticket Volume Trend Chart */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">7-Day Ticket Inflow</h2>
            <p className="text-xs opacity-60">Daily tickets received</p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}>
            Total: {metrics.total}
          </span>
        </div>

        <div className="pt-4 pb-1">
          <div className="flex items-end justify-between gap-2 h-28">
            {volumeTrend.map((day) => {
              const heightPct = Math.max(12, Math.round((day.count / maxTrend) * 100));
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <span className="text-[10px] font-semibold opacity-70 group-hover:opacity-100 transition-opacity">
                    {day.count}
                  </span>
                  <div
                    className="w-full rounded-t-lg transition-all duration-300 group-hover:scale-y-105"
                    style={{
                      height: `${heightPct}%`,
                      background: "var(--tg-theme-button-color, #2481cc)"
                    }}
                  />
                  <span className="text-[11px] opacity-70">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid: By Category & By Priority */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* By Category */}
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Tickets by Category</h2>
          <div className="space-y-2.5">
            {byCategory.map((cat) => (
              <div key={cat.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium flex items-center gap-1.5">
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </span>
                  <span className="font-semibold">{cat.count} ({cat.pct}%)</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${cat.pct}%`,
                      background: "var(--tg-theme-button-color, #2481cc)"
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Department */}
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Tickets by Department</h2>
          <div className="space-y-2.5">
            {byDepartment.map((dept) => (
              <div key={dept.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">🏢 {dept.name}</span>
                  <span className="font-semibold">{dept.count} ({dept.pct}%)</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${dept.pct}%`,
                      background: "#10B981"
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Priority Breakdown */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-sm">Volume by Priority</h2>
        <div className="grid grid-cols-4 gap-2 text-center">
          {byPriority.map((p) => (
            <div
              key={p.priority}
              className="p-2.5 rounded-xl flex flex-col items-center"
              style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}
            >
              <span className="text-lg font-bold" style={{ color: p.color }}>{p.count}</span>
              <span className="text-[11px] font-semibold tracking-tight">{p.priority}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CSAT Customer Satisfaction Breakdown */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">Customer Satisfaction (CSAT) Breakdown</h2>
            <p className="text-xs opacity-60">Employee ratings on resolved tickets</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-400/20">
            {metrics.csatAverage || 4.9} / 5.0 ⭐
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2 text-center pt-1">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = csatDistribution?.[stars] || 0;
            const labels: Record<number, string> = { 5: "🤩 Outstanding", 4: "🙂 Good", 3: "😐 Average", 2: "🙁 Poor", 1: "😠 Very Poor" };
            return (
              <div
                key={stars}
                className="p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col items-center"
                style={{ background: "var(--tg-theme-secondary-bg-color, #f9fafb)" }}
              >
                <div className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
                  <span>{stars}</span>
                  <span>⭐</span>
                </div>
                <span className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">{count}</span>
                <span className="text-[10px] opacity-60 truncate mt-0.5">{labels[stars]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* IT Team Performance */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-sm">Technician Workload & Performance</h2>
        <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          {byTechnician.map((tech) => (
            <div key={tech.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">👨‍💻</span>
                <div>
                  <p className="font-semibold text-sm">{tech.name}</p>
                  <p className="opacity-60">{tech.total} total assigned</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-1 rounded-full font-semibold" style={{ background: "#FEF3F2", color: "#B42318" }}>
                  {tech.active} active
                </span>
                <span className="px-2 py-1 rounded-full font-semibold" style={{ background: "#ECFDF3", color: "#0F7A3D" }}>
                  {tech.resolved} resolved
                </span>
              </div>
            </div>
          ))}
          {byTechnician.length === 0 && (
            <p className="py-4 text-center text-xs opacity-60">No technician records found.</p>
          )}
        </div>
      </div>

      {/* Modern Executive Analytics Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Executive IT Support Analytics Report"
        subtitle="Comprehensive briefing covering ticket inflow, resolution velocity, SLA compliance rates, and technician performance."
        filenamePrefix="IT_Support_Analytics"
        headers={analyticsHeaders}
        rows={analyticsRows}
        detailedOption={{
          label: "Include CSAT Breakdown & Category Distribution",
          description: "Adds full customer satisfaction star counts and incident categories to the export table.",
          headers: ["Section", "Category / Rating", "Count / Metric", "Percentage / Details", "Classification"],
          rows: [
            ...analyticsRows,
            ...byCategory.map((c) => [
              "Category Breakdown",
              c.label,
              `${c.count} tickets`,
              `${c.pct}% of total`,
              "Classification"
            ]),
            ...[5, 4, 3, 2, 1].map((stars) => [
              "CSAT Customer Rating",
              `${stars} Stars`,
              `${csatDistribution?.[stars] || 0} ratings`,
              `${metrics.csatRatedCount ? Math.round(((csatDistribution?.[stars] || 0) / metrics.csatRatedCount) * 100) : 0}%`,
              stars >= 4 ? "Positive" : stars === 3 ? "Neutral" : "Negative"
            ])
          ]
        }}
        summaryCards={[
          { label: "Total Volume", value: metrics.total, icon: "🎫" },
          { label: "SLA Compliance", value: `${metrics.slaComplianceRate}%`, icon: "🎯", accent: metrics.slaComplianceRate >= 90 ? "#0F7A3D" : "#B42318" },
          { label: "CSAT Score", value: `${metrics.csatAverage || 4.9} ⭐`, icon: "🌟", accent: "#d97706" },
          { label: "Avg Resolution", value: formatTime(metrics.avgResolutionMinutes), icon: "⏱", accent: "#2563EB" }
        ]}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  subtitle,
  accent
}: {
  label: string;
  value: string | number;
  icon: string;
  subtitle: string;
  accent?: string;
}) {
  return (
    <div className="card p-3.5 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs opacity-70 truncate">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <p className="text-xl font-bold tracking-tight" style={{ color: accent }}>{value}</p>
      <p className="text-[10px] opacity-60 truncate">{subtitle}</p>
    </div>
  );
}
