import { NextRequest } from "next/server";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bulut.my";

export async function GET(_req: NextRequest) {
  return Response.json({
    name: "Bulut API",
    version: "3.0",
    docs: `${BASE}/BULUT_API.md`,
    docs_for_ai: `${BASE}/BULUT_CLAUDE.md`,
    auth: {
      how: "Войдите своим аккаунтом → получите токен → шлите его в Authorization: Bearer <token>",
      login: "POST /api/auth/token  { email, password }  → { access_token, refresh_token }",
      refresh: "POST /api/auth/token  { refresh_token }",
      note: "Доступ определяется вашими комнатами (RLS). Env-ключи и сервисные аккаунты не нужны.",
    },
    workspace: {
      note: "Данные разделены по комнатам. Укажите X-Workspace-Id: <id> (или ?workspace=<id>).",
      list: "GET /api/workspaces",
    },
    endpoints: {
      "POST /api/auth/token": "Вход/обновление токена",
      "GET /api/workspaces": "Ваши комнаты",
      "GET /api/members": "Участники комнаты (реальные пользователи для assignee)",
      "GET /api/boards": "Доски комнаты (с колонками)",
      "POST /api/boards": "Создать доску",
      "GET /api/boards/:id": "Одна доска (колонки, счётчики, свои поля)",
      "PATCH /api/boards/:id": "Изменить доску (name, color, columns, position, restore)",
      "DELETE /api/boards/:id": "Удалить доску (мягко; ?hard=true — навсегда)",
      "GET /api/tasks": "Список задач (фильтры)",
      "POST /api/tasks": "Создать задачу",
      "GET /api/tasks/:id": "Задача + комментарии",
      "PATCH /api/tasks/:id": "Изменить/переместить задачу (columnId, position, status…)",
      "DELETE /api/tasks/:id": "Удалить задачу (мягко; ?hard=true — навсегда)",
      "GET /api/tasks/:id/comments": "Комментарии задачи",
      "POST /api/tasks/:id/comments": "Добавить комментарий",
      "GET /api/journal": "Журнал комнаты",
      "POST /api/journal": "Создать запись журнала",
      "DELETE /api/journal/:id": "Удалить запись",
      "GET /api/maps": "Карты комнаты",
      "GET /api/maps/:id": "Карта + узлы [{id,label,kind}]",
      "POST /api/maps · PATCH /api/maps/:id · DELETE /api/maps/:id": "CRUD карт",
      "POST /api/maps/:id/nodes": "Добавить узел на карту",
      "PATCH /api/maps/:id/nodes/:nodeId · DELETE": "Изменить/удалить узел",
      "POST /api/maps/:id/edges": "Добавить связь (стрелку)",
      "DELETE /api/maps/:id/edges/:edgeId": "Удалить связь",
    },
    docs_map: `${BASE}/BULUT_MAP_API.md`,
  });
}
