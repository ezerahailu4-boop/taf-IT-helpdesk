"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useMe } from "@/lib/useMe";
import { TicketCard, CardSkeleton, EmptyState, ErrorState } from "@/components/TicketCard";
import type { DbTicket, TicketPriority } from "@/types/db";

const EMPLOYEE_TABS = [
  { key: "all", label: "All Tickets" },
  { key: "OPEN", label: "Open" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CLOSED", label: "Closed" }
];

const TECH_TABS = [
  { key: "mine", label: "My Queue" },
  { key: "unassigned", label: "Unassigned" },
  { key: "critical", label: "🚨 Critical" },
  { key: "overdue", label: "⏰ Overdue" },
  { key: "waiting", label: "Waiting" },
  { key: "all", label: "All Tickets" }
];

export default function TicketsPage() {
  const { user } = useMe();
  const [tab, setTab] = useState("all");
  const [tickets, setTickets] = useState<DbTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Advanced Filters (Section 32)
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<TicketPriority | "ALL">("ALL");
  const [filterSla, setFilterSla] = useState<string>("ALL");
  const [showFilters, setShowFilters] = useState(false);

  const isStaff = user?.role === "TECHNICIAN" || user?.role === "ADMIN";
  const tabs = isStaff ? TECH_TABS : EMPLOYEE_TABS;

  useEffect(() => {
    if (!user) return;
    setTickets(null);
    setError(null);
    const params = new URLSearchParams();

    if (isStaff) {
      if (tab === "mine") params.set("scope", "mine");
      else if (tab === "unassigned") params.set("scope", "unassigned");
      else params.set("scope", "all");
    } else {
      if (tab !== "all" && tab !== "OPEN") params.set("status", tab);
    }

    if (search.trim()) params.set("q", search.trim());
    if (filterPriority !== "ALL") params.set("priority", filterPriority);

    api<{ tickets: DbTicket[] }>(`/api/tickets?${params.toString()}`)
      .then((d) => {
        let list = d.tickets;
        if (!isStaff && tab === "OPEN") {
          list = list.filter((t) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status));
        }
        if (isStaff && tab === "critical") {
          list = list.filter((t) => t.priority === "CRITICAL" && !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status));
        }
        if (isStaff && tab === "overdue") {
          list = list.filter((t) => t.resolution_due_at && new Date(t.resolution_due_at) < new Date() && !t.resolved_at);
        }
        if (isStaff && tab === "waiting") {
          list = list.filter((t) => t.status === "WAITING_FOR_USER" || t.status === "WAITING_FOR_ADMIN");
        }

        // SLA filter
        if (filterSla === "BREACHED") {
          list = list.filter((t) => t.resolution_due_at && new Date(t.resolution_due_at) < new Date() && !t.resolved_at);
        } else if (filterSla === "AT_RISK") {
          list = list.filter((t) => {
            if (!t.resolution_due_at || t.resolved_at) return false;
            const due = new Date(t.resolution_due_at).getTime();
            const now = Date.now();
            const created = new Date(t.created_at).getTime();
            const total = due - created;
            const left = due - now;
            return total > 0 && left / total <= 0.2 && left > 0;
          });
        }

        setTickets(list);
      })
      .catch((err) => setError(err.message));
  }, [user, tab, search, filterPriority, filterSla, isStaff]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {isStaff ? "Support Ticket Queue" : "My Support Tickets"}
          </h1>
          <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
            {isStaff ? "Manage company requests and SLA deadlines" : "Track status, responses, and resolutions"}
          </p>
        </div>
        {user?.role === "EMPLOYEE" && (
          <Link
            href="/create"
            className="text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm text-white"
            style={{ background: "var(--tg-theme-button-color,#2481cc)" }}
          >
            + New Ticket
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3.5 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all"
            style={{
              background: tab === t.key ? "var(--tg-theme-button-color,#2481cc)" : "var(--tg-theme-secondary-bg-color,#f2f2f7)",
              color: tab === t.key ? "#fff" : "var(--tg-theme-text-color,#111)"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search and Advanced Filters Toggle */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-xs opacity-60">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or #..."
              className="w-full pl-8 pr-3 py-2 rounded-xl card text-xs border"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border card transition-colors ${
              filterPriority !== "ALL" || filterSla !== "ALL" ? "border-blue-500 font-bold" : ""
            }`}
          >
            Filters {filterPriority !== "ALL" || filterSla !== "ALL" ? "•" : ""}
          </button>
        </div>

        {showFilters && (
          <div className="card p-3 rounded-2xl space-y-3 border text-xs" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold block mb-1">Priority</label>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value as any)}
                  className="w-full rounded-xl p-2 card text-xs border"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="CRITICAL">🔴 Critical</option>
                  <option value="HIGH">🟠 High</option>
                  <option value="MEDIUM">🟡 Medium</option>
                  <option value="LOW">🟢 Low</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">SLA Status</label>
                <select
                  value={filterSla}
                  onChange={(e) => setFilterSla(e.target.value)}
                  className="w-full rounded-xl p-2 card text-xs border"
                >
                  <option value="ALL">All SLAs</option>
                  <option value="AT_RISK">🟡 At Risk (&lt;20% remaining)</option>
                  <option value="BREACHED">🔴 Breached (Late)</option>
                </select>
              </div>
            </div>

            {(filterPriority !== "ALL" || filterSla !== "ALL" || search) && (
              <button
                onClick={() => {
                  setFilterPriority("ALL");
                  setFilterSla("ALL");
                  setSearch("");
                }}
                className="text-[11px] text-blue-600 hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={() => setTab((t) => t)} />}

      {!error && tickets === null && (
        <div className="space-y-2">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
      )}

      {!error && tickets?.length === 0 && (
        <EmptyState
          title={search ? "No tickets match your search." : "No tickets in this view."}
          actionHref={user?.role === "EMPLOYEE" ? "/create" : undefined}
          actionLabel={user?.role === "EMPLOYEE" ? "Report a Problem" : undefined}
        />
      )}

      <div className="space-y-2">
        {tickets?.map((t) => <TicketCard key={t.id} ticket={t} />)}
      </div>
    </div>
  );
}
