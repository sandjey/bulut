import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";

// ─── GET /api/tasks ─────────────────────────────────────────────────────────
// Query params:
//   boardId      – filter by board UUID
//   columnId     – filter by column ID
//   assignee     – filter by assignee name (exact, case-insensitive)
//   status       – active | done
//   priority     – low | medium | high
//   type         – task | bug | feature | newfeature | improvement | refactor | docs | test | design | research
//   search       – full-text search in title + description
//   dueAfter     – ISO date (YYYY-MM-DD), inclusive
//   dueBefore    – ISO date (YYYY-MM-DD), inclusive
//   hasAssignee  – true | false
//   overdue      – true  (due_date < today AND status != done)
//   sort         – created_at | due_date | position | title  (default: position)
//   order        – asc | desc                                (default: asc)
//   page         – page number (default: 1)
//   limit        – items per page (default: 50, max: 200)

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;

  const q = req.nextUrl.searchParams;

  // Pagination
  const limit = Math.min(Number(q.get("limit") ?? 50), 200);
  const page  = Math.max(Number(q.get("page")  ?? 1), 1);
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  // Sort
  const sortField = ["created_at", "due_date", "position", "title"].includes(q.get("sort") ?? "")
    ? q.get("sort")!
    : "position";
  const ascending = (q.get("order") ?? "asc") !== "desc";

  let query = db.from("tasks").select("*", { count: "exact" });

  // ─── Filters ────────────────────────────────────────────────────────────────
  if (q.get("boardId"))   query = query.eq("board_id",   q.get("boardId")!);
  if (q.get("columnId"))  query = query.eq("column_id",  q.get("columnId")!);
  if (q.get("status"))    query = query.eq("status",     q.get("status")!);
  if (q.get("priority"))  query = query.eq("priority",   q.get("priority")!);
  if (q.get("type"))      query = query.eq("type",       q.get("type")!);

  if (q.get("assignee")) {
    query = query.ilike("assignee", q.get("assignee")!);
  }
  if (q.get("hasAssignee") === "true")  query = query.neq("assignee", "");
  if (q.get("hasAssignee") === "false") query = query.eq("assignee", "");

  if (q.get("dueAfter"))  query = query.gte("due_date", q.get("dueAfter")!);
  if (q.get("dueBefore")) query = query.lte("due_date", q.get("dueBefore")!);

  if (q.get("overdue") === "true") {
    const today = new Date().toISOString().slice(0, 10);
    query = query.lt("due_date", today).neq("status", "done");
  }

  if (q.get("search")) {
    const s = q.get("search")!;
    query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
  }

  // ─── Sort + Pagination ──────────────────────────────────────────────────────
  const { data, error, count } = await query
    .order(sortField, { ascending })
    .range(from, to);

  if (error) return err(error.message, 500);

  const total = count ?? 0;
  return ok({
    data: data.map(toTaskResponse),
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasMore: to < total - 1,
    },
  });
}

// ─── POST /api/tasks ─────────────────────────────────────────────────────────
// Body (JSON):
//   title*       – string
//   boardId*     – UUID
//   columnId*    – string
//   description  – string
//   assignee     – string
//   priority     – low | medium | high       (default: medium)
//   type         – task | bug | feature …    (default: task)
//   dueDate      – YYYY-MM-DD
//   tags         – string[]
//   checklist    – { text: string }[]
//   attachments  – { name: string; url: string }[]

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db, userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  // ─── Validation ─────────────────────────────────────────────────────────────
  const title    = (body.title as string | undefined)?.trim();
  const boardId  = body.boardId  as string | undefined;
  const columnId = body.columnId as string | undefined;

  if (!title)    return err("'title' is required");
  if (!boardId)  return err("'boardId' is required");
  if (!columnId) return err("'columnId' is required");

  const PRIORITIES = ["low", "medium", "high"];
  const TYPES      = ["task","bug","feature","newfeature","improvement","refactor","docs","test","design","research"];

  const priority = PRIORITIES.includes(body.priority as string) ? body.priority : "medium";
  const type     = TYPES.includes(body.type as string)          ? body.type     : "task";

  // Validate board exists
  const { data: board, error: boardErr } = await db
    .from("boards").select("id,columns").eq("id", boardId).single();
  if (boardErr || !board) return err("Board not found", 404);

  // Validate column exists in board
  const columns = (board.columns ?? []) as { id: string; name: string }[];
  const col = columns.find((c) => c.id === columnId);
  if (!col) return err(`Column '${columnId}' not found in board '${boardId}'`, 404);

  // Build checklist items
  const rawChecklist = Array.isArray(body.checklist) ? body.checklist : [];
  const checklist = rawChecklist.map((item: Record<string, unknown>) => ({
    id:   crypto.randomUUID(),
    text: String(item.text ?? "").trim(),
    done: Boolean(item.done ?? false),
  })).filter((i) => i.text);

  // Build attachments
  const rawAttach = Array.isArray(body.attachments) ? body.attachments : [];
  const attachments = rawAttach.map((a: Record<string, unknown>) => ({
    id:   crypto.randomUUID(),
    name: String(a.name ?? a.url ?? "").trim(),
    url:  String(a.url  ?? "").trim(),
  })).filter((a) => a.url);

  // Position at end of column
  const { count: posCount } = await db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("board_id", boardId)
    .eq("column_id", columnId);
  const position = posCount ?? 0;

  const now = new Date().toISOString();
  const row = {
    id:               crypto.randomUUID(),
    user_id:          userId === "api-key" ? null : userId,
    board_id:         boardId,
    column_id:        columnId,
    title,
    description:      String(body.description ?? "").trim(),
    assignee:         String(body.assignee    ?? "").trim(),
    priority,
    type,
    due_date:         body.dueDate ?? null,
    tags:             Array.isArray(body.tags) ? body.tags.map(String) : [],
    status:           "active",
    position,
    checklist,
    attachments,
    stage_entered_at: now,
    return_count:     0,
    stage_times:      {},
    created_at:       now,
  };

  const { data, error } = await db.from("tasks").insert(row).select().single();
  if (error) return err(error.message, 500);

  return ok({ data: toTaskResponse(data) }, 201);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toTaskResponse(row: Record<string, unknown>) {
  return {
    id:             row.id,
    boardId:        row.board_id,
    columnId:       row.column_id,
    title:          row.title,
    description:    row.description,
    assignee:       row.assignee,
    priority:       row.priority,
    type:           row.type,
    status:         row.status,
    dueDate:        row.due_date,
    tags:           row.tags,
    checklist:      row.checklist ?? [],
    attachments:    row.attachments ?? [],
    stageTimes:     row.stage_times ?? {},
    returnCount:    row.return_count ?? 0,
    createdAt:      row.created_at,
    completedAt:    row.completed_at ?? null,
    readyAt:        row.ready_at ?? null,
    testedAt:       row.tested_at ?? null,
  };
}
