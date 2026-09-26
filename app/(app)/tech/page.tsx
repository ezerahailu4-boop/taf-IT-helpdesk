"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useMe } from "@/lib/useMe";
import { TicketCard, CardSkeleton, EmptyState } from "@/components/TicketCard";
import type { DbTicket } from "@/types/db";

export default function TechDashboard() {
  const { user, counts, loading, reload } = useMe();
  const [critical, setCritical] = useState<DbTicket[] | null>(null);
  const [unassigned, setUnassigned] = useState<DbTicket[] | null>(null);
  const [highTickets, setHighTickets] = useState<DbTicket[] | null>(null);

  useEffect(() => {
    api<{ tickets: DbTicket[] }>("/api/tickets?scope=all").then((d) => {
      const open = d.tickets.filter((t) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(t.status));
      setCritical(open.filter((t) => t.priority === "CRITICAL").slice(0, 3));
      setHighTickets(open.filter((t) => t.priority === "HIGH").slice(0, 3));
      setUnassigned(open.filter((t) => !t.assigned_technician_id).slice(0, 3));
    });
  }, []);

  const assigned = Object.values(counts).reduce((a, b) => a + b, 0);
  const inProgress = counts["IN_PROGRESS"] ?? 0;
  const waiting = (counts["WAITING_FOR_USER"] ?? 0) + (counts["WAITING_FOR_ADMIN"] ?? 0);
  const overdue = critical?.filter((t) => t.resolution_due_at && new Date(t.resolution_due_at) < new Date()).length ?? 0;

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">👨‍💻 IT Support Console</h1>
          <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
            Welcome back, {user?.first_name ?? "Technician"}
          </p>
        </div>
        <Link
          href="/tickets"
          className="text-xs font-semibold px-3 py-1.5 rounded-full card border"
          style={{ color: "var(--tg-theme-button-color, #2481cc)" }}
        >
          View Full Queue →
        </Link>
      </div>

      {/* Metrics Grid */}
      <div className="card p-4 border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <p className="font-semibold text-xs uppercase tracking-wider mb-3 opacity-60">My Queue Metrics</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Assigned" value={loading ? "…" : assigned} href="/tickets?tab=mine" />
          <Stat label="In Progress" value={inProgress} href="/tickets" />
          <Stat label="Waiting" value={waiting} href="/tickets?tab=waiting" />
          <Stat label="Overdue" value={overdue} accent="#B42318" href="/tickets?tab=overdue" />
        </div>
      </div>

      {/* Fast Tabs Navigation */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
        <Link href="/tickets?tab=mine" className="card p-2.5 text-center font-semibold border hover:border-blue-400 transition-colors">
          👤 My Tickets
        </Link>
        <Link href="/tickets?tab=unassigned" className="card p-2.5 text-center font-semibold border hover:border-blue-400 transition-colors">
          🙋 Unassigned ({unassigned?.length ?? 0})
        </Link>
        <Link href="/tickets?tab=critical" className="card p-2.5 text-center font-semibold border hover:border-blue-400 transition-colors text-red-600">
          🚨 Critical ({critical?.length ?? 0})
        </Link>
        <Link href="/tickets?tab=overdue" className="card p-2.5 text-center font-semibold border hover:border-blue-400 transition-colors text-amber-700">
          ⏰ Overdue
        </Link>
        <Link href="/tickets?tab=waiting" className="card p-2.5 text-center font-semibold border hover:border-blue-400 transition-colors">
          ⏳ Waiting
        </Link>
      </div>

      {/* Critical Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm flex items-center gap-1.5 text-red-600">
            <span>🔴</span> Critical Priority
          </p>
          <Link href="/tickets?tab=critical" className="text-xs font-medium text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {critical === null && <CardSkeleton />}
          {critical?.length === 0 && <EmptyState icon="🎉" title="No critical tickets right now." />}
          {critical?.map((t) => <TicketCard key={t.id} ticket={t} />)}
        </div>
      </div>

      {/* High Priority Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm flex items-center gap-1.5 text-amber-600">
            <span>🟠</span> High Priority
          </p>
          <Link href="/tickets" className="text-xs font-medium text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {highTickets === null && <CardSkeleton />}
          {highTickets?.length === 0 && <div className="card p-4 text-center text-xs opacity-60">No open high priority tickets.</div>}
          {highTickets?.map((t) => <TicketCard key={t.id} ticket={t} />)}
        </div>
      </div>

      {/* Unassigned Work Queue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm flex items-center gap-1.5">
            <span>🙋</span> Unassigned Queue (Ready to take)
          </p>
          <Link href="/tickets?tab=unassigned" className="text-xs font-medium text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {unassigned === null && <CardSkeleton />}
          {unassigned?.length === 0 && <div className="card p-4 text-center text-xs opacity-60">All tickets currently assigned! 🎉</div>}
          {unassigned?.map((t) => <TicketCard key={t.id} ticket={t} />)}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, href }: { label: string; value: number | string; accent?: string; href?: string }) {
  const content = (
    <div>
      <p className="text-2xl font-bold tracking-tight" style={{ color: accent }}>{value}</p>
      <p className="text-xs opacity-60 mt-0.5">{label}</p>
    </div>
  );

  if (href) {
    return <Link href={href} className="block hover:opacity-80 transition-opacity">{content}</Link>;
  }
  return content;
}
