/**
 * Построение графа Bulut MAP из простого описания (узлы + связи).
 * Используется MCP-эндпоинтом: LLM описывает флоу, здесь раскладываем и форматируем.
 */

export const FLOW_KINDS = [
  "terminator",
  "screen",
  "action",
  "decision",
  "process",
  "link",
  "note",
  "group",
] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

const COLOR: Record<FlowKind, string> = {
  terminator: "#10b981",
  screen: "#6366f1",
  action: "#0ea5e9",
  decision: "#f59e0b",
  process: "#8b5cf6",
  link: "#14b8a6",
  note: "#eab308",
  group: "#64748b",
};
const SIZE: Record<FlowKind, { w: number; h: number }> = {
  terminator: { w: 190, h: 58 },
  screen: { w: 212, h: 76 },
  action: { w: 212, h: 76 },
  decision: { w: 212, h: 84 },
  process: { w: 212, h: 76 },
  link: { w: 230, h: 78 },
  note: { w: 200, h: 112 },
  group: { w: 330, h: 220 },
};

export interface FlowNodeSpec {
  id: string;
  kind: string;
  label: string;
  description?: string;
}
export interface FlowEdgeSpec {
  from: string;
  to: string;
  label?: string;
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Слоистая раскладка слева-направо по самому длинному пути от старта. */
function layout(nodes: FlowNodeSpec[], edges: FlowEdgeSpec[]): Record<string, { x: number; y: number }> {
  const level: Record<string, number> = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 2000) {
    changed = false;
    for (const e of edges) {
      if (level[e.to] != null && level[e.from] != null && level[e.to] < level[e.from] + 1) {
        level[e.to] = level[e.from] + 1;
        changed = true;
      }
    }
  }
  const byLevel: Record<number, FlowNodeSpec[]> = {};
  for (const n of nodes) (byLevel[level[n.id] ?? 0] ||= []).push(n);
  const COLW = 320;
  const ROWH = 128;
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [lv, ns] of Object.entries(byLevel)) {
    ns.forEach((n, i) => {
      pos[n.id] = { x: Number(lv) * COLW, y: i * ROWH };
    });
  }
  return pos;
}

export function buildFlowGraph(nodes: FlowNodeSpec[], edges: FlowEdgeSpec[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const good = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const pos = layout(nodes, good);
  const bnodes = nodes.map((n) => {
    const kind = (FLOW_KINDS as readonly string[]).includes(n.kind) ? (n.kind as FlowKind) : "action";
    const sz = SIZE[kind];
    return {
      id: n.id,
      type: "bulut",
      position: pos[n.id] || { x: 0, y: 0 },
      width: sz.w,
      height: sz.h,
      data: {
        label: n.label ?? "",
        kind,
        color: COLOR[kind],
        ...(n.description ? { description: n.description } : {}),
      },
    };
  });
  const bedges = good.map((e) => ({
    id: uuid(),
    source: e.from,
    target: e.to,
    type: "default",
    markerEnd: { type: "arrowclosed", width: 22, height: 22 },
    ...(e.label ? { label: e.label } : {}),
  }));
  return { nodes: bnodes, edges: bedges, viewport: { x: 0, y: 0, zoom: 1 } };
}
