import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";
import { loadGraph, saveGraph, buildNode } from "@/lib/api-map";

// ─── POST /api/maps/:id/nodes ── добавить узел ─────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  const node = buildNode(body);
  g.value.nodes.push(node);
  const saved = await saveGraph(auth.db, params.id, g.value);
  if (!saved.ok) return err(saved.error, saved.status);

  return ok({ id: node.id, node }, 201);
}
