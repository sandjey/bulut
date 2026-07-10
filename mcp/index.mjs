#!/usr/bin/env node
/**
 * Bulut MAP — MCP-сервер.
 * Даёт Claude инструменты создавать/читать флоу-карты в Bulut через его API.
 * Claude сам придумывает узлы и связи; сервер раскладывает их и рисует.
 *
 * Требует env:
 *   BULUT_API_URL   — база API (напр. https://bulut-kappa.vercel.app)
 *   BULUT_API_KEY   — секретный ключ интеграции (BULUT_API_KEY из проекта)
 *   BULUT_SITE_URL  — (необязательно) база сайта для ссылок, по умолчанию = BULUT_API_URL
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = (process.env.BULUT_API_URL || "https://bulut-kappa.vercel.app").replace(/\/$/, "");
const SITE = (process.env.BULUT_SITE_URL || API).replace(/\/$/, "");
const KEY = process.env.BULUT_API_KEY || "";

const KINDS = ["terminator", "screen", "action", "decision", "process", "link", "note", "group"];
const COLOR = {
  terminator: "#10b981",
  screen: "#6366f1",
  action: "#0ea5e9",
  decision: "#f59e0b",
  process: "#8b5cf6",
  link: "#14b8a6",
  note: "#eab308",
  group: "#64748b",
};
const SIZE = {
  terminator: { w: 190, h: 58 },
  screen: { w: 212, h: 76 },
  action: { w: 212, h: 76 },
  decision: { w: 212, h: 84 },
  process: { w: 212, h: 76 },
  link: { w: 230, h: 78 },
  note: { w: 200, h: 112 },
  group: { w: 330, h: 220 },
};

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function api(path, method = "GET", body) {
  if (!KEY) throw new Error("BULUT_API_KEY не задан в окружении MCP-сервера");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/** Простая слоистая раскладка слева-направо (по самому длинному пути от старта). */
function layout(nodes, edges) {
  const level = Object.fromEntries(nodes.map((n) => [n.id, 0]));
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
  const byLevel = {};
  for (const n of nodes) (byLevel[level[n.id] ?? 0] ||= []).push(n);
  const COLW = 320;
  const ROWH = 128;
  const pos = {};
  for (const [lv, ns] of Object.entries(byLevel)) {
    ns.forEach((n, i) => {
      pos[n.id] = { x: Number(lv) * COLW, y: i * ROWH };
    });
  }
  return pos;
}

function buildGraph(nodes, edges) {
  // валидируем ссылки рёбер
  const ids = new Set(nodes.map((n) => n.id));
  const goodEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const pos = layout(nodes, goodEdges);
  const bnodes = nodes.map((n) => {
    const kind = KINDS.includes(n.kind) ? n.kind : "action";
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
  const bedges = goodEdges.map((e) => ({
    id: uuid(),
    source: e.from,
    target: e.to,
    type: "default",
    markerEnd: { type: "arrowclosed", width: 22, height: 22 },
    ...(e.label ? { label: e.label } : {}),
  }));
  return { nodes: bnodes, edges: bedges, viewport: { x: 0, y: 0, zoom: 1 } };
}

const server = new McpServer({ name: "bulut-map", version: "1.0.0" });

const nodeShape = z.object({
  id: z.string().describe("уникальный id узла в пределах флоу (напр. n1)"),
  kind: z.enum(KINDS).describe("тип: terminator(начало/конец), screen, action, decision(ветвление), process, link, note, group"),
  label: z.string().describe("текст на узле"),
  description: z.string().optional().describe("необязательное описание"),
});
const edgeShape = z.object({
  from: z.string().describe("id узла-источника"),
  to: z.string().describe("id узла-приёмника"),
  label: z.string().optional().describe("подпись стрелки (напр. «да»/«нет»)"),
});

server.tool(
  "create_flow",
  "Создать новую флоу-карту в Bulut MAP. Опиши узлы и связи — сервер разложит их и вернёт ссылку. Для ветвления используй kind:'decision' и подписи стрелок «да»/«нет».",
  {
    name: z.string().describe("название карты"),
    color: z.string().optional().describe("hex-цвет карты, напр. #6366f1"),
    nodes: z.array(nodeShape).min(1),
    edges: z.array(edgeShape).default([]),
  },
  async ({ name, color, nodes, edges }) => {
    const graph = buildGraph(nodes, edges);
    const res = await api("/api/maps", "POST", { name, color, graph });
    const url = `${SITE}/maps/${res.id}`;
    return {
      content: [
        {
          type: "text",
          text: `Карта «${name}» создана: ${res.nodeCount ?? graph.nodes.length} узлов, ${graph.edges.length} связей.\nОткрыть: ${url}`,
        },
      ],
    };
  },
);

server.tool("list_flows", "Список флоу-карт в Bulut.", {}, async () => {
  const res = await api("/api/maps");
  const lines = (res.data ?? []).map(
    (m) => `• ${m.name} — ${m.nodeCount} узлов, ${m.edgeCount} связей — ${SITE}/maps/${m.id}  (id: ${m.id})`,
  );
  return { content: [{ type: "text", text: lines.join("\n") || "Карт пока нет." }] };
});

server.tool(
  "get_flow",
  "Получить граф карты по id (узлы и связи).",
  { id: z.string() },
  async ({ id }) => {
    const res = await api(`/api/maps/${id}`);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  },
);

server.tool(
  "update_flow",
  "Перезаписать содержимое существующей карты (узлы и связи) по id.",
  {
    id: z.string(),
    name: z.string().optional(),
    color: z.string().optional(),
    nodes: z.array(nodeShape).min(1),
    edges: z.array(edgeShape).default([]),
  },
  async ({ id, name, color, nodes, edges }) => {
    const graph = buildGraph(nodes, edges);
    await api(`/api/maps/${id}`, "PATCH", { ...(name ? { name } : {}), ...(color ? { color } : {}), graph });
    return { content: [{ type: "text", text: `Карта обновлена: ${SITE}/maps/${id}` }] };
  },
);

server.tool("delete_flow", "Удалить карту по id.", { id: z.string() }, async ({ id }) => {
  await api(`/api/maps/${id}`, "DELETE");
  return { content: [{ type: "text", text: `Карта ${id} удалена.` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("bulut-map MCP запущен");
