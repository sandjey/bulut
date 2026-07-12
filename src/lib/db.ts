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
  description: string;
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
  photos: import("./types").TaskPhoto[];
  map_id: string | null;
  map_node_id: string | null;
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

interface MemberRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  color: string;
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
  photos: r.photos ?? [],
  order: r.position,
  mapId: r.map_id ?? null,
  mapNodeId: r.map_node_id ?? null,
  deletedAt: r.deleted_at ?? null,
});

const toComment = (r: CommentRow): TaskComment => ({
  id: r.id,
  taskId: r.task_id,
  author: r.author ?? "",
  text: r.text ?? "",
  kind: r.kind,
  createdAt: r.created_at,
});

const toMember = (r: MemberRow): Member => ({
  id: r.id,
  name: r.name,
  email: r.email ?? "",
  role: r.role ?? "",
  color: r.color ?? "#6366f1",
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
export async function fetchAll(userId: string): Promise<AppData> {
  const c = client();
  // Нет активной комнаты — нет данных (пусто, без падений).
  if (!activeWs) return { boards: [], tasks: [], journal: [], comments: [], members: [] };
  const ws = activeWs;
  const [boardsRes, tasksRes, journalRes, commentsRes, membersRes] = await Promise.all([
    c.from("boards").select("*").eq("workspace_id", ws).order("position", { ascending: true }),
    c.from("tasks").select("*").eq("workspace_id", ws).order("position", { ascending: true }),
    c.from("journal").select("*").eq("workspace_id", ws).order("date", { ascending: false }),
    c.from("task_comments").select("*").eq("workspace_id", ws).order("created_at", { ascending: true }),
    c.from("members").select("*").order("name", { ascending: true }),
  ]);
  if (boardsRes.error) throw boardsRes.error;
  if (tasksRes.error) throw tasksRes.error;
  if (journalRes.error) throw journalRes.error;
  // these tables may not exist yet (before later migrations) — degrade gracefully
  const comments = commentsRes.error ? [] : (commentsRes.data as CommentRow[]).map(toComment);
  const members = membersRes.error ? [] : (membersRes.data as MemberRow[]).map(toMember);

  // Фильтруем удалённые в JS (а не в SQL) — чтобы код не падал, если миграция
  // с deleted_at ещё не применена: тогда deletedAt = null и всё видно.
  const notDeleted = <T extends { deletedAt?: string | null }>(x: T) => !x.deletedAt;
  return {
    boards: (boardsRes.data as BoardRow[]).map(toBoard).filter(notDeleted),
    tasks: (tasksRes.data as TaskRow[]).map(toTask).filter(notDeleted),
    journal: (journalRes.data as JournalRow[]).map(toJournal).filter(notDeleted),
    comments,
    members,
  };
}

/** Загрузка Корзины: удалённые доски/задачи/записи журнала. */
export async function fetchTrash(): Promise<import("./types").TrashData> {
  const c = client();
  if (!activeWs) return { boards: [], tasks: [], journal: [] };
  const ws = activeWs;
  const [boardsRes, tasksRes, journalRes] = await Promise.all([
    c.from("boards").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }),
    c.from("tasks").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }),
    c.from("journal").select("*").eq("workspace_id", ws).order("date", { ascending: false }),
  ]);
  // если колонки deleted_at ещё нет — вернём пустую корзину, а не упадём
  if (boardsRes.error || tasksRes.error || journalRes.error) {
    return { boards: [], tasks: [], journal: [] };
  }
  const deleted = <T extends { deletedAt?: string | null }>(x: T) => !!x.deletedAt;
  return {
    boards: (boardsRes.data as BoardRow[]).map(toBoard).filter(deleted),
    tasks: (tasksRes.data as TaskRow[]).map(toTask).filter(deleted),
    journal: (journalRes.data as JournalRow[]).map(toJournal).filter(deleted),
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
  const { error } = await client().from("tasks").insert(taskToRow(t, userId));
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
    description: t.desc,
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
    photos: t.photos ?? [],
    map_id: t.mapId ?? null,
    map_node_id: t.mapNodeId ?? null,
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
      let q = c.from(t).select("*");
      if (activeWs) q = q.eq("workspace_id", activeWs);
      const { data, error } = await q;
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

/** Участники комнаты (join на профили для имени/фото). */
export async function fetchMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await client()
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, permissions, created_at, profiles(name, email, avatar)")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  type Row = {
    id: string;
    workspace_id: string;
    user_id: string;
    role: AppRole;
    permissions: string[] | null;
    created_at: string;
    profiles: { name: string | null; email: string | null; avatar: string | null } | null;
  };
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    userId: r.user_id,
    role: (r.role ?? "member") as AppRole,
    permissions: (r.permissions ?? []) as PermissionKey[],
    createdAt: r.created_at,
    name: r.profiles?.name || r.profiles?.email || "Участник",
    email: r.profiles?.email ?? "",
    avatar: r.profiles?.avatar ?? null,
  }));
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
