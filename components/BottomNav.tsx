"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/types/db";

const NAV: Record<UserRole, { href: string; label: string; icon: string }[]> = {
  EMPLOYEE: [
    { href: "/home", label: "Home", icon: "🏠" },
    { href: "/tickets", label: "My Tickets", icon: "🎫" },
    { href: "/create", label: "Create", icon: "🛠" },
    { href: "/help", label: "Help", icon: "📚" },
    { href: "/profile", label: "Profile", icon: "👤" }
  ],
  TECHNICIAN: [
    { href: "/tech", label: "Dashboard", icon: "🏠" },
    { href: "/tickets", label: "Tickets", icon: "🎫" },
    { href: "/tickets?tab=critical", label: "Critical", icon: "🚨" },
    { href: "/tickets?tab=mine", label: "My Queue", icon: "👤" },
    { href: "/help", label: "Help", icon: "📚" }
  ],
  ADMIN: [
    { href: "/admin", label: "Dashboard", icon: "📊" },
    { href: "/tickets", label: "Tickets", icon: "🎫" },
    { href: "/admin/users", label: "Users", icon: "👥" },
    { href: "/admin/assets", label: "Assets", icon: "💻" },
    { href: "/admin/reports", label: "Reports", icon: "📈" },
    { href: "/admin/settings", label: "Settings", icon: "⚙️" }
  ]
};

export function BottomNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = NAV[role] ?? NAV.EMPLOYEE;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t safe-bottom backdrop-blur-md transition-colors"
      style={{
        background: "var(--tg-theme-bg-color, #ffffff)",
        borderColor: "rgba(0,0,0,0.08)",
        boxShadow: "0 -2px 10px rgba(0,0,0,0.03)"
      }}
    >
      <div className="max-w-3xl mx-auto">
        <ul className="flex justify-around items-center px-1">
          {items.map((item) => {
            const active =
              pathname === item.href.split("?")[0] &&
              (!item.href.includes("?") || pathname + window.location.search === item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className="flex flex-col items-center justify-center py-2 text-[10px] sm:text-[11px] font-medium transition-all group"
                  style={{
                    color: active ? "var(--tg-theme-button-color, #2481cc)" : "var(--tg-theme-hint-color, #999999)"
                  }}
                >
                  <span
                    className={`text-lg sm:text-xl leading-none transition-transform duration-150 ${
                      active ? "scale-110" : "group-hover:scale-105"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className={`mt-0.5 truncate max-w-[64px] ${active ? "font-semibold" : ""}`}>
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
