"use client";
import { useEffect, useState, useCallback } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp: any;
    };
  }
}

export function getTelegramWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * Central hook for Telegram Mini App integration. Call once near the root
 * of each screen that needs the back button / main button / theme.
 */
export function useTelegram() {
  const [ready, setReady] = useState(false);
  const [initData, setInitData] = useState<string>("");
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg) {
      // Running outside Telegram (e.g. local dev in a plain browser) — degrade gracefully.
      setReady(true);
      return;
    }
    tg.ready();
    tg.expand();
    setInitData(tg.initData || "");
    setColorScheme(tg.colorScheme || "light");
    applyThemeVars(tg.themeParams || {});
    const onThemeChange = () => {
      setColorScheme(tg.colorScheme || "light");
      applyThemeVars(tg.themeParams || {});
    };
    tg.onEvent?.("themeChanged", onThemeChange);
    setReady(true);
    return () => tg.offEvent?.("themeChanged", onThemeChange);
  }, []);

  const showMainButton = useCallback((text: string, onClick: () => void) => {
    const tg = getTelegramWebApp();
    if (!tg?.MainButton) return () => {};
    tg.MainButton.setText(text);
    tg.MainButton.show();
    tg.MainButton.onClick(onClick);
    return () => {
      tg.MainButton.offClick(onClick);
      tg.MainButton.hide();
    };
  }, []);

  const showBackButton = useCallback((onClick: () => void) => {
    const tg = getTelegramWebApp();
    if (!tg?.BackButton) return () => {};
    tg.BackButton.show();
    tg.BackButton.onClick(onClick);
    return () => {
      tg.BackButton.offClick(onClick);
      tg.BackButton.hide();
    };
  }, []);

  const haptic = useCallback((style: "light" | "medium" | "heavy" | "success" | "error" = "light") => {
    const tg = getTelegramWebApp();
    if (!tg?.HapticFeedback) return;
    if (["success", "error"].includes(style)) tg.HapticFeedback.notificationOccurred(style);
    else tg.HapticFeedback.impactOccurred(style);
  }, []);

  return { ready, initData, colorScheme, showMainButton, showBackButton, haptic };
}

function applyThemeVars(theme: Record<string, string>) {
  const root = document.documentElement;
  const map: Record<string, string> = {
    bg_color: "--tg-theme-bg-color",
    text_color: "--tg-theme-text-color",
    hint_color: "--tg-theme-hint-color",
    link_color: "--tg-theme-link-color",
    button_color: "--tg-theme-button-color",
    button_text_color: "--tg-theme-button-text-color",
    secondary_bg_color: "--tg-theme-secondary-bg-color",
    section_bg_color: "--tg-theme-section-bg-color"
  };
  for (const [key, cssVar] of Object.entries(map)) {
    if (theme[key]) root.style.setProperty(cssVar, `#${theme[key].replace("#", "")}`);
  }
}
