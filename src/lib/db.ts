"use client";

import { getSupabase } from "./supabase";
import {
  AppData,
  Board,
  Column,
  JournalEntry,
  Task,
  Priority,
  TaskStatus,
  TaskType,
  TaskComment,
  CommentKind,
  Member,
  BackupMeta,
} from "./types";
import type { AppRole, PermissionKey, Profile } from "./permissions";
import type { ProjectMap, MapGraph } from "./map-types";
import type { Workspace, WorkspaceMember, Invitation, AppNotification } from "./workspace-types";

// ---------- Row types (snake_case, as stored in Postgres) ----------
interface BoardRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  columns: Column[];
  custom_fields: import("./types").CustomField[] | null;
  position: number;
  created_at: string;
  deleted_at: string | null;
}

interface TaskRow {
  id: string;
  user_id: string;
  board_id: string;
  column_id: string;
  title: string;
  // description/custom приходят только с деталями карточки (fetchTaskDetails);
  // в сводке их нет — undefined означает «ещё не загружали».
  description?: string;
  assignee: string;
  priority: Priority;
  type: TaskType;
  due_date: string | null;
  done_due_date: string | null;
  tags: string[];
  status: TaskStatus;
  position: number;
  created_at: string;
  created_by: string | null;
  ready_at: string | null;
  tested_at: string | null;
  completed_at: string | null;
  stage_entered_at: string | null;
  return_count: number;
  returns: import("./types").ReturnEvent[];
  stage_times: Record<string, number>;
  checklist: import("./types").ChecklistItem[];
  attachments: import("./types").Attachment[];
  // Фото не входят в обычную выборку (тяжёлый base64) — приходят только из
  // fetchTaskPhotos. Здесь undefined = «не запрашивали», а не «фото нет».
  photos?: import("./types").TaskPhoto[];
  photo_count?: number | null;
  map_id: string | null;
  map_node_id: string | null;
  parent_id: string | null;
  blocked_by: string[] | null;
  story_points: number | null;
  epic: string | null;
  sprint: string | null;
  watchers: string[] | null;
  custom?: Record<string, string> | null;
  deleted_at: string | null;
}

interface CommentRow {
  id: string;
  user_id: string;
  task_id: string;
  author: string;
  text: string;
  kind: CommentKind;
  created_at: string;
}


interface JournalRow {
  id: string;
  user_id: string;
  task_id: string | null;
  date: string;
  board_name: string;
  task_title: string;
  assignee: string;
  notes: string;
  stage: string;
  type: TaskType;
  created_at: string;
  deleted_at: string | null;
}

// ---------- Mappers ----------
const toBoard = (r: BoardRow): Board => ({
  id: r.id,
  name: r.name,
  color: r.color,
  columns: r.columns ?? [],
  customFields: r.custom_fields ?? [],
  createdAt: r.created_at,
  deletedAt: r.deleted_at ?? null,
});

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  boardId: r.board_id,
  columnId: r.column_id,
  title: r.title,
  desc: r.description ?? "",
  assignee: r.assignee ?? "",
  priority: r.priority,
  type: (r.type ?? "task") as TaskType,
  dueDate: r.due_date,
  doneDueDate: r.done_due_date ?? null,
  tags: r.tags ?? [],
  status: r.status,
  createdAt: r.created_at,
  createdBy: r.created_by ?? "",
  readyAt: r.ready_at,
  testedAt: r.tested_at,
  completedAt: r.completed_at,
  stageEnteredAt: r.stage_entered_at ?? r.created_at,
  returnCount: r.return_count ?? 0,
  returns: r.returns ?? [],
  stageTimes: r.stage_times ?? {},
  checklist: r.checklist ?? [],
  attachments: r.attachments ?? [],
  photos: r.photos,
  // undefined — сервер счётчик не отдал (миграция 20240131 ещё не применена)
  photoCount: r.photo_count ?? r.photos?.length,
  order: r.position,
  mapId: r.map_id ?? null,
  mapNodeId: r.map_node_id ?? null,
  parentId: r.parent_id ?? null,
  blockedBy: r.blocked_by ?? [],
  storyPoints: r.story_points ?? null,
  epic: r.epic ?? "",
  sprint: r.sprint ?? "",
  watchers: r.watchers ?? [],
  custom: r.custom ?? {},
  deletedAt: r.deleted_at ?? null,
  detailsLoaded: r.description !== undefined,
});

const toComment = (r: CommentRow): TaskComment => ({
  id: r.id,
  taskId: r.task_id,
  author: r.author ?? "",
  text: r.text ?? "",
  kind: r.kind,
  createdAt: r.created_at,
});

const toJournal = (r: JournalRow): JournalEntry => ({
  id: r.id,
  taskId: r.task_id,
  date: r.date,
  boardName: r.board_name,
  taskTitle: r.task_title,
  assignee: r.assignee ?? "",
  notes: r.notes ?? "",
  stage: r.stage ?? "",
  type: (r.type ?? "task") as TaskType,
  createdAt: r.created_at,
  deletedAt: r.deleted_at ?? null,
});

function client() {
  const c = getSupabase();
  if (!c) throw new Error("Supabase не настроен");
  return c;
}

// ---------- Активная комната (workspace) ----------
// Все записи/чтения основных данных ограничены активной комнатой.
let activeWs: string | null = null;
export function setActiveWorkspace(id: string | null) {
  activeWs = id;
}
export function getActiveWorkspace(): string | null {
  return activeWs;
}
function wsId(): string {
  if (!activeWs) throw new Error("Комната не выбрана");
  return activeWs;
}

