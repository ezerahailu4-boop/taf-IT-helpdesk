"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, uploadFile } from "@/lib/apiClient";
import { useMe } from "@/lib/useMe";
import { useTelegram } from "@/lib/telegram/useTelegram";
import { StatusPill, PriorityPill } from "@/components/StatusPill";
import { ErrorState } from "@/components/TicketCard";
import { computeSlaState } from "@/lib/sla";
import type { DbTicket, DbUser, TicketStatus, TicketPriority } from "@/types/db";

type Comment = { id: string; sender_role: string; message: string; created_at: string };
type Note = { id: string; note: string; created_at: string; author_id: string };
type Attachment = { id: string; file_name: string; file_type: string; file_size: number; storage_path: string };
type StatusHistoryItem = { id: string; from_status: string | null; to_status: string; note: string | null; created_at: string };

type Detail = {
  ticket: DbTicket;
  comments: Comment[];
  internalNotes: Note[];
  attachments: Attachment[];
  history: StatusHistoryItem[];
  requester: Pick<DbUser, "id" | "first_name" | "last_name" | "photo_url" | "department_id" | "telegram_username" | "telegram_id" | "phone">;
  technician: Pick<DbUser, "id" | "first_name" | "last_name"> | null;
  asset: { id: string; asset_tag: string; type: string; brand: string | null; model: string | null } | null;
  availableTechnicians: { id: string; first_name: string; last_name: string }[];
  categories: { id: string; key: string; label: string; icon: string }[];
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useMe();
  const { showBackButton, haptic } = useTelegram();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [internalMode, setInternalMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");

  // Merge modal
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [merging, setMerging] = useState(false);

  // CSAT Rating states
  const [ratingValue, setRatingValue] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<Detail>(`/api/tickets/${id}`).then(setData).catch((e: ApiError) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => showBackButton(() => router.push("/tickets")), [showBackButton, router]);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [data]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data || !user) {
    return (
      <div className="p-4 space-y-3">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  const { ticket, comments, internalNotes, attachments, requester, technician, asset, availableTechnicians, categories } = data;
  const isStaff = user.role === "TECHNICIAN" || user.role === "ADMIN";
  const isAdmin = user.role === "ADMIN";

  const sla = computeSlaState({
    createdAt: ticket.created_at,
    resolutionDueAt: ticket.resolution_due_at,
    resolvedAt: ticket.resolved_at,
    status: ticket.status
  });

  const timeline = [
    ...comments.map((c) => ({ ...c, kind: "comment" as const, ts: c.created_at })),
    ...(isStaff ? internalNotes.map((n) => ({ ...n, kind: "note" as const, sender_role: "INTERNAL", message: n.note, ts: n.created_at })) : [])
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  async function send() {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      await api(`/api/tickets/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: message.trim(), internal: internalMode })
      });
      setMessage("");
      haptic("light");
      load();
    } catch {
      haptic("error");
    } finally {
      setSending(false);
    }
  }

  async function take() {
    try {
      await api(`/api/tickets/${id}/take`, { method: "POST" });
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  async function setStatus(status: TicketStatus) {
    try {
      await api(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      haptic("light");
      load();
    } catch {
      haptic("error");
    }
  }

  async function setPriority(priority: TicketPriority) {
    try {
      await api(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ priority }) });
      haptic("light");
      load();
    } catch {
      haptic("error");
    }
  }

  async function setCategory(categoryId: string) {
    try {
      await api(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ categoryId }) });
      haptic("light");
      load();
    } catch {
      haptic("error");
    }
  }

  async function reassign(technicianId: string) {
    try {
      await api(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedTechnicianId: technicianId || null })
      });
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  async function resolve() {
    if (resolutionNote.trim().length < 3) return;
    try {
      await api(`/api/tickets/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolutionNote: resolutionNote.trim() })
      });
      setShowResolve(false);
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  async function confirmClose() {
    try {
      await api(`/api/tickets/${id}/close`, { method: "POST" });
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  async function submitRating(starsToSubmit?: number) {
    const score = starsToSubmit || ratingValue;
    if (!score || score < 1 || submittingRating) return;
    setSubmittingRating(true);
    try {
      await api(`/api/tickets/${id}/rate`, {
        method: "POST",
        body: JSON.stringify({ rating: score, comment: ratingComment.trim() || undefined })
      });
      haptic("success");
      load();
    } catch (e: any) {
      haptic("error");
      alert(e.message || "Failed to submit rating");
    } finally {
      setSubmittingRating(false);
    }
  }

  async function reopen() {
    try {
      await api(`/api/tickets/${id}/reopen`, { method: "POST" });
      haptic("light");
      load();
    } catch {
      haptic("error");
    }
  }

  async function handleMerge() {
    if (!mergeTarget.trim() || merging) return;
    setMerging(true);
    try {
      await api(`/api/tickets/${id}/merge`, {
        method: "POST",
        body: JSON.stringify({ targetTicketNumber: mergeTarget.trim() })
      });
      setShowMerge(false);
      haptic("success");
      load();
    } catch {
      haptic("error");
    } finally {
      setMerging(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadFile(file, id);
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  const slaColor = { ON_TRACK: "#0F7A3D", AT_RISK: "#C2410C", BREACHED: "#B42318", MET: "#0F7A3D" }[sla.state];

  // Visual Timeline Steps
  const statusSteps = [
    { key: "NEW", label: "New" },
    { key: "ASSIGNED", label: "Assigned" },
    { key: "IN_PROGRESS", label: "In Progress" },
    { key: "RESOLVED", label: "Resolved" },
    { key: "CLOSED", label: "Closed" }
  ];

  const currentStepIdx = statusSteps.findIndex((s) => s.key === ticket.status);

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Ticket Header & Metadata */}
      <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
            {ticket.ticket_number}
          </span>
          <div className="flex items-center gap-1.5">
            <PriorityPill priority={ticket.priority} />
            <StatusPill status={ticket.status} />
          </div>
        </div>

        <h1 className="font-bold text-lg leading-snug tracking-tight text-slate-900 dark:text-white">{ticket.subject}</h1>

        {/* Visual Lifecycle Timeline */}
        <div className="py-1">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-2 left-3 right-3 h-0.5 bg-slate-200 dark:bg-slate-700 -z-0" />
            {statusSteps.map((st, idx) => {
              const done = currentStepIdx >= idx || ticket.status === "RESOLVED" && idx <= 3 || ticket.status === "CLOSED";
              const current = ticket.status === st.key;
              return (
                <div key={st.key} className="flex flex-col items-center gap-1 z-10">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${
                      current
                        ? "ring-4 ring-indigo-100 dark:ring-indigo-950 bg-indigo-600 text-white"
                        : done
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-300 dark:bg-slate-700 text-slate-500"
                    }`}
                  >
                    {done ? "✓" : idx + 1}
                  </div>
                  <span className={`text-[9px] ${current ? "font-bold text-indigo-600 dark:text-indigo-400" : "opacity-60"}`}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Requester Identity Card for Staff */}
        {isStaff && requester && (
          <div className="card p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px] uppercase tracking-wide opacity-60">Reported By</span>
              {requester.telegram_username ? (
                <a
                  href={`https://t.me/${requester.telegram_username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>💬 @{requester.telegram_username}</span>
                  <span className="text-[10px]">↗</span>
                </a>
              ) : (
                <span className="text-[11px] opacity-60">Telegram User</span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                {requester.first_name?.[0] || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm leading-tight truncate">
                  {`${requester.first_name ?? ""} ${requester.last_name ?? ""}`.trim() || "Employee"}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] opacity-70 mt-0.5">
                  {requester.telegram_id && <span>Telegram ID: #{requester.telegram_id}</span>}
                  {requester.phone && <span>📞 {requester.phone}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Technician, SLA, Asset */}
        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          {!isStaff && <Info label="Requester" value={`${requester.first_name ?? ""} ${requester.last_name ?? ""}`.trim() || "Employee"} />}
          <Info label="Assigned Technician" value={technician ? `${technician.first_name ?? ""} ${technician.last_name ?? ""}`.trim() : "Unassigned"} />
          {asset && (
            <div>
              <span className="opacity-60 block text-[11px]">Linked Hardware:</span>
              <Link
                href={`/admin/assets/${asset.id}`}
                className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                <span>💻</span>
                <span>{asset.brand} {asset.model}</span>
                <span className="font-mono text-[10px]">({asset.asset_tag})</span>
              </Link>
            </div>
          )}
          {ticket.resolution_due_at && (
            <div>
              <span className="opacity-60 block text-[11px]">SLA Target:</span>
              <span className="font-bold" style={{ color: slaColor }}>{sla.label}</span>
            </div>
          )}
        </div>

        {/* Staff Actions Bar */}
        {isStaff && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
            {!ticket.assigned_technician_id && (
              <button
                onClick={take}
                className="px-3.5 py-1.5 rounded-full font-bold text-xs text-white shadow-sm"
                style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
              >
                🙋 Take Ticket
              </button>
            )}

            {ticket.status !== "RESOLVED" && ticket.status !== "CLOSED" && (
              <button
                onClick={() => setShowResolve(true)}
                className="px-3 py-1.5 rounded-full font-semibold text-xs text-white"
                style={{ background: "#0F7A3D" }}
              >
                ✅ Resolve
              </button>
            )}

            {/* Reassign Tech Dropdown */}
            <select
              value={ticket.assigned_technician_id || ""}
              onChange={(e) => reassign(e.target.value)}
              className="text-xs rounded-full px-2.5 py-1.5 card border"
            >
              <option value="">👤 (Unassigned)</option>
              {availableTechnicians?.map((t) => (
                <option key={t.id} value={t.id}>
                  👨‍💻 {t.first_name} {t.last_name}
                </option>
              ))}
            </select>

            {/* Status Dropdown */}
            <select
              value={ticket.status}
              onChange={(e) => setStatus(e.target.value as TicketStatus)}
              className="text-xs rounded-full px-2.5 py-1.5 card border"
            >
              {["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "WAITING_FOR_ADMIN", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>

            {/* Priority Dropdown */}
            <select
              value={ticket.priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className="text-xs rounded-full px-2.5 py-1.5 card border"
            >
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Admin: Category changer & Merge */}
            {isAdmin && (
              <>
                <select
                  value={ticket.category_id || ""}
                  onChange={(e) => setCategory(e.target.value)}
                  className="text-xs rounded-full px-2.5 py-1.5 card border"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                </select>

                <button
                  onClick={() => setShowMerge(true)}
                  className="px-2.5 py-1.5 rounded-full text-xs border font-medium hover:bg-black/5"
                  title="Merge duplicate ticket"
                >
                  🔀 Merge
                </button>
              </>
            )}
          </div>
        )}

        {/* CSAT Rating Display (If already rated) */}
        {ticket.rating && (
          <div className="card p-3 rounded-2xl border border-amber-300/80 dark:border-amber-700/60 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent shadow-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-base">🌟</span>
                <span className="font-bold text-xs text-amber-900 dark:text-amber-200">Customer Satisfaction (CSAT)</span>
              </div>
              <div className="flex items-center gap-1 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                <span className="text-xs font-black text-amber-800 dark:text-amber-200">{ticket.rating}.0</span>
                <span className="text-[10px]">⭐</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm text-amber-500">
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s}>{s <= (ticket.rating || 0) ? "★" : "☆"}</span>
              ))}
              <span className="text-[11px] font-semibold ml-2 text-slate-700 dark:text-slate-300">
                {ticket.rating === 5 ? "🤩 Outstanding" : ticket.rating === 4 ? "🙂 Good" : ticket.rating === 3 ? "😐 Acceptable" : ticket.rating === 2 ? "🙁 Unsatisfactory" : "😠 Poor"}
              </span>
            </div>
            {ticket.rating_comment && (
              <p className="text-xs italic text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-black/30 p-2 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                "{ticket.rating_comment}"
              </p>
            )}
          </div>
        )}

        {/* CSAT Interactive Rating Prompt for Requester */}
        {!isStaff && !ticket.rating && (ticket.status === "RESOLVED" || ticket.status === "CLOSED") && (
          <div className="card p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-900/80 bg-gradient-to-b from-indigo-50/70 to-white dark:from-indigo-950/40 dark:to-slate-900 shadow-sm space-y-2.5">
            <div className="text-center space-y-0.5">
              <div className="inline-block p-1.5 rounded-full bg-indigo-500/10 text-xl">⭐</div>
              <h3 className="font-bold text-xs text-slate-900 dark:text-white">How was your IT support experience?</h3>
              <p className="text-[11px] text-slate-500">
                {technician ? `Rate the support provided by ${technician.first_name}` : "Please rate how your issue was resolved"}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 py-0.5">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (hoverRating || ratingValue) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => {
                      setRatingValue(star);
                      haptic("light");
                    }}
                    className={`text-2xl transition-all transform active:scale-125 hover:scale-110 ${
                      active ? "opacity-100 drop-shadow-sm" : "opacity-30 grayscale"
                    }`}
                  >
                    ⭐
                  </button>
                );
              })}
            </div>

            <p className="text-center text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
              {ratingValue === 5 && "🤩 5/5 — Excellent! Fast & effective"}
              {ratingValue === 4 && "🙂 4/5 — Good support"}
              {ratingValue === 3 && "😐 3/5 — Acceptable"}
              {ratingValue === 2 && "🙁 2/5 — Unsatisfactory"}
              {ratingValue === 1 && "😠 1/5 — Poor experience"}
            </p>

            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Leave a comment or feedback for the technician (optional)..."
              rows={2}
              className="w-full text-xs rounded-xl p-2 card border focus:ring-1 focus:ring-indigo-500"
            />

            <div className="flex gap-2">
              <button
                onClick={() => submitRating()}
                disabled={submittingRating || ratingValue < 1}
                className="flex-1 py-2 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 shadow transition-all disabled:opacity-40"
              >
                {submittingRating ? "Submitting..." : ticket.status === "RESOLVED" ? "⭐ Submit Rating & Close Ticket" : "⭐ Submit Rating"}
              </button>
              {ticket.status === "RESOLVED" && (
                <button
                  onClick={reopen}
                  className="px-3 py-2 rounded-xl font-medium text-xs border card text-amber-700"
                >
                  🔄 Reopen
                </button>
              )}
            </div>
          </div>
        )}

        {/* Fallback button if resolved and user just wants quick confirm without rating */}
        {!isStaff && !ticket.rating && ticket.status === "RESOLVED" && (
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>Or close without rating:</span>
            <button onClick={confirmClose} className="font-semibold text-slate-600 dark:text-slate-300 underline">
              Confirm Resolved
            </button>
          </div>
        )}

        {!isStaff && ticket.status === "CLOSED" && (
          <button
            onClick={reopen}
            className="w-full py-2 rounded-xl text-xs font-semibold border card text-center text-slate-600 dark:text-slate-400 hover:text-slate-900"
          >
            🔄 Need more help? Reopen this Ticket
          </button>
        )}
      </div>

      {/* Conversation & Internal Notes Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Initial problem statement bubble */}
        <Bubble
          role="EMPLOYEE"
          name={requester.first_name ?? "Employee"}
          message={ticket.description}
          ts={ticket.created_at}
        />

        {/* Attachments if any */}
        {attachments.length > 0 && (
          <div className="card p-3 space-y-1.5 text-xs max-w-[85%] border mr-auto">
            <p className="font-semibold opacity-70">Ticket Attachments ({attachments.length}):</p>
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-1.5 text-blue-600">
                <span>📎</span>
                <span className="font-medium truncate">{att.file_name}</span>
                <span className="text-[10px] opacity-60">({Math.round(att.file_size / 1024)} KB)</span>
              </div>
            ))}
          </div>
        )}

        {/* Timeline Messages & Internal Notes */}
        {timeline.map((item) =>
          item.kind === "note" ? (
            <div
              key={item.id}
              className="mx-auto max-w-[92%] text-xs rounded-2xl p-3 border shadow-sm bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800/60"
            >
              <div className="flex items-center justify-between font-bold text-[10px] uppercase tracking-wider mb-1 text-amber-700 dark:text-amber-400">
                <span>🔒 Technician Internal Note (Hidden from employee)</span>
                <span>{new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="whitespace-pre-wrap">{item.message}</p>
            </div>
          ) : (
            <Bubble
              key={item.id}
              role={item.sender_role}
              name={item.sender_role === "EMPLOYEE" ? (requester.first_name ?? "Employee") : (technician?.first_name ?? "IT Support")}
              message={item.message}
              ts={item.ts}
            />
          )
        )}

        {ticket.resolution_note && (
          <div className="card p-3 rounded-2xl text-xs space-y-1 border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/40">
            <p className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1">
              <span>✅</span> Resolution Summary
            </p>
            <p className="text-emerald-800 dark:text-emerald-200 whitespace-pre-wrap">{ticket.resolution_note}</p>
          </div>
        )}
      </div>

      {/* Resolution Explanation Modal Sheet */}
      {showResolve && (
        <div className="p-3 border-t space-y-2.5 bg-white dark:bg-black/95 shadow-xl" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="font-bold text-xs flex items-center gap-1">
            <span>✅</span> Describe Resolution (Required):
          </p>
          <textarea
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            placeholder="e.g. Cleared stuck spooler job and reset network adapter..."
            className="w-full rounded-2xl p-3 card text-xs border"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={resolve}
              disabled={resolutionNote.trim().length < 3}
              className="flex-1 py-2.5 rounded-full font-bold text-xs text-white disabled:opacity-40"
              style={{ background: "#0F7A3D" }}
            >
              Confirm & Mark Resolved
            </button>
            <button
              onClick={() => setShowResolve(false)}
              className="px-4 py-2.5 rounded-full text-xs font-semibold opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Merge Duplicate Ticket Modal Sheet */}
      {showMerge && (
        <div className="p-3 border-t space-y-2.5 bg-white dark:bg-black/95 shadow-xl" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="font-bold text-xs flex items-center gap-1">
            <span>🔀</span> Merge this duplicate ticket into primary ticket:
          </p>
          <input
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            placeholder="Target ticket number (e.g. IT-2026-000241)"
            className="w-full rounded-xl p-2.5 card text-xs font-mono border"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleMerge}
              disabled={!mergeTarget.trim() || merging}
              className="flex-1 py-2.5 rounded-full font-bold text-xs text-white disabled:opacity-40"
              style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
            >
              {merging ? "Merging…" : "Confirm Merge"}
            </button>
            <button
              onClick={() => setShowMerge(false)}
              className="px-4 py-2.5 rounded-full text-xs font-semibold opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Chat Reply Composer */}
      {ticket.status !== "CLOSED" && ticket.status !== "CANCELLED" && !showResolve && !showMerge && (
        <div className="p-3 border-t safe-bottom bg-white dark:bg-black/90" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          {isStaff && (
            <label className="flex items-center gap-1.5 text-xs mb-1.5 font-medium cursor-pointer" style={{ color: internalMode ? "#92650A" : "var(--tg-theme-hint-color,#999)" }}>
              <input
                type="checkbox"
                checked={internalMode}
                onChange={(e) => setInternalMode(e.target.checked)}
                className="accent-amber-600 rounded"
              />
              <span>🔒 Internal Note (Only technicians & admins can read)</span>
            </label>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xl cursor-pointer p-1 rounded-full hover:bg-black/5 transition-colors" title="Attach file">
              📎<input type="file" className="hidden" onChange={onFile} />
            </label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={internalMode ? "Add a private technical note..." : "Write a reply to requester..."}
              className="flex-1 rounded-full px-4 py-2.5 card text-xs border focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              onClick={send}
              disabled={sending || !message.trim()}
              className="px-4 py-2.5 rounded-full font-bold text-xs text-white disabled:opacity-40 shadow-sm"
              style={{
                background: internalMode ? "#D97706" : "var(--tg-theme-button-color,#2481cc)"
              }}
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] opacity-60 block">{label}</span>
      <span className="font-semibold text-xs">{value}</span>
    </div>
  );
}

function Bubble({
  role,
  name,
  message,
  ts
}: {
  role: string;
  name: string;
  message: string;
  ts: string;
}) {
  const isEmployee = role === "EMPLOYEE";
  return (
    <div className={`max-w-[85%] ${isEmployee ? "mr-auto" : "ml-auto"}`}>
      <p className="text-[11px] mb-1 font-semibold flex items-center gap-1 text-slate-500 dark:text-slate-400">
        <span>{isEmployee ? "👤" : "👨‍💻"}</span>
        <span>{name}</span>
        <span className="font-normal opacity-60">· {new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </p>
      <div
        className={`rounded-2xl px-4 py-2.5 text-xs whitespace-pre-wrap leading-relaxed shadow-sm ${
          isEmployee
            ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80"
            : "bg-indigo-600 text-white"
        }`}
      >
        {message}
      </div>
    </div>
  );
}
