"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useTelegram } from "@/lib/telegram/useTelegram";

export default function AdminSettingsPage() {
  const { haptic } = useTelegram();
  const [chatId, setChatId] = useState("");
  const [allowCritical, setAllowCritical] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<{ settings: Record<string, unknown> }>("/api/admin/settings").then((d) => {
      setChatId(d.settings.it_group_chat_id ? String(d.settings.it_group_chat_id) : "");
      setAllowCritical(Boolean(d.settings.employees_can_set_critical));
      setLoaded(true);
    });
  }, []);

  async function save() {
    await api("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        itGroupChatId: chatId ? Number(chatId) : null,
        employeesCanSetCritical: allowCritical
      })
    });
    haptic("success");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!loaded) {
    return (
      <div className="p-4 space-y-4">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }

  const managementSections = [
    { href: "/admin/departments", title: "Departments", icon: "🏢", desc: "Corporate departments and routing groups" },
    { href: "/admin/support-groups", title: "Support Teams", icon: "👥", desc: "Tiered technician groups (Network, Hardware, Systems)" },
    { href: "/admin/automation-rules", title: "Auto-Routing Rules", icon: "⚡", desc: "Rule-based ticket assignment and escalation alerts" },
    { href: "/admin/sla-policies", title: "SLA Policies", icon: "🎯", desc: "Target response and resolution deadlines" },
    { href: "/admin/audit", title: "Audit Log Trail", icon: "📜", desc: "Immutable operational activity log" },
    { href: "/admin/reports", title: "Reports & Analytics", icon: "📈", desc: "Executive metrics, response times, and compliance" }
  ];

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">System Settings & Administration</h1>
        <p className="text-xs" style={{ color: "var(--tg-theme-hint-color,#999)" }}>
          Configure bot integration, notification targets, and core IT operations
        </p>
      </div>

      {/* Bot & Notification Configuration */}
      <div className="card p-4 space-y-3.5 border" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <p className="font-semibold text-sm flex items-center gap-2">
          <span>🤖</span>
          <span>Telegram Bot & Webhook Settings</span>
        </p>

        <div className="space-y-1">
          <label className="text-xs font-semibold block">IT Support Telegram Group Chat ID</label>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="-1001234567890"
            className="w-full rounded-xl p-2.5 card text-sm font-mono border"
          />
          <p className="text-[11px] opacity-60">
            All newly created tickets and re-opened tickets are immediately announced to this chat.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
          <div>
            <p className="font-medium text-xs">Allow Employees to Select "Critical" Priority</p>
            <p className="text-[11px] opacity-60">
              When disabled, only Technicians and Admins can escalate to Critical.
            </p>
          </div>
          <input
            type="checkbox"
            checked={allowCritical}
            onChange={(e) => setAllowCritical(e.target.checked)}
            className="w-5 h-5 accent-blue-600 rounded"
          />
        </div>

        <button
          onClick={save}
          className="w-full py-2.5 rounded-full font-semibold text-xs text-white shadow-sm transition-all"
          style={{ background: "var(--tg-theme-button-color,#2481cc)" }}
        >
          {saved ? "Saved Successfully ✅" : "Save Bot Settings"}
        </button>
      </div>

      {/* Operational Modules Navigation */}
      <div className="space-y-3">
        <h2 className="font-semibold text-sm">System Management Portals</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {managementSections.map((sec) => (
            <Link
              key={sec.href}
              href={sec.href}
              className="card p-3.5 flex items-start gap-3 block hover:opacity-90 transition-all border group"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
            >
              <span className="text-2xl p-2 rounded-xl group-hover:scale-110 transition-transform" style={{ background: "var(--tg-theme-secondary-bg-color, #f2f2f7)" }}>
                {sec.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm flex items-center justify-between">
                  <span>{sec.title}</span>
                  <span className="opacity-40 text-xs group-hover:translate-x-0.5 transition-transform">→</span>
                </p>
                <p className="text-xs opacity-60 line-clamp-2 mt-0.5">{sec.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
