import { NextRequest } from "next/server";
import { userClient } from "@/lib/supabase-server";
import { err, ok } from "@/lib/api-auth";

export const runtime = "nodejs";

// ─── POST /api/auth/token ──────────────────────────────────────────────────────
// Вход своим аккаунтом Bulut → токен для API. Дальше — Authorization: Bearer <token>.
//   Логин:   { "email": "...", "password": "..." }
//   Обновить:{ "refresh_token": "..." }
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return err("Некорректный JSON", 400);
  }

  const anon = userClient(""); // анонимный клиент — только для входа

  const res = body.refresh_token
    ? await anon.auth.refreshSession({ refresh_token: body.refresh_token })
    : body.email && body.password
      ? await anon.auth.signInWithPassword({ email: body.email.trim(), password: body.password })
      : null;

  if (!res) return err("Нужны email и password (или refresh_token)", 400);
  if (res.error || !res.data.session) {
    return err(res.error?.message ?? "Не удалось войти", 401);
  }

  const s = res.data.session;
  return ok({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    token_type: "bearer",
    expires_at: s.expires_at,
    expires_in: s.expires_in,
    user: { id: res.data.user?.id, email: res.data.user?.email },
  });
}
