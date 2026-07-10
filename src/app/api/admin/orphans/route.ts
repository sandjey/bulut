import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isServiceConfigured, serviceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/** Список аккаунтов Auth без профиля (осиротевшие). Только для owner/admin. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!jwt) return json({ error: "Не авторизован" }, 401);

  if (!isServiceConfigured()) {
    // Не ошибка — просто фича недоступна без ключа.
    return json({ configured: false, orphans: [] });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: caller, error: cErr } = await authClient.auth.getUser(jwt);
  if (cErr || !caller.user) return json({ error: "Сессия недействительна" }, 401);

  const svc = serviceClient();
  const { data: callerProfile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", caller.user.id)
    .single();
  const callerRole = callerProfile?.role ?? "member";
  if (callerRole !== "owner" && callerRole !== "admin") {
    return json({ error: "Недостаточно прав" }, 403);
  }

  // Все профили (id) и все аккаунты Auth
  const { data: profs } = await svc.from("profiles").select("id");
  const profileIds = new Set((profs ?? []).map((p) => p.id as string));

  const { data: list, error: lErr } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (lErr) return json({ error: `Не удалось получить список: ${lErr.message}` }, 500);

  const orphans = (list?.users ?? [])
    .filter((u) => !profileIds.has(u.id))
    .map((u) => ({ id: u.id, email: u.email ?? "", createdAt: u.created_at }));

  return json({ configured: true, orphans });
}
