import Link from "next/link";
import type { DbTicket } from "@/types/db";
import { StatusPill } from "./StatusPill";

export function TicketCard({
  ticket
}: {
  ticket: DbTicket & {
    requester_name?: string;
    requester_username?: string;
    department_name?: string;
  };
}) {
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="card block p-4 active:scale-[0.99] hover:border-indigo-500/40 dark:hover:border-indigo-400/40 transition-all border border-slate-200/80 dark:border-slate-800/80 space-y-2 bg-white dark:bg-slate-900/90 shadow-sm hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
          {ticket.ticket_number}
        </span>
        <StatusPill status={ticket.status} />
      </div>
      <p className="font-bold text-sm leading-snug text-slate-900 dark:text-white">
        {ticket.subject}
      </p>

      {/* Show requester identity to IT Staff */}
      {ticket.requester_name && (
        <div className="flex items-center gap-1.5 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
          <span>👤</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {ticket.requester_name}
          </span>
          {ticket.requester_username && (
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
              (@{ticket.requester_username})
            </span>
          )}
          {ticket.department_name && (
            <span className="text-[11px] opacity-75">• {ticket.department_name}</span>
          )}
        </div>
      )}
    </Link>
  );
}

export function EmptyState({
  icon = "📭",
  title,
  actionHref,
  actionLabel
}: {
  icon?: string;
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 gap-3 card border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
      <div className="text-4xl">{icon}</div>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-2 px-5 py-2.5 rounded-full font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all active:scale-95"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-4 space-y-2 border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/80">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton h-4 w-3/4" />
    </div>
  );
}

export function ErrorState({
  message,
  onRetry
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 gap-3 card border border-rose-200 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/20">
      <div className="text-3xl">⚠️</div>
      <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
        {message || "Something went wrong."}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 px-5 py-2 rounded-full font-bold text-xs bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
