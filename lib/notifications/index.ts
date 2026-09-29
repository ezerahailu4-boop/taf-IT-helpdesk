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
  // 1. Notify primary dispatcher (@tinsu2025 / ID 6319536255)
  const { data: dispatcher } = await db
    .from("users")
    .select("*")
    .or("telegram_username.ilike.tinsu2025,telegram_id.eq.6319536255")
    .maybeSingle();

  const directDispatcherText =
    `📥 <b>NEW TICKET ASSIGNED TO YOU FOR TRIAGE</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `👤 <b>Requester:</b> <b>${requester.first_name ?? "Employee"} ${requester.last_name ?? ""}</b>${requester.telegram_username ? ` (@${requester.telegram_username})` : ""}\n` +
    (requester.phone ? `📞 <b>Phone:</b> ${requester.phone}\n` : "") +
    (departmentName && departmentName !== "—" ? `🏢 <b>Department:</b> ${departmentName}\n` : "") +
    `📂 <b>Category:</b> ${categoryLabel}\n` +
    `${priorityEmoji[ticket.priority] || "🟡"} <b>Priority:</b> ${ticket.priority}\n` +
    `📝 <b>Issue:</b> ${ticket.subject}\n\n` +
    `<i>You are assigned as primary triage. If you cannot resolve this directly, tap "Reassign" below to hand off to another technician.</i>`;

  const dispatcherButtons = [
    [miniAppButton("🛠 Open & Handle Ticket", `/tickets/${ticket.id}`)],
    [{ text: "👤 Reassign to Tech", callback_data: `reassign_menu:${ticket.id}` }]
  ];

  if (dispatcher?.telegram_id && Number(dispatcher.telegram_id) > 100000 && Number(dispatcher.telegram_id) !== 2025001) {
    await sendMessage(dispatcher.telegram_id, directDispatcherText, {
      buttons: dispatcherButtons,
      parseMode: "HTML"
    });
    await log(db, dispatcher.id, ticket.id, "DISPATCH_DIRECT", "Ticket dispatched to primary triage", directDispatcherText);
  }

  // 2. Post to IT Support Group if configured
  const { data: settings } = await db.from("system_settings").select("value").eq("key", "it_group_chat_id").single();
  const chatId = settings?.value;
  if (!chatId) return;

  const text =
    `🚨 <b>NEW IT TICKET</b>\n` +
    `🎫 <b>${ticket.ticket_number}</b>\n` +
    `👤 <b>${requester.first_name ?? "Employee"} ${requester.last_name ?? ""}</b>${requester.telegram_username ? ` (@${requester.telegram_username})` : ""}\n` +
    (requester.phone ? `📞 ${requester.phone}\n` : "") +
    (departmentName && departmentName !== "—" ? `🏢 ${departmentName}\n` : "") +
    `📂 ${categoryLabel}\n` +
    `${priorityEmoji[ticket.priority] || "🟡"} ${ticket.priority}\n` +
    `📝 ${ticket.subject}\n` +
    `👨‍💻 <b>Assigned To:</b> @tinsu2025 (Primary Triage)`;

  await sendMessage(chatId, text, {
    buttons: [
      [miniAppButton("👁 View Ticket", `/tickets/${ticket.id}`)],
      [{ text: "👤 Reassign to Tech", callback_data: `reassign_menu:${ticket.id}` }]
    ],
    parseMode: "HTML"
  });
}

export async function notifyTicketAssigned(db: SupabaseClient, ticket: DbTicket, requester: DbUser, technician: DbUser) {
  // 1. Notify the employee that their ticket has a technician assigned
  if (requester?.telegram_id) {
    const requesterText =
      `👨‍💻 <b>Your IT ticket has been assigned</b>\n\n` +
      `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
      `👨‍💻 <b>Assigned Technician:</b> <b>${technician.first_name ?? "Support"} ${technician.last_name ?? ""}</b>\n` +
      `Our technician is reviewing your issue.`;
    await sendMessage(requester.telegram_id, requesterText, {
      buttons: [[miniAppButton("👁 View Ticket", `/tickets/${ticket.id}`)]],
      parseMode: "HTML"
    });
    await log(db, requester.id, ticket.id, "TICKET_ASSIGNED", "Ticket assigned", requesterText);
  }

  // 2. Notify the technician that a ticket was assigned to them
  if (technician?.telegram_id) {
    const requesterName = `${requester?.first_name ?? "Employee"} ${requester?.last_name ?? ""}`.trim();
    const techText =
      `📋 <b>NEW TICKET ASSIGNED TO YOU</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
      `📝 <b>Issue:</b> ${ticket.subject}\n` +
      `👤 <b>Requester:</b> <b>${requesterName}</b>${requester?.telegram_username ? ` (@${requester.telegram_username})` : ""}\n` +
      (requester?.phone ? `📞 <b>Phone:</b> ${requester.phone}\n` : "") +
      `${priorityEmoji[ticket.priority] || "🟡"} <b>Priority:</b> ${ticket.priority}\n\n` +
      `Please review and begin triage in your console.`;

    const techButtons: any[] = [
      [miniAppButton("🛠 Open in Tech Console", `/tickets/${ticket.id}`)]
    ];

    if (requester?.telegram_username) {
      techButtons.push([
        { text: `💬 Chat with ${requester.first_name ?? "Requester"}`, url: `https://t.me/${requester.telegram_username}` }
      ]);
    }

    await sendMessage(technician.telegram_id, techText, {
      buttons: techButtons,
      parseMode: "HTML"
    });
    await log(db, technician.id, ticket.id, "TECH_ASSIGNED", "Ticket assigned to you", techText);
  }
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
    `✅ <b>IT Ticket Resolved</b>\n${ticket.ticket_number}\n\nYour issue has been resolved.\n\nResolution:\n${resolutionNote}\n\n⭐ <i>Please take a moment to rate your support experience.</i>`;
  await sendMessage(requester.telegram_id, text, {
    buttons: [
      [miniAppButton("⭐ Rate & Close Ticket", `/tickets/${ticket.id}`)],
      [{ text: "✅ Confirm Resolved", callback_data: `confirm:${ticket.id}` }, { text: "🔄 Reopen Ticket", callback_data: `reopen:${ticket.id}` }]
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

export async function notifyTicketRated(
  db: SupabaseClient,
  ticket: DbTicket,
  rating: number,
  comment: string | null,
  requesterName: string,
  technician: DbUser
) {
  if (!technician?.telegram_id) return;
  const stars = "⭐".repeat(Math.max(1, Math.min(5, rating)));
  let text =
    `🌟 <b>CSAT Support Rating Received!</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `⭐ <b>Rating:</b> ${stars} (<b>${rating}/5</b>)\n` +
    `👤 <b>Requester:</b> ${requesterName}\n`;
  if (comment) {
    text += `💬 <b>Feedback:</b> <i>"${comment}"</i>\n`;
  }
  text += `\nGreat work keeping our users supported! 🚀`;

  await sendMessage(technician.telegram_id, text, {
    buttons: [[miniAppButton("👁 View Ticket", `/tickets/${ticket.id}`)]],
    parseMode: "HTML"
  });
  await log(db, technician.id, ticket.id, "TICKET_RATED", "Ticket rated", text);
}

