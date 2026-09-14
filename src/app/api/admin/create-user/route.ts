import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "crypto";
import { isServiceConfigured, serviceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/** Читаемый временный пароль: 12 символов без похожих букв (0/O, 1/l). */
function generatePassword(): string {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += abc[randomInt(0, abc.length)];
  return out;
}

/**
 * Создание аккаунта владельцем/админом (service_role), без письма с кодом.
 * Нужно, когда почта на сервере недоступна: владелец заводит аккаунт сам
 * и передаёт человеку логин + временный пароль, тот меняет его в /profile.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!jwt) return json({ error: "Не авторизован" }, 401);

  let body: { email?: string; name?: string; jobRole?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const jobRole = (body.jobRole ?? "").trim();
  const password = (body.password ?? "").trim() || generatePassword();

  if (!EMAIL_RE.test(email)) return json({ error: "Некорректный email" }, 400);
  if (!name) return json({ error: "Укажите имя" }, 400);
  if (password.length < 6) return json({ error: "Пароль должен быть не менее 6 символов" }, 400);

  if (!isServiceConfigured()) {
    return json(
      { error: "Создание аккаунтов не настроено на сервере: задайте SUPABASE_SERVICE_ROLE_KEY." },
      501,
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 1) Кто вызывает
  const authClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: caller, error: cErr } = await authClient.auth.getUser(jwt);
  if (cErr || !caller.user) return json({ error: "Сессия недействительна" }, 401);
  const callerId = caller.user.id;

  const svc = serviceClient();

  // 2) Права: глобальный owner/admin либо owner/admin хотя бы в одной комнате
  const { data: callerProfile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .maybeSingle();
  let allowed = callerProfile?.role === "owner" || callerProfile?.role === "admin";
  if (!allowed) {
    const { data: ws } = await svc
      .from("workspace_members")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["owner", "admin"])
      .limit(1);
    allowed = Boolean(ws && ws.length > 0);
  }
  if (!allowed) return json({ error: "Недостаточно прав" }, 403);

  // 3) Такой пользователь уже есть?
  const { data: existingRows } = await svc
    .from("profiles")
    .select("id, deleted_at")
    .ilike("email", email)
    .limit(1);
  const existing = existingRows?.[0] as { id: string; deleted_at: string | null } | undefined;
  if (existing && !existing.deleted_at) {
    return json({ error: "Пользователь с такой почтой уже зарегистрирован" }, 409);
  }

  // 4) Создаём подтверждённый аккаунт.
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, full_name: name, role: jobRole },
  });
  if (createErr || !created.user) {
    const m = createErr?.message ?? "";
    const human = /already been registered|already exists/i.test(m)
      ? "Пользователь с такой почтой уже зарегистрирован"
      : `Не удалось создать аккаунт: ${m}`;
    return json({ error: human }, /already/i.test(m) ? 409 : 500);
  }

  // 5) Профиль создаём явно — не полагаемся на триггер on_auth_user_created
  //    (в проекте его может не быть; заодно снимаем мягкое удаление).
  const { error: profErr } = await svc
    .from("profiles")
    .upsert(
      {
        id: created.user.id,
        email,
        name,
        job_role: jobRole,
        role: "member",
        permissions: ["board.view"],
        deleted_at: null,
      },
      { onConflict: "id" },
    );
  if (profErr) {
    // Без профиля человек не появится в команде — откатываем аккаунт.
    await svc.auth.admin.deleteUser(created.user.id);
    return json({ error: `Не удалось создать профиль: ${profErr.message}` }, 500);
  }

  return json({ ok: true, userId: created.user.id, email, password });
}
