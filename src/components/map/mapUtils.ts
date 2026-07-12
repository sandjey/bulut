import dagre from "@dagrejs/dagre";
import { toPng } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import type { MapNode, MapEdge } from "@/lib/map-types";

/** Автораскладка узлов по связям (dagre). dir: 'LR' | 'TB'. */
export function autoLayout(nodes: MapNode[], edges: MapEdge[], dir: "LR" | "TB" = "LR"): MapNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: dir, nodesep: 48, ranksep: 90, marginx: 20, marginy: 20 });

  const dim = (n: MapNode) => ({
    w: n.measured?.width ?? (n.width as number) ?? 200,
    h: n.measured?.height ?? (n.height as number) ?? 70,
  });

  nodes.forEach((n) => {
    const { w, h } = dim(n);
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    const { w, h } = dim(n);
    return { ...n, position: { x: p.x - w / 2, y: p.y - h / 2 } };
  });
}

/**
 * Выравнивание «на месте»: НЕ перекладывает узлы в новую схему, а аккуратно
 * ровняет их там, где они стоят — близкие по вертикали встают в одну строку,
 * близкие по горизонтали — в одну колонку, всё прилипает к сетке.
 */
export function tidyInPlace(nodes: MapNode[], grid = 20, thresh = 52): MapNode[] {
  // Кластеризация по оси: близкие значения получают общий «якорь».
  const anchorFor = (axis: "x" | "y") => {
    const sorted = [...nodes].sort((a, b) => a.position[axis] - b.position[axis]);
    const map = new Map<string, number>();
    let anchor: number | null = null;
    for (const n of sorted) {
      const v = n.position[axis];
      if (anchor === null || v - anchor > thresh) anchor = v;
      map.set(n.id, anchor);
    }
    return map;
  };
  const xa = anchorFor("x");
  const ya = anchorFor("y");
  const snap = (v: number) => Math.round(v / grid) * grid;
  return nodes.map((n) => ({
    ...n,
    position: { x: snap(xa.get(n.id) ?? n.position.x), y: snap(ya.get(n.id) ?? n.position.y) },
  }));
}

/**
 * Разводит вертикальные наложения В КОЛОНКАХ: если карточка выросла и налезает
 * на нижнюю — двигает нижние вниз, сохраняя минимальный зазор. Только вниз,
 * порядок сохраняется. Идемпотентно (повторный вызов ничего не меняет).
 */
export function resolveOverlaps(
  nodes: MapNode[],
  captionIds?: Set<string>,
  minGap = 22,
  colThresh = 140,
): MapNode[] {
  // высота карточки + запас под статус-подпись (она висит снаружи снизу)
  const heightOf = (n: MapNode) => {
    const h =
      n.measured?.height ??
      (n.height as number | undefined) ??
      (typeof n.style?.height === "number" ? n.style.height : undefined) ??
      72;
    return h + (captionIds?.has(n.id) ? 42 : 0);
  };

  // Группируем по колонкам (близкие по X). Группы-контейнеры не трогаем.
  const items = nodes.filter((n) => n.data?.kind !== "group");
  const sortedX = [...items].sort((a, b) => a.position.x - b.position.x);
  const colOf = new Map<string, number>();
  let anchor: number | null = null;
  let idx = -1;
  for (const n of sortedX) {
    if (anchor === null || n.position.x - anchor > colThresh) {
      anchor = n.position.x;
      idx++;
    }
    colOf.set(n.id, idx);
  }

  const columns = new Map<number, MapNode[]>();
  for (const n of items) {
    const ci = colOf.get(n.id)!;
    if (!columns.has(ci)) columns.set(ci, []);
    columns.get(ci)!.push(n);
  }

  const moved = new Map<string, number>();
  for (const list of columns.values()) {
    list.sort((a, b) => a.position.y - b.position.y);
    let prevBottom = -Infinity;
    for (const n of list) {
      let y = n.position.y;
      if (y < prevBottom + minGap) {
        y = prevBottom + minGap;
        if (Math.abs(y - n.position.y) > 0.5) moved.set(n.id, y);
      }
      prevBottom = y + heightOf(n);
    }
  }

  if (moved.size === 0) return nodes;
  return nodes.map((n) =>
    moved.has(n.id) ? { ...n, position: { x: n.position.x, y: moved.get(n.id)! } } : n,
  );
}

function download(dataUrl: string, name: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  a.click();
}

/** Экспорт карты в PNG (снимок всех узлов). */
export async function exportPng(nodes: MapNode[], name: string) {
  if (nodes.length === 0) return;
  const bounds = getNodesBounds(nodes);
  const pad = 80;
  const width = Math.min(4096, Math.max(640, bounds.width + pad * 2));
  const height = Math.min(4096, Math.max(480, bounds.height + pad * 2));
  const vp = getViewportForBounds(bounds, width, height, 0.3, 2, 0.12);
  const el = document.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!el) return;
  const dark = document.documentElement.classList.contains("dark");
  const dataUrl = await toPng(el, {
    backgroundColor: dark ? "#09090c" : "#f0f0f6",
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
  });
  download(dataUrl, `${name || "bulut-map"}.png`);
}

/** Экспорт графа в JSON. */
export function exportJson(nodes: MapNode[], edges: MapEdge[], name: string) {
  const clean = {
    nodes: nodes.map(({ selected, dragging, ...n }) => n),
    edges: edges.map(({ selected, ...e }) => e),
  };
  const blob = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(clean, null, 2));
  download(blob, `${name || "bulut-map"}.json`);
}

/** Разбор импортируемого JSON. */
export function parseImport(text: string): { nodes: MapNode[]; edges: MapEdge[] } | null {
  try {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.nodes)) return null;
    return { nodes: data.nodes as MapNode[], edges: (data.edges ?? []) as MapEdge[] };
  } catch {
    return null;
  }
}
