import { NextResponse } from "next/server";
import { sendInviteEmail } from "@/lib/mailer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, token, workspace } = await req.json();
    if (!email || !token) {
      return NextResponse.json({ error: "email и token обязательны" }, { status: 400 });
    }
    // Абсолютный URL приглашения — из origin запроса или переменной окружения.
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      req.headers.get("origin") ||
      new URL(req.url).origin;
    const url = `${origin}/invite/${token}`;

    await sendInviteEmail(String(email), String(workspace || "команду"), url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("invite/send", e);
    // Не блокируем поток: ссылку всё равно можно скопировать в приложении.
    return NextResponse.json({ error: "Не удалось отправить письмо" }, { status: 500 });
  }
}
