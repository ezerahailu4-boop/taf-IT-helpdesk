"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { EmptyState, ErrorState } from "@/components/TicketCard";

interface AuditItem {
  id: string;
  actor_id: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  previous_value: any;
  new_value: any;
  created_at: string;
  actor: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    telegram_username: string | null;
    role: string;
  } | null;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditItem[] | null>(null);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const params = filterType !== "ALL" ? `?objectType=${filterType.toLowerCase()}` : "";
    api<{ logs: AuditItem[] }>(`/api/admin/audit${params}`)
      .then((d) => setLogs(d.logs))
      .catch((err) => setError(err.message));
  };

  useEffect(() => { load(); }, [filterType]);

  const actionColors: Record<string, { bg: string; text: string }> = {
    CREATE: { bg: "#ECFDF3", text: "#0F7A3D" },
    RESOLVE: { bg: "#ECFDF3", text: "#0F7A3D" },
    TAKE: { bg: "#EFF8FF", text: "#175CD3" },
    ASSIGN: { bg: "#EFF8FF", text: "#175CD3" },
    UPDATE: { bg: "#FEF6EE", text: "#B54708" },
    STATUS_CHANGE: { bg: "#FEF6EE", text: "#B54708" },
    CLOSE: { bg: "#F2F4F7", text: "#344054" },
    REOPEN: { bg: "#FEF3F2", text: "#B42318" },
    DELETE: { bg: "#FEF3F2", text: "#B42318" }
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">System Audit Log</h1>
        <p className="text-xs" style={{ color: "var(--tg-theme-hint-color, #999)" }}>
          Immutable operational trail of every ticket status change, assignment, and config edit
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
        {["ALL", "TICKET", "USER", "ASSET", "DEPARTMENT", "SUPPORT_GROUP", "AUTOMATION_RULE"].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className="px-3 py-1 rounded-full font-medium whitespace-nowrap transition-all"
            style={{
              background: filterType === t ? "var(--tg-theme-button-color, #2481cc)" : "var(--tg-theme-secondary-bg-color, #f2f2f7)",
              color: filterType === t ? "#fff" : "var(--tg-theme-text-color, #111)"
            }}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!logs && !error && (
        <div className="space-y-2">
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
        </div>
      )}

      {logs?.length === 0 && (
        <EmptyState icon="📜" title="No audit entries for this filter." />
      )}

      <div className="space-y-2.5">
        {logs?.map((item) => {
          const isExpanded = expandedId === item.id;
          const colors = actionColors[item.action] || { bg: "#F2F4F7", text: "#344054" };
          const date = new Date(item.created_at);

          return (
            <div
              key={item.id}
              className="card p-3.5 space-y-2 border transition-all"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}
                  >
                    {item.actor?.first_name?.[0] ?? "🤖"}
                  </div>
                  <div>
                    <p className="font-semibold text-xs leading-tight">
                      {item.actor ? `${item.actor.first_name} ${item.actor.last_name || ""}` : "System"}
                      <span className="text-[10px] font-normal opacity-60 ml-1.5">
                        ({item.actor?.role ?? "SYSTEM"})
                      </span>
                    </p>
                    <p className="text-[11px] opacity-60">
                      {date.toLocaleDateString([], { month: "short", day: "numeric" })} · {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    {item.action.replace("_", " ")}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
                <span className="font-mono opacity-70">
                  {item.object_type}: {item.object_id ? String(item.object_id).slice(0, 16) + "…" : "global"}
                </span>

                {(item.previous_value || item.new_value) && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="text-[11px] font-medium opacity-80 hover:opacity-100 underline decoration-dotted"
                    style={{ color: "var(--tg-theme-button-color, #2481cc)" }}
                  >
                    {isExpanded ? "Hide Details ▲" : "View Diff ▼"}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="pt-2 space-y-2 text-xs font-mono bg-black/5 dark:bg-white/5 rounded-xl p-2.5 overflow-x-auto">
                  {item.previous_value && (
                    <div>
                      <p className="text-[10px] text-red-600 font-bold uppercase">Before:</p>
                      <pre className="text-[11px] overflow-x-auto">{JSON.stringify(item.previous_value, null, 2)}</pre>
                    </div>
                  )}
                  {item.new_value && (
                    <div>
                      <p className="text-[10px] text-green-600 font-bold uppercase">After:</p>
                      <pre className="text-[11px] overflow-x-auto">{JSON.stringify(item.new_value, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
