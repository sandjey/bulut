import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server-side admin client (bypasses RLS). Use only in API routes. */
export function adminClient() {
  return createClient(url, serviceKey || anonKey, {
    auth: { persistSession: false },
  });
}

/** Server-side client authenticated as the user via their JWT. */
export function userClient(jwt: string) {
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
