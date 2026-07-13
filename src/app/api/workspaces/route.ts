import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";

// ─── GET /api/workspaces ── комнаты, доступные API-аккаунту ────────────────────
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;

  const { data, error } = await db.from("workspace_members").select("role, workspaces(id, name, color)");
  if (error) return err(error.message, 500);

  type Row = { role: string; workspaces: { id: string; name: string; color: string } | null };
  const data2 = ((data ?? []) as unknown as Row[])
    .filter((r) => r.workspaces)
    .map((r) => ({ id: r.workspaces!.id, name: r.workspaces!.name, color: r.workspaces!.color, role: r.role }));

  return ok({ data: data2, total: data2.length });
}
