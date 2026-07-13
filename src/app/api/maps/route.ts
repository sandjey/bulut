import { NextRequest } from "next/server";
import { authenticate, resolveWorkspace, err, ok } from "@/lib/api-auth";

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const EMPTY_GRAPH = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };

// ─── GET /api/maps ── список карт ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const ws = await resolveWorkspace(auth.db, req);
  if (!ws.ok) return err(ws.error, ws.status);
  const { data, error } = await auth.db
    .from("project_maps")
    .select("id,name,color,graph,updated_at")
    .eq("workspace_id", ws.workspaceId)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (error) return err(error.message, 500);
  const maps = (data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id,
    name: m.name,
    color: m.color,
    updatedAt: m.updated_at,
    nodeCount: (m.graph as { nodes?: unknown[] })?.nodes?.length ?? 0,
    edgeCount: (m.graph as { edges?: unknown[] })?.edges?.length ?? 0,
  }));
  return ok({ data: maps, total: maps.length });
}

// ─── POST /api/maps ── создать карту ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const ws = await resolveWorkspace(auth.db, req);
  if (!ws.ok) return err(ws.error, ws.status);

  let body: { name?: string; color?: string; graph?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("Некорректный JSON", 400);
  }

  const id = uuid();
  const row = {
    id,
    user_id: auth.userId,
    workspace_id: ws.workspaceId,
    name: (body.name ?? "Новая карта").toString().slice(0, 200),
    color: (body.color ?? "#6366f1").toString(),
    graph: body.graph ?? EMPTY_GRAPH,
    position: 0,
  };
  const { error } = await auth.db.from("project_maps").insert(row);
  if (error) return err(error.message, 500);
  return ok({ id, name: row.name, color: row.color }, 201);
}
