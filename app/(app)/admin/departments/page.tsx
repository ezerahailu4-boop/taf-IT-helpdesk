"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useTelegram } from "@/lib/telegram/useTelegram";
import { EmptyState } from "@/components/TicketCard";

interface Department {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminDepartmentsPage() {
  const router = useRouter();
  const { showBackButton, haptic } = useTelegram();
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = () => {
    api<{ departments: Department[] }>("/api/admin/departments").then((d) => setDepartments(d.departments));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => showBackButton(() => router.back()), [showBackButton, router]);

  async function createDept() {
    if (!name.trim()) return;
    try {
      await api("/api/admin/departments", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() })
      });
      setName("");
      setShowAdd(false);
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  async function toggleActive(dept: Department) {
    try {
      await api("/api/admin/departments", {
        method: "PATCH",
        body: JSON.stringify({ id: dept.id, isActive: !dept.is_active })
      });
      haptic("light");
      load();
    } catch {
      haptic("error");
    }
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    try {
      await api("/api/admin/departments", {
        method: "PATCH",
        body: JSON.stringify({ id, name: editName.trim() })
      });
      setEditingId(null);
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
          <h1 className="text-xl font-bold tracking-tight">Department Management</h1>
          <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
            Configure corporate departments for ticket routing and reporting
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs font-semibold px-3 py-2 rounded-full shadow-sm text-white"
          style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
        >
          {showAdd ? "✕ Cancel" : "+ Add Department"}
        </button>
      </div>

      {showAdd && (
        <div className="card p-4 space-y-3 border" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="font-semibold text-sm">New Department</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Operations, Legal, Procurement"
            className="w-full rounded-xl p-2.5 card text-sm"
            autoFocus
          />
          <button
            onClick={createDept}
            disabled={!name.trim()}
            className="w-full py-2.5 rounded-full font-medium text-xs text-white disabled:opacity-50"
            style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
          >
            Save Department
          </button>
        </div>
      )}

      {!departments && (
        <div className="space-y-2">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
      )}

      {departments?.length === 0 && (
        <EmptyState icon="🏢" title="No departments configured yet." />
      )}

      <div className="space-y-2">
        {departments?.map((dept) => (
          <div
            key={dept.id}
            className="card p-3.5 flex items-center justify-between gap-3 border"
            style={{ borderColor: "rgba(0,0,0,0.04)" }}
          >
            {editingId === dept.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-xl p-2 card text-sm border"
                />
                <button
                  onClick={() => saveEdit(dept.id)}
                  className="px-3 py-1.5 rounded-xl font-medium text-xs text-white"
                  style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-2 py-1.5 rounded-xl text-xs opacity-60"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="min-w-0">
                  <p className="font-semibold text-sm flex items-center gap-2">
                    <span>🏢 {dept.name}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        dept.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {dept.is_active ? "Active" : "Disabled"}
                    </span>
                  </p>
                  <p className="text-[11px] opacity-60 mt-0.5">Created {new Date(dept.created_at).toLocaleDateString()}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditingId(dept.id);
                      setEditName(dept.name);
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg border opacity-80 hover:opacity-100"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(dept)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                      dept.is_active ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"
                    }`}
                  >
                    {dept.is_active ? "Disable" : "Enable"}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
