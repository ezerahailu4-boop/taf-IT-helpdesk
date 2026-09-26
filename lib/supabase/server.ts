import "server-only";
import { createNeonClient } from "@/lib/neon/client";
import { createClient } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "./mockClient";

let _neonClient: any = null;
let _mockClient: any = null;

/**
 * Authoritative Server Database Client.
 * 1. Primary: Live Neon Serverless PostgreSQL when DATABASE_URL or NEON_DATABASE_URL is provided.
 * 2. Secondary: Supabase (if legacy SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY are configured).
 * 3. Fallback: In-memory mock database with full enterprise seed data when env vars are absent.
 */
export function getDb(): any {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

  if (databaseUrl) {
    if (!_neonClient) {
      _neonClient = createNeonClient(databaseUrl);
    }
    return _neonClient;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  if (!_mockClient) {
    _mockClient = createMockSupabaseClient();
  }
  return _mockClient;
}

// Backward-compatible alias for existing imports
export const supabaseAdmin = getDb;
