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
} from "./types";
import type { AppRole, PermissionKey, Profile } from "./permissions";

// ---------- Row types (snake_case, as stored in Postgres) ----------
interface BoardRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  columns: Column[];
  position: number;
  created_at: string;
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
}

// ---------- Mappers ----------
const toBoard = (r: BoardRow): Board => ({
  id: r.id,
  name: r.name,
  color: r.color,
  columns: r.columns ?? [],
  createdAt: r.created_at,
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
});

function client() {
  const c = getSupabase();
  if (!c) throw new Error("Supabase не настроен");
  return c;
}

// ---------- Bulk load ----------
export async function fetchAll(userId: string): Promise<AppData> {
  const c = client();
  const [boardsRes, tasksRes, journalRes, commentsRes, membersRes] = await Promise.all([
    c.from("boards").select("*").order("position", { ascending: true }),
    c.from("tasks").select("*").order("position", { ascending: true }),
    c.from("journal").select("*").order("date", { ascending: false }),
    c.from("task_comments").select("*").order("created_at", { ascending: true }),
    c.from("members").select("*").order("name", { ascending: true }),
  ]);
  if (boardsRes.error) throw boardsRes.error;
  if (tasksRes.error) throw tasksRes.error;
  if (journalRes.error) throw journalRes.error;
  // these tables may not exist yet (before later migrations) — degrade gracefully
  const comments = commentsRes.error ? [] : (commentsRes.data as CommentRow[]).map(toComment);
  const members = membersRes.error ? [] : (membersRes.data as MemberRow[]).map(toMember);

  return {
    boards: (boardsRes.data as BoardRow[]).map(toBoard),
    tasks: (tasksRes.data as TaskRow[]).map(toTask),
    journal: (journalRes.data as JournalRow[]).map(toJournal),
    comments,
    members,
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

export async function deleteBoardRow(id: string) {
  const { error } = await client().from("boards").delete().eq("id", id);
  if (error) throw error;
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
  const { error } = await client().from("tasks").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteTaskRow(id: string) {
  const { error } = await client().from("tasks").delete().eq("id", id);
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
  };
}

// ---------- Comments ----------
export async function insertComment(comment: TaskComment, userId: string) {
  const { error } = await client().from("task_comments").insert({
    id: comment.id,
    user_id: userId,
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

export async function deleteJournalRow(id: string) {
  const { error } = await client().from("journal").delete().eq("id", id);
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
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  email: r.email ?? "",
  name: r.name ?? "",
  jobRole: r.job_role ?? "",
  role: (r.role ?? "member") as AppRole,
  permissions: (r.permissions ?? []) as PermissionKey[],
  createdAt: r.created_at,
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

export async function updateProfileFields(id: string, patch: { name?: string; jobRole?: string }) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.jobRole !== undefined) row.job_role = patch.jobRole;
  const { error } = await client().from("profiles").update(row).eq("id", id);
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
