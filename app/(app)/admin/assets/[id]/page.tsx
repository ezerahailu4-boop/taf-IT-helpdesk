"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";
import { useTelegram } from "@/lib/telegram/useTelegram";
import { StatusPill, PriorityPill } from "@/components/StatusPill";
import { TicketCard, EmptyState, ErrorState } from "@/components/TicketCard";
import type { DbTicket, DbUser } from "@/types/db";

interface AssetDetail {
  asset: {
    id: string;
    asset_tag: string;
    type: string;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    status: "IN_USE" | "IN_STORAGE" | "IN_REPAIR" | "RETIRED";
    warranty_expires_on: string | null;
    created_at: string;
  };
  assignedUser: Pick<DbUser, "id" | "first_name" | "last_name" | "telegram_username" | "photo_url"> | null;
  department: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  relatedTickets: DbTicket[];
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showBackButton, haptic } = useTelegram();
  const [data, setData] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = () => {
    api<AssetDetail>(`/api/admin/assets/${id}`)
      .then(setData)
      .catch((e: ApiError) => setError(e.message));
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => showBackButton(() => router.back()), [showBackButton, router]);

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    try {
      await api(`/api/admin/assets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus })
      });
      haptic("light");
      load();
    } catch {
      haptic("error");
    } finally {
      setUpdating(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="p-4 space-y-3">
        <div className="skeleton h-6 w-32" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }

  const { asset, assignedUser, department, location, relatedTickets } = data;

  const isWarrantyValid = asset.warranty_expires_on
    ? new Date(asset.warranty_expires_on) > new Date()
    : null;

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-mono font-semibold" style={{ color: "var(--tg-theme-hint-color, #999)" }}>
            {asset.asset_tag}
          </span>
          <h1 className="text-xl font-bold tracking-tight">
            {asset.brand} {asset.model}
          </h1>
          <p className="text-xs opacity-75">{asset.type}</p>
        </div>
        <select
          value={asset.status}
          disabled={updating}
          onChange={(e) => updateStatus(e.target.value)}
          className="text-xs font-semibold rounded-full px-3 py-1.5 card border"
          style={{ borderColor: "rgba(0,0,0,0.1)" }}
        >
          <option value="IN_USE">🟢 In Use</option>
          <option value="IN_STORAGE">📦 In Storage</option>
          <option value="IN_REPAIR">🛠 In Repair</option>
          <option value="RETIRED">⛔ Retired</option>
        </select>
      </div>

      {/* Specifications Card */}
      <div className="card p-4 space-y-3">
        <p className="font-semibold text-sm">Asset Details</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs opacity-60 block">Serial Number</span>
            <span className="font-mono text-xs font-medium">{asset.serial_number || "—"}</span>
          </div>
          <div>
            <span className="text-xs opacity-60 block">Location</span>
            <span className="font-medium">{location?.name || "Unassigned"}</span>
          </div>
          <div>
            <span className="text-xs opacity-60 block">Department</span>
            <span className="font-medium">{department?.name || "Corporate"}</span>
          </div>
          <div>
            <span className="text-xs opacity-60 block">Warranty</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                isWarrantyValid === true
                  ? "bg-green-100 text-green-800"
                  : isWarrantyValid === false
                  ? "bg-red-100 text-red-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {asset.warranty_expires_on ? `Exp: ${asset.warranty_expires_on}` : "No Warranty Info"}
            </span>
          </div>
        </div>
      </div>

      {/* Assigned Employee */}
      <div className="card p-4 space-y-2">
        <p className="font-semibold text-sm">Assigned To</p>
        {assignedUser ? (
          <div className="flex items-center gap-3 pt-1">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
              style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}
            >
              {assignedUser.first_name?.[0] ?? "👤"}
            </div>
            <div>
              <p className="font-medium text-sm">
                {assignedUser.first_name} {assignedUser.last_name}
              </p>
              <p className="text-xs opacity-60">@{assignedUser.telegram_username || "unknown"}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs opacity-60 py-1">Device currently unassigned / in stock.</p>
        )}
      </div>

      {/* Section 30: Related Tickets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-1.5">
            <span>🎫</span>
            <span>Related Tickets ({relatedTickets.length})</span>
          </h2>
          {relatedTickets.length > 0 && (
            <span className="text-xs opacity-60">Complete device service history</span>
          )}
        </div>

        {relatedTickets.length === 0 ? (
          <div className="card p-6 text-center text-sm opacity-60">
            No service tickets logged against this device.
          </div>
        ) : (
          <div className="space-y-2">
            {relatedTickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
