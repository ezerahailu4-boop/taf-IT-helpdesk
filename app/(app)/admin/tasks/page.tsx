"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useMe } from "@/lib/useMe";
import type { DbProjectTask, DbProjectTaskReport, ProjectTaskStatus, ProjectTaskPriority } from "@/types/db";

interface TechMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  telegram_username: string | null;
  photo_url: string | null;
  role: string;
}

interface TaskWithDetails extends DbProjectTask {
  assigned_to?: TechMember | null;
  created_by?: TechMember | null;
}

interface TasksResponse {
  tasks: TaskWithDetails[];
  metrics: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    overdue: number;
    completionRate: number;
  };
  technicians: TechMember[];
}

interface TaskDetailResponse {
  task: TaskWithDetails;
  reports: (DbProjectTaskReport & { technician?: TechMember })[];
}

const priorityColors: Record<ProjectTaskPriority, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: "bg-red-500/10 dark:bg-red-950/40 border-red-500/30", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  HIGH: { bg: "bg-orange-500/10 dark:bg-orange-950/40 border-orange-500/30", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  MEDIUM: { bg: "bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/30", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  LOW: { bg: "bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" }
};

const statusMeta: Record<ProjectTaskStatus, { label: string; bg: string; text: string }> = {
  PENDING: { label: "Pending", bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-600 dark:text-slate-300" },
  IN_PROGRESS: { label: "In Progress", bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-600 dark:text-blue-400" },
  BLOCKED: { label: "Blocked", bg: "bg-rose-500/10 border-rose-500/30", text: "text-rose-600 dark:text-rose-400" },
  COMPLETED: { label: "Completed", bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400" },
  CANCELLED: { label: "Cancelled", bg: "bg-gray-500/10 border-gray-500/20", text: "text-gray-500" }
};

export default function ProjectTasksPage() {
  const { user } = useMe();
  const searchParams = useSearchParams();
  const initialTaskId = searchParams.get("taskId");

  const [data, setData] = useState<TasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [techFilter, setTechFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal: Create Task
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    goal: "",
    deadline: "",
    priority: "MEDIUM" as ProjectTaskPriority,
    assignedToId: ""
  });
  const [creating, setCreating] = useState(false);

  // Modal: View & Report Task
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportProgress, setReportProgress] = useState<number>(0);
  const [reportStatus, setReportStatus] = useState<ProjectTaskStatus>("IN_PROGRESS");
  const [submittingReport, setSubmittingReport] = useState(false);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await api<TasksResponse>("/api/admin/tasks");
      setData(res);
    } catch (err) {
      console.error("Failed to load tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Open detail if taskId query parameter is passed
  useEffect(() => {
    if (initialTaskId) {
      openTaskDetail(initialTaskId);
    }
  }, [initialTaskId]);

  const openTaskDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await api<TaskDetailResponse>(`/api/tasks/${id}`);
      setSelectedTaskDetail(res);
      setReportProgress(res.task.progress);
      setReportStatus(res.task.status);
      setReportText("");
    } catch (err) {
      alert("Failed to load task details");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim() || !createForm.goal.trim() || !createForm.deadline) {
      alert("Please fill in Subject, Goal, and Deadline");
      return;
    }
    setCreating(true);
    try {
      await api("/api/admin/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: createForm.title.trim(),
          goal: createForm.goal.trim(),
          deadline: createForm.deadline,
          priority: createForm.priority,
          assignedToId: createForm.assignedToId || null
        })
      });
      setShowCreateModal(false);
      setCreateForm({
        title: "",
        goal: "",
        deadline: "",
        priority: "MEDIUM",
        assignedToId: ""
      });
      fetchTasks();
    } catch (err: any) {
      alert(err.message || "Failed to create project task");
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskDetail) return;
    if (!reportText.trim()) {
      alert("Please enter a work report or status note");
      return;
    }
    setSubmittingReport(true);
    try {
      await api(`/api/tasks/${selectedTaskDetail.task.id}/reports`, {
        method: "POST",
        body: JSON.stringify({
          reportText: reportText.trim(),
          progress: reportProgress,
          status: reportStatus
        })
      });
      // Refresh detail and list
      await openTaskDetail(selectedTaskDetail.task.id);
      fetchTasks();
    } catch (err: any) {
      alert(err.message || "Failed to submit work report");
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleQuickStatusChange = async (taskId: string, newStatus: ProjectTaskStatus, newProgress?: number) => {
    try {
      await api(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: newStatus,
          progress: newProgress !== undefined ? newProgress : newStatus === "COMPLETED" ? 100 : undefined
        })
      });
      if (selectedTaskDetail?.task.id === taskId) {
        openTaskDetail(taskId);
      }
      fetchTasks();
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    }
  };

  const filteredTasks = useMemo(() => {
    if (!data?.tasks) return [];
    return data.tasks.filter((t) => {
      const matchStatus = statusFilter === "ALL" || t.status === statusFilter;
      const matchTech = techFilter === "ALL" || t.assigned_to_id === techFilter;
      const matchSearch =
        !searchQuery.trim() ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.goal.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.assigned_to?.first_name && t.assigned_to.first_name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchStatus && matchTech && matchSearch;
    });
  }, [data?.tasks, statusFilter, techFilter, searchQuery]);

  const isAdmin = user?.role === "ADMIN";

  const formatDeadline = (d: string) => {
    const target = new Date(d);
    const now = new Date();
    const diffHours = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60));
    const isOverdue = diffHours < 0;

    let relative = "";
    if (Math.abs(diffHours) < 24) {
      relative = isOverdue ? `${Math.abs(diffHours)}h overdue` : `due in ${diffHours}h`;
    } else {
      const days = Math.round(diffHours / 24);
      relative = isOverdue ? `${Math.abs(days)}d overdue` : `due in ${days}d`;
    }

    return {
      dateFormatted: target.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      relative,
      isOverdue
    };
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto pb-28">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-3xl shadow-xl border border-indigo-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 tracking-wider uppercase">
                🎯 Projects & Deployments
              </span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Dispatch
              </span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-white">
              IT Project Tasks & Infrastructure Goals
            </h1>
            <p className="text-xs text-slate-300 max-w-xl">
              Assign targeted IT goals with hard deadlines, track technician work reports, and receive live completion updates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
              >
                <span>➕</span>
                <span>New Project Task</span>
              </button>
            )}

            <Link
              href="/admin"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
            >
              <span>🛡️</span>
              <span>Admin Console</span>
            </Link>

            <Link
              href="/tech"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm"
            >
              <span>👨‍💻</span>
              <span>Tech Workbench</span>
            </Link>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-3 border-t border-white/10">
          <div className="bg-black/30 p-3 rounded-2xl border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Tasks</span>
            <p className="text-xl sm:text-2xl font-black text-white">{data?.metrics.total ?? 0}</p>
          </div>
          <div className="bg-blue-500/10 p-3 rounded-2xl border border-blue-500/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">In Progress</span>
            <p className="text-xl sm:text-2xl font-black text-blue-400">{data?.metrics.inProgress ?? 0}</p>
          </div>
          <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Pending</span>
            <p className="text-xl sm:text-2xl font-black text-amber-400">{data?.metrics.pending ?? 0}</p>
          </div>
          <div className={`p-3 rounded-2xl border ${data?.metrics.overdue ? "bg-red-500/20 border-red-500/30" : "bg-black/30 border-white/10"}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${data?.metrics.overdue ? "text-red-300" : "text-slate-400"}`}>Overdue</span>
            <p className={`text-xl sm:text-2xl font-black ${data?.metrics.overdue ? "text-red-400 animate-pulse" : "text-slate-300"}`}>
              {data?.metrics.overdue ?? 0}
            </p>
          </div>
          <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Completed</span>
            <div className="flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-black text-emerald-400">{data?.metrics.completed ?? 0}</p>
              <span className="text-xs font-bold text-emerald-500">({data?.metrics.completionRate ?? 0}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Status Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {["ALL", "PENDING", "IN_PROGRESS", "BLOCKED", "COMPLETED"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === st
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st === "ALL" ? "All Tasks" : st.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {/* Technician Filter & Search */}
        <div className="flex items-center gap-2">
          <select
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            className="text-xs rounded-xl px-2.5 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium"
          >
            <option value="ALL">👤 All Technicians</option>
            {data?.technicians.map((t) => (
              <option key={t.id} value={t.id}>
                👨‍💻 {t.first_name} {t.last_name || ""} (@{t.telegram_username || "tech"})
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search task or goal..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs rounded-xl px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-36 sm:w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-44 rounded-3xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
          <span className="text-4xl">📋</span>
          <h3 className="font-bold text-base text-slate-800 dark:text-white">No Project Tasks Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {isAdmin ? "Click '+ New Project Task' above to assign an IT infrastructure deployment or scheduled maintenance." : "No tasks match your filter criteria."}
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md hover:bg-indigo-500 transition-all"
            >
              ➕ Create First Project Task
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTasks.map((t) => {
            const priorityStyle = priorityColors[t.priority] || priorityColors.MEDIUM;
            const statusStyle = statusMeta[t.status] || statusMeta.PENDING;
            const dl = formatDeadline(t.deadline);
            const isFinished = t.status === "COMPLETED";

            return (
              <div
                key={t.id}
                onClick={() => openTaskDetail(t.id)}
                className="group relative bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between space-y-4"
              >
                {/* Top Badge Bar */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 ${priorityStyle.bg} ${priorityStyle.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${priorityStyle.dot}`} />
                      {t.priority}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle.bg} ${statusStyle.text}`}>
                      {statusStyle.label}
                    </span>
                  </div>

                  <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${
                    isFinished
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      : dl.isOverdue
                      ? "bg-red-500/15 text-red-600 border-red-500/40 animate-pulse font-black"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}>
                    <span>{isFinished ? "✅" : dl.isOverdue ? "🚨" : "⏳"}</span>
                    <span>{isFinished ? "Completed" : dl.relative}</span>
                  </div>
                </div>

                {/* Subject & Goal */}
                <div className="space-y-1.5">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                    {t.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {t.goal}
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-semibold text-slate-500">Progress</span>
                    <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">{t.progress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFinished ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-indigo-600"
                      }`}
                      style={{ width: `${Math.max(5, t.progress)}%` }}
                    />
                  </div>
                </div>

                {/* Footer: Assignee & Action */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                      {t.assigned_to?.first_name?.[0] || "👤"}
                    </div>
                    <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
                      {t.assigned_to ? `${t.assigned_to.first_name} ${t.assigned_to.last_name || ""}` : "Unassigned"}
                    </span>
                    {t.assigned_to?.telegram_username && (
                      <span className="text-[10px] text-slate-400 font-mono">@{t.assigned_to.telegram_username}</span>
                    )}
                  </div>

                  <span className="text-indigo-600 dark:text-indigo-400 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 text-[11px]">
                    <span>Reports</span>
                    <span>→</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: CREATE PROJECT TASK */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎯</span>
                <h2 className="font-black text-base text-slate-900 dark:text-white">Create New Project Task</h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Subject / Task Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Upgrade Core Switch Firmware & Test Failover"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Goal & Deliverables <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the exact objectives, scope, test criteria, and deliverables for the technician..."
                  value={createForm.goal}
                  onChange={(e) => setCreateForm({ ...createForm, goal: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Deadline Date & Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={createForm.deadline}
                    onChange={(e) => setCreateForm({ ...createForm, deadline: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Priority Level</label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value as ProjectTaskPriority })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                  >
                    <option value="LOW">🟢 Low Priority</option>
                    <option value="MEDIUM">🟡 Medium Priority</option>
                    <option value="HIGH">🟠 High Priority</option>
                    <option value="CRITICAL">🔴 Critical Priority</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Assign Lead Technician <span className="text-indigo-500">(Instant Telegram Alert)</span>
                </label>
                <select
                  value={createForm.assignedToId}
                  onChange={(e) => setCreateForm({ ...createForm, assignedToId: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                >
                  <option value="">👤 (Unassigned - Assign Later)</option>
                  {data?.technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      👨‍💻 {t.first_name} {t.last_name || ""} (@{t.telegram_username || "tech"})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">
                  The assigned technician will immediately receive a direct notification on Telegram with task objectives and workbench links.
                </p>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-all disabled:opacity-50"
                >
                  {creating ? "Assigning Task..." : "🚀 Create & Dispatch Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TASK DETAIL & TECHNICIAN REPORT DRAWER */}
      {selectedTaskDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${priorityColors[selectedTaskDetail.task.priority].bg} ${priorityColors[selectedTaskDetail.task.priority].text}`}>
                    {selectedTaskDetail.task.priority}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusMeta[selectedTaskDetail.task.status].bg} ${statusMeta[selectedTaskDetail.task.status].text}`}>
                    {statusMeta[selectedTaskDetail.task.status].label}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Deadline: {formatDeadline(selectedTaskDetail.task.deadline).dateFormatted} ({formatDeadline(selectedTaskDetail.task.deadline).relative})
                  </span>
                </div>
                <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                  {selectedTaskDetail.task.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTaskDetail(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center font-bold shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Goal & Scope Description */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1 text-xs">
              <span className="font-bold uppercase tracking-wider text-[10px] text-indigo-600 dark:text-indigo-400">Target Objectives & Deliverables</span>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {selectedTaskDetail.task.goal}
              </p>
            </div>

            {/* Assignee & Overall Progress Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50/50 dark:bg-slate-800/30 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div>
                <span className="opacity-60 block text-[10px] uppercase font-bold">Assigned Lead Technician:</span>
                <p className="font-extrabold text-sm text-slate-900 dark:text-white mt-0.5">
                  {selectedTaskDetail.task.assigned_to ? `${selectedTaskDetail.task.assigned_to.first_name} ${selectedTaskDetail.task.assigned_to.last_name || ""}` : "Unassigned"}
                  {selectedTaskDetail.task.assigned_to?.telegram_username && (
                    <span className="text-xs font-normal text-indigo-500 ml-1">(@{selectedTaskDetail.task.assigned_to.telegram_username})</span>
                  )}
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <span className="opacity-60 text-[10px] uppercase font-bold">Current Progress:</span>
                  <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">{selectedTaskDetail.task.progress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      selectedTaskDetail.task.status === "COMPLETED" ? "bg-emerald-500" : "bg-indigo-600"
                    }`}
                    style={{ width: `${selectedTaskDetail.task.progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Technician Work Reports Timeline */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                  Technician Work Reports ({selectedTaskDetail.reports.length})
                </h4>
                {selectedTaskDetail.task.status !== "COMPLETED" && (
                  <button
                    onClick={() => handleQuickStatusChange(selectedTaskDetail.task.id, "COMPLETED", 100)}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all"
                  >
                    ✅ Mark Task 100% Completed
                  </button>
                )}
              </div>

              {selectedTaskDetail.reports.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-4">
                  <p className="text-xs text-slate-500">No reports logged yet. Post the first progress report below.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {selectedTaskDetail.reports.map((rep) => (
                    <div
                      key={rep.id}
                      className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs shadow-sm"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            👨‍💻 {rep.technician ? `${rep.technician.first_name} ${rep.technician.last_name || ""}` : "Technician"}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            {rep.progress}%
                          </span>
                        </div>
                        <span className="text-slate-400 text-[10px]">
                          {new Date(rep.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {rep.report_text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Work Report Form */}
            <form onSubmit={handleSubmitReport} className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 space-y-3 text-xs">
              <span className="font-bold text-slate-900 dark:text-white block">
                ✍️ Post Progress Update / Completion Report
              </span>

              <textarea
                required
                rows={2}
                placeholder="Write what was accomplished, testing results, or current status update..."
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>Update Progress</span>
                    <span className="text-indigo-600">{reportProgress}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={reportProgress}
                    onChange={(e) => {
                      const p = parseInt(e.target.value, 10);
                      setReportProgress(p);
                      if (p === 100) setReportStatus("COMPLETED");
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">Task Status</label>
                  <select
                    value={reportStatus}
                    onChange={(e) => {
                      const s = e.target.value as ProjectTaskStatus;
                      setReportStatus(s);
                      if (s === "COMPLETED") setReportProgress(100);
                    }}
                    className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                  >
                    <option value="IN_PROGRESS">🔵 In Progress</option>
                    <option value="BLOCKED">🔴 Blocked / Needs Parts</option>
                    <option value="COMPLETED">✅ Completed (100%)</option>
                    <option value="PENDING">⚪ Pending</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submittingReport || !reportText.trim()}
                className="w-full py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition-all disabled:opacity-50"
              >
                {submittingReport ? "Publishing Report..." : "🚀 Submit Work Report & Notify Admins"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
