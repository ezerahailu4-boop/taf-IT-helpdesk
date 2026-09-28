"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import { api } from "@/lib/apiClient";
import { useTelegram } from "@/lib/telegram/useTelegram";

interface UserAsset {
  id: string;
  asset_tag: string;
  type: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  warranty_expires_on: string | null;
  status: string;
}

interface Dept {
  id: string;
  name: string;
}

export default function ProfilePage() {
  const { user, counts, loading, reload } = useMe();
  const { haptic } = useTelegram();
  const [devices, setDevices] = useState<UserAsset[] | null>(null);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    api<{ assets: UserAsset[]; departments: Dept[] }>("/api/reference")
      .then((d) => {
        setDevices(d.assets ?? []);
        setDepartments(d.departments ?? []);
      })
      .catch(() => {
        setDevices([]);
        setDepartments([]);
      });
  }, []);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || "");
      setLastName(user.last_name || "");
      setPhone(user.phone || "");
      setDepartmentId(user.department_id || "");
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;
    setSaving(true);
    try {
      await api("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          departmentId: departmentId || null
        })
      });
      haptic("success");
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      setIsEditing(false);
      reload();
    } catch (e: any) {
      haptic("error");
      alert(e.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="p-4 space-y-4">
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  const currentDept = departments.find((d) => d.id === user.department_id)?.name;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-xl mx-auto pb-24">
      {/* Profile Header */}
      <div className="card p-5 flex items-center justify-between gap-3.5 border shadow-sm" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <div className="flex items-center gap-3.5 min-w-0">
          {user.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photo_url} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-500/20" />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold bg-indigo-500/10 text-indigo-600 shrink-0"
            >
              {user.first_name?.[0] ?? "👤"}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base leading-tight truncate">
                {user.first_name} {user.last_name || ""}
              </h1>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                {user.role}
              </span>
            </div>
            <p className="text-xs text-blue-600 font-semibold mt-0.5">@{user.telegram_username ?? "—"}</p>
            <p className="text-[11px] opacity-60 mt-0.5">
              {currentDept ? `🏢 ${currentDept} • ` : ""}Telegram ID: #{user.telegram_id}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:opacity-80 transition-opacity shrink-0"
        >
          {isEditing ? "Cancel" : "✏️ Edit"}
        </button>
      </div>

      {/* Edit Profile Form */}
      {isEditing && (
        <form onSubmit={handleSaveProfile} className="card p-5 space-y-3.5 border shadow-md bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Edit Official Employee Info</h2>
            <span className="text-[10px] text-slate-400">Used by IT Technicians</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold block mb-1">First Name *</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First Name"
                className="w-full text-xs p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold block mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name"
                className="w-full text-xs p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold block mb-1">Company Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              >
                <option value="">Select Department...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold block mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+251 9..."
                className="w-full text-xs p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors"
            >
              {saving ? "Saving…" : "Save Official Profile"}
            </button>
          </div>
        </form>
      )}

      {savedSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-bold text-center">
          ✅ Employee profile saved! IT staff will see this updated name.
        </div>
      )}

      {/* Section 29: My Assigned Hardware Devices */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-1.5">
            <span>💻</span>
            <span>My Assigned Devices ({devices?.length ?? 0})</span>
          </h2>
          <span className="text-[11px] opacity-60">Company Assets</span>
        </div>

        {devices?.length === 0 && (
          <div className="card p-4 text-center text-xs opacity-60 border">
            No IT hardware devices currently assigned to your account.
          </div>
        )}

        <div className="space-y-2">
          {devices?.map((dev) => (
            <div
              key={dev.id}
              className="card p-3.5 flex items-center justify-between gap-3 border"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            >
              <div>
                <p className="font-semibold text-xs">
                  {dev.type} — {dev.brand} {dev.model}
                </p>
                <p className="text-[11px] font-mono opacity-60 mt-0.5">
                  Tag: {dev.asset_tag} {dev.serial_number ? `· S/N: ${dev.serial_number}` : ""}
                </p>
                {dev.warranty_expires_on && (
                  <p className="text-[10px] text-green-700 font-medium mt-1">
                    Warranty valid until: {dev.warranty_expires_on}
                  </p>
                )}
              </div>
              <Link
                href={`/create`}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full border shadow-sm hover:bg-black/5"
              >
                Report Issue
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Ticket Activity Summary */}
      <div className="card p-4 space-y-3 border shadow-sm" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <p className="font-semibold text-sm">Ticket Activity Statistics</p>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {Object.entries(counts).map(([status, count]) => (
            <div key={status} className="p-2.5 rounded-xl card" style={{ background: "var(--tg-theme-secondary-bg-color,#f2f2f7)" }}>
              <p className="text-lg font-bold">{count}</p>
              <p className="text-[10px] opacity-70 truncate">{status.replace(/_/g, " ")}</p>
            </div>
          ))}
          {Object.keys(counts).length === 0 && (
            <p className="col-span-3 text-xs opacity-60 py-2">No activity recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
