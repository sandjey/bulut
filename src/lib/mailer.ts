import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getSmtpConfig } from "./infisical";

let transporter: Transporter | null = null;
let transportKey = "";

async function getTransport(): Promise<{ transport: Transporter; from: string }> {
  const cfg = await getSmtpConfig();
  const from = `"${cfg.fromName}" <${cfg.from}>`;
  // Ключ включает пароль: после ротации ключей в Infisical соединение
  // пересоздаётся само, без передеплоя.
  const key = `${cfg.host}:${cfg.port}:${cfg.username}:${cfg.password}:${cfg.starttls}`;
  if (!transporter || key !== transportKey) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      requireTLS: cfg.starttls,
      auth: { user: cfg.username, pass: cfg.password },
    });
    transportKey = key;
  }
  return { transport: transporter, from };
}

/** Ключ Resend (HTTP API). Если задан — письма уходят через него, без SMTP. */
function resendKey(): string {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

/** Адрес отправителя для Resend: домен должен быть подтверждён в Resend. */
function resendFrom(): string {
  const addr = process.env.MAIL_FROM?.trim() || "no-reply@bulut.my";
  const name = process.env.MAIL_FROM_NAME?.trim() || "Bulut";
  return `${name} <${addr}>`;
}

interface Letter {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Единая отправка: сначала Resend (если настроен), иначе SMTP. */
async function deliver(letter: Letter): Promise<void> {
  const key = resendKey();
  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: resendFrom(),
        to: [letter.to],
        subject: letter.subject,
        text: letter.text,
        html: letter.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw Object.assign(new Error(`Resend отклонил письмо: ${res.status} ${body.slice(0, 300)}`), {
        code: res.status === 401 || res.status === 403 ? "EAUTH" : "ERESEND",
      });
    }
    return;
  }
  const { transport, from } = await getTransport();
  await transport.sendMail({ from, ...letter });
}

/** Проверка канала отправки — для диагностики почты. */
export async function verifySmtp(): Promise<{ channel: "resend" | "smtp" }> {
  if (resendKey()) {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${resendKey()}` },
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Resend: ${res.status} ${(await res.text()).slice(0, 200)}`), {
        code: res.status === 401 || res.status === 403 ? "EAUTH" : "ERESEND",
      });
    }
    return { channel: "resend" };
  }
  const { transport } = await getTransport();
  await transport.verify();
  return { channel: "smtp" };
}

function otpEmailHtml(code: string, name: string): string {
  const spaced = code.split("").join(" ");
  return `<!doctype html>
<html><body style="margin:0;background:#0b0f1a;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="440" cellpadding="0" cellspacing="0"
             style="max-width:440px;width:100%;background:#141a2b;border:1px solid #243049;border-radius:20px;overflow:hidden">
        <tr><td style="padding:36px 36px 20px">
          <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.02em">Bulut</div>
          <div style="font-size:13px;color:#8b97b3;margin-top:2px">Подтверждение регистрации</div>
        </td></tr>
        <tr><td style="padding:0 36px 8px">
          <p style="color:#c7d0e6;font-size:15px;line-height:1.6;margin:0">
            ${name ? `Здравствуйте, <b style="color:#fff">${escapeHtml(name)}</b>!` : "Здравствуйте!"}
            Ваш код подтверждения email:
          </p>
        </td></tr>
        <tr><td style="padding:20px 36px">
          <div style="background:#0b0f1a;border:1px solid #2b3958;border-radius:14px;
                      text-align:center;padding:22px 0;font-size:34px;font-weight:800;
                      letter-spacing:12px;color:#fff;font-family:ui-monospace,Menlo,monospace">
            ${spaced}
          </div>
        </td></tr>
        <tr><td style="padding:0 36px 32px">
          <p style="color:#8b97b3;font-size:13px;line-height:1.6;margin:0">
            Код действует 10 минут. Если вы не запрашивали регистрацию — просто игнорируйте это письмо.
          </p>
        </td></tr>
      </table>
      <div style="color:#5a6684;font-size:12px;margin-top:16px">© Bulut — менеджер задач</div>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function sendOtpEmail(email: string, code: string, name: string): Promise<void> {
  await deliver({
    to: email,
    subject: `Код подтверждения Bulut: ${code}`,
    text: `Ваш код подтверждения регистрации в Bulut: ${code}\nКод действует 10 минут.`,
    html: otpEmailHtml(code, name),
  });
}

function inviteEmailHtml(workspace: string, url: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#0b0f1a;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="460" cellpadding="0" cellspacing="0"
             style="max-width:460px;width:100%;background:#141a2b;border:1px solid #243049;border-radius:20px;overflow:hidden">
        <tr><td style="padding:36px 36px 12px">
          <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.02em">Bulut</div>
          <div style="font-size:13px;color:#8b97b3;margin-top:2px">Приглашение в команду</div>
        </td></tr>
        <tr><td style="padding:8px 36px 4px">
          <p style="color:#c7d0e6;font-size:15px;line-height:1.6;margin:0">
            Вас пригласили присоединиться к комнате
            <b style="color:#fff">«${escapeHtml(workspace)}»</b> в Bulut.
          </p>
        </td></tr>
        <tr><td style="padding:22px 36px">
          <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
             font-size:15px;font-weight:700;padding:13px 26px;border-radius:12px">Принять приглашение</a>
        </td></tr>
        <tr><td style="padding:0 36px 32px">
          <p style="color:#8b97b3;font-size:13px;line-height:1.6;margin:0">
            Или откройте ссылку: <br><span style="color:#6f7b94;word-break:break-all">${url}</span><br><br>
            Приглашение действует 14 дней. Если это ошибка — просто игнорируйте письмо.
          </p>
        </td></tr>
      </table>
      <div style="color:#5a6684;font-size:12px;margin-top:16px">© Bulut — менеджер задач</div>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendNotifyEmail(
  email: string,
  title: string,
  body: string,
  url: string | null,
): Promise<void> {
  const button = url
    ? `<tr><td style="padding:20px 36px"><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 22px;border-radius:12px">Открыть в Bulut</a></td></tr>`
    : "";
  const html = `<!doctype html>
<html><body style="margin:0;background:#0b0f1a;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%"><tr><td align="center">
    <table role="presentation" width="460" style="max-width:460px;width:100%;background:#141a2b;border:1px solid #243049;border-radius:20px;overflow:hidden">
      <tr><td style="padding:32px 36px 8px"><div style="font-size:20px;font-weight:800;color:#fff">Bulut</div></td></tr>
      <tr><td style="padding:6px 36px 4px"><div style="color:#fff;font-size:16px;font-weight:700">${escapeHtml(title)}</div></td></tr>
      <tr><td style="padding:4px 36px"><p style="color:#c7d0e6;font-size:14px;line-height:1.6;margin:0">${escapeHtml(body)}</p></td></tr>
      ${button}
      <tr><td style="padding:8px 36px 30px"><p style="color:#5a6684;font-size:12px;margin:0">Это автоматическое уведомление Bulut.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  await deliver({
    to: email,
    subject: `Bulut · ${title}`,
    text: `${title}\n\n${body}${url ? `\n\n${url}` : ""}`,
    html,
  });
}

export async function sendInviteEmail(email: string, workspace: string, url: string): Promise<void> {
  await deliver({
    to: email,
    subject: `Приглашение в «${workspace}» — Bulut`,
    text: `Вас пригласили в комнату «${workspace}» в Bulut.\nПринять: ${url}\nСсылка действует 14 дней.`,
    html: inviteEmailHtml(workspace, url),
  });
}