// ---------- Bulk load ----------
//
// Данные грузятся слоями, а не всей комнатой сразу:
//   1. ядро      — доски + статистика по доскам (RPC, 10 строк);
//   2. сводки    — задачи выбранного набора (доска / мои / карта / все) без
//                  описания, кастомных полей и фото;
//   3. детали    — описание, кастомные поля и комментарии одной карточки,
//                  когда её открыли; фото — отдельно (fetchTaskPhotos).
// Журнал тоже отдельным слоем и по умолчанию без заметок (в них ~85% веса).

/**
 * Supabase (PostgREST) отдаёт не больше 1000 строк за запрос.
 * Комната «sarbon» уже перешагнула этот порог по комментариям — всё, что после
 * первой тысячи, просто не доезжало до интерфейса. Гоняем запрос страницами,
 * пока не получим короткую страницу.
 */
const PAGE = 1000;
type PageError = { code?: string; message?: string } | null;
async function fetchAllPages<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: PageError }> },
): Promise<{ data: T[] | null; error: PageError }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await build().range(from, from + PAGE - 1);
    if (res.error) return { data: null, error: res.error };
    const rows = (res.data as T[] | null) ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: all, error: null };
}

/** Разбить список id на пачки — иначе URL с `in(...)` упирается в лимит длины. */
const chunk = <T,>(arr: T[], size = 80): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Сводка задачи — всё, что нужно карточке на доске, спискам, отчётам и
 * логике этапов. Без `description`, `custom` и `photos`: они тяжёлые и
 * нужны только внутри открытой карточки.
 */
const TASK_SUMMARY_COLUMNS =
  "id,board_id,column_id,title,assignee,priority,type,due_date,done_due_date,tags,status," +
  "position,created_at,created_by,ready_at,tested_at,completed_at,stage_entered_at,return_count," +
  "returns,stage_times,checklist,attachments,map_id,map_node_id,parent_id,blocked_by,story_points," +
  "epic,sprint,watchers,deleted_at";
const TASK_DETAIL_COLUMNS = "id,description,custom";

// photo_count появляется только после миграции 20240131. Пока её нет — работаем
// без счётчика (значок «фото» на карточке просто не показывается).
let hasPhotoCount = true;
const summaryColumns = () =>
  hasPhotoCount ? `${TASK_SUMMARY_COLUMNS},photo_count` : TASK_SUMMARY_COLUMNS;

const isMissingColumn = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /photo_count/i.test(e.message ?? ""));

/** Какой набор задач нужен странице. */
export type TaskScope =
  | { kind: "all" }
  | { kind: "board"; boardId: string }
  | { kind: "mine"; me: string } // мои активные задачи (assignee = я, не «Готово»)
  | { kind: "map"; mapId: string }
  | { kind: "ids"; ids: string[] };

export function scopeKey(s: TaskScope): string {
  switch (s.kind) {
    case "all":
      return "all";
    case "board":
      return `board:${s.boardId}`;
    case "mine":
      return `mine:${s.me}`;
    case "map":
      return `map:${s.mapId}`;
    case "ids":
      return `ids:${[...s.ids].sort().join(",")}`;
  }
}

/** Входит ли задача в набор (по данным, которые есть у нас на руках). */
export function taskInScope(t: Task, s: TaskScope): boolean {
  switch (s.kind) {
    case "all":
      return true;
    case "board":
      return t.boardId === s.boardId;
    case "mine":
      return t.assignee === s.me && t.status !== "done";
    case "map":
      return t.mapId === s.mapId;
    case "ids":
      return s.ids.includes(t.id);
  }
}

type TaskQuery = ReturnType<ReturnType<typeof client>["from"]>;
function applyScope(q: TaskQuery, cols: string, ws: string, s: TaskScope) {
  let f = q.select(cols).eq("workspace_id", ws).is("deleted_at", null);
  switch (s.kind) {
    case "board":
      f = f.eq("board_id", s.boardId);
      break;
    case "mine":
      f = f.eq("assignee", s.me).neq("status", "done");
      break;
    case "map":
      f = f.eq("map_id", s.mapId);
      break;
    case "ids":
      f = f.in("id", s.ids);
      break;
  }
  // второй ключ сортировки нужен, чтобы страницы не перекрывались
  return f.order("position", { ascending: true }).order("id", { ascending: true });
}

/** Сводки задач набора (без описания/фото). Сам откатывается, если миграции photo_count нет. */
export async function fetchTaskSummaries(scope: TaskScope): Promise<Task[]> {
  const ws = wsId();
  if (scope.kind === "ids" && scope.ids.length === 0) return [];
  const run = async (cols: string) => {
    if (scope.kind === "ids") {
      const all: TaskRow[] = [];
      for (const part of chunk(scope.ids)) {
        const res = await fetchAllPages<TaskRow>(() => applyScope(client().from("tasks"), cols, ws, { kind: "ids", ids: part }));
        if (res.error) return res;
        all.push(...(res.data ?? []));
      }
      return { data: all, error: null as PageError };
    }
    return fetchAllPages<TaskRow>(() => applyScope(client().from("tasks"), cols, ws, scope));
  };
  let res = await run(summaryColumns());
  if (res.error && hasPhotoCount && isMissingColumn(res.error)) {
    hasPhotoCount = false; // миграция ещё не применена — пробуем без photo_count
    res = await run(summaryColumns());
  }
  if (res.error) throw res.error;
  return (res.data ?? []).map(toTask);
}

