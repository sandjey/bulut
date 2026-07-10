import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "crypto";

/**
 * OTP-подтверждение почты без базы данных.
 *
 * Код не хранится на сервере — вместо этого возвращается подписанный «билет»
 * (stateless token), в котором лежат email/имя/роль, HMAC от кода и срок годности.
 * На шаге проверки пересчитываем HMAC от введённого кода и сравниваем.
 *
 * Плюс: не требует таблицы в БД и работает в serverless.
 * Минус: невозможно жёстко считать попытки между запросами — поэтому короткий TTL
 *        и best-effort лимитер попыток в памяти процесса.
 */

const TTL_MS = 10 * 60 * 1000; // код живёт 10 минут
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function secret(): string {
  const s = process.env.OTP_SIGNING_SECRET;
  if (!s || s.length < 16) {
    throw new Error("OTP_SIGNING_SECRET не задан (нужна строка ≥ 16 символов)");
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function hmac(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += randomInt(0, 10).toString();
  return code;
}

interface Payload {
  e: string; // email (lowercased)
  n: string; // name
  r: string; // role
  x: number; // expiry epoch ms
  h: string; // hmac(email:code:x)
}

/** Создаёт подписанный билет под конкретный код. */
export function issueTicket(email: string, name: string, role: string, code: string): string {
  const e = email.trim().toLowerCase();
  const x = Date.now() + TTL_MS;
  const h = hmac(`${e}:${code}:${x}`);
  const payload: Payload = { e, n: name, r: role, x, h };
  const body = b64url(JSON.stringify(payload));
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; email: string; name: string; role: string }
  | { ok: false; reason: "invalid" | "expired" | "code" };

/** Проверяет билет + введённый код. */
export function verifyTicket(ticket: string, email: string, code: string): VerifyResult {
  const parts = ticket.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid" };
  const [body, sig] = parts;
  if (!safeEqual(sig, hmac(body))) return { ok: false, reason: "invalid" };

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const e = email.trim().toLowerCase();
  if (payload.e !== e) return { ok: false, reason: "invalid" };
  if (Date.now() > payload.x) return { ok: false, reason: "expired" };

  const expected = hmac(`${payload.e}:${code.trim()}:${payload.x}`);
  if (!safeEqual(expected, payload.h)) return { ok: false, reason: "code" };

  return { ok: true, email: payload.e, name: payload.n, role: payload.r };
}

// ── Best-effort лимитер попыток/частоты (в памяти процесса) ────────────────
const attempts = new Map<string, { count: number; resetAt: number }>();
const lastSend = new Map<string, number>();
const RESEND_COOLDOWN_MS = 45 * 1000;

export function canSend(email: string): { ok: boolean; waitSec?: number } {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const prev = lastSend.get(key);
  if (prev && now - prev < RESEND_COOLDOWN_MS) {
    return { ok: false, waitSec: Math.ceil((RESEND_COOLDOWN_MS - (now - prev)) / 1000) };
  }
  lastSend.set(key, now);
  attempts.delete(key); // новый код — сбрасываем счётчик попыток
  return { ok: true };
}

export function registerAttempt(email: string): boolean {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now > rec.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + TTL_MS });
    return true;
  }
  if (rec.count >= MAX_ATTEMPTS) return false;
  rec.count += 1;
  return true;
}
