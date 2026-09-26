"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import { api } from "@/lib/apiClient";

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

export default function ProfilePage() {
  const { user, counts, loading } = useMe();
  const [devices, setDevices] = useState<UserAsset[] | null>(null);

  useEffect(() => {
    api<{ assets: UserAsset[] }>("/api/reference")
      .then((d) => setDevices(d.assets ?? []))
      .catch(() => setDevices([]));
  }, []);

  if (loading || !user) {
    return (
      <div className="p-4 space-y-4">
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Profile Header */}
      <div className="card p-5 flex items-center gap-3.5 border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        {user.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photo_url} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-500/20" />
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: "var(--tg-theme-secondary-bg-color,#f2f2f7)" }}
          >
            {user.first_name?.[0] ?? "👤"}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-base leading-tight truncate">
              {user.first_name} {user.last_name}
            </h1>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "var(--tg-theme-secondary-bg-color,#f2f2f7)" }}
            >
              {user.role}
            </span>
          </div>
          <p className="text-xs opacity-60 mt-0.5">@{user.telegram_username ?? "—"}</p>
          <p className="text-[11px] font-mono opacity-50 mt-1">Telegram ID: {user.telegram_id}</p>
        </div>
      </div>

      {/* Section 29: My Assigned Hardware Devices */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-1.5">
            <span>💻</span>
            <span>My Assigned Devices ({devices?.length ?? 0})</span>
          </h2>
          <span className="text-[11px] opacity-60">Company Assets</span>
        </div>

        {!devices && (
          <div className="skeleton h-20 w-full" />
        )}

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
      <div className="card p-4 space-y-3 border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
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
