import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isServiceConfigured, serviceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/**
 * Полностью удаляет аккаунт из auth.users (service_role).
 * Связанные строки (profiles, boards, tasks, journal, project_maps этого
 * пользователя) удаляются каскадом по внешним ключам on delete cascade.
 * Работает и для «осиротевших» аккаунтов без профиля.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!jwt) return json({ error: "Не авторизован" }, 401);

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
  const userId = (body.userId ?? "").trim();
  if (!userId) return json({ error: "Не указан userId" }, 400);

  if (!isServiceConfigured()) {
    return json(
      { error: "Полное удаление не настроено на сервере: задайте SUPABASE_SERVICE_ROLE_KEY." },
      501,
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 1) Проверяем, кто вызывает
  const authClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: caller, error: cErr } = await authClient.auth.getUser(jwt);
  if (cErr || !caller.user) return json({ error: "Сессия недействительна" }, 401);
  const callerId = caller.user.id;

  const svc = serviceClient();
  const { data: callerProfile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();
  const callerRole = callerProfile?.role ?? "member";
  if (callerRole !== "owner" && callerRole !== "admin") {
    return json({ error: "Недостаточно прав" }, 403);
  }
  if (userId === callerId) return json({ error: "Нельзя удалить свой аккаунт" }, 403);

  // 2) Проверяем цель
  const { data: targetProfile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const targetRole = targetProfile?.role ?? null; // null = осиротевший (нет профиля)
  if (targetRole === "owner") return json({ error: "Нельзя удалить владельца" }, 403);
  // Админ может удалять только обычных пользователей и осиротевшие аккаунты
  if (callerRole === "admin" && targetRole && targetRole !== "member") {
    return json({ error: "Администратор может удалять только обычных пользователей" }, 403);
  }

  // 3) Удаляем аккаунт (каскад уберёт остальное)
  const { error: delErr } = await svc.auth.admin.deleteUser(userId);
  if (delErr) return json({ error: `Не удалось удалить аккаунт: ${delErr.message}` }, 500);
  // на всякий случай убираем профиль явно
  await svc.from("profiles").delete().eq("id", userId);

  return json({ ok: true });
}
