"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "@/lib/useMe";
import { api } from "@/lib/apiClient";
import { TicketCard, CardSkeleton } from "@/components/TicketCard";
import type { DbTicket } from "@/types/db";

export default function EmployeeHome() {
  const { user, counts, loading } = useMe();
  const [recent, setRecent] = useState<DbTicket[] | null>(null);
  const [articles, setArticles] = useState<{ id: string; title: string }[] | null>(null);

  useEffect(() => {
    api<{ tickets: DbTicket[] }>("/api/tickets?scope=mine").then((d) => setRecent(d.tickets.slice(0, 3))).catch(() => setRecent([]));
    api<{ articles: { id: string; title: string }[] }>("/api/knowledge").then((d) => setArticles(d.articles.slice(0, 3))).catch(() => setArticles([]));
  }, []);

  const open = (counts["NEW"] ?? 0) + (counts["ASSIGNED"] ?? 0);
  const inProgress = counts["IN_PROGRESS"] ?? 0;
  const resolved = (counts["RESOLVED"] ?? 0) + (counts["CLOSED"] ?? 0);

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          👋 Hello, {loading ? "…" : user?.first_name ?? "there"}
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
          How can Company IT Support help you today?
        </p>
      </div>

      {/* Quick Search Shortcut */}
      <Link
        href="/search"
        className="card p-3 flex items-center gap-2.5 text-xs text-left border block hover:opacity-90 transition-opacity"
        style={{ borderColor: "rgba(0,0,0,0.06)" }}
      >
        <span className="text-base opacity-60">🔍</span>
        <span className="opacity-60 flex-1">Search help articles, common problems, or devices...</span>
        <span className="font-semibold px-2 py-0.5 rounded-full text-[10px]" style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}>
          Search
        </span>
      </Link>

      {/* Primary Action: Report Problem */}
      <div>
        <Link
          href="/create"
          className="card p-4 flex items-center justify-between gap-3 border hover:border-indigo-500/40 hover:scale-[1.01] transition-all group shadow-xs"
          style={{ borderColor: "rgba(0,0,0,0.08)" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              🛠
            </span>
            <div className="text-left">
              <span className="font-bold text-sm block leading-tight">Report Problem</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Submit a new IT incident or request support</span>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shrink-0">
            + New Ticket
          </span>
        </Link>

        {/* Commented out per request: Request Service and Help Center
        <div className="grid grid-cols-2 gap-2.5 mt-2.5">
          <Link
            href="/create"
            className="card p-3.5 flex flex-col items-center justify-center text-center gap-1.5 border hover:scale-105 transition-all group"
            style={{ borderColor: "rgba(0,0,0,0.06)" }}
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">📦</span>
            <span className="font-bold text-xs leading-tight">Request Service</span>
          </Link>
          <Link
            href="/help"
            className="card p-3.5 flex flex-col items-center justify-center text-center gap-1.5 border hover:scale-105 transition-all group"
            style={{ borderColor: "rgba(0,0,0,0.06)" }}
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">📚</span>
            <span className="font-bold text-xs leading-tight">Help Center</span>
          </Link>
        </div>
        */}
      </div>

      {/* Ticket Status Summary Card */}
      <div className="card p-4 border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-xs uppercase tracking-wider opacity-60">My Ticket Status</p>
          <Link href="/tickets" className="text-xs font-semibold text-blue-600 hover:underline">
            View All →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Link href="/tickets?tab=OPEN" className="p-2.5 rounded-xl hover:bg-black/5 transition-colors" style={{ background: "var(--tg-theme-secondary-bg-color,#f2f2f7)" }}>
            <p className="text-xl font-bold">{loading ? "…" : open}</p>
            <p className="text-[11px] font-semibold text-green-700 mt-0.5">🟢 Open</p>
          </Link>
          <Link href="/tickets" className="p-2.5 rounded-xl hover:bg-black/5 transition-colors" style={{ background: "var(--tg-theme-secondary-bg-color,#f2f2f7)" }}>
            <p className="text-xl font-bold">{loading ? "…" : inProgress}</p>
            <p className="text-[11px] font-semibold text-amber-700 mt-0.5">🟡 In Progress</p>
          </Link>
          <Link href="/tickets?tab=RESOLVED" className="p-2.5 rounded-xl hover:bg-black/5 transition-colors" style={{ background: "var(--tg-theme-secondary-bg-color,#f2f2f7)" }}>
            <p className="text-xl font-bold">{loading ? "…" : resolved}</p>
            <p className="text-[11px] font-semibold text-blue-700 mt-0.5">✅ Resolved</p>
          </Link>
        </div>
      </div>

      {/* Recent Tickets Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm">Recent Tickets</p>
          <Link href="/tickets" className="text-xs font-semibold" style={{ color: "var(--tg-theme-button-color,#2481cc)" }}>
            See all
          </Link>
        </div>
        <div className="space-y-2">
          {recent === null && <><CardSkeleton /><CardSkeleton /></>}
          {recent?.length === 0 && (
            <div className="card p-5 text-center space-y-2 border">
              <p className="text-xs opacity-60">You don't have any tickets yet.</p>
              <Link
                href="/create"
                className="inline-block px-3.5 py-1.5 rounded-full font-bold text-xs text-white"
                style={{ background: "var(--tg-theme-button-color,#2481cc)" }}
              >
                + Submit Your First Ticket
              </Link>
            </div>
          )}
          {recent?.map((t) => <TicketCard key={t.id} ticket={t} />)}
        </div>
      </div>

      {/* Popular Help Articles */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm">Popular Help Articles</p>
          <Link href="/help" className="text-xs font-semibold text-blue-600 hover:underline">
            All Guides
          </Link>
        </div>
        <div className="card divide-y border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          {articles === null && <div className="p-4 skeleton h-4 w-2/3 m-2" />}
          {articles?.length === 0 && <p className="p-4 text-xs opacity-60">No articles available.</p>}
          {articles?.map((a) => (
            <Link key={a.id} href="/help" className="flex items-center justify-between p-3.5 text-xs font-medium hover:bg-black/5 transition-colors group">
              <span className="flex items-center gap-2">
                <span>📚</span>
                <span>{a.title}</span>
              </span>
              <span className="opacity-40 group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
