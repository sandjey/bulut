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
    return Response.json(
      {
        error:
          "Не удалось отправить письмо. Проверьте настройки почты (Infisical/SMTP) на сервере или адрес.",
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, ticket });
}
