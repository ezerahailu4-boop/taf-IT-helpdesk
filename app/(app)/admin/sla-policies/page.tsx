"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useTelegram } from "@/lib/telegram/useTelegram";
import type { TicketPriority } from "@/types/db";

interface SlaPolicy {
  id: string;
  priority: TicketPriority;
  response_minutes: number;
  resolution_minutes: number;
  updated_at: string;
}

export default function AdminSlaPoliciesPage() {
  const router = useRouter();
  const { showBackButton, haptic } = useTelegram();
  const [policies, setPolicies] = useState<SlaPolicy[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [respMins, setRespMins] = useState(15);
  const [resMins, setResMins] = useState(120);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api<{ slaPolicies: SlaPolicy[] }>("/api/admin/sla-policies").then((d) => setPolicies(d.slaPolicies));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => showBackButton(() => router.back()), [showBackButton, router]);

  function startEdit(p: SlaPolicy) {
    setEditingId(p.id);
    setRespMins(p.response_minutes);
    setResMins(p.resolution_minutes);
  }

  async function savePolicy(id: string) {
    setSaving(true);
    try {
      await api("/api/admin/sla-policies", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          responseMinutes: Number(respMins),
          resolutionMinutes: Number(resMins)
        })
      });
      setEditingId(null);
      haptic("success");
      load();
    } catch {
      haptic("error");
    } finally {
      setSaving(false);
    }
  }

  const priorityMeta: Record<TicketPriority, { icon: string; color: string; desc: string }> = {
    CRITICAL: { icon: "🔴", color: "#B42318", desc: "Outages affecting business operations or servers" },
    HIGH: { icon: "🟠", color: "#EA580C", desc: "Core workflow blocked for individual employees" },
    MEDIUM: { icon: "🟡", color: "#CA8A04", desc: "Standard requests, impaired non-critical functions" },
    LOW: { icon: "🟢", color: "#16A34A", desc: "General inquiries, minor issues, routine requests" }
  };

  function formatMins(m: number) {
    if (m < 60) return `${m} minutes`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (rem === 0) return `${h} hour${h > 1 ? "s" : ""}`;
    return `${h}h ${rem}m`;
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">SLA Target Policies</h1>
        <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
          Define service level response and resolution deadlines per ticket priority
        </p>
      </div>

      {!policies && (
        <div className="space-y-3">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      )}

      <div className="space-y-3">
        {policies?.map((policy) => {
          const meta = priorityMeta[policy.priority];
          const isEditing = editingId === policy.id;

          return (
            <div
              key={policy.id}
              className="card p-4 space-y-3 border"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meta.icon}</span>
                  <div>
                    <h2 className="font-bold text-sm" style={{ color: meta.color }}>
                      {policy.priority} Priority
                    </h2>
                    <p className="text-[11px] opacity-60">{meta.desc}</p>
                  </div>
                </div>

                {!isEditing && (
                  <button
                    onClick={() => startEdit(policy)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border hover:bg-black/5"
                  >
                    Adjust
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="pt-2 space-y-3 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="font-semibold block mb-1">Response Target (mins)</label>
                      <input
                        type="number"
                        value={respMins}
                        onChange={(e) => setRespMins(Number(e.target.value))}
                        className="w-full rounded-xl p-2.5 card text-xs border"
                        min={1}
                      />
                      <span className="text-[10px] opacity-60 mt-0.5 block">{formatMins(respMins)}</span>
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Resolution Target (mins)</label>
                      <input
                        type="number"
                        value={resMins}
                        onChange={(e) => setResMins(Number(e.target.value))}
                        className="w-full rounded-xl p-2.5 card text-xs border"
                        min={1}
                      />
                      <span className="text-[10px] opacity-60 mt-0.5 block">{formatMins(resMins)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => savePolicy(policy.id)}
                      disabled={saving}
                      className="flex-1 py-2 rounded-full font-medium text-xs text-white"
                      style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
                    >
                      {saving ? "Saving…" : "Save Policy"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 rounded-full text-xs opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
                  <div>
                    <span className="opacity-60 block text-[11px]">First Response:</span>
                    <span className="font-bold text-sm">{formatMins(policy.response_minutes)}</span>
                  </div>
                  <div>
                    <span className="opacity-60 block text-[11px]">Final Resolution:</span>
                    <span className="font-bold text-sm">{formatMins(policy.resolution_minutes)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