/** Детали карточек: описание и кастомные поля. Грузим, когда карточку открыли. */
export async function fetchTaskDetails(
  ids: string[],
): Promise<{ id: string; desc: string; custom: Record<string, string> }[]> {
  const out: { id: string; desc: string; custom: Record<string, string> }[] = [];
  for (const part of chunk(ids)) {
    const { data, error } = await client().from("tasks").select(TASK_DETAIL_COLUMNS).in("id", part);
    if (error) throw error;
    for (const r of (data ?? []) as Pick<TaskRow, "id" | "description" | "custom">[]) {
      out.push({ id: r.id, desc: r.description ?? "", custom: r.custom ?? {} });
    }
  }
  return out;
}

/** Комментарии выбранных задач (все, постранично). */
export async function fetchCommentsFor(taskIds: string[]): Promise<TaskComment[]> {
  const out: TaskComment[] = [];
  for (const part of chunk(taskIds)) {
    const res = await fetchAllPages<CommentRow>(() =>
      client()
        .from("task_comments")
        .select("*")
        .in("task_id", part)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    );
    if (res.error) throw res.error;
    out.push(...(res.data ?? []).map(toComment));
  }
  return out;
}

/**
 * Сколько комментариев у каждой задачи доски — для значка на карточке, без
 * самих текстов. Один запрос через join; если join недоступен — по id пачками.
 */
export async function fetchCommentCounts(boardId: string, taskIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const bump = (rows: { task_id: string }[]) => {
    for (const r of rows) counts.set(r.task_id, (counts.get(r.task_id) ?? 0) + 1);
  };
  const joined = await fetchAllPages<{ task_id: string }>(() =>
    client()
      .from("task_comments")
      .select("task_id,tasks!inner(id)")
      .eq("tasks.board_id", boardId)
      .order("id", { ascending: true }),
  );
  if (!joined.error) {
    bump(joined.data ?? []);
    return counts;
  }
  for (const part of chunk(taskIds)) {
    const res = await fetchAllPages<{ task_id: string }>(() =>
      client().from("task_comments").select("task_id").in("task_id", part).order("id", { ascending: true }),
    );
    if (res.error) throw res.error;
    bump(res.data ?? []);
  }
  return counts;
}

/** Живые доски комнаты. */
export async function fetchBoards(): Promise<Board[]> {
  const res = await fetchAllPages<BoardRow>(() =>
    client()
      .from("boards")
      .select("*")
      .eq("workspace_id", wsId())
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("id", { ascending: true }),
  );
  if (res.error) throw res.error;
  return (res.data ?? []).map(toBoard);
}

export interface BoardStats {
  total: number;
  done: number;
  active: number;
  overdue: number;
}

/**
 * Счётчики по доскам для главной: всего / готово / просрочено. Считает база
 * (RPC board_task_stats, миграция 20240133). Если RPC ещё нет — тянем
 * минимальную проекцию задач и считаем сами.
 */
export async function fetchBoardStats(today: string): Promise<Record<string, BoardStats>> {
  const ws = wsId();
  const out: Record<string, BoardStats> = {};
  const rpc = await client().rpc("board_task_stats", { p_ws: ws, p_today: today });
  if (!rpc.error && Array.isArray(rpc.data)) {
    for (const r of rpc.data as { board_id: string; total: number; done: number; overdue: number }[]) {
      out[r.board_id] = { total: r.total, done: r.done, active: r.total - r.done, overdue: r.overdue };
    }
    return out;
  }
  type Lite = Pick<TaskRow, "board_id" | "status" | "ready_at" | "due_date" | "done_due_date">;
  const res = await fetchAllPages<Lite>(() =>
    client()
      .from("tasks")
      .select("board_id,status,ready_at,due_date,done_due_date")
      .eq("workspace_id", ws)
      .is("deleted_at", null)
      .order("id", { ascending: true }),
  );
  if (res.error) throw res.error;
  for (const t of res.data ?? []) {
    const s = (out[t.board_id] ??= { total: 0, done: 0, active: 0, overdue: 0 });
    s.total++;
    if (t.status === "done") s.done++;
    else {
      s.active++;
      const devLate = !t.ready_at && !!t.due_date && t.due_date < today;
      const doneLate = !!t.done_due_date && t.done_due_date < today;
      if (devLate || doneLate) s.overdue++;
    }
  }
  return out;
}

const JOURNAL_SLIM_COLUMNS =
  "id,user_id,task_id,date,board_name,task_title,assignee,stage,type,created_at,deleted_at";

/** Журнал комнаты. `full` — с заметками (нужны только на странице журнала и в экспорте). */
export async function fetchJournal(full: boolean): Promise<JournalEntry[]> {
  const res = await fetchAllPages<JournalRow>(() =>
    client()
      .from("journal")
      .select(full ? "*" : JOURNAL_SLIM_COLUMNS)
      .eq("workspace_id", wsId())
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true }),
  );
  if (res.error) throw res.error;
  return (res.data ?? []).map(toJournal);
}

/** Комментарий с привязанной задачей — для ленты уведомлений. */
export interface FeedComment extends TaskComment {
  task: { id: string; title: string; boardId: string; assignee: string };
}

/**
 * Лента для колокольчика: возвраты по моим задачам и упоминания меня —
 * ищет база, клиенту не нужны все комментарии комнаты.
 */
