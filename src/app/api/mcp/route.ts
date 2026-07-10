import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { buildFlowGraph, FLOW_KINDS } from "@/lib/map-flow";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://bulut-kappa.vercel.app").replace(/\/$/, "");
const KEY = process.env.BULUT_API_KEY ?? "";

async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`);
  return data as Record<string, unknown>;
}

const kindEnum = z.enum([...FLOW_KINDS] as [string, ...string[]]);
const nodeSchema = {
  id: z.string().describe("уникальный id узла (напр. n1)"),
  kind: kindEnum.describe("terminator(начало/конец), screen, action, decision(ветвление), process, link, note, group"),
  label: z.string().describe("текст на узле"),
  description: z.string().optional(),
};
const edgeSchema = {
  from: z.string(),
  to: z.string(),
  label: z.string().optional().describe("подпись стрелки, напр. «да»/«нет»"),
};

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "create_flow",
      "Создать флоу-карту в Bulut MAP. Опиши узлы и связи — сервер разложит их и вернёт ссылку. Ветвление: kind:'decision' + подписи стрелок «да»/«нет».",
      {
        name: z.string().describe("название карты"),
        color: z.string().optional().describe("hex, напр. #6366f1"),
        nodes: z.array(z.object(nodeSchema)).min(1),
        edges: z.array(z.object(edgeSchema)).default([]),
      },
      async ({ name, color, nodes, edges }) => {
        const graph = buildFlowGraph(nodes, edges);
        const res = await api("/api/maps", "POST", { name, color, graph });
        return {
          content: [
            { type: "text", text: `Карта «${name}» создана (${graph.nodes.length} узлов, ${graph.edges.length} связей): ${BASE}/maps/${res.id}` },
          ],
        };
      },
    );

    server.tool("list_flows", "Список флоу-карт в Bulut.", {}, async () => {
      const res = await api("/api/maps");
      const arr = (res.data as Array<Record<string, unknown>>) ?? [];
      const text = arr.map((m) => `• ${m.name} — ${BASE}/maps/${m.id} (id: ${m.id})`).join("\n") || "Карт пока нет.";
      return { content: [{ type: "text", text }] };
    });

    server.tool("get_flow", "Получить граф карты по id.", { id: z.string() }, async ({ id }) => {
      const res = await api(`/api/maps/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    });

    server.tool(
      "update_flow",
      "Перезаписать содержимое карты (узлы и связи) по id.",
      {
        id: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        nodes: z.array(z.object(nodeSchema)).min(1),
        edges: z.array(z.object(edgeSchema)).default([]),
      },
      async ({ id, name, color, nodes, edges }) => {
        const graph = buildFlowGraph(nodes, edges);
        await api(`/api/maps/${id}`, "PATCH", { ...(name ? { name } : {}), ...(color ? { color } : {}), graph });
        return { content: [{ type: "text", text: `Карта обновлена: ${BASE}/maps/${id}` }] };
      },
    );

    server.tool("delete_flow", "Удалить карту по id.", { id: z.string() }, async ({ id }) => {
      await api(`/api/maps/${id}`, "DELETE");
      return { content: [{ type: "text", text: `Карта ${id} удалена.` }] };
    });

    server.tool(
      "link_task_to_node",
      "Привязать задачу к экрану (узлу) карты: задача появится на этом узле, статус-светофор обновится.",
      { taskId: z.string(), mapId: z.string(), nodeId: z.string() },
      async ({ taskId, mapId, nodeId }) => {
        await api(`/api/tasks/${taskId}`, "PATCH", { mapId, mapNodeId: nodeId });
        return { content: [{ type: "text", text: `Задача ${taskId} привязана к экрану ${nodeId}.` }] };
      },
    );

    server.tool(
      "map_health",
      "Здоровье карты: статус каждого экрана по задачам (🔴 открытый баг · 🟡 в работе · 🟢 готово · ⚪ нет задач).",
      { mapId: z.string() },
      async ({ mapId }) => {
        const map = (await api(`/api/maps/${mapId}`)) as { name?: string; graph?: { nodes?: Array<Record<string, unknown>> } };
        const tasksRes = (await api(`/api/tasks?mapId=${mapId}&limit=200`)) as { data?: Array<Record<string, unknown>> };
        const tasks = tasksRes.data ?? [];
        const nodes = (map.graph?.nodes ?? []).filter((n) => {
          const kind = (n.data as { kind?: string })?.kind;
          return kind !== "note" && kind !== "group";
        });
        const emoji: Record<string, string> = { empty: "⚪", ok: "🟢", wip: "🟡", bug: "🔴" };
        const lines = nodes.map((n) => {
          const d = n.data as { label?: string; statusOverride?: string };
          const linked = tasks.filter((t) => t.mapNodeId === n.id);
          const bugs = linked.filter((t) => t.type === "bug" && t.status !== "done").length;
          const active = linked.filter((t) => t.status !== "done").length;
          const status = d.statusOverride ?? (linked.length === 0 ? "empty" : bugs > 0 ? "bug" : active > 0 ? "wip" : "ok");
          return `${emoji[status] ?? "⚪"} ${d.label || "экран"} — задач: ${linked.length}${bugs ? `, багов: ${bugs}` : ""}`;
        });
        const header = `Карта «${map.name ?? mapId}» — экранов: ${nodes.length}`;
        return { content: [{ type: "text", text: [header, ...lines].join("\n") || "Нет экранов." }] };
      },
    );
  },
  {},
  { basePath: "/api" },
);

/** Простая авторизация: ?key=<BULUT_API_KEY> в URL (или заголовок X-API-Key). */
function authed(req: Request): boolean {
  const key = new URL(req.url).searchParams.get("key") ?? req.headers.get("x-api-key");
  return Boolean(KEY) && key === KEY;
}

async function guarded(req: Request): Promise<Response> {
  if (!authed(req)) {
    return new Response(JSON.stringify({ error: "unauthorized: добавьте ?key=<BULUT_API_KEY> к URL" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
