import { NextRequest } from "next/server";
import { verifyTicket, registerAttempt } from "@/lib/otp";
import { isServiceConfigured, serviceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string; ticket?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  const ticket = body.ticket ?? "";
  const password = (body.password ?? "").trim();

  if (!email || !code || !ticket) {
    return json({ error: "Введите код из письма" }, 400);
  }
  if (password.length < 6) {
    return json({ error: "Пароль должен быть не менее 6 символов" }, 400);
  }

  if (!registerAttempt(email)) {
    return json({ error: "Слишком много попыток. Запросите новый код." }, 429);
  }

  const res = verifyTicket(ticket, email, code);
  if (!res.ok) {
    const msg =
      res.reason === "expired"
        ? "Код истёк — запросите новый."
        : res.reason === "code"
          ? "Неверный код."
          : "Не удалось проверить код — запросите новый.";
    return json({ error: msg }, 400);
  }

  // Почта подтверждена кодом. Создаём аккаунт сразу подтверждённым через
  // service_role: на этом проекте Supabase mailer_autoconfirm выключен,
  // поэтому обычный supabase.auth.signUp() создавал пользователя без сессии
  // и без ошибки — форма регистрации молча зависала.
  if (!isServiceConfigured()) {
    return json(
      { error: "Регистрация не настроена на сервере: нет SUPABASE_SERVICE_ROLE_KEY." },
      501,
    );
  }

  const svc = serviceClient();
  const name = res.name ?? "";
  const role = res.role ?? "";

  // Убираем «призрачные» аккаунты от прошлых сломанных попыток регистрации
  // (были созданы клиентским signUp, но так и не подтвердились).
  const { data: list, error: listErr } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    return json({ error: `Не удалось проверить почту: ${listErr.message}` }, 500);
  }
  const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (existing) {
    if (existing.email_confirmed_at) {
      return json(
        { error: "Этот email уже зарегистрирован. Войдите или восстановите пароль." },
        409,
      );
    }
    await svc.auth.admin.deleteUser(existing.id);
  }

  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, full_name: name, role },
  });
  if (createErr || !created.user) {
    return json(
      { error: `Не удалось создать аккаунт: ${createErr?.message ?? "неизвестная ошибка"}` },
      500,
    );
  }

  // Профиль — не полагаемся только на триггер on_auth_user_created.
  const { error: profErr } = await svc
    .from("profiles")
    .upsert(
      {
        id: created.user.id,
        email,
        name,
        job_role: role,
        role: "member",
        permissions: ["board.view"],
        deleted_at: null,
      },
      { onConflict: "id" },
    );
  if (profErr) {
    await svc.auth.admin.deleteUser(created.user.id);
    return json({ error: `Не удалось создать профиль: ${profErr.message}` }, 500);
  }

  return json({ ok: true, email, name, role });
}
