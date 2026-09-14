import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySmtp } from "@/lib/mailer";
import { isServiceConfigured, serviceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Диагностика почты: отвечает, принимает ли SMTP-сервер логин.
 * Только для владельца/админа. Секреты наружу не отдаёт — только текст ошибки.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!jwt) return Response.json({ error: "Не авторизован" }, { status: 401 });
  if (!isServiceConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY не задан" }, { status: 501 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: caller, error } = await authClient.auth.getUser(jwt);
  if (error || !caller.user) return Response.json({ error: "Сессия недействительна" }, { status: 401 });

  const svc = serviceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", caller.user.id)
    .maybeSingle();
  if (profile?.role !== "owner" && profile?.role !== "admin") {
    return Response.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    await verifySmtp();
    return Response.json({ ok: true, smtp: "login ok" });
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; message?: string };
    return Response.json(
      { ok: false, code: err?.code ?? null, responseCode: err?.responseCode ?? null, message: err?.message ?? String(e) },
      { status: 200 },
    );
  }
}
