"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { DbUser } from "@/types/db";

export function TopHeader({ user }: { user: DbUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const isStaff = user.role === "TECHNICIAN" || user.role === "ADMIN";
  const isAdmin = user.role === "ADMIN";

  const getPortalInfo = () => {
    if (pathname.startsWith("/admin")) {
      return { label: "Admin Ops", icon: "🛡️", color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" };
    }
    if (pathname.startsWith("/tech")) {
      return { label: "Tech Console", icon: "👨‍💻", color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20" };
    }
    return { label: "Employee", icon: "🏠", color: "bg-slate-500/10 text-slate-600 border-slate-500/20" };
  };

  const portal = getPortalInfo();

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md transition-colors"
      style={{
        background: "var(--tg-theme-bg-color, #ffffff)",
        borderColor: "rgba(0,0,0,0.06)"
      }}
    >
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
        {/* Brand & Portal Indicator */}
        <div className="flex items-center gap-2.5">
          <Link
            href={isAdmin ? "/admin" : isStaff ? "/tech" : "/home"}
            className="flex items-center gap-2 group font-black text-sm tracking-tight text-slate-900 dark:text-white"
          >
            <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm shadow-sm">
              🛠️
            </span>
            <span className="hidden xs:inline">IT Helpdesk</span>
          </Link>

          {/* Current Portal Badge & Switcher for Staff */}
          {isStaff ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${portal.color} hover:opacity-80`}
              >
                <span>{portal.icon}</span>
                <span>{portal.label}</span>
                <span className="text-[9px] opacity-70">▾</span>
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute top-full left-0 mt-1.5 w-48 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 p-1.5 space-y-1 text-xs">
                    <p className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Switch Workspace
                    </p>

                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl font-medium transition-colors ${
                          pathname.startsWith("/admin")
                            ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 font-bold"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="text-base">🛡️</span>
                        <div>
                          <p className="font-bold leading-none">Admin Center</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Control & settings</p>
                        </div>
                      </Link>
                    )}

                    <Link
                      href="/tech"
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl font-medium transition-colors ${
                        pathname.startsWith("/tech")
                          ? "bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 font-bold"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="text-base">👨‍💻</span>
                      <div>
                        <p className="font-bold leading-none">Tech Console</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Dispatch & active work</p>
                      </div>
                    </Link>

                    <Link
                      href="/home"
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl font-medium transition-colors ${
                        !pathname.startsWith("/admin") && !pathname.startsWith("/tech")
                          ? "bg-slate-100 dark:bg-slate-800 font-bold"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="text-base">🏠</span>
                      <div>
                        <p className="font-bold leading-none">Employee View</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Submit & track tickets</p>
                      </div>
                    </Link>
                  </div>
                </>
              )}
            </div>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              Employee
            </span>
          )}
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:opacity-80 transition-opacity"
          >
            <span>🔍</span>
            <span className="hidden sm:inline">Search...</span>
          </Link>

          <Link
            href="/create"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all"
            style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
          >
            <span>+</span>
            <span>New Ticket</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
