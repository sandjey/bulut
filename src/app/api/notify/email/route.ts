import { NextResponse } from "next/server";
import { sendNotifyEmail } from "@/lib/mailer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { to, title, body, link } = await req.json();
    if (!to || !title) {
      return NextResponse.json({ error: "to и title обязательны" }, { status: 400 });
    }
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || req.headers.get("origin") || new URL(req.url).origin;
    const url = link ? (String(link).startsWith("http") ? String(link) : `${origin}${link}`) : null;
    await sendNotifyEmail(String(to), String(title), String(body || ""), url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("notify/email", e);
    return NextResponse.json({ error: "Не удалось отправить письмо" }, { status: 500 });
  }
}