export async function fetchNotificationFeed(me: string): Promise<FeedComment[]> {
  if (!activeWs || !me) return [];
  type Row = CommentRow & {
    tasks: { id: string; title: string; board_id: string; assignee: string; deleted_at: string | null } | null;
  };
  const cols = "*,tasks!inner(id,title,board_id,assignee,deleted_at)";
  const base = () =>
    client()
      .from("task_comments")
      .select(cols)
      .eq("workspace_id", activeWs!)
      .is("tasks.deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(40);
  const safe = me.replace(/[%_]/g, "");
  const [returns, mentions] = await Promise.all([
    base().eq("kind", "return").eq("tasks.assignee", me),
    base().ilike("text", `%@${safe}%`),
  ]);
  const rows: Row[] = [];
  for (const r of [returns, mentions]) {
    if (r.error) continue; // нет join/индекса — просто без этой части ленты
    rows.push(...((r.data ?? []) as unknown as Row[]));
  }
  const seen = new Set<string>();
  const out: FeedComment[] = [];
  for (const r of rows) {
    if (!r.tasks || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      ...toComment(r),
      task: { id: r.tasks.id, title: r.tasks.title, boardId: r.tasks.board_id, assignee: r.tasks.assignee ?? "" },
    });
  }
  return out;
}

/**
 * Фото одной задачи — грузим лениво, при открытии карточки.
 * Единственное место, где base64 уходит по сети.
 */
export async function fetchTaskPhotos(taskId: string): Promise<import("./types").TaskPhoto[]> {
  const { data, error } = await client().from("tasks").select("photos").eq("id", taskId).maybeSingle();
  if (error) throw error;
  return ((data?.photos as import("./types").TaskPhoto[] | null) ?? []);
}

/** Короткая метка «что-нибудь изменилось?» — см. миграцию 20240131. */
export async function fetchSyncStamp(): Promise<string | null> {
  if (!activeWs) return null;
  const { data, error } = await client().rpc("workspace_sync_stamp", { p_ws: activeWs });
  if (error || typeof data !== "string") return null;
  return data;
}

/** То же самое для карт (Bulut MAP) — графы тоже тяжёлые. */
export async function fetchMapsSyncStamp(): Promise<string | null> {
  if (!activeWs) return null;
  const { data, error } = await client().rpc("maps_sync_stamp", { p_ws: activeWs });
  if (error || typeof data !== "string") return null;
  return data;
}

/** Загрузка Корзины: удалённые доски/задачи/записи журнала. */
export async function fetchTrash(): Promise<import("./types").TrashData> {
  const c = client();
  if (!activeWs) return { boards: [], tasks: [], journal: [] };
  const ws = activeWs;
  const deleted = <T extends { deletedAt?: string | null }>(x: T) => !!x.deletedAt;
  const tasksRun = (cols: string) =>
    fetchAllPages<TaskRow>(() =>
      c
        .from("tasks")
        .select(cols)
        .eq("workspace_id", ws)
        .not("deleted_at", "is", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }),
    );
  const [boardsRes, tasksRes0, journalRes] = await Promise.all([
    fetchAllPages<BoardRow>(() =>
      c
        .from("boards")
        .select("*")
        .eq("workspace_id", ws)
        .not("deleted_at", "is", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }),
    ),
    tasksRun(summaryColumns()),
    fetchAllPages<JournalRow>(() =>
      c
        .from("journal")
        .select("*")
        .eq("workspace_id", ws)
        .not("deleted_at", "is", null)
        .order("date", { ascending: false })
        .order("id", { ascending: true }),
    ),
  ]);
  let tasksRes = tasksRes0;
  if (tasksRes.error && hasPhotoCount && isMissingColumn(tasksRes.error)) {
    hasPhotoCount = false;
    tasksRes = await tasksRun(summaryColumns());
  }
  // если колонки deleted_at ещё нет — вернём пустую корзину, а не упадём
  if (boardsRes.error || tasksRes.error || journalRes.error) {
    return { boards: [], tasks: [], journal: [] };
  }
  return {
    boards: (boardsRes.data ?? []).map(toBoard).filter(deleted),
    tasks: (tasksRes.data ?? []).map(toTask).filter(deleted),
    journal: (journalRes.data ?? []).map(toJournal).filter(deleted),
  };
}

// ---------- Members ----------
export async function insertMember(m: Member, userId: string) {
  const { error } = await client().from("members").insert({
    id: m.id,
    user_id: userId,
    name: m.name,
    email: m.email,
    role: m.role,
    color: m.color,
    created_at: m.createdAt,
  });
  if (error) throw error;
}

export async function updateMemberRow(id: string, patch: Partial<Member>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.color !== undefined) row.color = patch.color;
  const { error } = await client().from("members").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteMemberRow(id: string) {
  const { error } = await client().from("members").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Boards ----------
export async function insertBoard(b: Board, userId: string, position: number) {
  const { error } = await client().from("boards").insert({
    id: b.id,
    user_id: userId,
    workspace_id: wsId(),
    name: b.name,
    color: b.color,
    columns: b.columns,
    custom_fields: b.customFields ?? [],
    position,
    created_at: b.createdAt,
  });
  if (error) throw error;
}

export async function updateBoardRow(id: string, patch: Partial<Board>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.columns !== undefined) row.columns = patch.columns;
  if (patch.customFields !== undefined) row.custom_fields = patch.customFields;
  const { error } = await client().from("boards").update(row).eq("id", id);
  if (error) throw error;
}

/** Полное (безвозвратное) удаление доски — задачи каскадом удалит БД. */
export async function deleteBoardRow(id: string) {
  const { error } = await client().from("boards").delete().eq("id", id);
  if (error) throw error;
}

/** В Корзину: помечаем доску и её задачи удалёнными (обратимо). */
export async function softDeleteBoardRow(id: string) {
  const at = new Date().toISOString();
  const c = client();
  const b = await c.from("boards").update({ deleted_at: at }).eq("id", id);
  if (b.error) throw b.error;
  const t = await c.from("tasks").update({ deleted_at: at }).eq("board_id", id).is("deleted_at", null);
  if (t.error) throw t.error;
}

