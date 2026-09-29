"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { TicketCard, CardSkeleton } from "@/components/TicketCard";
import type { DbTicket } from "@/types/db";

type Timeframe = "today" | "week" | "month" | "all";

interface TechMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  role: string;
  active: number;
  resolved: number;
  total: number;
  csat?: number | null;
  ratingsCount?: number;
}

interface OverviewData {
  counts: {
    total: number;
    open: number;
    inProgress: number;
    waiting: number;
    resolved: number;
    critical: number;
    overdue: number;
    resolutionRate: number;
    avgResponseMinutes: number;
    avgResolutionHours: number;
    slaComplianceRate: number;
    csatAverage?: number;
    csatCount?: number;
    csatResponseRate?: number;
  };
  team: TechMember[];
  byDepartment: { name: string; count: number; pct: number }[];
  byPriority: { priority: string; label: string; count: number; color: string }[];
  trend: { label: string; count: number }[];
  criticalTickets: DbTicket[];
  tickets: any[];
}

export default function AdminDashboard() {
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [selectedTech, setSelectedTech] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("timeframe", timeframe);
    if (selectedTech !== "all") params.set("techId", selectedTech);

    api<OverviewData>(`/api/admin/overview?${params.toString()}`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Admin dashboard fetch error:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, [timeframe, selectedTech]);

  // Client-side CSV export
  const handleExportCSV = () => {
    if (!data || !data.tickets || data.tickets.length === 0) {
      alert("No tickets available to export for this selection.");
      return;
    }

    const headers = [
      "Ticket Number",
      "Subject",
      "Priority",
      "Status",
      "Requester Name",
      "Requester Username",
      "Assigned Technician",
      "Department",
      "Category",
      "Created At"
    ];

    const rows = data.tickets.map((t) => [
      `"${t.ticket_number}"`,
      `"${(t.subject || "").replace(/"/g, '""')}"`,
      `"${t.priority}"`,
      `"${t.status}"`,
      `"${t.requester_name || ""}"`,
      `"${t.requester_username ? `@${t.requester_username}` : ""}"`,
      `"${t.technician_name || "Unassigned"}"`,
      `"${t.department_name || ""}"`,
      `"${t.category_label || ""}"`,
      `"${new Date(t.created_at).toLocaleString()}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `IT_Helpdesk_Report_${timeframe}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered tickets in quick view
  const displayTickets = useMemo(() => {
    if (!data?.tickets) return [];
    if (!searchQuery.trim()) return data.tickets.slice(0, 10);
    const q = searchQuery.toLowerCase();
    return data.tickets.filter(
      (t) =>
        t.ticket_number.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.requester_name && t.requester_name.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [data?.tickets, searchQuery]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto pb-28">
      {/* Executive Command Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-3xl shadow-xl border border-indigo-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 tracking-wider uppercase">
                🛡️ Executive Command
              </span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Live Helpdesk
              </span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-white">
              IT Operations Command & Analytics
            </h1>
            <p className="text-xs text-slate-300 max-w-xl">
              Performance metrics, SLA compliance, technician capacity, and automated ticket dispatch.
            </p>
          </div>

          {/* Quick Links & Export */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all active:scale-95"
              title="Download CSV report of current selection"
            >
              <span>📥</span>
              <span>Export CSV</span>
            </button>

            <Link
              href="/admin/tasks"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all active:scale-95"
            >
              <span>🎯</span>
              <span>Project Tasks</span>
            </Link>

            <Link
              href="/admin/reports"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
            >
              <span>⭐</span>
              <span>CSAT Reports</span>
            </Link>

            <Link
              href="/tech"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
            >
              <span>👨‍💻</span>
              <span>Tech Desk</span>
            </Link>

            <Link
              href="/home"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
            >
              <span>🏠</span>
              <span>Employee View</span>
            </Link>
          </div>
        </div>

        {/* Filters: Timeframe & Technician Switcher */}
        <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Timeframe Buttons */}
          <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-2xl border border-white/10 w-fit">
            {(["today", "week", "month", "all"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all capitalize ${
                  timeframe === tf
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-300 hover:text-white hover:bg-white/5"
                }`}
              >
                {tf === "today" ? "Today" : tf === "week" ? "This Week" : tf === "month" ? "This Month" : "All Time"}
              </button>
            ))}
          </div>

          {/* Filter By Technician Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300 font-semibold whitespace-nowrap">Filter by Tech:</span>
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="text-xs font-bold bg-white/10 text-white border border-white/20 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="all" className="bg-slate-900 text-white">All Technicians ({data?.team.length || 0})</option>
              {data?.team.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                  👨‍💻 {t.first_name} {t.last_name || ""} ({t.active} active)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Critical Incidents Banner */}
      {(data?.counts.critical ?? 0) > 0 && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-red-500/10 via-rose-500/10 to-red-500/10 border border-red-500/30 shadow-sm animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <p className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400">
                {data?.counts.critical} Critical Incident Requires Immediate Triage
              </p>
              <p className="text-[11px] text-red-500/80">
                SLA response targets are actively ticking. Dispatch staff immediately.
              </p>
            </div>
          </div>
          <Link
            href="/tickets?tab=critical"
            className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-colors"
          >
            Review Incidents →
          </Link>
        </div>
      )}

      {/* Primary KPI Grid (7 Top Performance Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-3.5">
        <div className="card p-4 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Total Volume</span>
            <span>📦</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {loading ? "…" : data?.counts.total}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Tickets in {timeframe}</p>
          </div>
        </div>

        <div className="card p-4 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Resolution Rate</span>
            <span>🎯</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {loading ? "…" : `${data?.counts.resolutionRate}%`}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">{data?.counts.resolved} closed/resolved</p>
          </div>
        </div>

        <div className="card p-4 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between bg-gradient-to-br from-amber-500/5 to-transparent">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>CSAT Rating</span>
            <span>⭐</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-amber-500">
              {loading ? "…" : `${data?.counts.csatAverage ?? 4.9} ★`}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">{data?.counts.csatResponseRate ?? 0}% response rate</p>
          </div>
        </div>

        <div className="card p-4 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Active Backlog</span>
            <span>⚡</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
              {loading ? "…" : (data?.counts.open ?? 0) + (data?.counts.inProgress ?? 0)}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">{data?.counts.open} open • {data?.counts.inProgress} active</p>
          </div>
        </div>

        <div className="card p-4 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>SLA Compliance</span>
            <span>⏱️</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {loading ? "…" : `${data?.counts.slaComplianceRate}%`}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {data?.counts.overdue === 0 ? "Zero breached SLAs" : `${data?.counts.overdue} breached tickets`}
            </p>
          </div>
        </div>

        <div className="card p-4 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Avg Response</span>
            <span>💬</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400">
              {loading ? "…" : `${data?.counts.avgResponseMinutes}m`}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">First technician reply</p>
          </div>
        </div>

        <div className="card p-4 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Avg Resolution</span>
            <span>🏁</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-purple-600 dark:text-purple-400">
              {loading ? "…" : `${data?.counts.avgResolutionHours}h`}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Time to close/fix</p>
          </div>
        </div>
      </div>

      {/* Technician Performance Matrix Section */}
      <div className="card p-5 border border-slate-200/80 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>👨‍💻</span> IT Technician Performance & Live Workload
            </h2>
            <p className="text-xs text-slate-500">Real-time capacity, resolution counts, and workload distribution</p>
          </div>
          <Link
            href="/admin/users"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Manage Staff & Roles →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {(!data?.team || data.team.length === 0) && !loading && (
            <p className="col-span-3 text-xs text-slate-500 py-4 text-center">
              No technicians currently assigned. Promote staff in Users Management.
            </p>
          )}

          {data?.team.map((tech) => {
            const isSelected = selectedTech === tech.id;
            const maxCap = 6;
            const loadPct = Math.min(100, Math.round((tech.active / maxCap) * 100));
            const isOverloaded = tech.active >= 5;

            return (
              <div
                key={tech.id}
                onClick={() => setSelectedTech(isSelected ? "all" : tech.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? "ring-2 ring-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-500"
                    : "bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60 hover:border-slate-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 font-black flex items-center justify-center text-xs">
                      {tech.first_name?.[0] || "T"}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        {tech.first_name} {tech.last_name || ""}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span>@{tech.username || tech.role.toLowerCase()}</span>
                        {tech.csat && (
                          <span className="font-bold text-amber-500 flex items-center gap-0.5">
                            <span>⭐</span>
                            <span>{tech.csat}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      isOverloaded
                        ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                        : tech.active > 0
                        ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    }`}
                  >
                    {tech.active} Active
                  </span>
                </div>

                {/* Capacity Bar */}
                <div className="mt-3 space-y-1">
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOverloaded ? "bg-rose-500" : tech.active > 2 ? "bg-amber-500" : "bg-indigo-600"
                      }`}
                      style={{ width: `${Math.max(6, loadPct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
                    <span>{tech.resolved} Resolved</span>
                    <span>{isOverloaded ? "Overloaded" : tech.active > 0 ? "Active" : "Available"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Analytics Grid: Priority & Department Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Department Distribution */}
        <div className="card p-5 border border-slate-200/80 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Tickets by Department</h3>
            <span className="text-[11px] font-semibold text-slate-400">{data?.byDepartment.length || 0} depts</span>
          </div>

          <div className="space-y-2.5">
            {(!data?.byDepartment || data.byDepartment.length === 0) && (
              <p className="text-xs text-slate-400 py-3 text-center">No department activity in this period.</p>
            )}

            {data?.byDepartment.map((d) => (
              <div key={d.name} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-800 dark:text-slate-200">{d.name}</span>
                  <span className="text-slate-500">{d.count} ({d.pct}%)</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(4, d.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Priority Severity Breakdown */}
        <div className="card p-5 border border-slate-200/80 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Incident Severity Breakdown</h3>
            <span className="text-[11px] font-semibold text-slate-400">SLA Priority</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {data?.byPriority.map((p) => (
              <div
                key={p.priority}
                className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold" style={{ color: p.color }}>{p.label}</p>
                  <p className="text-[10px] text-slate-400">Target SLA</p>
                </div>
                <span className="text-lg font-black text-slate-900 dark:text-white">{p.count}</span>
              </div>
            ))}
          </div>

          {/* Quick SLA Health Indicator */}
          <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-500/20 text-xs flex items-center justify-between">
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">Overall SLA Health</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {data?.counts.overdue === 0 ? "🟢 100% On-Track" : `🔴 ${data?.counts.overdue} Overdue`}
            </span>
          </div>
        </div>
      </div>

      {/* Live Ticket Management & Quick Search */}
      <div className="card p-5 border border-slate-200/80 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>📋</span> Filtered Tickets List ({data?.tickets.length || 0})
            </h2>
            <p className="text-xs text-slate-500">Showing tickets matching timeframe and technician filters</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticket#, requester, title..."
              className="text-xs p-2 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 w-64"
            />
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              📥 CSV
            </button>
          </div>
        </div>

        {/* Tickets Preview Table/Cards */}
        <div className="space-y-2">
          {loading && <CardSkeleton />}

          {!loading && displayTickets.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400 border rounded-2xl">
              No tickets found matching your query or filter.
            </div>
          )}

          {!loading &&
            displayTickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
        </div>
      </div>

      {/* Complete System Administration Hub */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase font-bold text-slate-400 tracking-wider">
          Enterprise Control & Management Portals
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
            <p className="text-[10px] text-slate-500 mt-0.5">Executive trends, compliance</p>
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
            <p className="text-[10px] text-slate-500 mt-0.5">Tier 1, Network, Peripherals</p>
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
