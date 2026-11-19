const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN as string;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN && process.env.NODE_ENV !== "test") {
  // Don't throw at import time in dev tooling, but this must be set in production.
  console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set");
}

type InlineButton = { text: string; url?: string; callback_data?: string; web_app?: { url: string } };

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
  opts: {
    buttons?: InlineButton[][];
    parseMode?: "HTML" | "MarkdownV2";
    replyMarkup?: Record<string, unknown>;
  } = {}
) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode ?? "HTML"
  };
  if (opts.replyMarkup) {
    payload.reply_markup = opts.replyMarkup;
  } else if (opts.buttons) {
    payload.reply_markup = { inline_keyboard: opts.buttons };
  }
  return callTelegram("sendMessage", payload);
}

/**
 * Sends a file/document (such as a generated PDF report) directly to a Telegram chat.
 */
export async function sendDocument(
  chatId: number | string,
  fileBytes: Uint8Array | Buffer,
  filename: string,
  opts: {
    caption?: string;
    parseMode?: "HTML" | "MarkdownV2";
    buttons?: InlineButton[][];
    mimeType?: string;
  } = {}
) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  const arrayCopy = new Uint8Array(fileBytes);
  const blob = new Blob([arrayCopy], { type: opts.mimeType ?? "application/pdf" });
  form.append("document", blob, filename);

  if (opts.caption) {
    form.append("caption", opts.caption);
    form.append("parse_mode", opts.parseMode ?? "HTML");
  }
  if (opts.buttons) {
    form.append("reply_markup", JSON.stringify({ inline_keyboard: opts.buttons }));
  }

  const res = await fetch(`${API}/sendDocument`, {
    method: "POST",
    body: form
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`[telegram] sendDocument failed for chat ${chatId}:`, data);
  }
  return data;
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
      { command: "dailyreport", description: "Daily Sub-Tasks PDF (Admins)" },
      { command: "support", description: "Contact IT support" }
    ]
  });
}

export async function setWebhook(url: string, secretToken: string) {
  return callTelegram("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query", "my_chat_member"]
  });
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
