"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DbUser } from "@/types/db";

export function TopHeader({ user }: { user: DbUser }) {
  const pathname = usePathname();

  const isStaff = user.role === "TECHNICIAN" || user.role === "ADMIN";

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md transition-colors"
      style={{
        background: "var(--tg-theme-bg-color, #ffffff)",
        borderColor: "rgba(0,0,0,0.06)"
      }}
    >
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={user.role === "ADMIN" ? "/admin" : user.role === "TECHNICIAN" ? "/tech" : "/home"} className="flex items-center gap-2 group">
            <span className="text-xl">🛠</span>
            <div>
              <span className="font-bold text-sm tracking-tight">IT Helpdesk</span>
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  background: "var(--tg-theme-secondary-bg-color, #f2f2f7)",
                  color: "var(--tg-theme-hint-color, #888)"
                }}
              >
                {user.role}
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2 pr-16 sm:pr-24">
          <Link
            href="/search"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-opacity"
            style={{
              background: "var(--tg-theme-secondary-bg-color, #f2f2f7)",
              color: "var(--tg-theme-hint-color, #666)"
            }}
          >
            <span>🔍</span>
            <span className="hidden sm:inline">Search...</span>
          </Link>

          {user.role === "EMPLOYEE" && (
            <Link
              href="/create"
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white shadow-sm"
              style={{ background: "var(--tg-theme-button-color, #2481cc)" }}
            >
              <span>+</span>
              <span>New Ticket</span>
            </Link>
          )}

          {isStaff && (
            <Link
              href="/tickets"
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: "var(--tg-theme-secondary-bg-color, #f2f2f7)",
                color: "var(--tg-theme-text-color, #111)"
              }}
            >
              <span>Queue</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
