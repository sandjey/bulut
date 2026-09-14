import { NextRequest } from "next/server";
import { authenticate, resolveWorkspace, err, ok } from "@/lib/api-auth";

// ─── GET /api/members ─────────────────────────────────────────────────────────
// Реальные пользователи активной комнаты. Поле `assignee` — ровно та строка,
// которую нужно передавать в задачу (tasks.assignee), чтобы карточка привязалась
// к живому человеку так же, как при выборе в интерфейсе.
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;
  const ws = await resolveWorkspace(db, req);
  if (!ws.ok) return err(ws.error, ws.status);

  const { data: rows, error } = await db
    .from("workspace_members")
    .select("id,user_id,role,permissions,created_at")
    .eq("workspace_id", ws.workspaceId);
  if (error) return err(error.message, 500);

  const ids = (rows ?? []).map((r) => r.user_id as string);
  type Prof = { id: string; name: string | null; email: string | null; job_role: string | null; deleted_at: string | null };
  const profById = new Map<string, Prof>();
  if (ids.length) {
    const { data: profs, error: pErr } = await db
      .from("profiles")
      .select("id,name,email,job_role,deleted_at")
      .in("id", ids);
    if (pErr) return err(pErr.message, 500);
    for (const p of (profs ?? []) as Prof[]) profById.set(p.id, p);
  }

  const data = (rows ?? [])
    .map((r) => {
      const p = profById.get(r.user_id as string);
      const name = (p?.name ?? "").trim();
      const email = (p?.email ?? "").trim();
      return {
        memberId: r.id,
        userId: r.user_id,
        name,
        email,
        assignee: name || email, // ← это писать в task.assignee
        jobRole: p?.job_role ?? "",
        role: r.role, // owner | admin | member
        permissions: r.permissions ?? [],
        deleted: Boolean(p?.deleted_at),
        joinedAt: r.created_at,
      };
    })
    .sort((a, b) =>
      a.deleted !== b.deleted ? (a.deleted ? 1 : -1) : a.assignee.localeCompare(b.assignee, "ru"),
    );

  return ok({ data, total: data.length, workspaceId: ws.workspaceId });
}
