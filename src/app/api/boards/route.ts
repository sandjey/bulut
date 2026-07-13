import { NextRequest } from "next/server";
import { authenticate, resolveWorkspace, err, ok } from "@/lib/api-auth";

const DEFAULT_COLUMNS = ["К выполнению", "В процессе", "Готов к тестированию", "На проверке", "Готово"];
const BOARD_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── GET /api/boards ──────────────────────────────────────────────────────────
// Доски активной комнаты с колонками и счётчиками задач по колонкам.

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;
  const ws = await resolveWorkspace(db, req);
  if (!ws.ok) return err(ws.error, ws.status);

  const [{ data: boards, error: bErr }, { data: tasks, error: tErr }] = await Promise.all([
    db.from("boards").select("*").eq("workspace_id", ws.workspaceId).is("deleted_at", null).order("position", { ascending: true }),
    db.from("tasks").select("board_id,column_id,status").eq("workspace_id", ws.workspaceId).is("deleted_at", null),
  ]);

  if (bErr) return err(bErr.message, 500);
  if (tErr) return err(tErr.message, 500);

  const data = (boards ?? []).map((b: Record<string, unknown>) => {
    const bt = (tasks ?? []).filter((t) => t.board_id === b.id);
    const columns = ((b.columns ?? []) as { id: string; name: string }[]).map((col) => {
      const ct = bt.filter((t) => t.column_id === col.id);
      return {
        id:     col.id,
        name:   col.name,
        total:  ct.length,
        active: ct.filter((t) => t.status !== "done").length,
        done:   ct.filter((t) => t.status === "done").length,
      };
    });

    return {
      id:        b.id,
      name:      b.name,
      color:     b.color,
      createdAt: b.created_at,
      columns,
      taskCount: bt.length,
    };
  });

  return ok({ data, total: data.length });
}

// ─── POST /api/boards ── создать доску ─────────────────────────────────────────
// Body: { name?: string, color?: string, columns?: string[] }
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db, userId } = auth;
  const ws = await resolveWorkspace(db, req);
  if (!ws.ok) return err(ws.error, ws.status);

  let body: { name?: string; color?: string; columns?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    /* пустое тело — доска с дефолтами */
  }

  const names = Array.isArray(body.columns) && body.columns.length ? body.columns.map(String) : DEFAULT_COLUMNS;
  const columns = names.map((name) => ({ id: uuid(), name }));
  const id = uuid();

  const { count } = await db
    .from("boards")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws.workspaceId);

  const { error } = await db.from("boards").insert({
    id,
    user_id: userId,
    workspace_id: ws.workspaceId,
    name: (body.name ?? "Новая доска").toString().slice(0, 200),
    color: (body.color ?? BOARD_COLORS[(count ?? 0) % BOARD_COLORS.length]).toString(),
    columns,
    position: count ?? 0,
    created_at: new Date().toISOString(),
  });
  if (error) return err(error.message, 500);

  return ok({ id, name: body.name ?? "Новая доска", columns }, 201);
}
