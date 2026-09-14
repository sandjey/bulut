import { NextRequest } from "next/server";
import { generateCode, issueTicket, canSend } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { email?: string; name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const role = (body.role ?? "").trim();

  if (!EMAIL_RE.test(email)) return Response.json({ error: "Некорректный email" }, { status: 400 });
  if (!name) return Response.json({ error: "Укажите имя" }, { status: 400 });
  if (!role) return Response.json({ error: "Выберите роль" }, { status: 400 });

  const gate = canSend(email);
  if (!gate.ok) {
    return Response.json(
      { error: `Код уже отправлен. Повторите через ${gate.waitSec} сек.` },
      { status: 429 },
    );
  }

  // Проверяем, что сервер настроен (секрет подписи + SMTP из Infisical).
  if (!process.env.OTP_SIGNING_SECRET || process.env.OTP_SIGNING_SECRET.length < 16) {
    console.error("OTP_SIGNING_SECRET не задан в окружении");
    return Response.json(
      { error: "Регистрация не настроена на сервере (нет ключа подписи). Обратитесь к администратору." },
      { status: 500 },
    );
  }

  let ticket: string;
  try {
    const code = generateCode();
    ticket = issueTicket(email, name, role, code);
    await sendOtpEmail(email, code, name);
  } catch (e) {
    console.error("OTP send failed:", e);
    const err = e as { code?: string; responseCode?: number; message?: string };
    const msg = err?.message ?? "";
    // Разные причины — разные подсказки, иначе владелец не поймёт, что чинить.
    let text =
      "Не удалось отправить письмо с кодом. Попросите владельца Bulut создать вам аккаунт вручную.";
    if (err?.code === "EAUTH" || err?.responseCode === 535 || err?.responseCode === 534) {
      text =
        "Почтовый сервер отклонил пароль отправителя (SMTP). Регистрация по коду временно недоступна — " +
        "попросите владельца Bulut создать вам аккаунт.";
    } else if (/SMTP не настроен/.test(msg)) {
      text =
        "Почта на сервере не настроена (нет SMTP-ключей). Попросите владельца Bulut создать вам аккаунт.";
    } else if (err?.code === "ETIMEDOUT" || err?.code === "ECONNECTION" || err?.code === "ESOCKET") {
      text =
        "Почтовый сервер не отвечает. Попробуйте позже или попросите владельца Bulut создать вам аккаунт.";
    }
    return Response.json({ error: text, code: err?.code ?? null }, { status: 502 });
  }

  return Response.json({ ok: true, ticket });
}
