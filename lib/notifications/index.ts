import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage, miniAppButton } from "@/lib/telegram/bot";
import type { DbTicket, DbUser } from "@/types/db";

const priorityEmoji: Record<string, string> = {
  LOW: "🟢", MEDIUM: "🟡", HIGH: "🟠", CRITICAL: "🔴"
};

async function log(db: SupabaseClient, userId: string, ticketId: string | null, type: string, title: string, body?: string) {
  await db.from("notifications").insert({ user_id: userId, ticket_id: ticketId, type, title, body, sent_at: new Date().toISOString() });
}

/** Posted to the shared IT support group when a new ticket is created. */
export async function notifyNewTicketToItGroup(
  db: SupabaseClient,
  ticket: DbTicket,
  requester: DbUser,
  categoryLabel: string,
  departmentName: string,
  locationName: string
) {
  const { data: settings } = await db.from("system_settings").select("value").eq("key", "it_group_chat_id").single();
  const chatId = settings?.value;
  if (!chatId) return; // not configured yet — admin sets this in Settings

  const text =
    `🚨 <b>NEW IT TICKET</b>\n` +
    `🎫 <b>${ticket.ticket_number}</b>\n` +
    `👤 <b>${requester.first_name ?? "Employee"} ${requester.last_name ?? ""}</b>${requester.telegram_username ? ` (@${requester.telegram_username})` : ""}\n` +
    (requester.phone ? `📞 ${requester.phone}\n` : "") +
    (departmentName && departmentName !== "—" ? `🏢 ${departmentName}\n` : "") +
    `📂 ${categoryLabel}\n` +
    `${priorityEmoji[ticket.priority]} ${ticket.priority}\n` +
    `📝 ${ticket.subject}`;

  await sendMessage(chatId, text, {
    buttons: [
      [miniAppButton("👁 View Ticket", `/tickets/${ticket.id}`)],
      [{ text: "🙋 Take Ticket", callback_data: `take:${ticket.id}` }, { text: "👤 Assign", callback_data: `assign:${ticket.id}` }]
    ]
  });
}

export async function notifyTicketAssigned(db: SupabaseClient, ticket: DbTicket, requester: DbUser, technician: DbUser) {
  const text =
    `👨‍💻 Your IT ticket has been assigned.\n\n` +
    `Technician: <b>${technician.first_name ?? "Support"}</b>\nIT Support`;
  await sendMessage(requester.telegram_id, text, { buttons: [[miniAppButton("View Ticket", `/tickets/${ticket.id}`)]] });
  await log(db, requester.id, ticket.id, "TICKET_ASSIGNED", "Ticket assigned", text);
}

export async function notifyReply(
  db: SupabaseClient,
  ticket: DbTicket,
  recipient: DbUser,
  fromLabel: string,
  message: string
) {
  const text = `💬 <b>${fromLabel}</b> replied on ${ticket.ticket_number}\n\n${message}`;
  await sendMessage(recipient.telegram_id, text, { buttons: [[miniAppButton("Open Ticket", `/tickets/${ticket.id}`)]] });
  await log(db, recipient.id, ticket.id, "TICKET_REPLY", "New reply", text);
}

export async function notifyStatusChange(db: SupabaseClient, ticket: DbTicket, recipient: DbUser, from: string, to: string) {
  const text = `ℹ️ ${ticket.ticket_number} status changed:\n${from} → <b>${to}</b>`;
  await sendMessage(recipient.telegram_id, text, { buttons: [[miniAppButton("View Ticket", `/tickets/${ticket.id}`)]] });
  await log(db, recipient.id, ticket.id, "STATUS_CHANGE", "Status changed", text);
}

export async function notifyResolved(db: SupabaseClient, ticket: DbTicket, requester: DbUser, resolutionNote: string) {
  const text =
    `✅ <b>IT Ticket Resolved</b>\n${ticket.ticket_number}\n\nYour issue has been resolved.\n\nResolution:\n${resolutionNote}`;
  await sendMessage(requester.telegram_id, text, {
    buttons: [
      [{ text: "✅ Confirm Resolved", callback_data: `confirm:${ticket.id}` }, { text: "🔄 Reopen Ticket", callback_data: `reopen:${ticket.id}` }],
      [miniAppButton("Open in App", `/tickets/${ticket.id}`)]
    ]
  });
  await log(db, requester.id, ticket.id, "TICKET_RESOLVED", "Ticket resolved", text);
}

export async function notifyReopenedToItGroup(db: SupabaseClient, ticket: DbTicket) {
  const { data: settings } = await db.from("system_settings").select("value").eq("key", "it_group_chat_id").single();
  const chatId = settings?.value;
  if (!chatId) return;
  await sendMessage(chatId, `🔄 <b>Ticket reopened</b>: ${ticket.ticket_number}\n${ticket.subject}`, {
    buttons: [[miniAppButton("View Ticket", `/tickets/${ticket.id}`)]]
  });
}

export async function notifyCriticalToAdmins(db: SupabaseClient, ticket: DbTicket) {
  const { data: admins } = await db.from("users").select("*").eq("role", "ADMIN").eq("is_active", true);
  for (const admin of admins ?? []) {
    await sendMessage((admin as DbUser).telegram_id, `🔴 <b>Critical ticket</b>: ${ticket.ticket_number}\n${ticket.subject}`, {
      buttons: [[miniAppButton("View Ticket", `/tickets/${ticket.id}`)]]
    });
  }
}

export async function notifySlaWarning(db: SupabaseClient, ticket: DbTicket, technician: DbUser) {
  await sendMessage(technician.telegram_id, `⏰ SLA at risk on ${ticket.ticket_number}: "${ticket.subject}"`, {
    buttons: [[miniAppButton("Open Ticket", `/tickets/${ticket.id}`)]]
  });
}

export async function notifySlaBreach(db: SupabaseClient, ticket: DbTicket, technician: DbUser) {
  await sendMessage(technician.telegram_id, `🔥 SLA BREACHED on ${ticket.ticket_number}: "${ticket.subject}"`, {
    buttons: [[miniAppButton("Open Ticket", `/tickets/${ticket.id}`)]]
  });
  const { data: admins } = await db.from("users").select("*").eq("role", "ADMIN").eq("is_active", true);
  for (const admin of admins ?? []) {
    await sendMessage((admin as DbUser).telegram_id, `🔥 SLA breach: ${ticket.ticket_number}`, {
      buttons: [[miniAppButton("View Ticket", `/tickets/${ticket.id}`)]]
    });
  }
}