/** Восстановление доски из Корзины вместе с её задачами. */
export async function restoreBoardRow(id: string) {
  const c = client();
  const b = await c.from("boards").update({ deleted_at: null }).eq("id", id);
  if (b.error) throw b.error;
  const t = await c.from("tasks").update({ deleted_at: null }).eq("board_id", id);
  if (t.error) throw t.error;
}

// ---------- Tasks ----------
export async function insertTask(t: Task, userId: string) {
  // Новая задача — единственная запись, где фото передаются целиком.
  const { error } = await client()
    .from("tasks")
    .insert({ ...taskToRow(t, userId), description: t.desc, custom: t.custom ?? {}, photos: t.photos ?? [] });
  if (error) throw error;
}

export async function updateTaskRow(id: string, patch: Partial<Task>) {
  const row: Record<string, unknown> = {};
  if (patch.boardId !== undefined) row.board_id = patch.boardId;
  if (patch.columnId !== undefined) row.column_id = patch.columnId;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.desc !== undefined) row.description = patch.desc;
  if (patch.assignee !== undefined) row.assignee = patch.assignee;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.doneDueDate !== undefined) row.done_due_date = patch.doneDueDate;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.order !== undefined) row.position = patch.order;
  if (patch.createdBy !== undefined) row.created_by = patch.createdBy;
  if (patch.readyAt !== undefined) row.ready_at = patch.readyAt;
  if (patch.testedAt !== undefined) row.tested_at = patch.testedAt;
  if (patch.completedAt !== undefined) row.completed_at = patch.completedAt;
  if (patch.stageEnteredAt !== undefined) row.stage_entered_at = patch.stageEnteredAt;
  if (patch.returnCount !== undefined) row.return_count = patch.returnCount;
  if (patch.returns !== undefined) row.returns = patch.returns;
  if (patch.stageTimes !== undefined) row.stage_times = patch.stageTimes;
  if (patch.checklist !== undefined) row.checklist = patch.checklist;
  if (patch.attachments !== undefined) row.attachments = patch.attachments;
  if (patch.photos !== undefined) row.photos = patch.photos;
  if (patch.mapId !== undefined) row.map_id = patch.mapId;
  if (patch.mapNodeId !== undefined) row.map_node_id = patch.mapNodeId;
  if (patch.parentId !== undefined) row.parent_id = patch.parentId;
  if (patch.blockedBy !== undefined) row.blocked_by = patch.blockedBy;
  if (patch.storyPoints !== undefined) row.story_points = patch.storyPoints;
  if (patch.epic !== undefined) row.epic = patch.epic;
  if (patch.sprint !== undefined) row.sprint = patch.sprint;
  if (patch.watchers !== undefined) row.watchers = patch.watchers;
  if (patch.custom !== undefined) row.custom = patch.custom;
  const { error } = await client().from("tasks").update(row).eq("id", id);
  if (error) throw error;
}

/** Полное (безвозвратное) удаление задачи. */
export async function deleteTaskRow(id: string) {
  const { error } = await client().from("tasks").delete().eq("id", id);
  if (error) throw error;
}

