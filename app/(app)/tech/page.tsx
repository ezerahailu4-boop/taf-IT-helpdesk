"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useMe } from "@/lib/useMe";
import { TicketCard, CardSkeleton, EmptyState } from "@/components/TicketCard";
import type { DbTicket, DbProjectTask } from "@/types/db";

export default function TechDashboard() {
  const { user, counts, loading, reload } = useMe();
  const [activeTab, setActiveTab] = useState<"mine" | "unassigned" | "critical" | "waiting">("mine");
  const [allTickets, setAllTickets] = useState<DbTicket[]>([]);
  const [myTasks, setMyTasks] = useState<DbProjectTask[]>([]);
  const [fetching, setFetching] = useState(true);
  const [takingId, setTakingId] = useState<string | null>(null);

  const fetchTickets = () => {
    setFetching(true);
    api<{ tickets: DbTicket[] }>("/api/tickets?scope=all")
      .then((d) => {
        setAllTickets(d.tickets);
        setFetching(false);
      })
      .catch((err) => {
        console.error("Failed to load technician queue:", err);
        setFetching(false);
      });

    // Fetch assigned project tasks
    api<{ tasks: DbProjectTask[] }>("/api/admin/tasks")
      .then((d) => {
        if (d?.tasks) {
          const userTasks = d.tasks.filter(
            (t) => t.assigned_to_id === user?.id && t.status !== "COMPLETED" && t.status !== "CANCELLED"
          );
          setMyTasks(userTasks);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchTickets();
  }, [user?.id]);

  const openTickets = allTickets.filter((t) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status));
  const myTickets = openTickets.filter((t) => t.assigned_technician_id === user?.id);
  const unassigned = openTickets.filter((t) => !t.assigned_technician_id);
  const critical = openTickets.filter((t) => t.priority === "CRITICAL" || t.priority === "HIGH");
  const waiting = openTickets.filter((t) => t.status === "WAITING_FOR_USER" || t.status === "WAITING_FOR_ADMIN");
  
  // Quick take ticket directly from queue
  const handleTakeTicket = async (ticketId: string) => {
    setTakingId(ticketId);
    try {
      await api(`/api/tickets/${ticketId}/take`, { method: "POST" });
      fetchTickets();
      reload();
    } catch (e: any) {
      alert(e.message || "Failed to assign ticket");
    } finally {
      setTakingId(null);
    }
  };

  const currentTabTickets =
    activeTab === "mine"
      ? myTickets
      : activeTab === "unassigned"
      ? unassigned
      : activeTab === "critical"
      ? critical
      : waiting;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto pb-24">
      {/* Technician Console Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-sky-950 via-slate-900 to-cyan-950 text-white p-5 rounded-2xl shadow-lg border border-cyan-500/20">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 tracking-wide uppercase">
              👨‍💻 IT Technician Console
            </span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              On Duty • Ready for Dispatch
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Support Workbench
          </h1>
          <p className="text-xs text-slate-300">
            Welcome back, <span className="font-semibold text-white">{user?.first_name || "Technician"}</span>. Active tickets assigned to your queue.
          </p>
        </div>

        {/* Quick Portal Switch Links */}
        <div className="flex items-center gap-2">
          <Link
            href="/admin/tasks"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md active:scale-95"
          >
            <span>🎯</span>
            <span>Project Tasks</span>
          </Link>
          {user?.role === "ADMIN" && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
            >
              <span>🛡️</span>
              <span>Admin Center</span>
            </Link>
          )}
          <Link
            href="/home"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
          >
            <span>🏠</span>
            <span>Employee View</span>
          </Link>
          <button
            onClick={() => {
              fetchTickets();
              reload();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
            title="Refresh queue"
          >
            <span>🔄</span>
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Technician Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setActiveTab("mine")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeTab === "mine"
              ? "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-500 shadow-sm ring-1 ring-cyan-500"
              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold">My Active Queue</span>
            <span className="text-sm">👤</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {loading ? "…" : myTickets.length}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Assigned to you</p>
        </button>

        <button
          onClick={() => setActiveTab("unassigned")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeTab === "unassigned"
              ? "bg-amber-50 dark:bg-amber-950/40 border-amber-500 shadow-sm ring-1 ring-amber-500"
              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold">Unassigned</span>
            <span className="text-sm">🙋</span>
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {loading ? "…" : unassigned.length}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Needs technician</p>
        </button>

        <button
          onClick={() => setActiveTab("critical")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeTab === "critical"
              ? "bg-rose-50 dark:bg-rose-950/40 border-rose-500 shadow-sm ring-1 ring-rose-500"
              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold">High & Critical</span>
            <span className="text-sm">🚨</span>
          </div>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
            {loading ? "…" : critical.length}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Urgent triage</p>
        </button>

        <button
          onClick={() => setActiveTab("waiting")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeTab === "waiting"
              ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 shadow-sm ring-1 ring-indigo-500"
              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold">Waiting on User</span>
            <span className="text-sm">⏳</span>
          </div>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
            {loading ? "…" : waiting.length}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Customer replies</p>
        </button>
      </div>

      {/* Assigned Project Tasks Widget */}
      {myTasks.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-5 shadow-xl space-y-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎯</span>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-white">
                  Your Assigned Project Tasks ({myTasks.length})
                </h3>
                <p className="text-[11px] text-slate-300">
                  Target infrastructure goals and deployments assigned to you by Admin
                </p>
              </div>
            </div>
            <Link
              href="/admin/tasks"
              className="text-xs font-bold text-indigo-300 hover:text-white flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-xl transition-all"
            >
              <span>View All</span>
              <span>→</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {myTasks.map((t) => {
              const due = new Date(t.deadline);
              const now = new Date();
              const diffHours = Math.round((due.getTime() - now.getTime()) / (1000 * 3600));
              const isOverdue = diffHours < 0;
              const dueText = isOverdue
                ? `${Math.abs(diffHours)}h overdue`
                : diffHours < 24
                ? `due in ${diffHours}h`
                : `due in ${Math.round(diffHours / 24)}d`;

              return (
                <Link
                  key={t.id}
                  href={`/admin/tasks?taskId=${t.id}`}
                  className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-400/40 p-4 rounded-2xl transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-extrabold text-xs text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {t.title}
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        isOverdue
                          ? "bg-red-500/20 text-red-300 border-red-500/30 animate-pulse"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      {dueText}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 line-clamp-2">{t.goal}</p>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400 font-medium">Progress</span>
                      <span className="font-mono font-bold text-indigo-400">{t.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <span className="text-[11px] font-bold text-indigo-400 group-hover:text-indigo-300 flex items-center gap-1">
                      <span>Post Progress & Report</span>
                      <span>→</span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Tab Switcher */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("mine")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "mine"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            My Active ({myTickets.length})
          </button>
          <button
            onClick={() => setActiveTab("unassigned")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "unassigned"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Unassigned Pool ({unassigned.length})
          </button>
          <button
            onClick={() => setActiveTab("critical")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "critical"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Critical & High ({critical.length})
          </button>
          <button
            onClick={() => setActiveTab("waiting")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "waiting"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Waiting on Info ({waiting.length})
          </button>
        </div>

        <Link
          href="/tickets"
          className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex-shrink-0"
        >
          All Tickets →
        </Link>
      </div>

      {/* Tickets List Area */}
      <div className="space-y-3">
        {fetching && <CardSkeleton />}

        {!fetching && currentTabTickets.length === 0 && (
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center space-y-2 shadow-sm">
            <span className="text-3xl block">
              {activeTab === "unassigned" ? "🙌" : activeTab === "critical" ? "🎉" : "☕"}
            </span>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {activeTab === "unassigned"
                ? "No unassigned tickets in queue!"
                : activeTab === "critical"
                ? "Zero critical or high priority tickets open."
                : "Your active queue is empty."}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {activeTab === "mine"
                ? "Check the Unassigned Pool above to pick up new incoming employee requests."
                : "Great job keeping response and resolution times fast!"}
            </p>
            {activeTab === "mine" && unassigned.length > 0 && (
              <button
                onClick={() => setActiveTab("unassigned")}
                className="mt-3 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md transition-colors"
              >
                View {unassigned.length} Unassigned Tickets →
              </button>
            )}
          </div>
        )}

        {!fetching &&
          currentTabTickets.map((ticket) => (
            <div key={ticket.id} className="relative group">
              <TicketCard ticket={ticket} />

              {/* Quick Action Button overlay for unassigned tickets */}
              {!ticket.assigned_technician_id && (
                <div className="mt-1 flex justify-end px-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleTakeTicket(ticket.id);
                    }}
                    disabled={takingId === ticket.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
                  >
                    <span>⚡</span>
                    <span>{takingId === ticket.id ? "Assigning…" : "Assign to Me"}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
