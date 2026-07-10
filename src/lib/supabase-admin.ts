import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Настроен ли service_role (нужен для удаления аккаунтов из auth.users). */
export function isServiceConfigured(): boolean {
  return Boolean(url && serviceKey);
}

/** Клиент с service_role — обходит RLS. Использовать ТОЛЬКО на сервере после авторизации. */
export function serviceClient(): SupabaseClient {
  if (!url || !serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY не задан");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
