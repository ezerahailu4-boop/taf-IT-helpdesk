import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage, miniAppButton } from "@/lib/telegram/bot";
import type { DbTicket, DbUser, DbProjectTask } from "@/types/db";

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
    `✅ <b>IT Ticket Resolved</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `📝 <b>Issue:</b> ${ticket.subject}\n\n` +
    `🔧 <b>Resolution Note:</b>\n${resolutionNote || "Your issue has been marked resolved by our IT team."}\n\n` +
    `⭐ <b>Please rate your support experience (1–5 Stars):</b>`;

  await sendMessage(requester.telegram_id, text, {
    buttons: [
      [
        { text: "⭐ 1", callback_data: `rate:${ticket.id}:1` },
        { text: "⭐ 2", callback_data: `rate:${ticket.id}:2` },
        { text: "⭐ 3", callback_data: `rate:${ticket.id}:3` },
        { text: "⭐ 4", callback_data: `rate:${ticket.id}:4` },
        { text: "⭐ 5", callback_data: `rate:${ticket.id}:5` }
      ],
      [miniAppButton("💬 Write Review / Comment", `/tickets/${ticket.id}`)],
      [{ text: "🔄 Reopen Ticket", callback_data: `reopen:${ticket.id}` }]
    ],
    parseMode: "HTML"
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

export async function notifySlaWarning(
  db: SupabaseClient,
  ticket: DbTicket,
  technician: DbUser,
  remainingText?: string
) {
  if (!technician?.telegram_id) return;
  const timeLeft = remainingText || "Less than 20% resolution window remaining";
  const text =
    `⏰ <b>SLA RESOLUTION WARNING</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `📋 <b>Subject:</b> ${ticket.subject}\n` +
    `⚡ <b>Priority:</b> <b>${ticket.priority}</b>\n` +
    `⏳ <b>Time Remaining:</b> <code>${timeLeft}</code>\n` +
    `\n<i>Urgent action needed to resolve before deadline breach!</i>`;

  await sendMessage(technician.telegram_id, text, {
    buttons: [[miniAppButton("🎫 Open Ticket Now", `/tickets/${ticket.id}`)]],
    parseMode: "HTML"
  });
  await log(db, technician.id, ticket.id, "SLA_WARNING", "SLA resolution warning sent", text);
}

export async function notifySlaBreach(
  db: SupabaseClient,
  ticket: DbTicket,
  technician: DbUser
) {
  const techName = `${technician.first_name ?? "Technician"} ${technician.last_name ?? ""}`.trim();
  const techText =
    `🚨 <b>SLA RESOLUTION BREACHED!</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `📋 <b>Subject:</b> ${ticket.subject}\n` +
    `⚡ <b>Priority:</b> <b>${ticket.priority}</b>\n` +
    `\n🔥 <i>The agreed SLA resolution window has elapsed. Escalation alert has been triggered to IT Admins.</i>`;

  if (technician?.telegram_id) {
    await sendMessage(technician.telegram_id, techText, {
      buttons: [[miniAppButton("🎫 Resolve Ticket Immediately", `/tickets/${ticket.id}`)]],
      parseMode: "HTML"
    });
  }

  const adminText =
    `🚨 <b>CRITICAL: TICKET SLA ESCALATION BREACH</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `📋 <b>Subject:</b> ${ticket.subject}\n` +
    `⚡ <b>Priority:</b> <b>${ticket.priority}</b>\n` +
    `👨‍💻 <b>Assigned Tech:</b> ${techName} (@${technician.telegram_username || "tech"})\n` +
    `\n⚠️ <i>Ticket is unresolved and past SLA due date. Admin intervention required.</i>`;

  const { data: admins } = await db.from("users").select("*").eq("role", "ADMIN").eq("is_active", true);
  for (const admin of admins ?? []) {
    if ((admin as DbUser).telegram_id) {
      await sendMessage((admin as DbUser).telegram_id, adminText, {
        buttons: [[miniAppButton("🛡️ Inspect Ticket in Admin", `/tickets/${ticket.id}`)]],
        parseMode: "HTML"
      });
    }
  }

  await log(db, technician.id, ticket.id, "SLA_BREACH", "SLA resolution breach escalated", adminText);
}

