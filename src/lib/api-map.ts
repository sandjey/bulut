// Помощники для REST-API управления Bulut MAP (узлы/связи внутри графа-JSONB).
import type { SupabaseClient } from "@supabase/supabase-js";
import { NODE_SIZE, NODE_KIND_META, type MapNodeKind } from "./map-types";

export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const KINDS: MapNodeKind[] = ["terminator", "screen", "action", "decision", "process", "note", "group", "number", "link"];
const STATUSES = ["ok", "wip", "bug"];

interface GraphNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  style?: Record<string, unknown>;
  [k: string]: unknown;
}
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  [k: string]: unknown;
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport?: unknown;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

/** Прочитать граф карты (с учётом RLS текущего пользователя). */
export async function loadGraph(db: SupabaseClient, id: string): Promise<Result<Graph>> {
  const { data, error } = await db.from("project_maps").select("graph").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: false, error: "Карта не найдена", status: 404 };
  const g = (data.graph ?? {}) as Partial<Graph>;
  return { ok: true, value: { nodes: g.nodes ?? [], edges: g.edges ?? [], viewport: g.viewport } };
}

/** Записать граф обратно. */
export async function saveGraph(db: SupabaseClient, id: string, graph: Graph): Promise<Result<true>> {
  const { error } = await db
    .from("project_maps")
    .update({ graph, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, value: true };
}

interface NodeInput {
  kind?: string;
  label?: string;
  color?: string;
  description?: string;
  statusOverride?: string;
  link?: { boardId?: string; taskId?: string; url?: string };
  x?: number;
  y?: number;
}

/** Собрать корректный узел для графа (рендерится в приложении). */
export function buildNode(body: NodeInput): GraphNode {
  const kind = (KINDS.includes(body.kind as MapNodeKind) ? body.kind : "screen") as MapNodeKind;
  const sz = NODE_SIZE[kind];
  const meta = NODE_KIND_META[kind];
  const data: Record<string, unknown> = {
    label: String(body.label ?? meta.label),
    kind,
    color: body.color ?? meta.color,
  };
  if (body.description !== undefined) data.description = String(body.description);
  if (STATUSES.includes(String(body.statusOverride))) data.statusOverride = body.statusOverride;
  if (body.link && typeof body.link === "object") data.link = body.link;
  return {
    id: uuid(),
    type: "bulut",
    position: { x: Number(body.x ?? 0), y: Number(body.y ?? 0) },
    data,
    style: kind === "group" || kind === "number" ? { width: sz.w, height: sz.h } : { width: sz.w },
    ...(kind === "group" ? { zIndex: -1 } : {}),
  };
}

/** Применить изменения к data/position существующего узла. */
export function patchNode(node: GraphNode, body: NodeInput): GraphNode {
  const data = { ...(node.data ?? {}) };
  if (body.label !== undefined) data.label = String(body.label);
  if (body.color !== undefined) data.color = String(body.color);
  if (body.description !== undefined) data.description = String(body.description);
  if (body.kind !== undefined && KINDS.includes(body.kind as MapNodeKind)) data.kind = body.kind;
  if (body.statusOverride !== undefined) {
    if (STATUSES.includes(String(body.statusOverride))) data.statusOverride = body.statusOverride;
    else delete data.statusOverride; // null/пусто — вернуть авто-статус
  }
  if (body.link !== undefined) data.link = body.link ?? undefined;
  const position = {
    x: body.x !== undefined ? Number(body.x) : node.position?.x ?? 0,
    y: body.y !== undefined ? Number(body.y) : node.position?.y ?? 0,
  };
  return { ...node, data, position };
}

/** Собрать связь (стрелку). */
export function buildEdge(source: string, target: string, label?: string): GraphEdge {
  return {
    id: uuid(),
    source,
    target,
    type: "default",
    markerEnd: { type: "arrowclosed", width: 22, height: 22 },
    ...(label ? { label } : {}),
  };
}