/** В Корзину: помечаем задачу удалённой (обратимо). */
export async function softDeleteTaskRow(id: string) {
  const { error } = await client()
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Восстановление задачи из Корзины. */
export async function restoreTaskRow(id: string) {
  const { error } = await client().from("tasks").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

/** Persist new column/order for a set of tasks (used by drag & drop). */
export async function upsertTasks(tasks: Task[], userId: string) {
  if (tasks.length === 0) return;
  const { error } = await client()
    .from("tasks")
    .upsert(tasks.map((t) => taskToRow(t, userId)));
  if (error) throw error;
}

function taskToRow(t: Task, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    workspace_id: wsId(),
    board_id: t.boardId,
    column_id: t.columnId,
    title: t.title,
    // description и custom СПЕЦИАЛЬНО отсутствуют: в памяти обычно только
    // сводка задачи (детали грузятся при открытии карточки), и upsert затёр бы
    // описание пустой строкой. Они пишутся через insertTask и updateTaskRow.
    assignee: t.assignee,
    priority: t.priority,
    type: t.type,
    due_date: t.dueDate,
    done_due_date: t.doneDueDate,
    tags: t.tags,
    status: t.status,
    position: t.order,
    created_at: t.createdAt,
    created_by: t.createdBy ?? "",
    ready_at: t.readyAt,
    tested_at: t.testedAt,
    completed_at: t.completedAt,
    stage_entered_at: t.stageEnteredAt,
    return_count: t.returnCount,
    returns: t.returns ?? [],
    stage_times: t.stageTimes ?? {},
    checklist: t.checklist ?? [],
    attachments: t.attachments ?? [],
    // photos СПЕЦИАЛЬНО отсутствуют: в памяти их обычно нет (грузятся лениво),
    // и upsert затёр бы фото в базе пустым массивом. Фото пишутся только через
    // insertTask (новая задача) и updateTaskRow({ photos }) (загрузка/удаление).
    map_id: t.mapId ?? null,
    map_node_id: t.mapNodeId ?? null,
    parent_id: t.parentId ?? null,
    blocked_by: t.blockedBy ?? [],
    story_points: t.storyPoints ?? null,
    epic: t.epic ?? "",
    sprint: t.sprint ?? "",
    watchers: t.watchers ?? [],
  };
}

// ---------- Comments ----------
export async function insertComment(comment: TaskComment, userId: string) {
  const { error } = await client().from("task_comments").insert({
    id: comment.id,
    user_id: userId,
    workspace_id: wsId(),
    task_id: comment.taskId,
    author: comment.author,
    text: comment.text,
    kind: comment.kind,
    created_at: comment.createdAt,
  });
  if (error) throw error;
}

export async function deleteCommentRow(id: string) {
  const { error } = await client().from("task_comments").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Journal ----------
export async function insertJournal(e: JournalEntry, userId: string) {
  const { error } = await client().from("journal").insert({
    id: e.id,
    user_id: userId,
    workspace_id: wsId(),
    task_id: e.taskId,
    date: e.date,
    board_name: e.boardName,
    task_title: e.taskTitle,
    assignee: e.assignee,
    notes: e.notes,
    stage: e.stage,
    type: e.type,
    created_at: e.createdAt,
  });
  if (error) throw error;
}

/**
 * Вставить запись, только если у задачи ещё нет записи с таким этапом.
 * Нужна, когда журнал не загружен в память и продублировать нельзя проверить локально.
 */
export async function insertJournalIfNoStage(e: JournalEntry, userId: string) {
  if (e.taskId) {
    const { count, error } = await client()
      .from("journal")
      .select("id", { count: "exact", head: true })
      .eq("task_id", e.taskId)
      .eq("stage", e.stage)
      .is("deleted_at", null);
    if (error) throw error;
    if ((count ?? 0) > 0) return;
  }
  await insertJournal(e, userId);
}

export async function updateJournalRow(id: string, patch: Partial<JournalEntry>) {
  const row: Record<string, unknown> = {};
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.date !== undefined) row.date = patch.date;
  if (patch.boardName !== undefined) row.board_name = patch.boardName;
  if (patch.taskTitle !== undefined) row.task_title = patch.taskTitle;
  if (patch.assignee !== undefined) row.assignee = patch.assignee;
  if (patch.stage !== undefined) row.stage = patch.stage;
  const { error } = await client().from("journal").update(row).eq("id", id);
  if (error) throw error;
}

/** Полное (безвозвратное) удаление записи журнала. */
export async function deleteJournalRow(id: string) {
  const { error } = await client().from("journal").delete().eq("id", id);
  if (error) throw error;
}

/** В Корзину: помечаем запись журнала удалённой (обратимо). */
export async function softDeleteJournalRow(id: string) {
  const { error } = await client()
    .from("journal")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Восстановление записи журнала из Корзины. */
export async function restoreJournalRow(id: string) {
  const { error } = await client().from("journal").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function deleteJournalByTask(taskId: string) {
  const { error } = await client().from("journal").delete().eq("task_id", taskId);
  if (error) throw error;
}

// ---------- Profiles (роли и права) ----------
interface ProfileRow {
  id: string;
  email: string;
  name: string;
  job_role: string;
  role: AppRole;
  permissions: string[];
  created_at: string;
  avatar: string | null;
  deleted_at: string | null;
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  email: r.email ?? "",
  name: r.name ?? "",
  jobRole: r.job_role ?? "",
  role: (r.role ?? "member") as AppRole,
  permissions: (r.permissions ?? []) as PermissionKey[],
  createdAt: r.created_at,
  avatar: r.avatar ?? null,
  deletedAt: r.deleted_at ?? null,
});

/** Все профили (для раздела администрирования и команды). */
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await client()
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as ProfileRow[]).map(toProfile);
}

export async function updateProfilePermissions(id: string, permissions: PermissionKey[]) {
  const { error } = await client().from("profiles").update({ permissions }).eq("id", id);
  if (error) throw error;
}

export async function updateProfileFields(
  id: string,
  patch: { name?: string; jobRole?: string; avatar?: string | null },
) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.jobRole !== undefined) row.job_role = patch.jobRole;
  if (patch.avatar !== undefined) row.avatar = patch.avatar;
  const { error } = await client().from("profiles").update(row).eq("id", id);
  if (error) throw error;
}

/** Мягкое удаление профиля: помечаем deleted_at. Контент (доски/задачи/…) не трогаем. */
export async function softDeleteProfile(id: string) {
  const { error } = await client()
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateProfileRole(id: string, role: AppRole, permissions?: PermissionKey[]) {
  const row: Record<string, unknown> = { role };
  if (permissions !== undefined) row.permissions = permissions;
  const { error } = await client().from("profiles").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteProfile(id: string) {
  const { error } = await client().from("profiles").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Project maps (Bulut MAP) ----------
interface ProjectMapRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color: string;
  graph: MapGraph;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const toMap = (r: ProjectMapRow): ProjectMap => ({
  id: r.id,
  name: r.name,
  description: r.description ?? "",
  color: r.color ?? "#6366f1",
  graph: r.graph ?? { nodes: [], edges: [] },
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? null,
});

export async function fetchProjectMaps(): Promise<ProjectMap[]> {
  if (!activeWs) return [];
  const { data, error } = await client()
    .from("project_maps")
    .select("*")
    .eq("workspace_id", activeWs)
    .order("position", { ascending: true });
  if (error) throw error;
  // фильтр удалённых в JS — migration-safe (нет колонки → всё видно)
  return (data as ProjectMapRow[]).map(toMap).filter((m) => !m.deletedAt);
}

/** Удалённые карты (Корзина). */
export async function fetchTrashMaps(): Promise<ProjectMap[]> {
  if (!activeWs) return [];
  const { data, error } = await client()
    .from("project_maps")
    .select("*")
    .eq("workspace_id", activeWs)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as ProjectMapRow[]).map(toMap).filter((m) => !!m.deletedAt);
}

export async function insertProjectMap(
  m: { id: string; name: string; color: string; graph: MapGraph },
  userId: string,
  position: number,
) {
  const { error } = await client().from("project_maps").insert({
    id: m.id,
    user_id: userId,
    workspace_id: wsId(),
    name: m.name,
    color: m.color,
    graph: m.graph,
    position,
  });
  if (error) throw error;
}

export async function updateProjectMapRow(
  id: string,
  patch: Partial<Pick<ProjectMap, "name" | "description" | "color" | "graph">>,
) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.graph !== undefined) row.graph = patch.graph;
  const { error } = await client().from("project_maps").update(row).eq("id", id);
  if (error) throw error;
}

