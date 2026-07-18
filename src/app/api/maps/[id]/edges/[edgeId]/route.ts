import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";
import { loadGraph, saveGraph } from "@/lib/api-map";

// ─── DELETE /api/maps/:id/edges/:edgeId ── удалить связь ───────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string; edgeId: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);

  const g = await loadGraph(auth.db, params.id);
  if (!g.ok) return err(g.error, g.status);
  if (!g.value.edges.some((e) => e.id === params.edgeId)) return err("Связь не найдена", 404);

  g.value.edges = g.value.edges.filter((e) => e.id !== params.edgeId);
  const saved = await saveGraph(auth.db, params.id, g.value);
  if (!saved.ok) return err(saved.error, saved.status);
  return ok({ id: params.edgeId, deleted: true });
}
