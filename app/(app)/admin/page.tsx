"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { TicketCard, CardSkeleton } from "@/components/TicketCard";
import { PriorityPill, StatusPill } from "@/components/StatusPill";
import type { DbTicket } from "@/types/db";

type Timeframe = "today" | "week" | "month" | "all";
type TicketTab = "all" | "open" | "in_progress" | "critical" | "resolved";

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
    resolutionRate: number | null;
    avgResponseMinutes: number | null;
    avgResolutionHours: number | null;
    slaComplianceRate: number | null;
    csatAverage?: number | null;
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
  const [ticketTab, setTicketTab] = useState<TicketTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [triggeringSla, setTriggeringSla] = useState(false);
  const [slaFeedback, setSlaFeedback] = useState<string | null>(null);

  const fetchData = (silent = false) => {
    if (!silent) setLoading(true);
    setIsSyncing(true);
    const params = new URLSearchParams();
    params.set("timeframe", timeframe);
    if (selectedTech !== "all") params.set("techId", selectedTech);

    api<OverviewData>(`/api/admin/overview?${params.toString()}`)
      .then((res) => {
        setData(res);
        setLastSyncTime(new Date());
      })
      .catch((err) => {
        console.error("Admin dashboard fetch error:", err);
      })
      .finally(() => {
        if (!silent) setLoading(false);
        setIsSyncing(false);
      });
  };

  useEffect(() => {
    fetchData();

    // Live Real-Time Polling Sync every 12s
    const interval = setInterval(() => {
      fetchData(true);
    }, 12000);

    const onFocus = () => fetchData(true);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [timeframe, selectedTech]);

  const handleTriggerSlaSweep = async () => {
    setTriggeringSla(true);
    setSlaFeedback(null);
    try {
      const res: any = await api("/api/cron/sla-sweep", { method: "POST" });
      setSlaFeedback(res.summary || "SLA & escalation sweep completed.");
      fetchData(true);
      setTimeout(() => setSlaFeedback(null), 6000);
    } catch (err: any) {
      setSlaFeedback(err.message || "Failed to trigger SLA sweep");
      setTimeout(() => setSlaFeedback(null), 5000);
    } finally {
      setTriggeringSla(false);
    }
  };

  const handleExportCSV = () => {
    if (!data?.tickets || data.tickets.length === 0) {
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
    link.setAttribute("download", `IT_Helpdesk_${timeframe}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered tickets in quick view
  const displayTickets = useMemo(() => {
    if (!data?.tickets) return [];
    let list = data.tickets;

    // Filter by Tab
    if (ticketTab === "open") {
      list = list.filter((t) => ["NEW", "ASSIGNED"].includes(t.status));
    } else if (ticketTab === "in_progress") {
      list = list.filter((t) => t.status === "IN_PROGRESS");
    } else if (ticketTab === "critical") {
      list = list.filter((t) => t.priority === "CRITICAL");
    } else if (ticketTab === "resolved") {
      list = list.filter((t) => ["RESOLVED", "CLOSED"].includes(t.status));
    }

    // Filter by Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.ticket_number.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          (t.requester_name && t.requester_name.toLowerCase().includes(q)) ||
          (t.technician_name && t.technician_name.toLowerCase().includes(q))
      );
    }

    return list.slice(0, 15);
  }, [data?.tickets, ticketTab, searchQuery]);

  // Max count in trend for bar scaling
  const maxTrend = useMemo(() => {
    if (!data?.trend || data.trend.length === 0) return 1;
    return Math.max(1, ...data.trend.map((t) => t.count));
  }, [data?.trend]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto pb-28 text-slate-900 dark:text-slate-100 font-sans">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER & GLOBAL ACTIONS (shadcn/ui PageHeader)
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              IT Command Center
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time operations, engineer dispatch capacity, SLA monitoring, and resolution metrics.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fetchData(false)}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors disabled:opacity-50"
            title="Refresh metrics immediately"
          >
            <svg
              className={`w-3.5 h-3.5 text-slate-600 dark:text-slate-400 ${isSyncing ? "animate-spin" : ""}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span>{isSyncing ? "Updating..." : "Refresh"}</span>
          </button>

          <button
            onClick={handleTriggerSlaSweep}
            disabled={triggeringSla}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100/60 shadow-sm transition-colors disabled:opacity-50"
            title="Scan ticket deadlines & dispatch automated Telegram alerts"
          >
            <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            <span>{triggeringSla ? "Sweeping SLA..." : "SLA Sweep"}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors"
            title="Export filtered records as CSV"
          >
            <svg className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span>Export CSV</span>
          </button>

          <Link
            href="/admin/tasks"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
          >
            <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span>Project Tasks</span>
          </Link>
        </div>
      </div>

      {/* SLA Feedback Alert Toast */}
      {slaFeedback && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 text-xs text-indigo-900 dark:text-indigo-300 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
            <span className="font-medium">{slaFeedback}</span>
          </div>
          <button onClick={() => setSlaFeedback(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs px-2 py-0.5">✕</button>
        </div>
      )}

      {/* Critical Incidents Callout (Only appears when Critical tickets exist) */}
      {(data?.counts.critical ?? 0) > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
                {data?.counts.critical} Critical Priority Incident(s) Active
              </p>
              <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80">
                P1 outage response SLA active (target: 2 hours). Immediate triage recommended.
              </p>
            </div>
          </div>
          <button
            onClick={() => setTicketTab("critical")}
            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            Review Critical Incidents →
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. CONTROLS: TIMEFRAME & TECHNICIAN FILTER
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Timeframe Segmented Control (shadcn tabs style) */}
        <div className="inline-flex h-9 items-center rounded-lg bg-slate-100 dark:bg-slate-800/80 p-1 text-slate-500 dark:text-slate-400 w-fit">
          {[
            { key: "today", label: "Today" },
            { key: "week", label: "7 Days" },
            { key: "month", label: "30 Days" },
            { key: "all", label: "All Time" }
          ].map((item) => {
            const active = timeframe === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTimeframe(item.key as Timeframe)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  active
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm"
                    : "hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Engineer Filter Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Focus Engineer:
          </label>
          <select
            value={selectedTech}
            onChange={(e) => setSelectedTech(e.target.value)}
            className="h-9 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All IT Engineers ({data?.team.length || 0})</option>
            {data?.team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.first_name} {t.last_name || ""} ({t.active} active)
              </option>
            ))}
          </select>
          {selectedTech !== "all" && (
            <button
              onClick={() => setSelectedTech("all")}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline px-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. EXECUTIVE METRICS (shadcn KPI Metric Cards)
      ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Total Volume */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Total Volume</span>
            <svg className="w-4 h-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
            </svg>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {loading ? "…" : data?.counts.total ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {(data?.counts.resolved ?? 0)} resolved
            </p>
          </div>
        </div>

        {/* Card 2: Active Backlog */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Active Backlog</span>
            <svg className="w-4 h-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
            </svg>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {loading ? "…" : (data?.counts.open ?? 0) + (data?.counts.inProgress ?? 0)}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {data?.counts.open ?? 0} open · {data?.counts.inProgress ?? 0} in progress
            </p>
          </div>
        </div>

        {/* Card 3: Resolution Rate */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Resolution Rate</span>
            <svg className="w-4 h-4 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {loading ? "…" : data?.counts.resolutionRate !== null && data?.counts.resolutionRate !== undefined ? `${data.counts.resolutionRate}%` : "—"}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {(data?.counts.total ?? 0) === 0 ? "No tickets logged" : `${data?.counts.resolved ?? 0} closed / resolved`}
            </p>
          </div>
        </div>

        {/* Card 4: SLA Compliance */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">SLA Compliance</span>
            <svg className="w-4 h-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
              {loading ? "…" : data?.counts.slaComplianceRate !== null && data?.counts.slaComplianceRate !== undefined ? `${data.counts.slaComplianceRate}%` : "—"}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {(data?.counts.overdue ?? 0) === 0 ? "100% within SLA target" : `${data?.counts.overdue} breached deadlines`}
            </p>
          </div>
        </div>

        {/* Card 5: First Response Time */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Avg Response</span>
            <svg className="w-4 h-4 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a.75.75 0 0 1-.974-.94 4.5 4.5 0 0 0 1.258-2.502C4.16 16.14 3 14.184 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
            </svg>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {loading ? "…" : data?.counts.avgResponseMinutes !== null && data?.counts.avgResponseMinutes !== undefined ? `${data.counts.avgResponseMinutes}m` : "—"}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Target: under 15m
            </p>
          </div>
        </div>

        {/* Card 6: Customer CSAT */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">CSAT Rating</span>
            <svg className="w-4 h-4 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
            </svg>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {loading ? "…" : data?.counts.csatAverage ? `${data.counts.csatAverage} ★` : "—"}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {data?.counts.csatCount ? `${data.counts.csatCount} reviews (${data.counts.csatResponseRate}% response)` : "No ratings submitted"}
            </p>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. ENGINEER CAPACITY & LIVE WORKLOAD (shadcn Team Board)
      ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>IT Staff Workload & Dispatch Capacity</span>
              <span className="text-[11px] font-normal text-slate-500">
                ({data?.team.length || 0} active engineers)
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time ticket load per engineer. Click any engineer card to filter the queue.
            </p>
          </div>
          <Link
            href="/admin/users"
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Manage Staff & Roles</span>
            <span>→</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(!data?.team || data.team.length === 0) && !loading && (
            <p className="col-span-3 text-xs text-slate-500 py-6 text-center">
              No technicians configured. Promote users in Staff Management.
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
                className={`p-3.5 rounded-lg border transition-all cursor-pointer select-none ${
                  isSelected
                    ? "ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30"
                    : "border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-xs">
                      {tech.first_name?.[0] || "T"}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                        {tech.first_name} {tech.last_name || ""}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>@{tech.username || "tech"}</span>
                        {tech.csat && (
                          <span className="font-semibold text-amber-500 flex items-center gap-0.5">
                            <span>★</span>
                            <span>{tech.csat}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      isOverloaded
                        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/40"
                        : tech.active > 0
                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40"
                    }`}
                  >
                    {tech.active === 0 ? "Available" : `${tech.active} Active`}
                  </span>
                </div>

                {/* Capacity Progress Bar */}
                <div className="mt-3 space-y-1">
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOverloaded ? "bg-rose-500" : tech.active > 2 ? "bg-amber-500" : "bg-indigo-600"
                      }`}
                      style={{ width: `${Math.max(4, loadPct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                    <span>{tech.resolved} resolved tickets</span>
                    <span>{tech.active}/{maxCap} capacity</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. DUAL ANALYTICS: INTAKE TREND & PRIORITY BREAKDOWN
      ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ticket Volume Intake Trend */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Ticket Intake & Trend
              </h3>
              <p className="text-xs text-slate-900 dark:text-slate-100 font-medium">Daily volume distribution</p>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Peak: {maxTrend} / day
            </span>
          </div>

          {/* Visual Trend Bars */}
          <div className="pt-4 flex items-end justify-between gap-1.5 h-36">
            {(!data?.trend || data.trend.length === 0) && (
              <p className="w-full text-center text-xs text-slate-400 my-auto">No trend data available.</p>
            )}

            {data?.trend.map((t, idx) => {
              const heightPct = Math.round((t.count / maxTrend) * 100);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end">
                  <span className="text-[10px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    {t.count}
                  </span>
                  <div
                    className={`w-full max-w-[28px] rounded-t transition-all ${
                      t.count > 0 ? "bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400" : "bg-slate-100 dark:bg-slate-800"
                    }`}
                    style={{ height: `${Math.max(6, heightPct)}%` }}
                  />
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 truncate max-w-[42px] text-center">
                    {t.label.split(",")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority Severity & Department Load */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Incident Severity Matrix
              </h3>
              <p className="text-xs text-slate-900 dark:text-slate-100 font-medium">Target SLA compliance per tier</p>
            </div>
            <span className="text-xs text-slate-500 font-mono">4 Priorities</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {data?.byPriority.map((p) => {
              const slaTarget = p.priority === "CRITICAL" ? "2h SLA" : p.priority === "HIGH" ? "4h SLA" : p.priority === "MEDIUM" ? "8h SLA" : "24h SLA";
              return (
                <div
                  key={p.priority}
                  className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold" style={{ color: p.color }}>
                      {p.label}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">{slaTarget}</p>
                  </div>
                  <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">
                    {p.count}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Department Breakdown */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Department Distribution
            </span>
            <div className="space-y-2">
              {data?.byDepartment.slice(0, 3).map((d) => (
                <div key={d.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{d.name}</span>
                    <span className="text-slate-500 font-mono">{d.count} ({d.pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(4, d.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          6. FILTERED TICKET QUEUE (shadcn Table / Feed)
      ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Operational Ticket Queue</span>
              <span className="text-xs font-normal text-slate-500">
                ({displayTickets.length} shown)
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Active tickets filtered by selected timeframe, engineer, and status tab.
            </p>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ticket #, title, user..."
                className="h-9 w-64 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-8 pr-3 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
              />
              <svg
                className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-xs text-slate-400 hover:text-slate-600 px-1.5"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Tab Pills for Fast Triage */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "all", label: "All Tickets" },
            { key: "open", label: "Open / Unassigned" },
            { key: "in_progress", label: "In Progress" },
            { key: "critical", label: "Critical Priority" },
            { key: "resolved", label: "Resolved / Closed" }
          ].map((tab) => {
            const active = ticketTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setTicketTab(tab.key as TicketTab)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  active
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tickets Feed */}
        <div className="space-y-2">
          {loading && <CardSkeleton />}

          {!loading && displayTickets.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              No tickets found matching the selected filter or search criteria.
            </div>
          )}

          {!loading &&
            displayTickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          7. ADMINISTRATIVE MODULES (shadcn Feature Grid)
      ───────────────────────────────────────────────────────────── */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Management & Infrastructure Modules
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/admin/users"
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold mb-2.5 group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Users & Staff</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Role permissions, team roster</p>
          </Link>

          <Link
            href="/admin/tasks"
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold mb-2.5 group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Project Tasks</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Engineer deliverables & reports</p>
          </Link>

          <Link
            href="/admin/assets"
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold mb-2.5 group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Hardware Assets</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Laptops, routers & devices</p>
          </Link>

          <Link
            href="/admin/reports"
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold mb-2.5 group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">CSAT & Metrics</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">SLA breach audits, CSAT rating</p>
          </Link>

          <Link
            href="/admin/audit"
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold mb-2.5 group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Audit Trail</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Security log of all operations</p>
          </Link>

          <Link
            href="/admin/departments"
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-cyan-500/10 text-cyan-600 flex items-center justify-center font-bold mb-2.5 group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Departments</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Finance, HR, Operations</p>
          </Link>

          <Link
            href="/admin/support-groups"
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-pink-500/10 text-pink-600 flex items-center justify-center font-bold mb-2.5 group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Support Tiers</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Tier 1, Systems, Hardware</p>
          </Link>

          <Link
            href="/admin/settings"
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold mb-2.5 group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">System Settings</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">SLA schedules & Telegram bot</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
