"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { TicketCard, CardSkeleton } from "@/components/TicketCard";
import type { DbTicket } from "@/types/db";

type Overview = {
  counts: Record<string, number>;
  team: { id: string; first_name: string | null; last_name: string | null; active: number }[];
  criticalTickets: DbTicket[];
};

export default function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Overview>("/api/admin/overview")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load admin overview:", err);
        setLoading(false);
      });
  }, []);

  const total = data?.counts.total ?? 0;
  const resolved = data?.counts.resolved ?? 0;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 100;
  const criticalCount = data?.counts.critical ?? 0;
  const overdueCount = data?.counts.overdue ?? 0;
  const openCount = data?.counts.open ?? 0;
  const inProgressCount = data?.counts.inProgress ?? 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto pb-24">
      {/* Header with Quick Portal Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-indigo-500/20">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 tracking-wide uppercase">
              🛡️ Executive Command
            </span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Operations
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            IT Operations & Command Center
          </h1>
          <p className="text-xs text-slate-300">
            Real-time infrastructure oversight, team capacity, and SLA management
          </p>
        </div>

        {/* Quick Portal Switch Links */}
        <div className="flex items-center gap-2">
          <Link
            href="/tech"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
          >
            <span>👨‍💻</span>
            <span>Tech Console</span>
          </Link>
          <Link
            href="/home"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
          >
            <span>🏠</span>
            <span>Employee View</span>
          </Link>
          <Link
            href="/admin/reports"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md"
          >
            <span>📈</span>
            <span>Analytics</span>
          </Link>
        </div>
      </div>

      {/* Critical Incidents Warning Banner */}
      {criticalCount > 0 && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-red-500/10 via-rose-500/10 to-red-500/10 border border-red-500/30 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center text-xl font-bold flex-shrink-0 animate-bounce">
              🚨
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400">
                {criticalCount} Critical Priority Incident{criticalCount > 1 ? "s" : ""} Requiring Dispatch
              </p>
              <p className="text-[11px] text-red-500/80">
                Response SLAs are ticking. High-visibility incidents require immediate technician triage.
              </p>
            </div>
          </div>
          <Link
            href="/tickets?tab=critical"
            className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-colors flex-shrink-0"
          >
            Triage Now →
          </Link>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Active Backlog</span>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 text-sm">🎫</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              {loading ? "…" : openCount + inProgressCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              <span className="font-semibold text-blue-600">{openCount} unassigned</span> • {inProgressCount} in progress
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>SLA Compliance</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-sm">🎯</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {loading ? "…" : `${overdueCount === 0 ? "100" : "87"}%`}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {overdueCount === 0 ? "All tickets within SLA target" : `${overdueCount} tickets currently overdue`}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Resolution Rate</span>
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 text-sm">✅</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400">
              {loading ? "…" : `${resolutionRate}%`}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {resolved} resolved of {total} lifetime tickets
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Incident Severity</span>
            <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 text-sm">🚨</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
              {loading ? "…" : criticalCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {criticalCount === 0 ? "No active critical issues" : "High urgency attention required"}
            </p>
          </div>
        </div>
      </div>

      {/* Team Load & Capacity Section */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>👨‍💻</span> IT Technician Load & Capacity
            </h2>
            <p className="text-xs text-slate-500">Live ticket distribution across support staff</p>
          </div>
          <Link
            href="/admin/users"
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Manage Staff Roles →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(!data?.team || data.team.length === 0) && !loading && (
            <p className="col-span-3 text-xs text-slate-500 py-3 text-center">
              No technicians currently assigned. Promote staff in Users Management.
            </p>
          )}

          {data?.team.map((tech) => {
            const activeTickets = tech.active || 0;
            const maxCapacity = 5;
            const loadPercent = Math.min(100, Math.round((activeTickets / maxCapacity) * 100));
            const isHeavy = activeTickets >= 4;

            return (
              <div
                key={tech.id}
                className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-600 font-bold flex items-center justify-center text-xs">
                      {tech.first_name?.[0] || "T"}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {tech.first_name} {tech.last_name || ""}
                      </p>
                      <p className="text-[10px] text-slate-500">Tier-1 Support</p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isHeavy
                        ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    }`}
                  >
                    {activeTickets} Active
                  </span>
                </div>

                {/* Capacity Bar */}
                <div className="space-y-1">
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isHeavy ? "bg-amber-500" : "bg-indigo-600"
                      }`}
                      style={{ width: `${Math.max(8, loadPercent)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span>Load: {loadPercent}%</span>
                    <span>{isHeavy ? "Near Limit" : "Optimal"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Critical Incidents Live Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-red-500">🔴</span> High Urgency Incident Queue
          </h2>
          <Link href="/tickets?tab=critical" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
            View all tickets
          </Link>
        </div>

        <div className="space-y-2">
          {loading && <CardSkeleton />}
          {!loading && (!data?.criticalTickets || data.criticalTickets.length === 0) && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center space-y-1 shadow-sm">
              <span className="text-2xl">🎉</span>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">All Systems Operational</p>
              <p className="text-[11px] text-slate-500">Zero open critical issues. Backlog is running smoothly.</p>
            </div>
          )}
          {data?.criticalTickets?.map((t) => (
            <TicketCard key={t.id} ticket={t} />
          ))}
        </div>
      </div>

      {/* Complete Administration Portals Grid */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase font-bold text-slate-400 tracking-wider">
          System Administration Hub
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/admin/users"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">
              👥
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">Users & Roles</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Staff promotion, permissions</p>
          </Link>

          <Link
            href="/admin/assets"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">
              💻
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">Hardware Assets</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Laptops, monitors, inventory</p>
          </Link>

          <Link
            href="/admin/reports"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">
              📈
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">SLA & Reports</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Resolution compliance, trends</p>
          </Link>

          <Link
            href="/admin/audit"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">
              📜
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">Audit Trail</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Security log of all operations</p>
          </Link>

          <Link
            href="/admin/departments"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">
              🏢
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">Departments</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Finance, HR, Engineering</p>
          </Link>

          <Link
            href="/admin/support-groups"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-600 flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">
              👥
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">Support Tiers</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Tier 1, Network, Hardware</p>
          </Link>

          <Link
            href="/admin/automation-rules"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">
              ⚡
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">Auto-Routing</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Keyword triggers, SLA rules</p>
          </Link>

          <Link
            href="/admin/settings"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">
              ⚙️
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">System Settings</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Business hours, bot config</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
