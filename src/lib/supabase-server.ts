import { createClient } from "@supabase/supabase-js";

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server-side client. Pass a user JWT to act as that user (RLS applies).
 *  Pass empty string "" to get an anon client (for signInWithPassword). */
export function userClient(jwt: string) {
  const headers: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {};
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers },
  });
}
