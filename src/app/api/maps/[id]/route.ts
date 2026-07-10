import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";

// ─── GET /api/maps/:id ── карта с графом ───────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { data, error } = await auth.db
    .from("project_maps")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err("Карта не найдена", 404);
  return ok({
    id: data.id,
    name: data.name,
    color: data.color,
    graph: data.graph,
    updatedAt: data.updated_at,
  });
}

// ─── PATCH /api/maps/:id ── обновить (имя/цвет/граф) ───────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);

  let body: { name?: string; color?: string; graph?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("Некорректный JSON", 400);
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) row.name = String(body.name).slice(0, 200);
  if (body.color !== undefined) row.color = String(body.color);
  if (body.graph !== undefined) row.graph = body.graph;

  const { error } = await auth.db.from("project_maps").update(row).eq("id", params.id);
  if (error) return err(error.message, 500);
  return ok({ id: params.id, updated: true });
}

// ─── DELETE /api/maps/:id ──────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { error } = await auth.db.from("project_maps").delete().eq("id", params.id);
  if (error) return err(error.message, 500);
  return ok({ id: params.id, deleted: true });
}
