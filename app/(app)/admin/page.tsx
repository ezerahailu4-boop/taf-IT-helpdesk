"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { TicketCard, CardSkeleton } from "@/components/TicketCard";
import type { DbTicket } from "@/types/db";

type Overview = {
  counts: Record<string, number>;
  team: { id: string; first_name: string | null; last_name: string | null; active: number }[];
  criticalTickets: DbTicket[];
};

export default function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    api<Overview>("/api/admin/overview").then(setData);
  }, []);

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Admin Control Center</h1>
          <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
            Operations overview, team load, and incident management
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="text-xs font-semibold px-3 py-1.5 rounded-full card border text-blue-600 hover:bg-black/5"
        >
          📈 Analytics
        </Link>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Metric label="Total" value={data?.counts.total} href="/tickets" />
        <Metric label="Open" value={data?.counts.open} href="/tickets?tab=OPEN" />
        <Metric label="In Progress" value={data?.counts.inProgress} href="/tickets" />
        <Metric label="Waiting" value={data?.counts.waiting} href="/tickets?tab=waiting" />
        <Metric label="Resolved" value={data?.counts.resolved} href="/tickets?tab=RESOLVED" accent="#0F7A3D" />
        <Metric label="Overdue" value={data?.counts.overdue} href="/tickets?tab=overdue" accent="#B42318" />
      </div>

      {/* Critical Alert Banner */}
      {(data?.counts.critical ?? 0) > 0 && (
        <div
          className="card p-3.5 flex items-center justify-between gap-2 border"
          style={{ background: "#FDECEC", borderColor: "#FECDCA" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🔴</span>
            <span className="text-xs font-bold" style={{ color: "#B42318" }}>
              {data?.counts.critical} critical ticket(s) requiring immediate attention
            </span>
          </div>
          <Link
            href="/tickets?tab=critical"
            className="text-xs font-bold px-2.5 py-1 rounded-lg bg-red-600 text-white shadow-sm"
          >
            Review Now
          </Link>
        </div>
      )}

      {/* Today's Activity */}
      <div className="card p-4 border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <p className="font-semibold text-xs uppercase tracking-wider mb-2.5 opacity-60">Today's Activity</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-xl" style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}>
            <p className="text-xl font-bold">{data?.counts.todayNew ?? "…"}</p>
            <p className="text-[10px] opacity-70">New Tickets</p>
          </div>
          <div className="p-2 rounded-xl" style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}>
            <p className="text-xl font-bold text-green-700">{data?.counts.todayResolved ?? "…"}</p>
            <p className="text-[10px] opacity-70">Resolved</p>
          </div>
          <div className="p-2 rounded-xl" style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}>
            <p className="text-xl font-bold text-amber-700">{data?.counts.todayReopened ?? "…"}</p>
            <p className="text-[10px] opacity-70">Reopened</p>
          </div>
        </div>
      </div>

      {/* IT Team Load */}
      <div className="card p-4 space-y-3 border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">IT Technician Team Load</p>
          <Link href="/admin/users" className="text-xs text-blue-600 hover:underline">
            Manage Staff
          </Link>
        </div>

        <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          {!data && <div className="p-3 skeleton h-4 w-2/3" />}
          {data?.team.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2 text-xs">
              <span className="font-medium">👨‍💻 {t.first_name} {t.last_name}</span>
              <span className="font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}>
                {t.active} Active Tickets
              </span>
            </div>
          ))}
          {data?.team.length === 0 && (
            <p className="py-2 text-xs opacity-60">No technicians registered yet.</p>
          )}
        </div>
      </div>

      {/* Critical Tickets Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm flex items-center gap-1.5 text-red-600">
            <span>🔴</span> Critical Tickets
          </p>
          <Link href="/tickets?tab=critical" className="text-xs text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {!data && <CardSkeleton />}
          {data?.criticalTickets.length === 0 && (
            <div className="card p-4 text-center text-xs opacity-60">No active critical tickets. All systems stable.</div>
          )}
          {data?.criticalTickets.map((t) => <TicketCard key={t.id} ticket={t} />)}
        </div>
      </div>

      {/* Admin Quick Action Hub */}
      <div className="space-y-2">
        <p className="font-semibold text-xs uppercase tracking-wider opacity-60">Administration Hub</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Link href="/admin/users" className="card p-3 text-center font-semibold text-xs border hover:border-blue-400 transition-colors">
            <span className="text-xl block mb-1">👥</span> Users & Staff
          </Link>
          <Link href="/admin/assets" className="card p-3 text-center font-semibold text-xs border hover:border-blue-400 transition-colors">
            <span className="text-xl block mb-1">💻</span> Hardware Assets
          </Link>
          <Link href="/admin/reports" className="card p-3 text-center font-semibold text-xs border hover:border-blue-400 transition-colors">
            <span className="text-xl block mb-1">📈</span> SLA & Reports
          </Link>
          <Link href="/admin/audit" className="card p-3 text-center font-semibold text-xs border hover:border-blue-400 transition-colors">
            <span className="text-xl block mb-1">📜</span> Audit Trail
          </Link>
          <Link href="/admin/departments" className="card p-3 text-center font-semibold text-xs border hover:border-blue-400 transition-colors">
            <span className="text-xl block mb-1">🏢</span> Departments
          </Link>
          <Link href="/admin/support-groups" className="card p-3 text-center font-semibold text-xs border hover:border-blue-400 transition-colors">
            <span className="text-xl block mb-1">👥</span> Support Teams
          </Link>
          <Link href="/admin/automation-rules" className="card p-3 text-center font-semibold text-xs border hover:border-blue-400 transition-colors">
            <span className="text-xl block mb-1">⚡</span> Auto Routing
          </Link>
          <Link href="/admin/settings" className="card p-3 text-center font-semibold text-xs border hover:border-blue-400 transition-colors">
            <span className="text-xl block mb-1">⚙️</span> Settings & Bot
          </Link>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent, href }: { label: string; value?: number; accent?: string; href?: string }) {
  const content = (
    <div className="card p-2.5 text-center border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <p className="text-lg font-bold tracking-tight" style={{ color: accent }}>{value ?? "…"}</p>
      <p className="text-[10px] opacity-60 mt-0.5">{label}</p>
    </div>
  );

  if (href) {
    return <Link href={href} className="block hover:opacity-85 transition-opacity">{content}</Link>;
  }
  return content;
}
