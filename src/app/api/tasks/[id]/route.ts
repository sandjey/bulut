import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";

// ─── GET /api/tasks/:id ───────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;

  const { data, error } = await db
    .from("tasks")
    .select("*, task_comments(*)")
    .eq("id", params.id)
    .single();

  if (error || !data) return err("Task not found", 404);

  return ok({ data: toTaskDetailResponse(data) });
}

// ─── PATCH /api/tasks/:id ─────────────────────────────────────────────────────
// Body (any subset):
//   title, description, assignee, priority, type, status,
//   dueDate, tags, columnId, checklist, attachments

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("Invalid JSON body"); }

  const PRIORITIES = ["low", "medium", "high"];
  const TYPES      = ["task","bug","feature","newfeature","improvement","refactor","docs","test","design","research"];
  const STATUSES   = ["active", "done"];

  const patch: Record<string, unknown> = {};
  if (body.title       !== undefined) patch.title       = String(body.title).trim();
  if (body.description !== undefined) patch.description = String(body.description);
  if (body.assignee    !== undefined) patch.assignee    = String(body.assignee);
  if (body.columnId    !== undefined) patch.column_id   = String(body.columnId);
  if (body.dueDate     !== undefined) patch.due_date    = body.dueDate ?? null;
  if (body.tags        !== undefined) patch.tags        = Array.isArray(body.tags) ? body.tags.map(String) : [];

  if (body.priority !== undefined && PRIORITIES.includes(body.priority as string))
    patch.priority = body.priority;
  if (body.type !== undefined && TYPES.includes(body.type as string))
    patch.type = body.type;
  if (body.status !== undefined && STATUSES.includes(body.status as string)) {
    patch.status = body.status;
    if (body.status === "done") patch.completed_at = new Date().toISOString();
  }
  if (body.checklist !== undefined && Array.isArray(body.checklist))
    patch.checklist = body.checklist;
  if (body.attachments !== undefined && Array.isArray(body.attachments))
    patch.attachments = body.attachments;

  if (Object.keys(patch).length === 0) return err("No valid fields to update");

  const { data, error } = await db.from("tasks").update(patch).eq("id", params.id).select().single();
  if (error || !data) return err(error?.message ?? "Task not found", error ? 500 : 404);

  return ok({ data: toTaskDetailResponse(data) });
}

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;

  const { error } = await db.from("tasks").delete().eq("id", params.id);
  if (error) return err(error.message, 500);

  return ok({ deleted: true, id: params.id });
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function toTaskDetailResponse(row: Record<string, unknown>) {
  const comments = Array.isArray(row.task_comments)
    ? (row.task_comments as Record<string, unknown>[]).map((c) => ({
        id:        c.id,
        author:    c.author,
        text:      c.text,
        kind:      c.kind,
        createdAt: c.created_at,
      }))
    : [];

  return {
    id:          row.id,
    boardId:     row.board_id,
    columnId:    row.column_id,
    title:       row.title,
    description: row.description,
    assignee:    row.assignee,
    priority:    row.priority,
    type:        row.type,
    status:      row.status,
    dueDate:     row.due_date,
    tags:        row.tags,
    checklist:   row.checklist ?? [],
    attachments: row.attachments ?? [],
    stageTimes:  row.stage_times ?? {},
    returnCount: row.return_count ?? 0,
    createdAt:   row.created_at,
    completedAt: row.completed_at ?? null,
    readyAt:     row.ready_at ?? null,
    testedAt:    row.tested_at ?? null,
    comments,
  };
}
