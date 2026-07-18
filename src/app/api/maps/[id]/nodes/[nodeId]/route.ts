import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";
import { loadGraph, saveGraph, patchNode } from "@/lib/api-map";

// ─── PATCH /api/maps/:id/nodes/:nodeId ── изменить узел ────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string; nodeId: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Некорректный JSON", 400);
  }

  const g = await loadGraph(auth.db, params.id);
  if (!g.ok) return err(g.error, g.status);

  const idx = g.value.nodes.findIndex((n) => n.id === params.nodeId);
  if (idx < 0) return err("Узел не найден", 404);
  g.value.nodes[idx] = patchNode(g.value.nodes[idx], body);

  const saved = await saveGraph(auth.db, params.id, g.value);
  if (!saved.ok) return err(saved.error, saved.status);
  return ok({ id: params.nodeId, node: g.value.nodes[idx] });
}

// ─── DELETE /api/maps/:id/nodes/:nodeId ── удалить узел (и его связи) ───────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string; nodeId: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);

  const g = await loadGraph(auth.db, params.id);
  if (!g.ok) return err(g.error, g.status);
  if (!g.value.nodes.some((n) => n.id === params.nodeId)) return err("Узел не найден", 404);

  g.value.nodes = g.value.nodes.filter((n) => n.id !== params.nodeId);
  g.value.edges = g.value.edges.filter((e) => e.source !== params.nodeId && e.target !== params.nodeId);

  const saved = await saveGraph(auth.db, params.id, g.value);
  if (!saved.ok) return err(saved.error, saved.status);
  return ok({ id: params.nodeId, deleted: true });
}
