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
  const dataUrl = await toPng(el, {
    backgroundColor: "#09090c",
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
