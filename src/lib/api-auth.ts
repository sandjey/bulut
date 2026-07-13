import { NextRequest } from "next/server";
import { userClient } from "./supabase-server";
import { SupabaseClient } from "@supabase/supabase-js";

export type AuthResult =
  | { ok: true; db: SupabaseClient; userId: string }
  | { ok: false; error: string; status: number };

/**
 * Authenticate an API request.
 * Accepts:
 *  - Authorization: Bearer <supabase-jwt>   (user token from the app)
 *  - X-API-Key: <BULUT_API_KEY env var>     (secret key for integrations)
 */
export async function authenticate(req: NextRequest): Promise<AuthResult> {
  const apiKey = req.headers.get("x-api-key");
  const envKey = process.env.BULUT_API_KEY;

  // ── X-API-Key auth (external integrations) ──────────────────────────────
  if (apiKey) {
    if (!envKey) return { ok: false, error: "API key auth not configured", status: 501 };
    if (apiKey !== envKey) return { ok: false, error: "Invalid API key", status: 401 };

    // Sign in as the dedicated service account to get a valid Supabase session
    const email = process.env.BULUT_API_SERVICE_EMAIL;
    const pass  = process.env.BULUT_API_SERVICE_PASS;
    if (!email || !pass) {
      return { ok: false, error: "Service account not configured on server", status: 501 };
    }

    // Use a temp anon client to sign in, then switch to authenticated client
    const anonDb = userClient(""); // will use anon key for sign-in
    const { data, error } = await anonDb.auth.signInWithPassword({ email, password: pass });
    if (error || !data.session) {
      return { ok: false, error: "Service account sign-in failed", status: 500 };
    }

    const db = userClient(data.session.access_token);
    return { ok: true, db, userId: data.user.id };
  }

  // ── Bearer JWT auth (user session from the app) ──────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const jwt  = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
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

  return { ok: true, db, userId: data.user.id };
}

export function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export function ok(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export type WorkspaceResult =
  | { ok: true; workspaceId: string; all: string[] }
  | { ok: false; error: string; status: number };

/**
 * Determine which workspace (room) the request operates on.
 * Priority: `X-Workspace-Id` header → `?workspace=` query → the single
 * membership of the API account. Verifies membership.
 */
export async function resolveWorkspace(db: SupabaseClient, req: NextRequest): Promise<WorkspaceResult> {
  const explicit = req.headers.get("x-workspace-id") || req.nextUrl.searchParams.get("workspace");
  const { data, error } = await db.from("workspace_members").select("workspace_id");
  if (error) return { ok: false, error: error.message, status: 500 };
  const all = (data ?? []).map((r) => r.workspace_id as string);
  if (all.length === 0) {
    return {
      ok: false,
      error:
        "API-аккаунт не состоит ни в одной комнате. Пригласите пользователя (email из BULUT_API_SERVICE_EMAIL) в нужную комнату.",
      status: 403,
    };
  }
  if (explicit) {
    if (!all.includes(explicit)) return { ok: false, error: "Нет доступа к этой комнате (workspace)", status: 403 };
    return { ok: true, workspaceId: explicit, all };
  }
  // По умолчанию — первая комната. Если их несколько, укажите X-Workspace-Id.
  return { ok: true, workspaceId: all[0], all };
}
