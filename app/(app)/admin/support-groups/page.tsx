"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useTelegram } from "@/lib/telegram/useTelegram";
import { EmptyState } from "@/components/TicketCard";

interface SupportGroup {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  technicians: { id: string; first_name: string; last_name: string }[];
}

export default function AdminSupportGroupsPage() {
  const router = useRouter();
  const { showBackButton, haptic } = useTelegram();
  const [groups, setGroups] = useState<SupportGroup[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const load = () => {
    api<{ supportGroups: SupportGroup[] }>("/api/admin/support-groups").then((d) => setGroups(d.supportGroups));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => showBackButton(() => router.back()), [showBackButton, router]);

  async function createGroup() {
    if (!name.trim()) return;
    try {
      await api("/api/admin/support-groups", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || undefined })
      });
      setName("");
      setDesc("");
      setShowAdd(false);
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  async function toggleActive(g: SupportGroup) {
    try {
      await api("/api/admin/support-groups", {
        method: "PATCH",
        body: JSON.stringify({ id: g.id, isActive: !g.is_active })
      });
      haptic("light");
      load();
    } catch {
      haptic("error");
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">IT Support Teams</h1>
          <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
            Specialized tiers and groups for automatic ticket dispatching
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs font-semibold px-3 py-2 rounded-full shadow-sm text-white"
          style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
        >
          {showAdd ? "✕ Cancel" : "+ New Team"}
        </button>
      </div>

      {showAdd && (
        <div className="card p-4 space-y-3 border" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="font-semibold text-sm">Create Support Group</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team Name (e.g. Cloud Infrastructure, Helpdesk Tier 1)"
            className="w-full rounded-xl p-2.5 card text-sm"
            autoFocus
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description of responsibilities and scope..."
            rows={2}
            className="w-full rounded-xl p-2.5 card text-sm"
          />
          <button
            onClick={createGroup}
            disabled={!name.trim()}
            className="w-full py-2.5 rounded-full font-medium text-xs text-white disabled:opacity-50"
            style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
          >
            Save Team
          </button>
        </div>
      )}

      {!groups && (
        <div className="space-y-2">
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
        </div>
      )}

      {groups?.length === 0 && (
        <EmptyState icon="👥" title="No support teams configured yet." />
      )}

      <div className="space-y-3">
        {groups?.map((g) => (
          <div
            key={g.id}
            className="card p-4 space-y-2.5 border"
            style={{ borderColor: "rgba(0,0,0,0.04)" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-sm flex items-center gap-2">
                  <span>👥 {g.name}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      g.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {g.is_active ? "Active" : "Disabled"}
                  </span>
                </p>
                {g.description && (
                  <p className="text-xs opacity-70 mt-1">{g.description}</p>
                )}
              </div>
              <button
                onClick={() => toggleActive(g)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                  g.is_active ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"
                }`}
              >
                {g.is_active ? "Disable" : "Enable"}
              </button>
            </div>

            <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
              <span className="opacity-60">Technicians ({g.technicians.length}):</span>
              <div className="flex flex-wrap gap-1">
                {g.technicians.map((tech) => (
                  <span
                    key={tech.id}
                    className="px-2 py-0.5 rounded-md text-[11px] font-medium"
                    style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}
                  >
                    👨‍💻 {tech.first_name} {tech.last_name}
                  </span>
                ))}
                {g.technicians.length === 0 && (
                  <span className="opacity-50 italic">None assigned</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
