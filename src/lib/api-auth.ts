import { NextRequest } from "next/server";
import { adminClient, userClient } from "./supabase-server";
import { SupabaseClient } from "@supabase/supabase-js";

export type AuthResult =
  | { ok: true; db: SupabaseClient; userId: string }
  | { ok: false; error: string; status: number };

/**
 * Authenticate an API request.
 * Accepts:
 *  - Authorization: Bearer <supabase-jwt>   (user token)
 *  - X-API-Key: <BULUT_API_KEY env var>     (service key for integrations)
 */
export async function authenticate(req: NextRequest): Promise<AuthResult> {
  const apiKey = req.headers.get("x-api-key");
  const envKey = process.env.BULUT_API_KEY;

  // X-API-Key auth (for external integrations / webhooks)
  if (apiKey) {
    if (!envKey) {
      return { ok: false, error: "API key auth not configured (set BULUT_API_KEY env var)", status: 501 };
    }
    if (apiKey !== envKey) {
      return { ok: false, error: "Invalid API key", status: 401 };
    }
    return { ok: true, db: adminClient(), userId: "api-key" };
  }

  // Bearer JWT auth (Supabase user session token)
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!jwt) {
    return {
      ok: false,
      error: "Unauthorized. Provide 'Authorization: Bearer <token>' or 'X-API-Key: <key>'",
      status: 401,
    };
  }

  const db = userClient(jwt);
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) {
    return { ok: false, error: "Invalid or expired token", status: 401 };
  }

  return { ok: true, db: adminClient(), userId: data.user.id };
}

export function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export function ok(data: unknown, status = 200) {
  return Response.json(data, { status });
}
