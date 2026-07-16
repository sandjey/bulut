import { NextRequest } from "next/server";

export const runtime = "nodejs";

// ─── POST /api/console/proxy ─────────────────────────────────────────────────────
// Серверный «бегунок» для Bulut Console: выполняет запрос к ВНЕШНЕМУ адресу, чтобы
// обойти CORS. Защищён от обращений к приватным/локальным адресам (SSRF).
//   Тело: { method, url, headers, body? }
//   Ответ: { status, statusText, headers, body, ms }

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 приватные диапазоны
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  // IPv6 приватные
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

export async function POST(req: NextRequest) {
  let body: { method?: string; url?: string; headers?: Record<string, string>; body?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const { method = "GET", url = "", headers = {}, body: reqBody } = body;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ error: "Некорректный URL" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return Response.json({ error: "Разрешены только http/https" }, { status: 400 });
  }
  if (isPrivateHost(target.hostname)) {
    return Response.json(
      { error: "Обращение к локальным/приватным адресам запрещено" },
      { status: 403 },
    );
  }

  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(target.toString(), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : reqBody,
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await res.text();
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => (outHeaders[k] = v));

    // Set-Cookie отдельным массивом (для cookie jar на клиенте)
    let setCookies: string[] = [];
    const h = res.headers as Headers & { getSetCookie?: () => string[] };
    if (typeof h.getSetCookie === "function") setCookies = h.getSetCookie();
    else if (outHeaders["set-cookie"]) setCookies = [outHeaders["set-cookie"]];

    return Response.json({
      status: res.status,
      statusText: res.statusText,
      headers: outHeaders,
      body: text,
      setCookies,
      ms: Date.now() - started,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка запроса";
    return Response.json(
      { error: msg.includes("aborted") ? "Таймаут (30с)" : msg, ms: Date.now() - started },
      { status: 502 },
    );
  }
}
