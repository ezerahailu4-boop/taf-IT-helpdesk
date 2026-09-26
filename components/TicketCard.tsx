import Link from "next/link";
import type { DbTicket } from "@/types/db";
import { StatusPill } from "./StatusPill";

export function TicketCard({ ticket }: { ticket: DbTicket & { requester_name?: string; requester_username?: string; department_name?: string } }) {
  return (
    <Link href={`/tickets/${ticket.id}`} className="card block p-4 active:opacity-70 transition border space-y-1.5" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
          {ticket.ticket_number}
        </span>
        <StatusPill status={ticket.status} />
      </div>
      <p className="font-semibold text-sm leading-snug">{ticket.subject}</p>

      {/* Show requester identity to IT Staff */}
      {ticket.requester_name && (
        <div className="flex items-center gap-1.5 text-xs pt-1 border-t" style={{ borderColor: "rgba(0,0,0,0.04)", color: "var(--tg-theme-hint-color,#888)" }}>
          <span>👤</span>
          <span className="font-semibold" style={{ color: "var(--tg-theme-text-color,#111)" }}>{ticket.requester_name}</span>
          {ticket.requester_username && (
            <span className="text-[11px] text-blue-600">(@{ticket.requester_username})</span>
          )}
          {ticket.department_name && (
            <span className="text-[11px] opacity-75">• {ticket.department_name}</span>
          )}
        </div>
      )}
    </Link>
  );
}

export function EmptyState({ icon = "📭", title, actionHref, actionLabel }: { icon?: string; title: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 gap-3">
      <div className="text-4xl">{icon}</div>
      <p style={{ color: "var(--tg-theme-hint-color,#999)" }}>{title}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="mt-2 px-5 py-2.5 rounded-full font-medium" style={{ background: "var(--tg-theme-button-color,#2481cc)", color: "var(--tg-theme-button-text-color,#fff)" }}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-4 space-y-2">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton h-4 w-3/4" />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 gap-3">
      <div className="text-3xl">⚠️</div>
      <p style={{ color: "var(--tg-theme-hint-color,#999)" }}>Something went wrong.</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-1 px-5 py-2.5 rounded-full font-medium" style={{ background: "var(--tg-theme-button-color,#2481cc)", color: "#fff" }}>
          Try Again
        </button>
      )}
    </div>
  );
}
