"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { EmptyState } from "@/components/TicketCard";

interface Asset {
  id: string;
  asset_tag: string;
  type: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: "IN_USE" | "IN_STORAGE" | "IN_REPAIR" | "RETIRED";
  warranty_expires_on: string | null;
}

export default function AdminAssetsPage() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [tag, setTag] = useState("");
  const [type, setType] = useState("Laptop");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [warranty, setWarranty] = useState("");

  const load = () => api<{ assets: Asset[] }>("/api/admin/assets").then((d) => setAssets(d.assets));
  useEffect(() => { load(); }, []);

  async function add() {
    if (!tag.trim() || !type.trim()) return;
    await api("/api/admin/assets", {
      method: "POST",
      body: JSON.stringify({
        assetTag: tag.trim(),
        type,
        brand: brand.trim() || null,
        model: model.trim() || null,
        serialNumber: serial.trim() || null,
        warrantyExpiresOn: warranty || null
      })
    });
    setTag(""); setType("Laptop"); setBrand(""); setModel(""); setSerial(""); setWarranty("");
    setShowAdd(false);
    load();
  }

  const assetTypes = ["Laptop", "Desktop", "Printer", "Phone", "Monitor", "Router", "Switch", "Server"];

  const filteredAssets = assets?.filter((a) => filterType === "ALL" || a.type === filterType);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">IT Asset Registry</h1>
          <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
            Manage company devices, servers, and hardware inventory
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-xs font-semibold px-3.5 py-2 rounded-full shadow-sm"
          style={{ background: "var(--tg-theme-button-color,#2481cc)", color: "#fff" }}
        >
          {showAdd ? "✕ Cancel" : "+ Register Asset"}
        </button>
      </div>

      {showAdd && (
        <div className="card p-4 space-y-3 border" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="font-semibold text-sm">Register New Hardware Asset</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium block mb-1">Asset Tag</label>
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="e.g. IT-LAP-00130"
                className="w-full rounded-xl p-2.5 card text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Asset Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-xl p-2.5 card text-xs"
              >
                {assetTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium block mb-1">Brand</label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Dell, Apple, HP"
                className="w-full rounded-xl p-2.5 card text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. Latitude 5440"
                className="w-full rounded-xl p-2.5 card text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium block mb-1">Serial Number</label>
              <input
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="Serial / Service Tag"
                className="w-full rounded-xl p-2.5 card text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Warranty Expiry</label>
              <input
                type="date"
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
                className="w-full rounded-xl p-2.5 card text-xs"
              />
            </div>
          </div>

          <button
            onClick={add}
            disabled={!tag.trim()}
            className="w-full py-2.5 rounded-full font-medium text-xs disabled:opacity-50"
            style={{ background: "var(--tg-theme-button-color,#2481cc)", color: "#fff" }}
          >
            Save Asset
          </button>
        </div>
      )}

      {/* Filter by Type */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
        <button
          onClick={() => setFilterType("ALL")}
          className="px-3 py-1 rounded-full font-medium whitespace-nowrap"
          style={{
            background: filterType === "ALL" ? "var(--tg-theme-button-color,#2481cc)" : "var(--tg-theme-secondary-bg-color,#f2f2f7)",
            color: filterType === "ALL" ? "#fff" : "var(--tg-theme-text-color,#111)"
          }}
        >
          All ({assets?.length ?? 0})
        </button>
        {assetTypes.map((t) => {
          const count = assets?.filter((a) => a.type === t).length ?? 0;
          if (count === 0 && filterType !== t) return null;
          return (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className="px-3 py-1 rounded-full font-medium whitespace-nowrap"
              style={{
                background: filterType === t ? "var(--tg-theme-button-color,#2481cc)" : "var(--tg-theme-secondary-bg-color,#f2f2f7)",
                color: filterType === t ? "#fff" : "var(--tg-theme-text-color,#111)"
              }}
            >
              {t} ({count})
            </button>
          );
        })}
      </div>

      {/* Assets List */}
      <div className="space-y-2">
        {!filteredAssets && (
          <div className="space-y-2">
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-16 w-full" />
          </div>
        )}

        {filteredAssets?.map((a) => (
          <Link
            key={a.id}
            href={`/admin/assets/${a.id}`}
            className="card p-3.5 flex items-center justify-between block hover:opacity-90 transition-all border"
            style={{ borderColor: "rgba(0,0,0,0.04)" }}
          >
            <div>
              <p className="font-semibold text-sm">
                {a.type} — {a.brand} {a.model}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono font-medium" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
                  {a.asset_tag}
                </span>
                {a.serial_number && (
                  <span className="text-[11px] opacity-60">· S/N: {a.serial_number}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  background:
                    a.status === "IN_USE"
                      ? "#EBFDF2"
                      : a.status === "IN_REPAIR"
                      ? "#FEF3F2"
                      : "var(--tg-theme-secondary-bg-color,#f2f2f7)",
                  color:
                    a.status === "IN_USE"
                      ? "#0F7A3D"
                      : a.status === "IN_REPAIR"
                      ? "#B42318"
                      : "inherit"
                }}
              >
                {a.status.replace("_", " ")}
              </span>
              <span className="opacity-40 text-xs">→</span>
            </div>
          </Link>
        ))}

        {filteredAssets?.length === 0 && (
          <EmptyState icon="💻" title="No assets match this filter." />
        )}
      </div>
    </div>
  );
}
