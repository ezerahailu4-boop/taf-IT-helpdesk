"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useTelegram } from "@/lib/telegram/useTelegram";
import { EmptyState } from "@/components/TicketCard";
import type { DbUser, UserRole } from "@/types/db";

interface Dept { id: string; name: string }
interface Loc { id: string; name: string }

export default function AdminUsersPage() {
  const { haptic } = useTelegram();
  const [users, setUsers] = useState<DbUser[] | null>(null);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [filter, setFilter] = useState<UserRole | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<DbUser | null>(null);

  const load = () => {
    api<{ users: DbUser[] }>("/api/admin/users").then((d) => setUsers(d.users));
    api<{ departments: Dept[]; locations: Loc[] }>("/api/reference").then((d) => {
      setDepartments(d.departments ?? []);
      setLocations(d.locations ?? []);
    });
  };

  useEffect(() => { load(); }, []);

  async function setRole(id: string, role: UserRole) {
    await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
    haptic("success");
    load();
  }

  async function toggleStatus(user: DbUser) {
    await api(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !user.is_active })
    });
    haptic("light");
    load();
  }

  async function saveUserEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await api(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: editingUser.role,
          departmentId: editingUser.department_id || null,
          locationId: editingUser.location_id || null,
          isActive: editingUser.is_active
        })
      });
      setEditingUser(null);
      haptic("success");
      load();
    } catch {
      haptic("error");
    }
  }

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const locMap = new Map(locations.map((l) => [l.id, l.name]));

  const filtered = users?.filter((u) => {
    if (filter !== "ALL" && u.role !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase();
      const userN = (u.telegram_username ?? "").toLowerCase();
      const tgId = String(u.telegram_id);
      return name.includes(q) || userN.includes(q) || tgId.includes(q);
    }
    return true;
  });

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">User Management</h1>
        <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
          Manage corporate employees, IT technicians, and system administrators
        </p>
      </div>

      {/* Role Filter Pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
        {(["ALL", "EMPLOYEE", "TECHNICIAN", "ADMIN"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className="px-3.5 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all"
            style={{
              background: filter === r ? "var(--tg-theme-button-color,#2481cc)" : "var(--tg-theme-secondary-bg-color,#f2f2f7)",
              color: filter === r ? "#fff" : "var(--tg-theme-text-color,#111)"
            }}
          >
            {r === "ALL" ? `All (${users?.length ?? 0})` : r.charAt(0) + r.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="relative">
        <span className="absolute left-3.5 top-3 text-xs opacity-60">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, @username, or Telegram ID..."
          className="w-full pl-9 pr-4 py-2.5 rounded-2xl card text-xs border"
          style={{ borderColor: "rgba(0,0,0,0.06)" }}
        />
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="card p-4 space-y-3 border ring-2 ring-blue-500 shadow-md">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm">
              Edit User: {editingUser.first_name} {editingUser.last_name}
            </p>
            <button onClick={() => setEditingUser(null)} className="text-xs opacity-60">✕ Cancel</button>
          </div>

          <form onSubmit={saveUserEdit} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold block mb-1">Assigned Role</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                  className="w-full rounded-xl p-2.5 card text-xs border"
                >
                  <option value="EMPLOYEE">👤 Employee</option>
                  <option value="TECHNICIAN">👨‍💻 Technician</option>
                  <option value="ADMIN">⚙️ Administrator</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Status</label>
                <select
                  value={editingUser.is_active ? "active" : "disabled"}
                  onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.value === "active" })}
                  className="w-full rounded-xl p-2.5 card text-xs border"
                >
                  <option value="active">🟢 Active</option>
                  <option value="disabled">⛔ Disabled</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold block mb-1">Department</label>
                <select
                  value={editingUser.department_id || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, department_id: e.target.value || null })}
                  className="w-full rounded-xl p-2.5 card text-xs border"
                >
                  <option value="">(None assigned)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>🏢 {d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Location</label>
                <select
                  value={editingUser.location_id || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, location_id: e.target.value || null })}
                  className="w-full rounded-xl p-2.5 card text-xs border"
                >
                  <option value="">(None assigned)</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>📍 {l.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-full font-bold text-xs text-white"
                style={{ background: "var(--tg-theme-button-color,#2481cc)" }}
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2.5 rounded-full text-xs opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="space-y-2.5">
        {!filtered && (
          <div className="space-y-2">
            <div className="skeleton h-20 w-full" />
            <div className="skeleton h-20 w-full" />
            <div className="skeleton h-20 w-full" />
          </div>
        )}

        {filtered?.map((u) => (
          <div
            key={u.id}
            className="card p-3.5 space-y-2 border transition-all"
            style={{ borderColor: "rgba(0,0,0,0.06)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {u.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                    style={{ background: "var(--tg-theme-secondary-bg-color,#f2f2f7)" }}
                  >
                    {u.first_name?.[0] ?? "👤"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {u.first_name} {u.last_name}
                  </p>
                  <p className="text-[11px] opacity-60 truncate">
                    @{u.telegram_username ?? "no_username"} · ID: {u.telegram_id}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={u.role}
                  onChange={(e) => setRole(u.id, e.target.value as UserRole)}
                  className="text-xs font-semibold rounded-full px-2.5 py-1.5 card border"
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="TECHNICIAN">Technician</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button
                  onClick={() => setEditingUser(u)}
                  className="text-xs p-1.5 rounded-lg border hover:bg-black/5"
                  title="Edit user details"
                >
                  ✏️
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 text-[11px] pt-1.5 border-t opacity-75" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
              <span>🏢 {u.department_id ? deptMap.get(u.department_id) || "—" : "General"}</span>
              <span>📍 {u.location_id ? locMap.get(u.location_id) || "—" : "Office"}</span>
              <span className={`text-right font-semibold ${u.is_active ? "text-green-700" : "text-red-600"}`}>
                {u.is_active ? "Active" : "Disabled"}
              </span>
            </div>
          </div>
        ))}

        {filtered?.length === 0 && (
          <EmptyState icon="👥" title="No users found matching your criteria." />
        )}
      </div>
    </div>
  );
}
