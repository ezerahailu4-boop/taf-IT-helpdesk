const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN as string;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN && process.env.NODE_ENV !== "test") {
  // Don't throw at import time in dev tooling, but this must be set in production.
  console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set");
}

type InlineButton = { text: string; url?: string; callback_data?: string };

async function callTelegram(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`[telegram] ${method} failed:`, data);
  }
  return data;
}

export function miniAppButton(text: string, path = "") {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://it-helpdesk-alpha-brown.vercel.app");
  const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  const url = `${base.replace(/\/$/, "")}${cleanPath}`;
  return { text, web_app: { url } };
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: { buttons?: InlineButton[][]; parseMode?: "HTML" | "MarkdownV2" } = {}
) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode ?? "HTML"
  };
  if (opts.buttons) {
    payload.reply_markup = { inline_keyboard: opts.buttons };
  }
  return callTelegram("sendMessage", payload);
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
}

export async function setMyCommands() {
  return callTelegram("setMyCommands", {
    commands: [
      { command: "start", description: "Open IT Support" },
      { command: "help", description: "Get help" },
      { command: "mytickets", description: "View my tickets" },
      { command: "newticket", description: "Report a problem" },
      { command: "support", description: "Contact IT support" }
    ]
  });
}

export async function setWebhook(url: string, secretToken: string) {
  return callTelegram("setWebhook", { url, secret_token: secretToken, allowed_updates: ["message", "callback_query"] });
}

export async function setChatMenuButton(chatId?: number | string, url?: string) {
  const base =
    url ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://it-helpdesk-alpha-brown.vercel.app");
  const payload: Record<string, unknown> = {
    menu_button: {
      type: "web_app",
      text: "🛠 Open IT Helpdesk",
      web_app: { url: base }
    }
  };
  if (chatId) {
    payload.chat_id = chatId;
  }
  return callTelegram("setChatMenuButton", payload);
}
