"use client";
import { getTelegramWebApp } from "@/lib/telegram/useTelegram";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getInitData(): string {
  if (typeof window === "undefined") return "";

  // 1. Telegram WebApp object
  const tg = getTelegramWebApp();
  if (tg?.initData && tg.initData.length > 5) {
    try { sessionStorage.setItem("tg_init_data", tg.initData); } catch (e) {}
    return tg.initData;
  }

  // 2. SessionStorage cache
  try {
    const cached = sessionStorage.getItem("tg_init_data");
    if (cached && cached.length > 5) return cached;
  } catch (e) {}

  // 3. Location hash (#tgWebAppData=...)
  try {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const hp = new URLSearchParams(hash);
      const fromHash = hp.get("tgWebAppData");
      if (fromHash && fromHash.length > 5) {
        try { sessionStorage.setItem("tg_init_data", fromHash); } catch (e) {}
        return fromHash;
      }
    }
  } catch (e) {}

  // 4. Location search (?tgWebAppData=... or ?initData=...)
  try {
    const sp = new URLSearchParams(window.location.search);
    const fromSearch = sp.get("tgWebAppData") || sp.get("initData");
    if (fromSearch && fromSearch.length > 5) {
      try { sessionStorage.setItem("tg_init_data", fromSearch); } catch (e) {}
      return fromSearch;
    }
  } catch (e) {}

  return "";
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const initData = getInitData();
  const demoRole = typeof window !== "undefined" ? localStorage.getItem("it_helpdesk_demo_role") || "" : "";

  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": initData,
      ...(demoRole ? { "x-demo-role": demoRole } : {}),
      ...(options.headers || {})
    }
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(data?.error || "Something went wrong", res.status);
  }
  return data as T;
}

export async function uploadFile(file: File, ticketId: string) {
  const tg = getTelegramWebApp();
  const initData = tg?.initData || "";
  const demoRole = typeof window !== "undefined" ? localStorage.getItem("it_helpdesk_demo_role") || "" : "";

  const form = new FormData();
  form.append("file", file);
  form.append("ticketId", ticketId);

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "x-telegram-init-data": initData,
      ...(demoRole ? { "x-demo-role": demoRole } : {})
    },
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(data?.error || "Upload failed", res.status);
  return data;
}