export async function notifyResponseSlaWarning(
  db: SupabaseClient,
  ticket: DbTicket,
  technician: DbUser,
  remainingText?: string
) {
  if (!technician?.telegram_id) return;
  const timeLeft = remainingText || "Less than 20% first-response window remaining";
  const text =
    `⏰ <b>SLA FIRST-RESPONSE WARNING</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `📋 <b>Subject:</b> ${ticket.subject}\n` +
    `⚡ <b>Priority:</b> <b>${ticket.priority}</b>\n` +
    `⏳ <b>Time Remaining:</b> <code>${timeLeft}</code>\n` +
    `\n<i>Send the customer a first reply before the deadline breach!</i>`;

  await sendMessage(technician.telegram_id, text, {
    buttons: [[miniAppButton("🎫 Open Ticket Now", `/tickets/${ticket.id}`)]],
    parseMode: "HTML"
  });
  await log(db, technician.id, ticket.id, "SLA_WARNING", "SLA first-response warning sent", text);
}

export async function notifyResponseSlaBreach(
  db: SupabaseClient,
  ticket: DbTicket,
  technician: DbUser
) {
  const techName = `${technician.first_name ?? "Technician"} ${technician.last_name ?? ""}`.trim();
  const techText =
    `🚨 <b>SLA FIRST-RESPONSE BREACHED!</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `📋 <b>Subject:</b> ${ticket.subject}\n` +
    `⚡ <b>Priority:</b> <b>${ticket.priority}</b>\n` +
    `\n🔥 <i>No first reply was sent within the agreed response window. Escalation alert has been triggered to IT Admins.</i>`;

  if (technician?.telegram_id) {
    await sendMessage(technician.telegram_id, techText, {
      buttons: [[miniAppButton("🎫 Reply Immediately", `/tickets/${ticket.id}`)]],
      parseMode: "HTML"
    });
  }

  const adminText =
    `🚨 <b>TICKET FIRST-RESPONSE SLA BREACH</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `📋 <b>Subject:</b> ${ticket.subject}\n` +
    `⚡ <b>Priority:</b> <b>${ticket.priority}</b>\n` +
    `👨‍💻 <b>Assigned Tech:</b> ${techName} (@${technician.telegram_username || "tech"})\n` +
    `\n⚠️ <i>Ticket has not received a first response and is past the response SLA. Admin intervention required.</i>`;

  const { data: admins } = await db.from("users").select("*").eq("role", "ADMIN").eq("is_active", true);
  for (const admin of admins ?? []) {
    if ((admin as DbUser).telegram_id) {
      await sendMessage((admin as DbUser).telegram_id, adminText, {
        buttons: [[miniAppButton("🛡️ Inspect Ticket in Admin", `/tickets/${ticket.id}`)]],
        parseMode: "HTML"
      });
    }
  }

  await log(db, technician.id, ticket.id, "SLA_BREACH", "SLA first-response breach escalated", adminText);
}

export async function notifyProjectTaskDeadlineWarning(
  db: SupabaseClient,
  task: DbProjectTask,
  technician: DbUser,
  hoursRemaining: number
) {
  if (!technician?.telegram_id) return;
  const deadlineStr = new Date(task.deadline).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const text =
    `⚠️ <b>PROJECT TASK DEADLINE APPROACHING</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Task:</b> <b>${task.title}</b>\n` +
    `⏳ <b>Deadline:</b> <code>${deadlineStr}</code> (<b>~${Math.max(1, Math.round(hoursRemaining))}h remaining</b>)\n` +
    `📊 <b>Current Progress:</b> <b>${task.progress}%</b> (${task.status.replace(/_/g, " ")})\n` +
    `⚡ <b>Priority:</b> <b>${task.priority}</b>\n` +
    `\n<i>Please ensure all deliverable milestones are met or submit a progress report before the deadline.</i>`;

  await sendMessage(technician.telegram_id, text, {
    buttons: [
      [miniAppButton("📋 Update Progress Report", `/admin/tasks?taskId=${task.id}`)]
    ],
    parseMode: "HTML"
  });
}

export async function notifyProjectTaskDeadlineBreach(
  db: SupabaseClient,
  task: DbProjectTask,
  technician: DbUser
) {
  const deadlineStr = new Date(task.deadline).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const techName = `${technician.first_name ?? "Technician"} ${technician.last_name ?? ""}`.trim();

  // Notify technician
  if (technician?.telegram_id) {
    const techText =
      `🚨 <b>PROJECT TASK DEADLINE OVERDUE!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>Task:</b> <b>${task.title}</b>\n` +
      `⏳ <b>Due Date:</b> <code>${deadlineStr}</code>\n` +
      `📊 <b>Progress:</b> <b>${task.progress}%</b> (Incomplete)\n` +
      `⚡ <b>Priority:</b> <b>${task.priority}</b>\n` +
      `\n🔥 <i>The targeted delivery deadline has expired. This task has been escalated to IT Admin oversight.</i>`;

    await sendMessage(technician.telegram_id, techText, {
      buttons: [
        [miniAppButton("📋 Complete & Submit Report", `/admin/tasks?taskId=${task.id}`)]
      ],
      parseMode: "HTML"
    });
  }

  // Notify IT Admins
  const adminText =
    `🚨 <b>TASK DEADLINE BREACH ESCALATION</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Task:</b> <b>${task.title}</b>\n` +
    `🎯 <b>Goal:</b> ${task.goal}\n` +
    `👨‍💻 <b>Lead Tech:</b> ${techName} (@${technician.telegram_username || "tech"})\n` +
    `⏳ <b>Deadline Was:</b> <code>${deadlineStr}</code> (OVERDUE)\n` +
    `📊 <b>Status / Progress:</b> <b>${task.progress}%</b> (${task.status})\n` +
    `⚡ <b>Priority:</b> <b>${task.priority}</b>\n` +
    `\n⚠️ <i>Task is overdue without completion. Immediate review recommended.</i>`;

  const { data: admins } = await db.from("users").select("*").eq("role", "ADMIN").eq("is_active", true);
  for (const admin of admins ?? []) {
    if ((admin as DbUser).telegram_id && String((admin as DbUser).telegram_id) !== String(technician.telegram_id)) {
      await sendMessage((admin as DbUser).telegram_id, adminText, {
        buttons: [[miniAppButton("📋 Review in Task Console", `/admin/tasks?taskId=${task.id}`)]],
        parseMode: "HTML"
      });
    }
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

export async function notifyProjectTaskAssigned(
  db: SupabaseClient,
  task: DbProjectTask,
  technician: DbUser,
  adminUser?: DbUser | null
) {
  if (!technician?.telegram_id) return;
  const deadlineStr = new Date(task.deadline).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const text =
    `📌 <b>NEW PROJECT TASK ASSIGNED</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Task:</b> <b>${task.title}</b>\n` +
    `🎯 <b>Goal:</b> ${task.goal}\n` +
    `🏷️ <b>Category:</b> <b>${task.category === "UNPLANNED" ? "⚡ Unplanned" : "📅 Planned"}</b>\n` +
    `⚡ <b>Priority:</b> <b>${task.priority}</b>\n` +
    `📅 <b>Deadline:</b> <code>${deadlineStr}</code>\n` +
    (adminUser ? `👤 <b>Assigned By:</b> ${adminUser.first_name || "Admin"} (@${adminUser.telegram_username || "admin"})\n` : "") +
    `\n<i>Please review the objectives and post regular progress reports.</i>`;

  await sendMessage(technician.telegram_id, text, {
    buttons: [
      [miniAppButton("📋 Open Task & Submit Report", `/admin/tasks?taskId=${task.id}`)]
    ],
    parseMode: "HTML"
  });
}

export async function notifyProjectTaskUpdated(
  db: SupabaseClient,
  task: DbProjectTask,
  technician: DbUser,
  reportText: string,
  isCompleted: boolean
) {
  const { data: admins } = await db.from("users").select("*").eq("role", "ADMIN").eq("is_active", true);
  if (!admins || admins.length === 0) return;

  const techName = `${technician.first_name ?? "Technician"} ${technician.last_name ?? ""}`.trim();
  const header = isCompleted
    ? `🎉 <b>PROJECT TASK COMPLETED!</b>`
    : `🚀 <b>PROJECT TASK PROGRESS UPDATE</b>`;

  const text =
    `${header}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Task:</b> <b>${task.title}</b>\n` +
    `👨‍💻 <b>Technician:</b> ${techName} (@${technician.telegram_username || "tech"})\n` +
    `📊 <b>Progress:</b> <b>${task.progress}%</b> (${task.status.replace(/_/g, " ")})\n` +
    `📝 <b>Work Report:</b>\n<i>"${reportText}"</i>`;

  for (const admin of admins) {
    if ((admin as DbUser).telegram_id && String((admin as DbUser).telegram_id) !== String(technician.telegram_id)) {
      await sendMessage((admin as DbUser).telegram_id, text, {
        buttons: [[miniAppButton("📋 View Project Task", `/admin/tasks?taskId=${task.id}`)]],
        parseMode: "HTML"
      });
    }
  }
}

export async function notifyProjectTaskAwaitingSignOff(
  db: SupabaseClient,
  task: DbProjectTask,
  technician: DbUser,
  reportText?: string
) {
  const { data: admins } = await db.from("users").select("*").eq("role", "ADMIN").eq("is_active", true);
  if (!admins || admins.length === 0) return;

  const techName = `${technician.first_name ?? "Technician"} ${technician.last_name ?? ""}`.trim();
  const text =
    `📋 <b>TASK COMPLETION REVIEW REQUESTED</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📌 <b>Task:</b> <b>${task.title}</b>\n` +
    `👨‍💻 <b>Assigned Tech:</b> ${techName} (@${technician.telegram_username || "tech"})\n` +
    `📊 <b>Reported Progress:</b> <b>100% (Fieldwork Done)</b>\n` +
    `🏷️ <b>Category:</b> <b>${task.category === "UNPLANNED" ? "⚡ Unplanned" : "📅 Planned"}</b>\n` +
    (reportText ? `📝 <b>Technician Note:</b>\n<i>"${reportText}"</i>\n\n` : "\n") +
    `❓ <b>Is this task completed?</b>\n` +
    `<i>The assigned technician marked this task as finished. Admin review required — please confirm with Yes or No below:</i>`;

  for (const admin of admins) {
    if ((admin as DbUser).telegram_id && String((admin as DbUser).telegram_id) !== String(technician.telegram_id)) {
      await sendMessage((admin as DbUser).telegram_id, text, {
        buttons: [
          [
            { text: "✅ Yes, It's Completed", callback_data: `task_review:${task.id}:yes` },
            { text: "❌ No, Needs Work", callback_data: `task_review:${task.id}:no` }
          ],
          [miniAppButton("🔍 Review Task & Reports", `/admin/tasks?taskId=${task.id}`)]
        ],
        parseMode: "HTML"
      });
    }
  }
}

export async function notifyProjectTaskApproved100(
  db: SupabaseClient,
  task: DbProjectTask,
  adminUser: DbUser,
  approvalNote?: string
) {
  const assignedTechIds: string[] =
    task.assigned_technician_ids && task.assigned_technician_ids.length > 0
      ? task.assigned_technician_ids
      : task.assigned_to_id
      ? [task.assigned_to_id]
      : [];

  if (assignedTechIds.length === 0) return;

  const { data: technicians } = await db.from("users").select("*").in("id", assignedTechIds);
  if (!technicians || technicians.length === 0) return;

  const adminName = `${adminUser.first_name ?? "Admin"} ${adminUser.last_name ?? ""}`.trim();
  const text =
    `🎉 <b>PROJECT TASK VERIFIED & 100% COMPLETED!</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Task:</b> <b>${task.title}</b>\n` +
    `👔 <b>Reviewed By:</b> ${adminName} (@${adminUser.telegram_username || "admin"})\n` +
    `✅ <b>Admin Decision:</b> <b>YES — Verified & Completed</b>\n` +
    `📊 <b>Final Status:</b> <b>COMPLETED (100%)</b>\n` +
    (approvalNote ? `📝 <b>Admin Sign-off Note:</b>\n<i>"${approvalNote}"</i>\n\n` : "\n") +
    `🚀 <i>Great job! The Admin has officially verified all deliverables and confirmed completion.</i>`;

  for (const tech of technicians) {
    if ((tech as DbUser).telegram_id && String((tech as DbUser).telegram_id) !== String(adminUser.telegram_id)) {
      await sendMessage((tech as DbUser).telegram_id, text, {
        buttons: [[miniAppButton("🎯 View Completed Task", `/admin/tasks?taskId=${task.id}`)]],
        parseMode: "HTML"
      });
    }
  }
}

export async function notifyProjectTaskRevisionsRequested(
  db: SupabaseClient,
  task: DbProjectTask,
  adminUser: DbUser,
  revisionNote?: string
) {
  const assignedTechIds: string[] =
    task.assigned_technician_ids && task.assigned_technician_ids.length > 0
      ? task.assigned_technician_ids
      : task.assigned_to_id
      ? [task.assigned_to_id]
      : [];

  if (assignedTechIds.length === 0) return;

  const { data: technicians } = await db.from("users").select("*").in("id", assignedTechIds);
  if (!technicians || technicians.length === 0) return;

  const adminName = `${adminUser.first_name ?? "Admin"} ${adminUser.last_name ?? ""}`.trim();
  const text =
    `↩️ <b>TASK REVIEW: REVISIONS REQUIRED</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Task:</b> <b>${task.title}</b>\n` +
    `👔 <b>Reviewed By:</b> ${adminName} (@${adminUser.telegram_username || "admin"})\n` +
    `❌ <b>Admin Decision:</b> <b>NO — Not Completed Yet</b>\n` +
    `📊 <b>Status:</b> <b>Returned to In Progress (70%)</b>\n` +
    (revisionNote ? `📝 <b>Feedback / Changes Needed:</b>\n<i>"${revisionNote}"</i>\n\n` : "\n") +
    `⚠️ <i>Please review the feedback above, complete the necessary work, and resubmit for Admin review.</i>`;

  for (const tech of technicians) {
    if ((tech as DbUser).telegram_id && String((tech as DbUser).telegram_id) !== String(adminUser.telegram_id)) {
      await sendMessage((tech as DbUser).telegram_id, text, {
        buttons: [[miniAppButton("📋 Open Task & Update Work", `/admin/tasks?taskId=${task.id}`)]],
        parseMode: "HTML"
      });
    }
  }
}



