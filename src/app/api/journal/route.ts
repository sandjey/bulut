import { NextRequest } from "next/server";
import { authenticate, resolveWorkspace, err, ok } from "@/lib/api-auth";

function toEntry(r: Record<string, unknown>) {
  return {
    id: r.id,
    taskId: r.task_id ?? null,
    date: r.date,
    boardName: r.board_name,
    taskTitle: r.task_title,
    assignee: r.assignee ?? "",
    notes: r.notes ?? "",
    stage: r.stage ?? "",
    type: r.type ?? "task",
    createdAt: r.created_at,
  };
}

// ─── GET /api/journal ── записи журнала комнаты ────────────────────────────────
// Фильтры: taskId, from (YYYY-MM-DD), to, page, limit
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const ws = await resolveWorkspace(auth.db, req);
  if (!ws.ok) return err(ws.error, ws.status);

  const q = req.nextUrl.searchParams;
  const limit = Math.min(Number(q.get("limit") ?? 50), 200);
  const page = Math.max(Number(q.get("page") ?? 1), 1);
  const from = (page - 1) * limit;

  let query = auth.db
    .from("journal")
    .select("*", { count: "exact" })
    .eq("workspace_id", ws.workspaceId)
    .is("deleted_at", null);
  if (q.get("taskId")) query = query.eq("task_id", q.get("taskId")!);
  if (q.get("from")) query = query.gte("date", q.get("from")!);
  if (q.get("to")) query = query.lte("date", q.get("to")!);

  const { data, error, count } = await query.order("date", { ascending: false }).range(from, from + limit - 1);
  if (error) return err(error.message, 500);
  return ok({ data: (data ?? []).map(toEntry), meta: { total: count ?? 0, page, limit } });
}

// ─── POST /api/journal ── создать запись ───────────────────────────────────────
// Body: { boardName, taskTitle, notes?, stage?, assignee?, type?, taskId?, date? }
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const ws = await resolveWorkspace(auth.db, req);
  if (!ws.ok) return err(ws.error, ws.status);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Некорректный JSON", 400);
  }

  const row = {
    id: crypto.randomUUID(),
    user_id: auth.userId,
    workspace_id: ws.workspaceId,
    task_id: (body.taskId as string) ?? null,
    date: (body.date as string) ?? new Date().toISOString().slice(0, 10),
    board_name: String(body.boardName ?? ""),
    task_title: String(body.taskTitle ?? ""),
    assignee: String(body.assignee ?? ""),
    notes: String(body.notes ?? ""),
    stage: String(body.stage ?? ""),
    type: String(body.type ?? "task"),
    created_at: new Date().toISOString(),
  };
  const { data, error } = await auth.db.from("journal").insert(row).select().single();
  if (error) return err(error.message, 500);
  return ok({ data: toEntry(data) }, 201);
}
