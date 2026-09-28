"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/types/db";

const NAV: Record<UserRole, { href: string; label: string; icon: string }[]> = {
  EMPLOYEE: [
    { href: "/home", label: "Home", icon: "🏠" },
    { href: "/tickets", label: "My Tickets", icon: "🎫" },
    { href: "/create", label: "Create", icon: "➕" },
    { href: "/help", label: "Help", icon: "📚" },
    { href: "/profile", label: "Profile", icon: "👤" }
  ],
  TECHNICIAN: [
    { href: "/tech", label: "Workbench", icon: "👨‍💻" },
    { href: "/tickets", label: "Queue", icon: "🎫" },
    { href: "/tickets?tab=critical", label: "Critical", icon: "🚨" },
    { href: "/help", label: "Help", icon: "📚" },
    { href: "/profile", label: "Profile", icon: "👤" }
  ],
  ADMIN: [
    { href: "/admin", label: "Control", icon: "🛡️" },
    { href: "/tech", label: "Tech Desk", icon: "👨‍💻" },
    { href: "/tickets", label: "Queue", icon: "🎫" },
    { href: "/admin/reports", label: "Reports", icon: "📈" },
    { href: "/admin/settings", label: "Settings", icon: "⚙️" }
  ]
};

export function BottomNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = NAV[role] ?? NAV.EMPLOYEE;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 dark:border-slate-800/80 safe-bottom bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-lg transition-colors">
      <div className="max-w-md sm:max-w-xl mx-auto">
        <ul className="flex justify-around items-center px-2 py-1">
          {items.map((item) => {
            const baseHref = item.href.split("?")[0];
            const active = pathname === baseHref;

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`flex flex-col items-center justify-center py-1.5 text-[11px] font-medium transition-all group ${
                    active
                      ? "text-indigo-600 dark:text-indigo-400 font-bold"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <span
                    className={`text-xl transition-transform duration-150 ${
                      active ? "scale-110 drop-shadow-sm" : "group-hover:scale-105 opacity-80"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className={`mt-0.5 tracking-tight ${active ? "font-bold" : ""}`}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
