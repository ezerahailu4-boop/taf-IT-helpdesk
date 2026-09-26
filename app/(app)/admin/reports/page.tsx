"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { ErrorState } from "@/components/TicketCard";

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
  };
  byDepartment: { name: string; count: number; pct: number }[];
  byCategory: { label: string; icon: string; count: number; pct: number }[];
  byPriority: { priority: string; count: number; color: string }[];
  byTechnician: { id: string; name: string; active: number; resolved: number; total: number }[];
  volumeTrend: { date: string; label: string; count: number }[];
}

export default function AdminReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const { metrics, byDepartment, byCategory, byPriority, byTechnician, volumeTrend } = data;
  const maxTrend = Math.max(1, ...volumeTrend.map((d) => d.count));

  function formatTime(minutes: number) {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">IT Support Analytics</h1>
        <p className="text-xs" style={{ color: "var(--tg-theme-hint-color, #999)" }}>
          Executive reports on performance, SLA compliance, and team workload
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <KpiCard label="Avg Response Time" value={formatTime(metrics.avgResponseMinutes)} icon="⚡" subtitle="Time to first reply" />
        <KpiCard label="Avg Resolution" value={formatTime(metrics.avgResolutionMinutes)} icon="⏱" subtitle="Total time to resolve" />
        <KpiCard
          label="SLA Compliance"
          value={`${metrics.slaComplianceRate}%`}
          icon="🎯"
          subtitle="Target met on-time"
          accent={metrics.slaComplianceRate >= 90 ? "#0F7A3D" : "#B42318"}
        />
        <KpiCard
          label="Reopened Rate"
          value={`${metrics.reopenedRate}%`}
          icon="🔄"
          subtitle={`${metrics.reopenedTickets} reopened tickets`}
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
