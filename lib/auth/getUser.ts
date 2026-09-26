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
  const isDevOrDemo = process.env.NODE_ENV !== "production" || !botToken;
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

    if (existing) {
      await db
        .from("users")
        .update({
          telegram_username: tgUser.username ?? existing.telegram_username,
          first_name: tgUser.first_name ?? existing.first_name,
          last_name: tgUser.last_name ?? existing.last_name,
          photo_url: tgUser.photo_url ?? existing.photo_url,
          language_code: tgUser.language_code ?? existing.language_code,
          last_active_at: new Date().toISOString()
        })
        .eq("id", existing.id);
      return { ...existing, telegram_username: tgUser.username ?? existing.telegram_username } as DbUser;
    }

    const { data: created, error: insertErr } = await db
      .from("users")
      .insert({
        telegram_id: tgUser.id,
        telegram_username: tgUser.username,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        photo_url: tgUser.photo_url,
        language_code: tgUser.language_code,
        role: "EMPLOYEE"
      })
      .select("*")
      .single();

    if (insertErr) throw new Error(insertErr.message);
    return created as DbUser;
  }

  // If in Dev or Demo mode and no valid Telegram initData is available:
  if (isDevOrDemo) {
    let targetRole = (demoRole || "EMPLOYEE").toUpperCase();
    if (!["EMPLOYEE", "TECHNICIAN", "ADMIN"].includes(targetRole)) {
      targetRole = "EMPLOYEE";
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
        telegram_id: targetRole === "ADMIN" ? 1005 : targetRole === "TECHNICIAN" ? 1002 : 1001,
        telegram_username: targetRole.toLowerCase(),
        first_name: targetRole === "ADMIN" ? "Sarah" : targetRole === "TECHNICIAN" ? "Daniel" : "Ezera",
        last_name: targetRole === "ADMIN" ? "Connor" : targetRole === "TECHNICIAN" ? "Kebede" : "Hailu",
        role: targetRole as any
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
