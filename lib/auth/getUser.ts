import "server-only";
import { NextRequest } from "next/server";
import { validateTelegramInitData } from "@/lib/telegram/validateInitData";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { DbUser } from "@/types/db";

/**
 * Extracts and validates Telegram initData from the request, then loads
 * (or creates) the corresponding user row. This is the ONLY place identity
 * enters the system — every API route must call this instead of trusting
 * any user id sent in a request body.
 *
 * In local development or when outside Telegram, supports demo persona switching
 * (Ezera as EMPLOYEE, Daniel as TECHNICIAN, Sarah as ADMIN) so all 3 roles
 * can be tested easily directly in the browser or Telegram test harness.
 */
export async function requireUser(req: NextRequest): Promise<DbUser> {
  const initData =
    req.headers.get("x-telegram-init-data") ||
    new URL(req.url).searchParams.get("initData") ||
    "";

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const isDevOrDemo = process.env.ALLOW_BROWSER_DEMO !== "false";
  const demoRole = req.headers.get("x-demo-role") || new URL(req.url).searchParams.get("demo_role");

  const db = supabaseAdmin();

  // If valid Telegram initData is present and botToken is configured, authenticate strictly via Telegram HMAC
  if (initData && botToken) {
    const validated = validateTelegramInitData(initData, botToken);
    if (!validated) {
      throw new AuthError("Invalid Telegram authentication hash");
    }

    const tgUser = validated.user;

    const { data: existing, error: fetchErr } = await db
      .from("users")
      .select("*")
      .eq("telegram_id", tgUser.id)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);

    const username = (tgUser.username || "").toLowerCase();
    const TECH_USERNAMES = ["tinsu2025", "mati20", "kirabelll", "ik8927"];
    const ADMIN_USERNAMES = ["ezrsh_404", "not_adonay", "kalkidangebyehu"];
    const TECH_IDS = ["6319536255", "7434354672"];
    const ADMIN_IDS = ["883942515", "2074368152", "205797800"];

    const isDesignatedAdmin = ADMIN_IDS.includes(String(tgUser.id)) || ADMIN_USERNAMES.includes(username);
    const isDesignatedTech = TECH_IDS.includes(String(tgUser.id)) || TECH_USERNAMES.includes(username);

    let matchedUser = existing;
    if (!matchedUser && tgUser.username) {
      const { data: byUsername } = await db.from("users").select("*").ilike("telegram_username", tgUser.username).maybeSingle();
      if (byUsername) matchedUser = byUsername;
    }

function cleanName(val: string | null | undefined): string {
  if (!val) return "";
  return val.replace(/😘+/gu, "").trim();
}

    if (matchedUser) {
      // If the user has already registered their official employee name, preserve it!
      // Do NOT overwrite it with their Telegram profile display name / handle (e.g. "Heisenberg").
      const hasRegisteredName = Boolean(matchedUser.is_registered && matchedUser.first_name);

      const cleanFirstName = hasRegisteredName
        ? matchedUser.first_name
        : (cleanName(tgUser.first_name) || "User");

      const cleanLastName = hasRegisteredName
        ? (matchedUser.last_name ?? "")
        : cleanName(tgUser.last_name);

      const updateData: Record<string, unknown> = {
        telegram_id: tgUser.id,
        telegram_username: tgUser.username ?? matchedUser.telegram_username,
        first_name: cleanFirstName,
        last_name: cleanLastName,
        photo_url: tgUser.photo_url ?? matchedUser.photo_url,
        language_code: tgUser.language_code ?? matchedUser.language_code,
        last_active_at: new Date().toISOString()
      };

      if (isDesignatedAdmin && matchedUser.role !== "ADMIN") {
        updateData.role = "ADMIN";
        matchedUser.role = "ADMIN";
      } else if (isDesignatedTech && matchedUser.role === "EMPLOYEE") {
        updateData.role = "TECHNICIAN";
        matchedUser.role = "TECHNICIAN";
      }

      await db
        .from("users")
        .update(updateData)
        .eq("id", matchedUser.id);
      return { ...matchedUser, ...updateData } as DbUser;
    }

    const { data: created, error: insertErr } = await db
      .from("users")
      .insert({
        telegram_id: tgUser.id,
        telegram_username: tgUser.username,
        first_name: cleanName(tgUser.first_name) || "User",
        last_name: cleanName(tgUser.last_name),
        photo_url: tgUser.photo_url,
        language_code: tgUser.language_code,
        role: isDesignatedAdmin ? "ADMIN" : isDesignatedTech ? "TECHNICIAN" : "EMPLOYEE",
        is_registered: isDesignatedAdmin || isDesignatedTech ? true : false
      })
      .select("*")
      .single();

    if (insertErr) throw new Error(insertErr.message);
    return created as DbUser;
  }

  // If in Dev or Demo mode and no valid Telegram initData is available:
  if (isDevOrDemo) {
    const isAdminPath = req.nextUrl?.pathname?.includes("/admin");
    const isTechPath = req.nextUrl?.pathname?.includes("/tech");
    let defaultRole = isAdminPath ? "ADMIN" : isTechPath ? "TECHNICIAN" : "ADMIN"; // Default to ADMIN for dashboard access
    let targetRole = (demoRole || defaultRole).toUpperCase();
    if (!["EMPLOYEE", "TECHNICIAN", "ADMIN"].includes(targetRole)) {
      targetRole = "ADMIN";
    }

    // Try finding the real primary user first
    if (targetRole === "ADMIN") {
      const { data: adonayAdmin } = await db
        .from("users")
        .select("*")
        .eq("telegram_username", "not_adonay")
        .maybeSingle();

      if (adonayAdmin) return adonayAdmin as DbUser;

      const { data: ezeraAdmin } = await db
        .from("users")
        .select("*")
        .eq("telegram_username", "Ezrsh_404")
        .maybeSingle();

      if (ezeraAdmin) return ezeraAdmin as DbUser;
    } else if (targetRole === "TECHNICIAN") {
      const { data: tinsuTech } = await db
        .from("users")
        .select("*")
        .eq("telegram_username", "tinsu2025")
        .maybeSingle();

      if (tinsuTech) return tinsuTech as DbUser;
    }

    const { data: user } = await db
      .from("users")
      .select("*")
      .eq("role", targetRole)
      .limit(1)
      .maybeSingle();

    if (user) {
      return user as DbUser;
    }

    // Fallback: create mock demo user
    const { data: created } = await db
      .from("users")
      .insert({
        telegram_id: targetRole === "ADMIN" ? 2074368152 : targetRole === "TECHNICIAN" ? 1002 : 1001,
        telegram_username: targetRole === "ADMIN" ? "Ezrsh_404" : targetRole.toLowerCase(),
        first_name: targetRole === "ADMIN" ? "Ezera" : targetRole === "TECHNICIAN" ? "Daniel" : "Employee",
        last_name: targetRole === "ADMIN" ? "Hailu" : targetRole === "TECHNICIAN" ? "Worku" : "User",
        role: targetRole as any,
        is_registered: true
      })
      .select("*")
      .single();

    return created as DbUser;
  }

  throw new AuthError("Invalid or missing Telegram authentication");
}

export class AuthError extends Error {
  status = 401;
}