/** Полное (безвозвратное) удаление карты. */
export async function deleteProjectMapRow(id: string) {
  const { error } = await client().from("project_maps").delete().eq("id", id);
  if (error) throw error;
}

/** В Корзину: помечаем карту удалённой (обратимо). */
export async function softDeleteProjectMapRow(id: string) {
  const { error } = await client()
    .from("project_maps")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Восстановление карты из Корзины. */
export async function restoreProjectMapRow(id: string) {
  const { error } = await client().from("project_maps").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

// ---------- Бэкапы (снимки всех данных) ----------

/** Полный сырой снимок всех таблиц (включая удалённые строки). */
export async function fetchFullSnapshot(): Promise<Record<string, unknown[]>> {
  const c = client();
  // Снимок делаем в пределах активной комнаты.
  const tables = ["boards", "tasks", "journal", "task_comments", "project_maps"];
  const out: Record<string, unknown[]> = {};
  await Promise.all(
    tables.map(async (t) => {
      // постранично: в комнате уже больше 1000 комментариев, а PostgREST режет по 1000
      const { data, error } = await fetchAllPages<unknown>(() => {
        let q = c.from(t).select("*");
        if (activeWs) q = q.eq("workspace_id", activeWs);
        return q.order("id", { ascending: true });
      });
      out[t] = error ? [] : (data ?? []);
    }),
  );
  return out;
}

/** Создать бэкап: снимок в таблицу backups. Возвращает метаданные. */
export async function createBackupRow(
  label: string,
  kind: "manual" | "auto",
  authorName: string,
  userId: string | null,
): Promise<BackupMeta> {
  const data = await fetchFullSnapshot();
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) counts[k] = v.length;
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `${Date.now()}`;
  const createdAt = new Date().toISOString();
  const { error } = await client().from("backups").insert({
    id,
    created_at: createdAt,
    created_by: userId,
    workspace_id: activeWs,
    author_name: authorName,
    label,
    kind,
    counts,
    data,
  });
  if (error) throw error;
  return { id, createdAt, createdBy: userId, authorName, label, kind, counts };
}

interface BackupRow {
  id: string;
  created_at: string;
  created_by: string | null;
  author_name: string | null;
  label: string | null;
  kind: string;
  counts: Record<string, number>;
}

/** Список бэкапов (без тяжёлого поля data). */
export async function fetchBackups(): Promise<BackupMeta[]> {
  if (!activeWs) return [];
  const { data, error } = await client()
    .from("backups")
    .select("id, created_at, created_by, author_name, label, kind, counts")
    .eq("workspace_id", activeWs)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as BackupRow[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    createdBy: r.created_by,
    authorName: r.author_name ?? "",
    label: r.label ?? "",
    kind: (r.kind === "auto" ? "auto" : "manual") as "manual" | "auto",
    counts: r.counts ?? {},
  }));
}

/** Данные одного бэкапа (для скачивания / восстановления). */
export async function fetchBackupData(id: string): Promise<Record<string, unknown[]> | null> {
  const { data, error } = await client().from("backups").select("data").eq("id", id).single();
  if (error || !data) return null;
  return (data as { data: Record<string, unknown[]> }).data;
}

export async function deleteBackupRow(id: string) {
  const { error } = await client().from("backups").delete().eq("id", id);
  if (error) throw error;
}

