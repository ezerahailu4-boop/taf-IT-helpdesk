"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useMe } from "@/lib/useMe";
import type { DbProjectTask, DbProjectTaskReport, ProjectTaskStatus, ProjectTaskPriority, ProjectTaskCategory } from "@/types/db";

interface TechMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  telegram_username: string | null;
  photo_url: string | null;
  role: string;
  activeTasksCount?: number;
  activeTicketsCount?: number;
  workloadScore?: number;
  avgRating?: number | null;
  ratingCount?: number;
  capacityStatus?: "OPTIMAL" | "LIGHT" | "MODERATE" | "BUSY";
  isRecommended?: boolean;
}

interface TaskWithDetails extends DbProjectTask {
  assigned_to?: TechMember | null;
  assigned_technicians?: TechMember[];
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
  smartDispatch?: {
    recommendedTechId: string | null;
    recommendedTechName: string | null;
    recommendedReason: string;
  };
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

const categoryMeta: Record<ProjectTaskCategory, { label: string; bg: string; text: string; icon: string }> = {
  PLANNED: {
    label: "Planned",
    bg: "bg-blue-500/10 dark:bg-blue-950/40 border-blue-500/30",
    text: "text-blue-600 dark:text-blue-400",
    icon: "📅"
  },
  UNPLANNED: {
    label: "Unplanned",
    bg: "bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
    icon: "⚡"
  }
};

function ProjectTasksContent() {
  const { user } = useMe();
  const searchParams = useSearchParams();
  const initialTaskId = searchParams.get("taskId");

  const [data, setData] = useState<TasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [techFilter, setTechFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal: Create Task
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    goal: "",
    deadline: "",
    priority: "MEDIUM" as ProjectTaskPriority,
    category: "PLANNED" as ProjectTaskCategory,
    assignedTechnicianIds: [] as string[]
  });
  const [creating, setCreating] = useState(false);

