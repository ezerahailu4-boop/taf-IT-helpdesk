"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { StatusPill, PriorityPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/TicketCard";
import type { DbTicket } from "@/types/db";

interface SearchResults {
  tickets: DbTicket[];
  articles: { id: string; title: string; body: string }[];
  assets: { id: string; asset_tag: string; type: string; brand: string | null; model: string | null; status: string }[];
  users: { id: string; first_name: string; last_name: string; telegram_username: string | null; role: string }[];
}

export default function GlobalSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"ALL" | "TICKETS" | "HELP" | "ASSETS" | "USERS">("ALL");

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(() => {
      api<SearchResults>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((data) => {
          setResults(data);
        })
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timeout);
  }, [query]);

  const totalCount =
    (results?.tickets.length ?? 0) +
    (results?.articles.length ?? 0) +
    (results?.assets.length ?? 0) +
    (results?.users.length ?? 0);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Global Search</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--tg-theme-hint-color, #999)" }}>
          Find tickets, help articles, company assets, and team members
        </p>
      </div>

      <div className="relative">
        <span className="absolute left-3.5 top-3.5 text-base opacity-50">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Wi-Fi, password, laptop, ticket #..."
          className="w-full pl-10 pr-10 py-3 rounded-2xl card text-sm font-medium transition-all focus:outline-none"
          style={{
            border: "1px solid rgba(0,0,0,0.08)"
          }}
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3.5 top-3.5 text-xs px-1.5 py-0.5 rounded-full opacity-60 hover:opacity-100"
            style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}
          >
            ✕
          </button>
        )}
      </div>

      {!query && (
        <div className="space-y-3 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-60">Popular Searches</p>
          <div className="flex flex-wrap gap-2">
            {["Wi-Fi", "Password", "Printer", "Dell Latitude", "Email", "VPN"].map((tag) => (
              <button
                key={tag}
                onClick={() => setQuery(tag)}
                className="px-3 py-1.5 rounded-full text-xs font-medium card hover:scale-105 transition-all"
                style={{
                  background: "var(--tg-theme-secondary-bg-color, #f2f2f7)",
                  color: "var(--tg-theme-text-color, #111)"
                }}
              >
                🔎 {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {query && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
          {[
            { key: "ALL", label: `All (${totalCount})` },
            { key: "TICKETS", label: `Tickets (${results?.tickets.length ?? 0})` },
            { key: "HELP", label: `Help (${results?.articles.length ?? 0})` },
            { key: "ASSETS", label: `Assets (${results?.assets.length ?? 0})` },
            { key: "USERS", label: `Users (${results?.users.length ?? 0})` }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className="px-3 py-1 rounded-full font-medium whitespace-nowrap transition-all"
              style={{
                background:
                  activeTab === tab.key
                    ? "var(--tg-theme-button-color, #2481cc)"
                    : "var(--tg-theme-secondary-bg-color, #f2f2f7)",
                color: activeTab === tab.key ? "#fff" : "var(--tg-theme-text-color, #111)"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="space-y-2 py-4">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
      )}

      {!loading && query && totalCount === 0 && (
        <EmptyState icon="🔍" title={`No results found for "${query}"`} />
      )}

      {!loading && results && (
        <div className="space-y-4">
          {/* Tickets section */}
          {(activeTab === "ALL" || activeTab === "TICKETS") && results.tickets.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider opacity-60">Tickets</h2>
              <div className="space-y-2">
                {results.tickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tickets/${t.id}`}
                    className="card p-3.5 flex items-center justify-between gap-3 block hover:opacity-90 transition-opacity"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono opacity-60">{t.ticket_number}</span>
                        <StatusPill status={t.status} />
                      </div>
                      <p className="font-medium text-sm truncate">{t.subject}</p>
                    </div>
                    <PriorityPill priority={t.priority} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Knowledge Articles section */}
          {(activeTab === "ALL" || activeTab === "HELP") && results.articles.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider opacity-60">Help Articles</h2>
              <div className="space-y-2">
                {results.articles.map((a) => (
                  <Link
                    key={a.id}
                    href="/help"
                    className="card p-3.5 block hover:opacity-90 transition-opacity"
                  >
                    <p className="font-medium text-sm flex items-center gap-2">
                      <span>📚</span> {a.title}
                    </p>
                    <p className="text-xs opacity-70 line-clamp-2 mt-1">{a.body}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Assets section */}
          {(activeTab === "ALL" || activeTab === "ASSETS") && results.assets.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider opacity-60">IT Assets</h2>
              <div className="space-y-2">
                {results.assets.map((ast) => (
                  <Link
                    key={ast.id}
                    href={`/admin/assets/${ast.id}`}
                    className="card p-3.5 flex items-center justify-between gap-3 block hover:opacity-90 transition-opacity"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        💻 {ast.type} — {ast.brand} {ast.model}
                      </p>
                      <p className="text-xs font-mono opacity-60 mt-0.5">{ast.asset_tag}</p>
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}
                    >
                      {ast.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Users section */}
          {(activeTab === "ALL" || activeTab === "USERS") && results.users.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider opacity-60">Users & Staff</h2>
              <div className="space-y-2">
                {results.users.map((u) => (
                  <div key={u.id} className="card p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs"
                        style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}
                      >
                        {u.first_name?.[0] ?? "👤"}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {u.first_name} {u.last_name}
                        </p>
                        <p className="text-xs opacity-60">@{u.telegram_username ?? "—"}</p>
                      </div>
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}
                    >
                      {u.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