/** Восстановление из бэкапа: upsert всех строк (по первичному ключу). */
export async function restoreFromBackup(data: Record<string, unknown[]>) {
  const c = client();
  const order = ["boards", "project_maps", "tasks", "journal", "task_comments"];
  for (const table of order) {
    const rows = data[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const { error } = await c.from(table).upsert(rows as never[], { onConflict: "id" });
    if (error) throw error;
  }
}

// ============================================================
//  Комнаты (workspaces), участники, приглашения, уведомления
// ============================================================

/** Мои комнаты (через членство) с моей ролью/правами в каждой. */
export async function fetchMyWorkspaces(userId: string): Promise<Workspace[]> {
  const { data, error } = await client()
    .from("workspace_members")
    .select("role, permissions, workspaces(id, name, color, owner_id, created_at)")
    .eq("user_id", userId);
  if (error) throw error;
  type Row = {
    role: AppRole;
    permissions: string[] | null;
    workspaces: { id: string; name: string; color: string; owner_id: string | null; created_at: string } | null;
  };
  return (data as unknown as Row[])
    .filter((r) => r.workspaces)
    .map((r) => ({
      id: r.workspaces!.id,
      name: r.workspaces!.name,
      color: r.workspaces!.color ?? "#6366f1",
      ownerId: r.workspaces!.owner_id,
      createdAt: r.workspaces!.created_at,
      myRole: (r.role ?? "member") as AppRole,
      myPermissions: (r.permissions ?? []) as PermissionKey[],
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Создать комнату (RPC), вернуть её id. */
export async function createWorkspaceRpc(name: string, color: string): Promise<string> {
  const { data, error } = await client().rpc("create_workspace", { p_name: name, p_color: color });
  if (error) throw error;
  return data as string;
}

export async function updateWorkspaceRow(id: string, patch: { name?: string; color?: string }) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  const { error } = await client().from("workspaces").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteWorkspaceRow(id: string) {
  const { error } = await client().from("workspaces").delete().eq("id", id);
  if (error) throw error;
}

/** Участники комнаты. Профили тянем отдельно (нет прямого FK workspace_members→profiles). */
export async function fetchMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const c = client();
  const { data, error } = await c
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, permissions, created_at")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  type Row = {
    id: string;
    workspace_id: string;
    user_id: string;
    role: AppRole;
    permissions: string[] | null;
    created_at: string;
  };
  const rows = (data ?? []) as Row[];

  // подтягиваем имя/почту/фото из profiles по user_id
  const ids = rows.map((r) => r.user_id);
  const profById = new Map<string, { name: string; email: string; avatar: string | null }>();
  if (ids.length) {
    const { data: profs } = await c.from("profiles").select("id, name, email, avatar").in("id", ids);
    for (const p of (profs ?? []) as { id: string; name: string | null; email: string | null; avatar: string | null }[]) {
      profById.set(p.id, { name: p.name ?? "", email: p.email ?? "", avatar: p.avatar ?? null });
    }
  }

  return rows.map((r) => {
    const p = profById.get(r.user_id);
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      userId: r.user_id,
      role: (r.role ?? "member") as AppRole,
      permissions: (r.permissions ?? []) as PermissionKey[],
      createdAt: r.created_at,
      name: p?.name || p?.email || "Участник",
      email: p?.email ?? "",
      avatar: p?.avatar ?? null,
    };
  });
}

export async function updateWsMemberRow(
  id: string,
  patch: { role?: AppRole; permissions?: PermissionKey[] },
) {
  const row: Record<string, unknown> = {};
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.permissions !== undefined) row.permissions = patch.permissions;
  const { error } = await client().from("workspace_members").update(row).eq("id", id);
  if (error) throw error;
}

export async function removeMemberRow(id: string) {
  const { error } = await client().from("workspace_members").delete().eq("id", id);
  if (error) throw error;
}

export async function leaveWorkspaceDb(workspaceId: string, userId: string) {
  const { error } = await client()
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Найти зарегистрированный профиль по email (для проверки перед приглашением). */
export async function findProfileByEmail(
  email: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const { data, error } = await client()
    .from("profiles")
    .select("id, name, email, deleted_at")
    .ilike("email", email.trim())
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const p = data[0] as { id: string; name: string; email: string; deleted_at: string | null };
  if (p.deleted_at) return null;
  return { id: p.id, name: p.name, email: p.email };
}

/** Пригласить в комнату (RPC): создаёт invite + уведомление. Возвращает токен. */
export async function inviteToWorkspaceRpc(
  workspaceId: string,
  email: string,
  role: AppRole,
): Promise<{ token: string; workspace: string }> {
  const { data, error } = await client().rpc("invite_to_workspace", {
    p_ws: workspaceId,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
  return data as { token: string; workspace: string };
}

const toInvite = (r: {
  id: string;
  workspace_id: string;
  email: string;
  role: AppRole;
  token: string;
  status: string;
  created_at: string;
  expires_at: string;
}): Invitation => ({
  id: r.id,
  workspaceId: r.workspace_id,
  email: r.email,
  role: (r.role ?? "member") as AppRole,
  token: r.token,
  status: (r.status ?? "pending") as Invitation["status"],
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});

/** Приглашения комнаты (для владельца/админа). */
export async function fetchInvitations(workspaceId: string): Promise<Invitation[]> {
  const { data, error } = await client()
    .from("invitations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as Parameters<typeof toInvite>[0][]).map(toInvite);
}

export async function revokeInvitation(id: string) {
  const { error } = await client().from("invitations").update({ status: "revoked" }).eq("id", id);
  if (error) throw error;
}

/** Приглашения на мою почту (ожидающие). */
export async function fetchMyPendingInvites(email: string): Promise<Invitation[]> {
  const { data, error } = await client()
    .from("invitations")
    .select("*, workspaces(name)")
    .eq("email", email.toLowerCase())
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  type Row = Parameters<typeof toInvite>[0] & { workspaces: { name: string } | null };
  return (data as Row[]).map((r) => ({ ...toInvite(r), workspaceName: r.workspaces?.name }));
}

/** Принять приглашение (RPC), вернуть id комнаты. */
export async function acceptInvitationRpc(token: string): Promise<string> {
  const { data, error } = await client().rpc("accept_invitation", { p_token: token });
  if (error) throw error;
  return data as string;
}

const toNotif = (r: {
  id: string;
  user_id: string;
  workspace_id: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}): AppNotification => ({
  id: r.id,
  userId: r.user_id,
  workspaceId: r.workspace_id,
  type: r.type,
  title: r.title ?? "",
  body: r.body ?? "",
  link: r.link,
  read: !!r.read,
  createdAt: r.created_at,
});

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await client()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data as Parameters<typeof toNotif>[0][]).map(toNotif);
}

/** Уведомить участника комнаты (через RPC — RLS сам по себе не даёт писать другим). */
export async function notifyMember(
  userId: string,
  workspaceId: string,
  type: string,
  title: string,
  body: string,
  link: string | null,
) {
  const { error } = await client().rpc("notify_member", {
    p_user: userId,
    p_ws: workspaceId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_link: link,
  });
  if (error) throw error;
}

export async function markNotificationRead(id: string) {
  const { error } = await client().from("notifications").update({ read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await client()
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
}