  // Modal: View & Report Task
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportProgress, setReportProgress] = useState<number>(0);
  const [reportStatus, setReportStatus] = useState<ProjectTaskStatus>("IN_PROGRESS");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const isSubmittingRef = useRef(false);

  // Edit Assignees in Task Detail Drawer
  const [isEditingAssignees, setIsEditingAssignees] = useState(false);
  const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
  const [savingAssignees, setSavingAssignees] = useState(false);

  // Live Sync & SLA Sweep States
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const [triggeringSla, setTriggeringSla] = useState(false);
  const [slaFeedback, setSlaFeedback] = useState<string | null>(null);

  const fetchTasks = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setIsSyncing(true);
      const res = await api<TasksResponse>("/api/admin/tasks");
      setData(res);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error("Failed to load tasks:", err);
    } finally {
      if (!silent) setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchTasks();

    // ⚡ Feature 4: Live Real-Time Polling Sync every 10s
    const interval = setInterval(() => {
      fetchTasks(true);
    }, 10000);

    // ⚡ Refetch on window focus
    const onFocus = () => fetchTasks(true);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const handleTriggerSlaSweep = async () => {
    setTriggeringSla(true);
    setSlaFeedback(null);
    try {
      const res: any = await api("/api/cron/sla-sweep", { method: "POST" });
      setSlaFeedback(res.summary || "SLA & deadline sweep executed successfully!");
      await fetchTasks(true);
      setTimeout(() => setSlaFeedback(null), 7000);
    } catch (err: any) {
      setSlaFeedback(err.message || "Failed to trigger SLA sweep");
      setTimeout(() => setSlaFeedback(null), 5000);
    } finally {
      setTriggeringSla(false);
    }
  };

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
      const currentIds = (res.task.assigned_technicians && res.task.assigned_technicians.length > 0)
        ? res.task.assigned_technicians.map((t: any) => t.id)
        : (res.task.assigned_to_id ? [res.task.assigned_to_id] : []);
      setEditAssigneeIds(currentIds);
      setIsEditingAssignees(false);
    } catch (err) {
      alert("Failed to load task details");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSaveAssignees = async () => {
    if (!selectedTaskDetail) return;
    setSavingAssignees(true);
    try {
      await api<{ task: any }>(`/api/tasks/${selectedTaskDetail.task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedTechnicianIds: editAssigneeIds })
      });
      await openTaskDetail(selectedTaskDetail.task.id);
      fetchTasks(true);
      setIsEditingAssignees(false);
    } catch (err: any) {
      alert(err.message || "Failed to update assigned technicians");
    } finally {
      setSavingAssignees(false);
    }
  };

  const toggleTechnicianAssignment = (techId: string) => {
    setCreateForm((prev) => {
      const exists = prev.assignedTechnicianIds.includes(techId);
      if (exists) {
        return {
          ...prev,
          assignedTechnicianIds: prev.assignedTechnicianIds.filter((id) => id !== techId)
        };
      } else {
        return {
          ...prev,
          assignedTechnicianIds: [...prev.assignedTechnicianIds, techId]
        };
      }
    });
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
          category: createForm.category,
          assignedTechnicianIds: createForm.assignedTechnicianIds,
          assignedToId: createForm.assignedTechnicianIds[0] || null
        })
      });
      setShowCreateModal(false);
      setCreateForm({
        title: "",
        goal: "",
        deadline: "",
        priority: "MEDIUM",
        category: "PLANNED",
        assignedTechnicianIds: []
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
    if (submittingReport || isSubmittingRef.current || reportSubmitted) return;

    // Prevent duplicate submission if nothing changed and note is empty
    const isUnchanged =
      reportProgress === selectedTaskDetail.task.progress &&
      reportStatus === selectedTaskDetail.task.status &&
      !reportText.trim();

    if (isUnchanged) {
      alert("Please adjust progress, change task status, or write a work note before submitting.");
      return;
    }

    isSubmittingRef.current = true;
    setSubmittingReport(true);
    try {
      const finalNote =
        reportText.trim() ||
        `Progress updated to ${reportProgress}% (${reportStatus.replace(/_/g, " ")})`;

      await api(`/api/tasks/${selectedTaskDetail.task.id}/reports`, {
        method: "POST",
        body: JSON.stringify({
          reportText: finalNote,
          progress: reportProgress,
          status: reportStatus
        })
      });
      setReportSubmitted(true);
      setReportText("");

      // Refresh detail and list
      await openTaskDetail(selectedTaskDetail.task.id);
      fetchTasks(true);

      setTimeout(() => {
        setReportSubmitted(false);
      }, 3000);
    } catch (err: any) {
      alert(err.message || "Failed to submit work report");
    } finally {
      setSubmittingReport(false);
      isSubmittingRef.current = false;
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
      const matchCategory = categoryFilter === "ALL" || (t.category || "PLANNED") === categoryFilter;
      const matchTech =
        techFilter === "ALL" ||
        t.assigned_to_id === techFilter ||
        (t.assigned_technician_ids && t.assigned_technician_ids.includes(techFilter));
      const matchSearch =
        !searchQuery.trim() ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.goal.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.assigned_to?.first_name && t.assigned_to.first_name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchStatus && matchCategory && matchTech && matchSearch;
    });
  }, [data?.tasks, statusFilter, categoryFilter, techFilter, searchQuery]);

  const isAdmin = user?.role === "ADMIN";

  const handleExportCSV = () => {
    if (!filteredTasks || filteredTasks.length === 0) {
      alert("No tasks available to export for this selection.");
      return;
    }

    const headers = [
      "Task Title",
      "Category",
      "Priority",
      "Status",
      "Progress (%)",
      "Assigned Technician(s)",
      "Deadline",
      "Goal / Deliverables",
      "Created At"
    ];

    const rows = filteredTasks.map((t) => {
      const techNames =
        t.assigned_technicians && t.assigned_technicians.length > 0
          ? t.assigned_technicians.map((tech: any) => `${tech.first_name || ""} ${tech.last_name || ""}`.trim()).join("; ")
          : t.assigned_to
          ? `${t.assigned_to.first_name || ""} ${t.assigned_to.last_name || ""}`.trim()
          : "Unassigned";

      return [
        `"${(t.title || "").replace(/"/g, '""')}"`,
        `"${t.category || "PLANNED"}"`,
        `"${t.priority}"`,
        `"${t.status}"`,
        `"${t.progress}%"`,
        `"${techNames.replace(/"/g, '""')}"`,
        `"${new Date(t.deadline).toLocaleString()}"`,
        `"${(t.goal || "").replace(/"/g, '""')}"`,
        `"${new Date(t.created_at).toLocaleString()}"`
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const catLabel = categoryFilter === "ALL" ? "All" : categoryFilter;
    link.setAttribute(
      "download",
      `IT_Tasks_${catLabel}_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 tracking-wider uppercase">
                🎯 Projects & Deployments
              </span>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Live Sync Active</span>
              </div>
              <button
                onClick={() => fetchTasks(false)}
                title="Refresh tasks data immediately"
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] bg-white/10 hover:bg-white/20 text-slate-200 transition-all font-semibold active:scale-95"
              >
                <span className={`inline-block transition-transform ${isSyncing ? "animate-spin" : ""}`}>🔄</span>
                <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
              </button>
            </div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-white">
              IT Project Tasks & Infrastructure Goals
            </h1>
            <p className="text-xs text-slate-300 max-w-xl">
              Assign targeted IT goals with hard deadlines, track technician work reports, and receive live completion updates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
            >
              <span>➕</span>
              <span>New Project Task</span>
            </button>

            {isAdmin && (
              <button
                onClick={handleTriggerSlaSweep}
                disabled={triggeringSla}
                title="Trigger immediate automated SLA & deadline sweep across tickets & project tasks"
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 backdrop-blur-md transition-all active:scale-95 disabled:opacity-50"
              >
                <span>{triggeringSla ? "⏳" : "🚨"}</span>
                <span>{triggeringSla ? "Sweeping SLA..." : "Trigger SLA Sweep"}</span>
              </button>
            )}

            <button
              onClick={handleExportCSV}
              title="Export filtered project tasks as CSV"
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 shadow-sm active:scale-95"
            >
              <span>📥</span>
              <span>Export CSV</span>
            </button>

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

        {/* SLA Sweep Live Feedback Alert */}
        {slaFeedback && (
          <div className="bg-indigo-900/80 border border-indigo-400/50 p-3 rounded-2xl flex items-center justify-between gap-3 text-xs text-indigo-200 shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-base">🚨</span>
              <span className="font-semibold">{slaFeedback}</span>
            </div>
            <button onClick={() => setSlaFeedback(null)} className="text-slate-400 hover:text-white text-xs px-2 py-1">✕</button>
          </div>
        )}

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
        {/* Status & Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none flex-wrap">
          <div className="flex items-center gap-1">
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

          <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 hidden sm:block" />

          {/* Category Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
            <button
              onClick={() => setCategoryFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                categoryFilter === "ALL"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setCategoryFilter("PLANNED")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                categoryFilter === "PLANNED"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <span>📅</span>
              <span>Planned</span>
            </button>
            <button
              onClick={() => setCategoryFilter("UNPLANNED")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                categoryFilter === "UNPLANNED"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <span>⚡</span>
              <span>Unplanned</span>
            </button>
          </div>
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

          <button
            onClick={handleExportCSV}
            title="Export currently filtered tasks to CSV spreadsheet"
            className="px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all flex items-center gap-1.5 shrink-0 shadow-xs active:scale-95"
          >
            <span>📥</span>
            <span>Export CSV</span>
          </button>
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
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                      (t.category === "UNPLANNED")
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                    }`}>
                      <span>{t.category === "UNPLANNED" ? "⚡" : "📅"}</span>
                      <span>{t.category === "UNPLANNED" ? "Unplanned" : "Planned"}</span>
                    </span>
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
                    {t.assigned_technicians && t.assigned_technicians.length > 1 ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="flex -space-x-1.5 overflow-hidden shrink-0">
                          {t.assigned_technicians.map((tech: any, i: number) => (
                            <div
                              key={tech.id || i}
                              title={`${tech.first_name} ${tech.last_name || ""} (@${tech.telegram_username || "tech"})`}
                              className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px] ring-2 ring-white dark:ring-slate-900 shrink-0"
                            >
                              {tech.first_name?.[0] || "👤"}
                            </div>
                          ))}
                        </div>
                        <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px] truncate">
                          {t.assigned_technicians.map((tech: any) => tech.first_name).join(", ")}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
                          👥 {t.assigned_technicians.length}
                        </span>
                      </div>
                    ) : (
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
                    )}
                  </div>

                  <span className="text-indigo-600 dark:text-indigo-400 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 text-[11px] shrink-0 ml-2">
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

              {/* Task Category: Planned vs Unplanned */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Category <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCreateForm((prev) => ({ ...prev, category: "PLANNED" }))}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                      createForm.category === "PLANNED"
                        ? "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-2xl">📅</span>
                    <div>
                      <div className="font-black text-xs">Planned</div>
                      <div className="text-[10px] text-slate-500">Scheduled maintenance & projects</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateForm((prev) => ({ ...prev, category: "UNPLANNED" }))}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                      createForm.category === "UNPLANNED"
                        ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-2xl">⚡</span>
                    <div>
                      <div className="font-black text-xs">Unplanned</div>
                      <div className="text-[10px] text-slate-500">Emergency fix & sudden incident</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 text-xs sm:text-sm block">
                      Assign Technician(s) <span className="text-indigo-500 font-semibold">(One or More)</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Select one or more technicians to assign to this task. Each will receive direct Telegram alerts.
                    </p>
                  </div>
                  {createForm.assignedTechnicianIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCreateForm((prev) => ({ ...prev, assignedTechnicianIds: [] }))}
                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium shrink-0"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {/* Candidate Technicians Multi-Select Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40">
                  {data?.technicians.map((t) => {
                    const idx = createForm.assignedTechnicianIds.indexOf(t.id);
                    const isSelected = idx !== -1;

                    return (
                      <div
                        key={t.id}
                        onClick={() => toggleTechnicianAssignment(t.id)}
                        className={`p-2.5 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer select-none ${
                          isSelected
                            ? "bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500 ring-1 ring-indigo-500/50 shadow-xs"
                            : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSelected ? "bg-indigo-600 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          }`}>
                            {t.first_name?.[0] || "T"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate">
                              {t.first_name} {t.last_name || ""}
                            </p>
                            <div className="flex items-center gap-1 text-[10px] text-slate-500">
                              <span>@{t.telegram_username || "tech"}</span>
                              {t.avgRating && (
                                <span className="text-amber-500 font-semibold flex items-center">
                                  ★{t.avgRating}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs font-black transition-colors ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                          }`}>
                            {isSelected ? "✓" : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Summary Chips */}
                {createForm.assignedTechnicianIds.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] font-bold text-slate-500">
                      Selected ({createForm.assignedTechnicianIds.length}):
                    </span>
                    {createForm.assignedTechnicianIds.map((id) => {
                      const tech = data?.technicians.find((t) => t.id === id);
                      if (!tech) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                        >
                          <span>{tech.first_name} {tech.last_name || ""}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTechnicianAssignment(id);
                            }}
                            className="text-indigo-400 hover:text-indigo-700 dark:hover:text-white ml-0.5 text-xs font-bold"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <p className="text-[10px] text-slate-500">
                  Every assigned technician will immediately receive a direct notification on Telegram with task objectives and workbench links.
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
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                    (selectedTaskDetail.task.category === "UNPLANNED")
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                  }`}>
                    <span>{selectedTaskDetail.task.category === "UNPLANNED" ? "⚡" : "📅"}</span>
                    <span>{selectedTaskDetail.task.category === "UNPLANNED" ? "Unplanned" : "Planned"}</span>
                  </span>
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
            <div className="space-y-3 bg-slate-50/50 dark:bg-slate-800/30 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="opacity-60 block text-[10px] uppercase font-bold">
                  {selectedTaskDetail.task.assigned_technicians && selectedTaskDetail.task.assigned_technicians.length > 1
                    ? `Assigned Technicians (${selectedTaskDetail.task.assigned_technicians.length}):`
                    : "Assigned Technician:"}
                </span>

                {!isEditingAssignees ? (
                  <button
                    type="button"
                    onClick={() => {
                      const currentIds = (selectedTaskDetail.task.assigned_technicians && selectedTaskDetail.task.assigned_technicians.length > 0)
                        ? selectedTaskDetail.task.assigned_technicians.map((t: any) => t.id)
                        : (selectedTaskDetail.task.assigned_to_id ? [selectedTaskDetail.task.assigned_to_id] : []);
                      setEditAssigneeIds(currentIds);
                      setIsEditingAssignees(true);
                    }}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-900/40 flex items-center gap-1 transition-all active:scale-95"
                  >
                    <span>✏️</span>
                    <span>Reassign / Add Technicians</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={savingAssignees}
                      onClick={() => setIsEditingAssignees(false)}
                      className="px-2.5 py-1 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={savingAssignees}
                      onClick={handleSaveAssignees}
                      className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all disabled:opacity-50 flex items-center gap-1"
                    >
                      <span>{savingAssignees ? "Saving..." : `Save & Dispatch (${editAssigneeIds.length})`}</span>
                    </button>
                  </div>
                )}
              </div>

              {!isEditingAssignees ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    {selectedTaskDetail.task.assigned_technicians && selectedTaskDetail.task.assigned_technicians.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {selectedTaskDetail.task.assigned_technicians.map((tech: any) => (
                          <span
                            key={tech.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-xs"
                          >
                            <span>{tech.first_name} {tech.last_name || ""}</span>
                            {tech.telegram_username && (
                              <span className="opacity-70 font-normal font-mono text-[10px]">@{tech.telegram_username}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="font-extrabold text-sm text-slate-900 dark:text-white mt-0.5">
                        {selectedTaskDetail.task.assigned_to ? `${selectedTaskDetail.task.assigned_to.first_name} ${selectedTaskDetail.task.assigned_to.last_name || ""}` : "Unassigned"}
                        {selectedTaskDetail.task.assigned_to?.telegram_username && (
                          <span className="text-xs font-normal text-indigo-500 ml-1">(@{selectedTaskDetail.task.assigned_to.telegram_username})</span>
                        )}
                      </p>
                    )}
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
              ) : (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Select one or more technicians to assign to this task.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                    {data?.technicians.map((t) => {
                      const isSelected = editAssigneeIds.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            setEditAssigneeIds((prev) =>
                              prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                            );
                          }}
                          className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? "bg-indigo-50/90 dark:bg-indigo-950/70 border-indigo-400 dark:border-indigo-600 shadow-xs"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 pointer-events-none"
                          />
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs shrink-0">
                            {t.first_name?.[0] || "T"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-slate-800 dark:text-slate-200 truncate text-xs block">
                              {t.first_name} {t.last_name || ""}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block truncate">
                              @{t.telegram_username || "tech"} • {t.activeTasksCount} active
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Technician Work Reports Timeline */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                  Technician Work Reports ({selectedTaskDetail.reports.length})
                </h4>
                {selectedTaskDetail.task.status !== "COMPLETED" ? (
                  <button
                    onClick={() => handleQuickStatusChange(selectedTaskDetail.task.id, "COMPLETED", 100)}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all active:scale-95"
                  >
                    ✅ Mark Task 100% Completed
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <span>🎉</span>
                    <span>Completed (100%)</span>
                  </span>
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
                rows={2}
                placeholder="Optional: Write accomplishments, test notes, or blockers..."
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

              {reportSubmitted && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-center text-xs flex items-center justify-center gap-1.5 animate-pulse">
                  <span>✅</span>
                  <span>Report submitted successfully! Admins notified.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  submittingReport ||
                  reportSubmitted ||
                  (selectedTaskDetail.task.status === "COMPLETED" &&
                    reportStatus === "COMPLETED" &&
                    reportProgress === 100 &&
                    !reportText.trim())
                }
                className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition-all active:scale-[0.98] ${
                  reportSubmitted
                    ? "bg-emerald-600 cursor-not-allowed scale-[1.01]"
                    : submittingReport
                    ? "bg-indigo-700 opacity-60 cursor-not-allowed"
                    : selectedTaskDetail.task.status === "COMPLETED" && !reportText.trim()
                    ? "bg-slate-700 text-slate-300 opacity-80 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                }`}
              >
                {submittingReport ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Publishing Report...</span>
                  </span>
                ) : reportSubmitted ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span>✅</span>
                    <span>Submitted Successfully!</span>
                  </span>
                ) : selectedTaskDetail.task.status === "COMPLETED" && !reportText.trim() ? (
                  <span>🎉 Task Completed (Type note to post addendum)</span>
                ) : (
                  <span>🚀 Submit Work Report & Notify Admins</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectTasksPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-semibold">Loading Project Tasks & Goals...</p>
        </div>
      }
    >
      <ProjectTasksContent />
    </Suspense>
  );
}

