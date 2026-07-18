import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";
import { loadGraph, saveGraph, buildEdge } from "@/lib/api-map";

// ─── POST /api/maps/:id/edges ── добавить связь (стрелку) ──────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);

  let body: { source?: string; target?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return err("Некорректный JSON", 400);
  }
  if (!body.source || !body.target) return err("Нужны source и target (id узлов)", 400);

  const g = await loadGraph(auth.db, params.id);
  if (!g.ok) return err(g.error, g.status);

  const ids = new Set(g.value.nodes.map((n) => n.id));
  if (!ids.has(body.source) || !ids.has(body.target)) return err("source или target — несуществующий узел", 400);

  const edge = buildEdge(body.source, body.target, body.label);
  g.value.edges.push(edge);
  const saved = await saveGraph(auth.db, params.id, g.value);
  if (!saved.ok) return err(saved.error, saved.status);

  return ok({ id: edge.id, edge }, 201);
}
