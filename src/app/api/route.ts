import { NextRequest } from "next/server";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bulut-kappa.vercel.app";

export async function GET(_req: NextRequest) {
  return Response.json({
    name: "Bulut API",
    version: "2.0",
    docs: `${BASE}/BULUT_API.md`,
    auth: {
      header: "X-API-Key: <BULUT_API_KEY>  (или Authorization: Bearer <supabase-jwt>)",
    },
    workspace: {
      note: "Данные разделены по комнатам. Укажите X-Workspace-Id: <id> (или ?workspace=<id>). Без него берётся первая комната API-аккаунта.",
      list: "GET /api/workspaces",
    },
    endpoints: {
      "GET /api/workspaces": "Комнаты, доступные ключу",
      "GET /api/boards": "Доски комнаты (с колонками и счётчиками)",
      "POST /api/boards": "Создать доску { name?, color?, columns?: string[] }",
      "GET /api/tasks": "Список задач (фильтры: boardId, columnId, status, priority, type, assignee, search, overdue, mapId, mapNodeId, subtasks, page, limit)",
      "POST /api/tasks": "Создать задачу { title*, boardId*, columnId*, ... }",
      "GET /api/tasks/:id": "Задача + комментарии",
      "PATCH /api/tasks/:id": "Изменить задачу (любые поля + status)",
      "DELETE /api/tasks/:id": "Удалить задачу",
      "GET /api/maps": "Карты комнаты",
      "GET /api/maps/:id": "Карта + плоский список узлов [{id,label,kind}]",
      "POST /api/maps": "Создать карту",
      "PATCH /api/maps/:id": "Изменить карту",
      "DELETE /api/maps/:id": "Удалить карту",
    },
    example: {
      url: `${BASE}/api/tasks`,
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": "<key>", "X-Workspace-Id": "<workspace-id>" },
      body: { title: "Проверить логин", boardId: "<board-id>", columnId: "<column-id>", type: "bug", priority: "high" },
    },
  });
}
