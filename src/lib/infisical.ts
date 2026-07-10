import "server-only";

/**
 * Минимальный клиент Infisical (env-management).
 * Логинится по machine-identity (Universal Auth) и читает секреты из проекта.
 * Токен и секреты кэшируются в памяти процесса, чтобы не дёргать API на каждый запрос.
 */

const BASE = process.env.INFISICAL_API_URL || "https://app.infisical.com";
const CLIENT_ID = process.env.INFISICAL_CLIENT_ID;
const CLIENT_SECRET = process.env.INFISICAL_CLIENT_SECRET;
const PROJECT_ID = process.env.INFISICAL_PROJECT_ID;
const ENVIRONMENT = process.env.INFISICAL_ENVIRONMENT || "prod";

const SECRETS_TTL_MS = 5 * 60 * 1000; // перечитывать секреты не чаще раза в 5 минут

let tokenCache: { token: string; expiresAt: number } | null = null;
let secretsCache: { values: Record<string, string>; expiresAt: number } | null = null;

export function isInfisicalConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && PROJECT_ID);
}

async function login(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 10_000) return tokenCache.token;

  const res = await fetch(`${BASE}/api/v1/auth/universal-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Infisical login failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { accessToken: string; expiresIn?: number };
  const ttl = (data.expiresIn ?? 2592000) * 1000;
  tokenCache = { token: data.accessToken, expiresAt: now + Math.min(ttl, 24 * 60 * 60 * 1000) };
  return data.accessToken;
}

/** Читает все секреты окружения проекта в виде { KEY: value }. Кэшируется. */
export async function getSecrets(): Promise<Record<string, string>> {
  if (!isInfisicalConfigured()) {
    throw new Error("Infisical не настроен: заполните INFISICAL_CLIENT_ID/SECRET/PROJECT_ID");
  }
  const now = Date.now();
  if (secretsCache && secretsCache.expiresAt > now) return secretsCache.values;

  const token = await login();
  const url = new URL(`${BASE}/api/v3/secrets/raw`);
  url.searchParams.set("workspaceId", PROJECT_ID!);
  url.searchParams.set("environment", ENVIRONMENT);
  url.searchParams.set("secretPath", "/");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Infisical secrets fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { secrets: Array<{ secretKey: string; secretValue: string }> };
  const values: Record<string, string> = {};
  for (const s of data.secrets) values[s.secretKey] = s.secretValue;

  secretsCache = { values, expiresAt: now + SECRETS_TTL_MS };
  return values;
}

export interface SmtpConfig {
  host: string;
  port: number;
  starttls: boolean;
  username: string;
  password: string;
  from: string;
  fromName: string;
}

/** Достаёт SMTP-конфиг из Infisical (с фолбэком на переменные окружения). */
export async function getSmtpConfig(): Promise<SmtpConfig> {
  let s: Record<string, string> = {};
  try {
    s = await getSecrets();
  } catch (e) {
    // Фолбэк: если Infisical недоступен, пробуем переменные окружения процесса
    s = {};
  }
  const pick = (k: string) => s[k] ?? process.env[k] ?? "";

  const host = pick("SMTP_HOST");
  const password = pick("SMTP_PASSWORD");
  const username = pick("SMTP_USERNAME");
  if (!host || !username || !password) {
    throw new Error("SMTP не настроен в Infisical (SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD)");
  }

  return {
    host,
    port: Number(pick("SMTP_PORT") || 587),
    starttls: (pick("SMTP_STARTTLS") || "true").toLowerCase() === "true",
    username,
    password,
    from: pick("SMTP_FROM") || username,
    fromName: pick("SMTP_FROM_NAME") || "Bulut",
  };
}
