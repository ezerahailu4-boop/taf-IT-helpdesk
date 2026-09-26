import type { TicketPriority, TicketStatus } from "@/types/db";

const STATUS_STYLE: Record<TicketStatus, { bg: string; fg: string; label: string; icon: string }> = {
  NEW: { bg: "#E8F0FE", fg: "#1A56DB", label: "New", icon: "🆕" },
  ASSIGNED: { bg: "#EFE9FE", fg: "#6D28D9", label: "Assigned", icon: "📌" },
  IN_PROGRESS: { bg: "#FEF6E7", fg: "#92650A", label: "In Progress", icon: "🟡" },
  WAITING_FOR_USER: { bg: "#FEF2E7", fg: "#9A3412", label: "Waiting on you", icon: "⏳" },
  WAITING_FOR_ADMIN: { bg: "#FEF2E7", fg: "#9A3412", label: "Waiting on admin", icon: "⏳" },
  RESOLVED: { bg: "#E7F8EE", fg: "#0F7A3D", label: "Resolved", icon: "✅" },
  CLOSED: { bg: "#EEF0F2", fg: "#4B5563", label: "Closed", icon: "🔒" },
  REOPENED: { bg: "#FDECEC", fg: "#B42318", label: "Reopened", icon: "🔄" },
  CANCELLED: { bg: "#EEF0F2", fg: "#6B7280", label: "Cancelled", icon: "🚫" }
};

const PRIORITY_STYLE: Record<TicketPriority, { fg: string; icon: string }> = {
  LOW: { fg: "#0F7A3D", icon: "🟢" },
  MEDIUM: { fg: "#92650A", icon: "🟡" },
  HIGH: { fg: "#C2410C", icon: "🟠" },
  CRITICAL: { fg: "#B42318", icon: "🔴" }
};

export function StatusPill({ status }: { status: TicketStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="status-pill" style={{ background: s.bg, color: s.fg }}>
      {s.icon} {s.label}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: TicketPriority }) {
  const p = PRIORITY_STYLE[priority];
  return (
    <span className="status-pill" style={{ background: "transparent", color: p.fg, padding: 0 }}>
      {p.icon} {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}
