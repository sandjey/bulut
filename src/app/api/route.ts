import { NextRequest } from "next/server";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bulut-kappa.vercel.app";

export async function GET(_req: NextRequest) {
  return Response.json({
    name: "Bulut API",
    version: "1.0",
    auth: {
      methods: [
        "Authorization: Bearer <supabase-jwt>",
        "X-API-Key: <BULUT_API_KEY>",
      ],
    },
    endpoints: {
      boards: {
        "GET /api/boards": "List all boards with columns and task counts",
      },
      tasks: {
        "GET /api/tasks": {
          description: "List tasks with filters and pagination",
          params: {
            boardId:     "UUID – filter by board",
            columnId:    "string – filter by column",
            assignee:    "string – filter by assignee (case-insensitive)",
            status:      "active | done",
            priority:    "low | medium | high",
            type:        "task | bug | feature | newfeature | improvement | refactor | docs | test | design | research",
            search:      "string – search in title and description",
            dueAfter:    "YYYY-MM-DD – due date from",
            dueBefore:   "YYYY-MM-DD – due date to",
            hasAssignee: "true | false",
            overdue:     "true – tasks past due date",
            sort:        "created_at | due_date | position | title  (default: position)",
            order:       "asc | desc  (default: asc)",
            page:        "number (default: 1)",
            limit:       "number (default: 50, max: 200)",
          },
        },
        "POST /api/tasks": {
          description: "Create a new task",
          body: {
            title:       "string (required)",
            boardId:     "UUID (required)",
            columnId:    "string (required)",
            description: "string",
            assignee:    "string",
            priority:    "low | medium | high  (default: medium)",
            type:        "task | bug | feature | ...  (default: task)",
            dueDate:     "YYYY-MM-DD",
            tags:        "string[]",
            checklist:   "{ text: string; done?: boolean }[]",
            attachments: "{ name: string; url: string }[]",
          },
        },
        "GET /api/tasks/:id":    "Get single task with comments",
        "PATCH /api/tasks/:id":  "Update task fields (any subset of POST body + status)",
        "DELETE /api/tasks/:id": "Delete task",
      },
    },
    examples: {
      getAllTasks:     `GET ${BASE}/api/tasks`,
      filterByBoard:  `GET ${BASE}/api/tasks?boardId=<uuid>&status=active`,
      search:         `GET ${BASE}/api/tasks?search=логин&priority=high`,
      overdue:        `GET ${BASE}/api/tasks?overdue=true`,
      paginate:       `GET ${BASE}/api/tasks?page=2&limit=20`,
      createTask: {
        method:  "POST",
        url:     `${BASE}/api/tasks`,
        headers: { "Content-Type": "application/json", "X-API-Key": "<your-key>" },
        body: {
          title:    "Исправить баг авторизации",
          boardId:  "<board-uuid>",
          columnId: "<column-id>",
          assignee: "Иван",
          priority: "high",
          type:     "bug",
          dueDate:  "2026-07-10",
          checklist: [{ text: "Воспроизвести баг" }, { text: "Написать тест" }],
        },
      },
    },
  });
}
