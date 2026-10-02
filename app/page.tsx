"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTelegram } from "@/lib/telegram/useTelegram";
import { useMe } from "@/lib/useMe";

export default function RootPage() {
  const router = useRouter();
  const { ready } = useTelegram();
  const { user, loading, error } = useMe();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === "ADMIN") router.replace("/admin");
    else if (user.role === "TECHNICIAN") router.replace("/tech");
    else router.replace("/home");
  }, [user, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-6">
      <div className="w-16 h-16 rounded-3xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center text-3xl shadow-sm animate-pulse">
        🛠️
      </div>

      <div className="space-y-1.5 max-w-sm">
        <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
          TAF IT Helpdesk
        </h1>
        <p className="text-xs text-slate-500">
          {loading && !timedOut ? "Connecting to your workspace..." : "Select your IT workspace to continue:"}
        </p>
      </div>

      {loading && !timedOut ? (
        <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold py-4">
          <div className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
          <span>Authenticating...</span>
        </div>
      ) : (
        <div className="w-full max-w-xs space-y-2.5 pt-1">
          <Link
            href="/admin"
            className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-between shadow-md transition-all active:scale-95"
          >
            <span className="flex items-center gap-2">
              <span>🛡️</span>
              <span>Admin Command Center</span>
            </span>
            <span>→</span>
          </Link>

          <Link
            href="/tech"
            className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-between shadow-sm transition-all active:scale-95"
          >
            <span className="flex items-center gap-2">
              <span>👨‍💻</span>
              <span>Technician Console</span>
            </span>
            <span>→</span>
          </Link>

          <Link
            href="/home"
            className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-between shadow-sm transition-all active:scale-95"
          >
            <span className="flex items-center gap-2">
              <span>🏠</span>
              <span>Employee Portal</span>
            </span>
            <span>→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
