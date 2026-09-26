"use client";
import { getTelegramWebApp } from "@/lib/telegram/useTelegram";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const tg = getTelegramWebApp();
  const initData = tg?.initData || "";
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
