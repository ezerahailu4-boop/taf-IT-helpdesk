import type { TicketPriority, TicketStatus } from "@/types/db";

const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; icon: string; className: string }
> = {
  NEW: {
    label: "New",
    icon: "🆕",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
  },
  ASSIGNED: {
    label: "Assigned",
    icon: "📌",
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
  },
  IN_PROGRESS: {
    label: "In Progress",
    icon: "🟡",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
  },
  WAITING_FOR_USER: {
    label: "Waiting on User",
    icon: "⏳",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
  },
  WAITING_FOR_ADMIN: {
    label: "Waiting on Admin",
    icon: "⏳",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
  },
  RESOLVED: {
    label: "Resolved",
    icon: "✅",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
  },
  CLOSED: {
    label: "Closed",
    icon: "🔒",
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20"
  },
  REOPENED: {
    label: "Reopened",
    icon: "🔄",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
  },
  CANCELLED: {
    label: "Cancelled",
    icon: "🚫",
    className: "bg-slate-500/10 text-slate-500 dark:text-slate-500 border border-slate-500/20"
  }
};

const PRIORITY_CONFIG: Record<
  TicketPriority,
  { label: string; icon: string; className: string }
> = {
  LOW: {
    label: "Low",
    icon: "🟢",
    className: "text-emerald-600 dark:text-emerald-400"
  },
  MEDIUM: {
    label: "Medium",
    icon: "🟡",
    className: "text-amber-600 dark:text-amber-400"
  },
  HIGH: {
    label: "High",
    icon: "🟠",
    className: "text-orange-600 dark:text-orange-400"
  },
  CRITICAL: {
    label: "Critical",
    icon: "🔴",
    className: "text-rose-600 dark:text-rose-400 font-bold animate-pulse"
  }
};

export function StatusPill({ status }: { status: TicketStatus }) {
  const conf = STATUS_CONFIG[status] || STATUS_CONFIG.NEW;
  return (
    <span className={`status-pill ${conf.className}`}>
      <span>{conf.icon}</span>
      <span>{conf.label}</span>
    </span>
  );
}

export function PriorityPill({ priority }: { priority: TicketPriority }) {
  const conf = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.MEDIUM;
  return (
    <span className={`status-pill bg-transparent p-0 ${conf.className}`}>
      <span>{conf.icon}</span>
      <span>{conf.label}</span>
    </span>
  );
}
