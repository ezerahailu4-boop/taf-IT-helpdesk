import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendMessage, answerCallbackQuery, miniAppButton } from "@/lib/telegram/bot";
import { recordStatusChange, writeAudit } from "@/lib/tickets/audit";
import { notifyTicketAssigned, notifyTicketRated } from "@/lib/notifications";

/**
 * Telegram calls this webhook for every update. We verify the shared secret
 * header Telegram attaches (configured via setWebhook secret_token) before
 * processing anything — this stops anyone else from posting fake updates.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = await req.json();
  const db = supabaseAdmin();

  try {
    if (update.message) {
      await handleMessage(db, update.message);
    } else if (update.callback_query) {
      await handleCallback(db, update.callback_query);
    }
  } catch (err) {
    console.error("[telegram webhook] error handling update:", err);
    // Always 200 back to Telegram so it doesn't endlessly retry a poison update.
  }

  return NextResponse.json({ ok: true });
}

async function upsertUserFromTelegram(db: ReturnType<typeof supabaseAdmin>, from: any) {
  const username = (from.username || "").toLowerCase();
  const TECH_USERNAMES = ["tinsu2025", "mati20", "kirabelll", "ik8927"];
  const ADMIN_USERNAMES = ["ezrsh_404", "not_adonay"];
  const TECH_IDS = ["6319536255", "7434354672"];
  const ADMIN_IDS = ["883942515", "2074368152"];

  const isDesignatedAdmin = ADMIN_IDS.includes(String(from.id)) || ADMIN_USERNAMES.includes(username);
  const isDesignatedTech = TECH_IDS.includes(String(from.id)) || TECH_USERNAMES.includes(username);

function cleanName(val: string | null | undefined): string {
  if (!val) return "";
  return val.replace(/😘+/gu, "").trim();
}

  let { data: existing } = await db.from("users").select("*").eq("telegram_id", from.id).maybeSingle();

  // If not found by telegram_id, check if pre-seeded by username
  if (!existing && from.username) {
    const { data: byUsername } = await db.from("users").select("*").ilike("telegram_username", from.username).maybeSingle();
    if (byUsername) {
      existing = byUsername;
      const targetRole = isDesignatedAdmin ? "ADMIN" : (isDesignatedTech || existing.role === "TECHNICIAN") ? "TECHNICIAN" : existing.role;
      await db.from("users").update({
        telegram_id: from.id,
        first_name: cleanName(from.first_name || existing.first_name) || "User",
        last_name: cleanName(from.last_name || existing.last_name),
        role: targetRole,
        is_registered: true,
        is_active: true,
        last_active_at: new Date().toISOString()
      }).eq("id", existing.id);
      existing.telegram_id = from.id;
      existing.role = targetRole;
      return existing;
    }
  }

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (from.username && from.username !== existing.telegram_username) {
      updates.telegram_username = from.username;
    }
    if (isDesignatedAdmin && existing.role !== "ADMIN") {
      updates.role = "ADMIN";
      existing.role = "ADMIN";
    } else if (isDesignatedTech && existing.role === "EMPLOYEE") {
      updates.role = "TECHNICIAN";
      existing.role = "TECHNICIAN";
    }
    if (Object.keys(updates).length > 0) {
      await db.from("users").update(updates).eq("id", existing.id);
    }
    return existing;
  }

  const { data: created } = await db
    .from("users")
    .insert({
      telegram_id: from.id,
      telegram_username: from.username,
      first_name: cleanName(from.first_name) || "User",
      last_name: cleanName(from.last_name),
      role: isDesignatedAdmin ? "ADMIN" : isDesignatedTech ? "TECHNICIAN" : "EMPLOYEE",
      is_registered: isDesignatedAdmin || isDesignatedTech ? true : false,
      is_active: true
    })
    .select("*")
    .single();
  return created;
}

async function handleMessage(db: ReturnType<typeof supabaseAdmin>, message: any) {
  const chatId = message.chat.id;
  const text: string = (message.text ?? "").trim();
  const from = message.from;
  const user = await upsertUserFromTelegram(db, from);

  // 1. Explicit /name or /register command
  if (text.startsWith("/name") || text.startsWith("/register")) {
    const rawName = text.replace(/^\/(name|register)/i, "").trim();
    if (!rawName) {
      await sendMessage(
        chatId,
        `📝 <b>Update Your Employee Name:</b>\nPlease reply with your full name, for example:\n<code>/name abebe kebede</code>`,
        { parseMode: "HTML" }
      );
      return;
    }
    const parts = rawName.split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";

    await db.from("users").update({
      first_name: firstName,
      last_name: lastName,
      is_registered: true,
      telegram_username: from.username || user.telegram_username,
      last_active_at: new Date().toISOString()
    }).eq("id", user.id);

    await sendMessage(
      chatId,
      `✅ <b>Profile Updated!</b>\n\nYour official name is now registered as:\n👤 <b>${firstName} ${lastName}</b>\nTelegram: @${from.username || "none"}\nID: <code>#${from.id}</code>\n\nOur IT team will see your official name on all your tickets.`,
      {
        parseMode: "HTML",
        buttons: [
          [miniAppButton("🛠 Open IT Helpdesk", user?.role === "ADMIN" ? "/admin" : user?.role === "TECHNICIAN" ? "/tech" : "/home")],
          [miniAppButton("🎫 My Tickets", "/tickets")]
        ]
      }
    );
    return;
  }

  // 2. If user is NOT yet registered
  if (!user.is_registered) {
    if (text.startsWith("/start")) {
      await sendMessage(
        chatId,
        `👋 <b>Welcome to Company IT Support!</b>\n\nTo ensure our IT technicians and managers can identify you on tickets, please reply with your <b>Full Name</b> (First & Last Name):\n\n<i>Example: abebe kebede</i>`,
        { parseMode: "HTML" }
      );
      return;
    }

    // Free text: treat as full name registration
    if (!text.startsWith("/")) {
      const parts = text.split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";

      await db.from("users").update({
        first_name: firstName,
        last_name: lastName,
        is_registered: true,
        telegram_username: from.username || user.telegram_username,
        last_active_at: new Date().toISOString()
      }).eq("id", user.id);

      await sendMessage(
        chatId,
        `✅ <b>Registration Successful!</b>\n\nWelcome, <b>${firstName} ${lastName}</b>!\nYour IT employee profile is now connected.\n\nTechnicians will now see your official name on all your support requests.`,
        {
          parseMode: "HTML",
          buttons: [
            [miniAppButton("🛠 Open IT Helpdesk", user?.role === "ADMIN" ? "/admin" : user?.role === "TECHNICIAN" ? "/tech" : "/home")],
            [miniAppButton("🎫 My Tickets", "/tickets")],
            [miniAppButton("📚 Help Center", "/help")]
          ]
        }
      );
      return;
    }
  }

  // 3. User is registered
  const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || from.first_name || "Employee";

  if (text.startsWith("/start")) {
    const isStaff = user?.role === "ADMIN" || user?.role === "TECHNICIAN";
    const buttons =
      user?.role === "ADMIN"
        ? [
            [miniAppButton("🛡️ Admin Command Center", "/admin")],
            [miniAppButton("👨‍💻 Technician Workbench", "/tech")],
            [miniAppButton("🎫 Ticket Queue", "/tickets")],
            [miniAppButton("📚 Help Center", "/help")]
          ]
        : user?.role === "TECHNICIAN"
        ? [
            [miniAppButton("👨‍💻 Technician Workbench", "/tech")],
            [miniAppButton("🎫 My Queue", "/tickets")],
            [miniAppButton("📚 Help Center", "/help")]
          ]
        : [
            [miniAppButton("🛠 Open IT Helpdesk", "/home")],
            [miniAppButton("🎫 My Tickets", "/tickets")],
            [miniAppButton("📚 Help Center", "/help")]
          ];

    await sendMessage(
      chatId,
      `👋 <b>Welcome to Company IT Support</b>\nHello, <b>${fullName}</b>!${isStaff ? ` (Role: <b>${user.role}</b>)` : ""}\nHow can we help you today?\n\n<i>(To update your name anytime, send <code>/name Your Name</code>)</i>`,
      {
        parseMode: "HTML",
        buttons
      }
    );
    return;
  }

  if (text.startsWith("/help")) {
    await sendMessage(chatId, "Need help? Open the Help Center in the app, or describe your issue with /newticket.", {
      buttons: [[miniAppButton("📚 Help Center", "/help")]]
    });
    return;
  }

  if (text.startsWith("/mytickets")) {
    await sendMessage(chatId, "Here's your ticket list:", { buttons: [[miniAppButton("🎫 My Tickets", "/tickets")]] });
    return;
  }

  if (text.startsWith("/newticket")) {
    await sendMessage(chatId, "Let's get you help — tell us what's going on:", { buttons: [[miniAppButton("🛠 Report a Problem", "/create")]] });
    return;
  }

  if (text.startsWith("/support")) {
    await sendMessage(chatId, "Opening IT Support...", { buttons: [[miniAppButton("🛠 Open IT Helpdesk", "/home")]] });
    return;
  }

  // Any other free-text message: gentle nudge toward the Mini App
  await sendMessage(chatId, `Hello <b>${fullName}</b>, you can report an issue or check your tickets right here:`, {
    parseMode: "HTML",
    buttons: [[miniAppButton("🛠 Open IT Helpdesk", "/home")]]
  });
}

async function handleCallback(db: ReturnType<typeof supabaseAdmin>, cb: any) {
  const [action, ticketId] = String(cb.data ?? "").split(":");
  const user = await upsertUserFromTelegram(db, cb.from);

  const { data: ticket } = await db.from("tickets").select("*").eq("id", ticketId).single();
  if (!ticket) {
    await answerCallbackQuery(cb.id, "Ticket not found");
    return;
  }

  switch (action) {
    case "take": {
      if (user.role === "EMPLOYEE") {
        await answerCallbackQuery(cb.id, "Only IT staff can take tickets");
        return;
      }
      if (ticket.assigned_technician_id && ticket.assigned_technician_id !== user.id) {
        await answerCallbackQuery(cb.id, "Already taken by someone else");
        return;
      }
      const newStatus = ticket.status === "NEW" ? "ASSIGNED" : ticket.status;
      const { data: updated } = await db
        .from("tickets")
        .update({ assigned_technician_id: user.id, status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", ticket.id).select("*").single();
      await recordStatusChange(db, { ticketId: ticket.id, changedBy: user.id, from: ticket.status, to: newStatus });
      await writeAudit(db, { actorId: user.id, action: "TAKE", objectType: "ticket", objectId: ticket.id });
      const { data: requester } = await db.from("users").select("*").eq("id", ticket.requester_id).single();
      if (requester && updated) await notifyTicketAssigned(db, updated, requester, user);
      await answerCallbackQuery(cb.id, "Ticket assigned to you ✅");
      break;
    }
    case "reassign_menu":
    case "assign": {
      if (user.role === "EMPLOYEE") {
        await answerCallbackQuery(cb.id, "Only technicians can reassign tickets");
        return;
      }

      const { data: staffList } = await db
        .from("users")
        .select("id, first_name, last_name, telegram_username, role")
        .in("role", ["TECHNICIAN", "ADMIN"])
        .eq("is_active", true);

      const candidates = (staffList ?? []).filter((s: any) => s.id !== user.id);

      if (candidates.length === 0) {
        await answerCallbackQuery(cb.id, "No other technicians found to reassign to");
        return;
      }

      const techButtons = candidates.map((s: any) => [
        {
          text: `👨‍💻 ${s.first_name} ${s.last_name || ""} (@${s.telegram_username || "tech"})`,
          callback_data: `reassign_to:${ticket.id}:${s.id}`
        }
      ]);

      await sendMessage(
        cb.from.id,
        `👤 <b>Reassign Ticket ${ticket.ticket_number}</b>\nTap a technician to assign this ticket to:`,
        {
          buttons: techButtons,
          parseMode: "HTML"
        }
      );
      await answerCallbackQuery(cb.id, "Choose technician from list");
      break;
    }
    case "reassign_to": {
      const [, tId, targetTechId] = String(cb.data ?? "").split(":");
      if (user.role === "EMPLOYEE") {
        await answerCallbackQuery(cb.id, "Only technicians can reassign tickets");
        return;
      }

      const { data: targetTech } = await db.from("users").select("*").eq("id", targetTechId).single();
      if (!targetTech) {
        await answerCallbackQuery(cb.id, "Selected technician not found");
        return;
      }

      const now = new Date().toISOString();
      const { data: updated } = await db
        .from("tickets")
        .update({
          assigned_technician_id: targetTech.id,
          status: "ASSIGNED",
          updated_at: now
        })
        .eq("id", ticket.id)
        .select("*")
        .single();

      await recordStatusChange(db, {
        ticketId: ticket.id,
        changedBy: user.id,
        from: ticket.status,
        to: "ASSIGNED",
        note: `Reassigned by @${user.telegram_username || user.first_name} to ${targetTech.first_name}`
      });

      await writeAudit(db, {
        actorId: user.id,
        action: "ASSIGN",
        objectType: "ticket",
        objectId: ticket.id,
        newValue: { assigned_technician_id: targetTech.id }
      });

      const { data: requester } = await db.from("users").select("*").eq("id", ticket.requester_id).single();
      if (targetTech.telegram_id && requester && updated) {
        await notifyTicketAssigned(db, updated, requester, targetTech);
      }

      await answerCallbackQuery(cb.id, `Reassigned to ${targetTech.first_name} ✅`);
      await sendMessage(
        cb.from.id,
        `✅ <b>Ticket ${ticket.ticket_number} Reassigned!</b>\nSuccessfully handed off to <b>${targetTech.first_name} ${targetTech.last_name || ""}</b> (@${targetTech.telegram_username || "tech"}).`,
        { parseMode: "HTML" }
      );
      break;
    }
    case "confirm": {
      if (ticket.requester_id !== user.id) {
        await answerCallbackQuery(cb.id, "Only the requester can confirm this");
        return;
      }
      await db.from("tickets").update({ status: "CLOSED", closed_at: new Date().toISOString(), closed_by: user.id }).eq("id", ticket.id);
      await recordStatusChange(db, { ticketId: ticket.id, changedBy: user.id, from: ticket.status, to: "CLOSED" });
      await answerCallbackQuery(cb.id, "Thanks! Ticket closed.");
      break;
    }
    case "reopen": {
      if (ticket.requester_id !== user.id) {
        await answerCallbackQuery(cb.id, "Only the requester can reopen this");
        return;
      }
      await db.from("tickets").update({ status: "REOPENED", reopened_count: (ticket.reopened_count ?? 0) + 1 }).eq("id", ticket.id);
      await recordStatusChange(db, { ticketId: ticket.id, changedBy: user.id, from: ticket.status, to: "REOPENED" });
      await answerCallbackQuery(cb.id, "Ticket reopened — IT has been notified.");
      break;
    }
    case "rate": {
      const [, tId, starStr] = String(cb.data ?? "").split(":");
      const stars = parseInt(starStr, 10);
      if (ticket.requester_id !== user.id) {
        await answerCallbackQuery(cb.id, "Only the ticket creator can submit a rating.");
        return;
      }
      if (isNaN(stars) || stars < 1 || stars > 5) {
        await answerCallbackQuery(cb.id, "Invalid rating score.");
        return;
      }

      const now = new Date().toISOString();
      const { data: updated } = await db
        .from("tickets")
        .update({
          rating: stars,
          rated_at: now,
          status: "CLOSED",
          closed_at: now,
          closed_by: user.id,
          updated_at: now
        })
        .eq("id", ticket.id)
        .select("*")
        .single();

      await recordStatusChange(db, {
        ticketId: ticket.id,
        changedBy: user.id,
        from: ticket.status,
        to: "CLOSED",
        note: `Rated ${stars} stars via Telegram`
      });

      await writeAudit(db, {
        actorId: user.id,
        action: "RATE",
        objectType: "ticket",
        objectId: ticket.id,
        newValue: { rating: stars }
      });

      await answerCallbackQuery(cb.id, `Thank you for rating ${stars} ⭐!`);

      // Notify the assigned technician
      if (ticket.assigned_technician_id) {
        const { data: tech } = await db.from("users").select("*").eq("id", ticket.assigned_technician_id).single();
        if (tech) {
          const requesterName = `${user.first_name ?? "Employee"} ${user.last_name ?? ""}`.trim();
          await notifyTicketRated(db, updated, stars, null, requesterName, tech);
        }
      }

      await sendMessage(
        cb.from.id,
        `🌟 <b>Thank You for Your Feedback!</b>\n\n` +
        `You rated ticket <code>${ticket.ticket_number}</code>:\n` +
        `<b>${"⭐".repeat(stars)} (${stars}/5)</b>\n\n` +
        `Your feedback has been recorded and the ticket is now officially closed. Have a great day!`,
        { parseMode: "HTML" }
      );
      break;
    }
    default:
      await answerCallbackQuery(cb.id);
  }
}
