"use client";
import { createClient } from "@supabase/supabase-js";

/**
 * Browser client — anon key only, used only for reading public storage URLs
 * or subscribing to safe realtime channels if you add them later.
 * Never put the service role key here.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  return createClient(url, key);
}
