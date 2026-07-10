import { NextRequest } from "next/server";
import { verifyTicket, registerAttempt } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string; ticket?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  const ticket = body.ticket ?? "";

  if (!email || !code || !ticket) {
    return Response.json({ error: "Введите код из письма" }, { status: 400 });
  }

  if (!registerAttempt(email)) {
    return Response.json(
      { error: "Слишком много попыток. Запросите новый код." },
      { status: 429 },
    );
  }

  const res = verifyTicket(ticket, email, code);
  if (!res.ok) {
    const msg =
      res.reason === "expired"
        ? "Код истёк — запросите новый."
        : res.reason === "code"
          ? "Неверный код."
          : "Не удалось проверить код — запросите новый.";
    return Response.json({ error: msg }, { status: 400 });
  }

  // Почта подтверждена. Возвращаем данные, чтобы клиент завершил регистрацию в Supabase.
  return Response.json({ ok: true, email: res.email, name: res.name, role: res.role });
}
