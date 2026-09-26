"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useTelegram } from "@/lib/telegram/useTelegram";
import { EmptyState } from "@/components/TicketCard";
import type { TicketPriority, UserRole } from "@/types/db";

interface Rule {
  id: string;
  name: string;
  is_active: boolean;
  match_category_id: string | null;
  match_priority: TicketPriority | null;
  route_support_group_id: string | null;
  notify_role: UserRole | null;
  category?: { id: string; key: string; label: string } | null;
  supportGroup?: { id: string; name: string } | null;
}

interface Meta {
  categories: { id: string; key: string; label: string }[];
  supportGroups: { id: string; name: string }[];
}

export default function AdminAutomationRulesPage() {
  const router = useRouter();
  const { showBackButton, haptic } = useTelegram();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [catId, setCatId] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [notifyRole, setNotifyRole] = useState<string>("");

  const load = () => {
    api<{ automationRules: Rule[]; categories: any[]; supportGroups: any[] }>("/api/admin/automation-rules").then((d) => {
      setRules(d.automationRules);
      setMeta({ categories: d.categories, supportGroups: d.supportGroups });
    });
  };

  useEffect(() => { load(); }, []);
  useEffect(() => showBackButton(() => router.back()), [showBackButton, router]);

  async function createRule() {
    if (!name.trim()) return;
    try {
      await api("/api/admin/automation-rules", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          matchCategoryId: catId || null,
          matchPriority: priority || null,
          routeSupportGroupId: groupId || null,
          notifyRole: notifyRole || null
        })
      });
      setName(""); setCatId(""); setPriority(""); setGroupId(""); setNotifyRole("");
      setShowAdd(false);
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  async function toggleActive(r: Rule) {
    try {
      await api("/api/admin/automation-rules", {
        method: "PATCH",
        body: JSON.stringify({ id: r.id, isActive: !r.is_active })
      });
      haptic("light");
      load();
    } catch {
      haptic("error");
    }
  }

  async function deleteRule(id: string) {
    try {
      await api(`/api/admin/automation-rules?id=${id}`, { method: "DELETE" });
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Auto-Routing & SLA Rules</h1>
          <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
            Automatically assign incoming tickets to support groups and send escalation alerts
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs font-semibold px-3 py-2 rounded-full shadow-sm text-white"
          style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
        >
          {showAdd ? "✕ Cancel" : "+ New Rule"}
        </button>
      </div>

      {showAdd && (
        <div className="card p-4 space-y-3 border" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="font-semibold text-sm">Create Automation Rule</p>
          <div>
            <label className="text-xs font-medium block mb-1">Rule Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Critical tickets -> Alert Admin"
              className="w-full rounded-xl p-2.5 card text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="font-medium block mb-1">IF Category matches</label>
              <select
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
                className="w-full rounded-xl p-2.5 card text-xs"
              >
                <option value="">(Any Category)</option>
                {meta?.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-medium block mb-1">IF Priority matches</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-xl p-2.5 card text-xs"
              >
                <option value="">(Any Priority)</option>
                <option value="CRITICAL">🔴 Critical</option>
                <option value="HIGH">🟠 High</option>
                <option value="MEDIUM">🟡 Medium</option>
                <option value="LOW">🟢 Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="font-medium block mb-1">THEN Route to Group</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-xl p-2.5 card text-xs"
              >
                <option value="">(No specific group)</option>
                {meta?.supportGroups.map((sg) => (
                  <option key={sg.id} value={sg.id}>👥 {sg.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-medium block mb-1">AND Alert Role</label>
              <select
                value={notifyRole}
                onChange={(e) => setNotifyRole(e.target.value)}
                className="w-full rounded-xl p-2.5 card text-xs"
              >
                <option value="">(None)</option>
                <option value="ADMIN">⚙️ Administrators</option>
                <option value="TECHNICIAN">👨‍💻 Technicians</option>
              </select>
            </div>
          </div>

          <button
            onClick={createRule}
            disabled={!name.trim()}
            className="w-full py-2.5 rounded-full font-medium text-xs text-white disabled:opacity-50"
            style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
          >
            Save Rule
          </button>
        </div>
      )}

      {!rules && (
        <div className="space-y-2">
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
        </div>
      )}

      {rules?.length === 0 && (
        <EmptyState icon="⚡" title="No automation rules configured." />
      )}

      <div className="space-y-3">
        {rules?.map((r) => (
          <div
            key={r.id}
            className="card p-4 space-y-2.5 border"
            style={{ borderColor: "rgba(0,0,0,0.04)" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-sm flex items-center gap-2">
                  <span>⚡ {r.name}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      r.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {r.is_active ? "Active" : "Inactive"}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleActive(r)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                    r.is_active ? "text-amber-700 hover:bg-amber-50" : "text-green-700 hover:bg-green-50"
                  }`}
                >
                  {r.is_active ? "Pause" : "Activate"}
                </button>
                <button
                  onClick={() => deleteRule(r.id)}
                  className="text-xs px-2 py-1 rounded-lg border text-red-600 hover:bg-red-50"
                  title="Delete rule"
                >
                  🗑
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
              <div>
                <span className="opacity-60 block text-[10px] uppercase font-semibold">Conditions:</span>
                <span className="font-medium">
                  {r.category ? `Category: ${r.category.label}` : ""}
                  {r.category && r.match_priority ? " + " : ""}
                  {r.match_priority ? `Priority: ${r.match_priority}` : ""}
                  {!r.category && !r.match_priority ? "Always (All tickets)" : ""}
                </span>
              </div>
              <div>
                <span className="opacity-60 block text-[10px] uppercase font-semibold">Actions:</span>
                <span className="font-medium">
                  {r.supportGroup ? `→ ${r.supportGroup.name}` : ""}
                  {r.supportGroup && r.notify_role ? " & " : ""}
                  {r.notify_role ? `Notify ${r.notify_role}` : ""}
                  {!r.supportGroup && !r.notify_role ? "None" : ""}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
