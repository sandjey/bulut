import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";

function toComment(c: Record<string, unknown>) {
  return { id: c.id, taskId: c.task_id, author: c.author, text: c.text, kind: c.kind, createdAt: c.created_at };
}

// ─── GET /api/tasks/:id/comments ── комментарии задачи ─────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { data, error } = await auth.db
    .from("task_comments")
    .select("*")
    .eq("task_id", params.id)
    .order("created_at", { ascending: true });
  if (error) return err(error.message, 500);
  return ok({ data: (data ?? []).map(toComment), total: (data ?? []).length });
}

// ─── POST /api/tasks/:id/comments ── добавить комментарий ──────────────────────
// Body: { text*, author?, kind?: "comment" | "return" }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);

  let body: { text?: string; author?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return err("Некорректный JSON", 400);
  }
  const text = (body.text ?? "").trim();
  if (!text) return err("'text' обязателен");

  // берём комнату задачи, чтобы проставить workspace_id
  const { data: task, error: tErr } = await auth.db
    .from("tasks")
    .select("workspace_id")
    .eq("id", params.id)
    .single();
  if (tErr || !task) return err("Задача не найдена", 404);

  const row = {
    id: crypto.randomUUID(),
    user_id: auth.userId,
    workspace_id: task.workspace_id,
    task_id: params.id,
    author: String(body.author ?? "").trim(),
    text,
    kind: body.kind === "return" ? "return" : "comment",
    created_at: new Date().toISOString(),
  };
  const { data, error } = await auth.db.from("task_comments").insert(row).select().single();
  if (error) return err(error.message, 500);
  return ok({ data: toComment(data) }, 201);
}
