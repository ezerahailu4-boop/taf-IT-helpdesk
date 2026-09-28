"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getTelegramWebApp } from "@/lib/telegram/useTelegram";
import type { UserRole } from "@/types/db";

export function DemoRoleSwitcher({ currentRole }: { currentRole?: UserRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole>(currentRole || "EMPLOYEE");
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("it_helpdesk_demo_role") as UserRole;
    if (saved) setRole(saved);
  }, []);

  // Only show switcher if not in native telegram webapp with fixed initData or if explicitly enabled
  const tg = getTelegramWebApp();
  const isNativeTgWithInitData = Boolean(tg?.initData && tg.initData.length > 20);

  if (!mounted || isNativeTgWithInitData) return null;

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    localStorage.setItem("it_helpdesk_demo_role", newRole);
    setIsOpen(false);

    // Navigate to role's primary landing view
    if (newRole === "ADMIN" && !pathname.startsWith("/admin")) {
      router.push("/admin");
    } else if (newRole === "TECHNICIAN" && !pathname.startsWith("/tech")) {
      router.push("/tech");
    } else if (newRole === "EMPLOYEE" && (pathname.startsWith("/admin") || pathname.startsWith("/tech"))) {
      router.push("/home");
    } else {
      window.location.reload();
    }
  };

  const roleMeta: Record<UserRole, { label: string; icon: string; name: string }> = {
    EMPLOYEE: { label: "Employee", icon: "👤", name: "Ezera (Finance)" },
    TECHNICIAN: { label: "Technician", icon: "👨‍💻", name: "Daniel (Network Team)" },
    ADMIN: { label: "Admin", icon: "⚙️", name: "Sarah (IT Manager)" }
  };

  return (
    <div className="fixed bottom-20 right-3 sm:right-6 z-50 text-xs">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold shadow-lg transition-all border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:scale-105"
          title="Switch Demo Persona"
        >
          <span>{roleMeta[role].icon}</span>
          <span className="font-bold">{roleMeta[role].label}</span>
          <span className="opacity-60 text-[10px]">▼</span>
        </button>

        {isOpen && (
          <div className="absolute right-0 bottom-full mb-2 w-56 rounded-2xl p-1.5 shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white animate-in fade-in">
            <div className="px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase opacity-60">
              Demo Persona Switcher
            </div>
            {(["EMPLOYEE", "TECHNICIAN", "ADMIN"] as UserRole[]).map((r) => (
              <button
                key={r}
                onClick={() => handleRoleChange(r)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  role === r ? "font-semibold" : "opacity-80 hover:opacity-100"
                }`}
                style={
                  role === r
                    ? {
                        background: "var(--tg-theme-button-color, #2481cc)",
                        color: "var(--tg-theme-button-text-color, #ffffff)"
                      }
                    : {}
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{roleMeta[r].icon}</span>
                  <div>
                    <p className="leading-tight">{roleMeta[r].label}</p>
                    <p className="text-[10px] opacity-75">{roleMeta[r].name}</p>
                  </div>
                </div>
                {role === r && <span>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
