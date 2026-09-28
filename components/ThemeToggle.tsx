"use client";
import { useEffect, useState } from "react";
import { getTelegramWebApp } from "@/lib/telegram/useTelegram";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("it_helpdesk_theme");
    const tg = getTelegramWebApp();
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme: "light" | "dark" =
      saved === "dark" || saved === "light"
        ? saved
        : tg?.colorScheme === "dark" || tg?.colorScheme === "light"
        ? tg.colorScheme
        : prefersDark
        ? "dark"
        : "dark"; // Default to sleek dark mode for high-end look

    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const applyTheme = (t: "light" | "dark") => {
    const root = document.documentElement;
    if (t === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("it_helpdesk_theme", next);
    applyTheme(next);
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggleTheme}
      className="w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-all border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 hover:scale-105 active:scale-95"
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
