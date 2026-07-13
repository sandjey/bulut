"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppData,
  Board,
  Column,
  JournalEntry,
  Task,
  TaskComment,
  CommentKind,
  Member,
  Priority,
  TaskType,
  ReturnEvent,
  TrashData,
  BackupMeta,
  BOARD_COLORS,
  DEFAULT_COLUMN_NAMES,
  READY_COLUMN_NAME,
  REVIEW_COLUMN_NAME,
} from "./types";
import * as db from "./db";
import { loadCache, saveCache } from "./cache";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth";
import { useWorkspace } from "./workspace";
import { getMe } from "./me";
import { avatarColor } from "./utils";
import { JournalTrigger } from "./settings";
import { formatDuration } from "./date";
import { accrueStageTimes, stageTimeList } from "./stages";
import { format } from "date-fns";

/** Seconds elapsed between two ISO timestamps (never negative). */
function secondsBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
}

/** Build the journal note from a card: description + per-stage time breakdown. */
function buildNote(task: Task, board: Board | undefined, explicitNote: string): string {
  const base = explicitNote || task.desc || "";
  let metrics = "";
  if (board) {
    const stages = stageTimeList(task, board);
    if (stages.length) {
      metrics = "По этапам: " + stages.map((s) => `${s.name} — ${formatDuration(s.seconds)}`).join("; ");
    }
  }
  if (task.returnCount) metrics += `${metrics ? " · " : ""}Возвратов: ${task.returnCount}`;
  if (!base) return metrics;
  return metrics ? `${base}\n${metrics}` : base;
}

/** Build a journal entry from a task + action label. */
function mkEntry(task: Task, board: Board | undefined, stage: string, note = ""): JournalEntry {
  return {
    id: uuid(),
    taskId: task.id,
    date: format(new Date(), "yyyy-MM-dd"),
    boardName: board?.name ?? "—",
    taskTitle: task.title,
    assignee: task.assignee,
    notes: note,
    stage,
    type: task.type,
    createdAt: new Date().toISOString(),
  };
}

const ACTION_LABEL: Record<JournalTrigger, string> = {
  done: "Готово",
  review: READY_COLUMN_NAME, // «Готов к тестированию» — разработчик сдал в тест
  returned: "Возврат",
  moved: "Перемещение",
};

/**
 * Which stage transitions are auto-logged to the journal. Fixed by design:
 * a card is recorded when it reaches «Готов к тестированию» (dev finished).
 */
const AUTO_JOURNAL: JournalTrigger[] = ["review"];

/**
 * Append a journal entry for a stage transition when it's an auto-logged
 * action. "done" entries are deduped per task.
 */
function appendLog(
  journal: JournalEntry[],
  task: Task,
  board: Board | undefined,
  action: JournalTrigger,
  note = ""
): { journal: JournalEntry[]; entry: JournalEntry | null } {
  if (!AUTO_JOURNAL.includes(action)) return { journal, entry: null };
  const label =
    action === "moved"
      ? board?.columns.find((c) => c.id === task.columnId)?.name ?? "Перемещение"
      : ACTION_LABEL[action];
  if (action === "done" && journal.some((j) => j.taskId === task.id && j.stage === "Готово")) {
    return { journal, entry: null };
  }
  const entry = mkEntry(task, board, label, buildNote(task, board, note));
  return { journal: [entry, ...journal], entry };
}

/**
 * Ensure a task has its single «dev handoff» journal record. Completion is NOT
 * a new entry — the «Готово» mark is derived from the task status in the UI.
 * If the card reached done without ever passing «Готов к тестированию», create
 * the record now so the finished work is still logged exactly once.
 */
function ensureDevRecord(
  journal: JournalEntry[],
  task: Task,
  board: Board | undefined
): { journal: JournalEntry[]; entry: JournalEntry | null } {
  if (journal.some((j) => j.taskId === task.id && j.stage === READY_COLUMN_NAME)) {
    return { journal, entry: null };
  }
  const entry = mkEntry(task, board, READY_COLUMN_NAME, buildNote(task, board, ""));
  return { journal: [entry, ...journal], entry };
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * One-time board migration: split the old single «На проверке» column into
 * «Готов к тестированию» (dev handoff — keeps existing cards) followed by a
 * fresh «На проверке» (QA testing). Idempotent: skipped once the board already
 * has a «Готов к тестированию» column.
 */
function migrateBoardColumns(board: Board): { columns: Column[]; changed: boolean } {
  const hasReady = board.columns.some((c) => c.name === READY_COLUMN_NAME);
  const reviewIdx = board.columns.findIndex((c) => c.name === REVIEW_COLUMN_NAME);
  if (hasReady || reviewIdx === -1) return { columns: board.columns, changed: false };

  const columns = board.columns.map((c, i) =>
    i === reviewIdx ? { ...c, name: READY_COLUMN_NAME } : c
  );
  // insert a new «На проверке» right after the renamed column
  columns.splice(reviewIdx + 1, 0, { id: uuid(), name: REVIEW_COLUMN_NAME });
  return { columns, changed: true };
}

export interface NewTaskInput {
  boardId: string;
  columnId: string;
  title: string;
  desc?: string;
  assignee?: string;
  priority?: Priority;
  type?: TaskType;
  dueDate?: string | null;
  doneDueDate?: string | null;
  tags?: string[];
  mapId?: string | null;
  mapNodeId?: string | null;
  parentId?: string | null;
  epic?: string;
  sprint?: string;
  storyPoints?: number | null;
  watchers?: string[];
  custom?: Record<string, string>;
}

interface StoreContextValue extends AppData {
  ready: boolean;
  // boards
  createBoard: (name: string, color?: string) => Board;
  updateBoard: (id: string, patch: Partial<Omit<Board, "id">>) => void;
  deleteBoard: (id: string) => void;
  addColumn: (boardId: string, name: string) => void;
  renameColumn: (boardId: string, columnId: string, name: string) => void;
  deleteColumn: (boardId: string, columnId: string) => void;
  // tasks
  createTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => void;
  deleteTask: (id: string) => void;
  moveTask: (taskId: string, toColumnId: string, toIndex: number) => void;
  toggleDone: (id: string, doneColumnId?: string) => void;
  // team workflow
  sendToReview: (id: string) => void;
  acceptTask: (id: string) => void;
  returnTask: (id: string, author: string, reason: string) => void;
  addComment: (taskId: string, author: string, text: string, kind?: CommentKind) => void;
  deleteComment: (id: string) => void;
  // members (team)
  addMember: (name: string, opts?: { email?: string; role?: string; color?: string }) => Member | null;
  updateMember: (id: string, patch: Partial<Omit<Member, "id">>) => void;
  deleteMember: (id: string) => void;
  // journal
  addJournalEntry: (entry: Omit<JournalEntry, "id" | "createdAt">) => void;
  updateJournalEntry: (id: string, patch: Partial<JournalEntry>) => void;
  deleteJournalEntry: (id: string) => void;
  // корзина (soft-delete)
  trash: TrashData;
  refreshTrash: () => void;
  restoreBoard: (id: string) => void;
  restoreTask: (id: string) => void;
  restoreJournal: (id: string) => void;
  purgeBoard: (id: string) => void;
  purgeTask: (id: string) => void;
  purgeJournal: (id: string) => void;
  emptyTrash: () => Promise<void>;
  // бэкапы
  backups: BackupMeta[];
  refreshBackups: () => Promise<void>;
  createBackup: (label: string) => Promise<BackupMeta | null>;
  deleteBackup: (id: string) => Promise<void>;
  downloadBackup: (id: string) => Promise<void>;
  restoreBackup: (id: string) => Promise<void>;
  // data
  refetch: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const EMPTY: AppData = { boards: [], tasks: [], journal: [], comments: [], members: [] };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? "";
  const { activeId } = useWorkspace();
  // Кэш и данные привязаны к паре (пользователь, комната).
  const cacheKey = userId && activeId ? `${userId}:${activeId}` : null;

  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const dataRef = useRef<AppData>(EMPTY);

  const EMPTY_TRASH: TrashData = useMemo(() => ({ boards: [], tasks: [], journal: [] }), []);
  const [trash, setTrash] = useState<TrashData>({ boards: [], tasks: [], journal: [] });
  const trashRef = useRef<TrashData>({ boards: [], tasks: [], journal: [] });
  const applyTrash = useCallback((next: TrashData) => {
    trashRef.current = next;
    setTrash(next);
  }, []);
  const [backups, setBackups] = useState<BackupMeta[]>([]);

  const apply = useCallback((next: AppData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const refreshTrash = useCallback(() => {
    db.fetchTrash().then(applyTrash).catch(() => {});
  }, [applyTrash]);

  const refetch = useCallback(async () => {
    if (!userId) return;
    try {
      const fresh = await db.fetchAll(userId);
      apply(fresh);
      refreshTrash();
    } catch (e) {
      console.error("Не удалось загрузить данные", e);
    }
  }, [userId, apply, refreshTrash]);

  // (Re)load whenever the signed-in user changes.
  // Cache-first: hydrate instantly from localStorage (offline-safe, no empty
  // flash on reload / navigation), then refresh from Supabase in the background.
  useEffect(() => {
    let cancelled = false;
    if (!userId || !activeId) {
      apply(EMPTY);
      applyTrash(EMPTY_TRASH);
      setBackups([]);
      setReady(false);
      return;
    }

    const cached = cacheKey ? loadCache(cacheKey) : null;
    if (cached) {
      apply(cached);
      setReady(true); // show cached data immediately
    } else {
      apply(EMPTY); // другая комната — не показываем чужие данные из прошлого стейта
      setReady(false);
    }

    db.fetchAll(userId)
      .then((fresh) => {
        if (!cancelled) {
          apply(fresh);
          setReady(true);
          refreshTrash();
        }
      })
      .catch((e) => {
        // offline / server unreachable — keep whatever the cache gave us
        console.error("Не удалось загрузить данные (работаем из кэша)", e);
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, activeId, cacheKey, apply, applyTrash, refreshTrash, EMPTY_TRASH]);

  // Write-through: persist every state change to the offline cache (по комнате)
  useEffect(() => {
    if (cacheKey && ready) saveCache(cacheKey, data);
  }, [data, cacheKey, ready]);

  // Real-time: subscribe to all table changes so every user sees updates instantly
  useEffect(() => {
    if (!userId) return;
    const sb = getSupabase();
    if (!sb) return;

    // Debounce refetch to avoid flooding when many rows change at once
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        db.fetchAll(userId).then(apply).catch(console.error);
        refreshTrash();
      }, 300);
    };

    const channel = sb
      .channel("bulut-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "boards" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "journal" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, scheduleRefetch)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [userId, apply, refreshTrash]);

  /** Fire-and-forget DB write; on failure, re-sync from server. */
  const persist = useCallback(
    (p: Promise<unknown>) => {
      p.catch((e) => {
        console.error("Ошибка синхронизации", e);
        refetch();
      });
    },
    [refetch]
  );

  // One-time column migration: «На проверке» → «Готов к тестированию» + new «На проверке».
  useEffect(() => {
    if (!ready) return;
    const d = dataRef.current;
    if (!d.boards.some((b) => migrateBoardColumns(b).changed)) return;
    const boards = d.boards.map((b) => {
      const { columns, changed } = migrateBoardColumns(b);
      if (changed && userId) persist(db.updateBoardRow(b.id, { columns }));
      return changed ? { ...b, columns } : b;
    });
    apply({ ...d, boards });
  }, [ready, data.boards, userId, apply, persist]);

  // One-time journal migration: old handoff entries were labelled «На проверке»,
  // which is now the «Готов к тестированию» stage — relabel them to match.
  useEffect(() => {
    if (!ready) return;
    const d = dataRef.current;
    const stale = d.journal.filter((j) => j.stage === REVIEW_COLUMN_NAME);
    if (stale.length === 0) return;
    const journal = d.journal.map((j) =>
      j.stage === REVIEW_COLUMN_NAME ? { ...j, stage: READY_COLUMN_NAME } : j
    );
    apply({ ...d, journal });
    if (userId) stale.forEach((j) => persist(db.updateJournalRow(j.id, { stage: READY_COLUMN_NAME })));
  }, [ready, data.journal, userId, apply, persist]);

  // One-time cleanup: «Готово» больше не отдельная запись — метка выводится из
  // статуса задачи. Схлопываем старые «Готово»-записи в одну запись разработчика.
  useEffect(() => {
    if (!ready) return;
    const d = dataRef.current;
    const doneAuto = d.journal.filter((j) => j.taskId && j.stage === "Готово");
    if (doneAuto.length === 0) return;
    const hasReady = new Set(
      d.journal.filter((j) => j.taskId && j.stage === READY_COLUMN_NAME).map((j) => j.taskId)
    );
    const toDelete = new Set<string>();
    const toRename = new Set<string>();
    const renamedTask = new Set<string | null>();
    for (const j of doneAuto) {
      if (hasReady.has(j.taskId) || renamedTask.has(j.taskId)) {
        toDelete.add(j.id);
      } else {
        toRename.add(j.id);
        renamedTask.add(j.taskId);
      }
    }
    const journal = d.journal
      .filter((j) => !toDelete.has(j.id))
      .map((j) => (toRename.has(j.id) ? { ...j, stage: READY_COLUMN_NAME } : j));
    apply({ ...d, journal });
    if (userId) {
      toDelete.forEach((id) => persist(db.deleteJournalRow(id)));
      toRename.forEach((id) => persist(db.updateJournalRow(id, { stage: READY_COLUMN_NAME })));
    }
  }, [ready, data.journal, userId, apply, persist]);

  // ---------------- Boards ----------------
  const createBoard = useCallback(
    (name: string, color?: string): Board => {
      const board: Board = {
        id: uuid(),
        name: name.trim() || "Новая доска",
        color: color || BOARD_COLORS[Math.floor(Math.random() * BOARD_COLORS.length)],
        columns: DEFAULT_COLUMN_NAMES.map((n) => ({ id: uuid(), name: n })),
        customFields: [],
        createdAt: new Date().toISOString(),
      };
      const position = dataRef.current.boards.length;
      apply({ ...dataRef.current, boards: [...dataRef.current.boards, board] });
      if (userId) persist(db.insertBoard(board, userId, position));
      return board;
    },
    [apply, persist, userId]
  );

  const updateBoard = useCallback(
    (id: string, patch: Partial<Omit<Board, "id">>) => {
      apply({
        ...dataRef.current,
        boards: dataRef.current.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      });
      persist(db.updateBoardRow(id, patch));
    },
    [apply, persist]
  );

  // Удаление доски = перенос в Корзину (доска + её задачи). Обратимо.
  const deleteBoard = useCallback(
    (id: string) => {
      const d = dataRef.current;
      const board = d.boards.find((b) => b.id === id);
      if (!board) return;
      const boardTasks = d.tasks.filter((t) => t.boardId === id);
      const at = new Date().toISOString();
      apply({
        ...d,
        boards: d.boards.filter((b) => b.id !== id),
        tasks: d.tasks.filter((t) => t.boardId !== id),
      });
      applyTrash({
        boards: [{ ...board, deletedAt: at }, ...trashRef.current.boards],
        tasks: [...boardTasks.map((t) => ({ ...t, deletedAt: at })), ...trashRef.current.tasks],
        journal: trashRef.current.journal,
      });
      persist(db.softDeleteBoardRow(id));
    },
    [apply, applyTrash, persist]
  );

  const addColumn = useCallback(
    (boardId: string, name: string) => {
      const col: Column = { id: uuid(), name: name.trim() || "Колонка" };
      const board = dataRef.current.boards.find((b) => b.id === boardId);
      if (!board) return;
      const columns = [...board.columns, col];
      apply({
        ...dataRef.current,
        boards: dataRef.current.boards.map((b) => (b.id === boardId ? { ...b, columns } : b)),
      });
      persist(db.updateBoardRow(boardId, { columns }));
    },
    [apply, persist]
  );

  const renameColumn = useCallback(
    (boardId: string, columnId: string, name: string) => {
      const board = dataRef.current.boards.find((b) => b.id === boardId);
      if (!board) return;
      const columns = board.columns.map((c) => (c.id === columnId ? { ...c, name } : c));
      apply({
        ...dataRef.current,
        boards: dataRef.current.boards.map((b) => (b.id === boardId ? { ...b, columns } : b)),
      });
      persist(db.updateBoardRow(boardId, { columns }));
    },
    [apply, persist]
  );

  const deleteColumn = useCallback(
    (boardId: string, columnId: string) => {
      const board = dataRef.current.boards.find((b) => b.id === boardId);
      if (!board || board.columns.length <= 1) return;
      const fallback = board.columns.find((c) => c.id !== columnId)!;
      const columns = board.columns.filter((c) => c.id !== columnId);
      const movedTasks: Task[] = [];
      const tasks = dataRef.current.tasks.map((t) => {
        if (t.boardId === boardId && t.columnId === columnId) {
          const nt = { ...t, columnId: fallback.id };
          movedTasks.push(nt);
          return nt;
        }
        return t;
      });
      apply({
        ...dataRef.current,
        boards: dataRef.current.boards.map((b) => (b.id === boardId ? { ...b, columns } : b)),
        tasks,
      });
      persist(db.updateBoardRow(boardId, { columns }));
      if (userId && movedTasks.length) persist(db.upsertTasks(movedTasks, userId));
    },
    [apply, persist, userId]
  );

  // ---------------- Tasks ----------------
  const createTask = useCallback(
    (input: NewTaskInput): Task => {
      const task: Task = {
        id: uuid(),
        boardId: input.boardId,
        columnId: input.columnId,
        title: input.title.trim() || "Новая задача",
        desc: input.desc ?? "",
        assignee: input.assignee ?? "",
        priority: input.priority ?? "medium",
        type: input.type ?? "task",
        dueDate: input.dueDate ?? null,
        doneDueDate: input.doneDueDate ?? null,
        tags: input.tags ?? [],
        status: "active",
        createdAt: new Date().toISOString(),
        createdBy: getMe() || userEmail || "",
        readyAt: null,
        testedAt: null,
        completedAt: null,
        stageEnteredAt: new Date().toISOString(),
        returnCount: 0,
        returns: [],
        stageTimes: {},
        checklist: [],
        attachments: [],
        photos: [],
        order: Date.now(),
        mapId: input.mapId ?? null,
        mapNodeId: input.mapNodeId ?? null,
        parentId: input.parentId ?? null,
        blockedBy: [],
        storyPoints: input.storyPoints ?? null,
        epic: input.epic ?? "",
        sprint: input.sprint ?? "",
        watchers: input.watchers ?? [],
        custom: input.custom ?? {},
      };
      apply({ ...dataRef.current, tasks: [...dataRef.current.tasks, task] });
      if (userId) persist(db.insertTask(task, userId));
      return task;
    },
    [apply, persist, userId, userEmail]
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<Task, "id">>) => {
      apply({
        ...dataRef.current,
        tasks: dataRef.current.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      });
      persist(db.updateTaskRow(id, patch));
    },
    [apply, persist]
  );

  // Удаление задачи = перенос в Корзину. Журнал НЕ трогаем (история сохраняется).
  const deleteTask = useCallback(
    (id: string) => {
      const d = dataRef.current;
      const task = d.tasks.find((t) => t.id === id);
      if (!task) return;
      const at = new Date().toISOString();
      apply({ ...d, tasks: d.tasks.filter((t) => t.id !== id) });
      applyTrash({
        ...trashRef.current,
        tasks: [{ ...task, deletedAt: at }, ...trashRef.current.tasks],
      });
      persist(db.softDeleteTaskRow(id));
    },
    [apply, applyTrash, persist]
  );

  const moveTask = useCallback(
    (taskId: string, toColumnId: string, toIndex: number) => {
      const d = dataRef.current;
      const moving = d.tasks.find((t) => t.id === taskId);
      if (!moving) return;

      const destTasks = d.tasks
        .filter(
          (t) => t.columnId === toColumnId && t.boardId === moving.boardId && t.id !== taskId
        )
        .sort((a, b) => a.order - b.order);

      const updatedMoving = { ...moving, columnId: toColumnId };
      destTasks.splice(toIndex, 0, updatedMoving);

      const newOrder = new Map<string, number>();
      destTasks.forEach((t, i) => newOrder.set(t.id, i));

      // workflow transitions based on destination column role
      const board = d.boards.find((b) => b.id === moving.boardId);
      const nowIso = new Date().toISOString();
      const changedColumn = toColumnId !== moving.columnId;
      let statusPatch: Partial<Task> = {};
      let action: JournalTrigger = "moved";
      let removeDoneFor: string | null = null;
      let removeReadyFor: string | null = null;

      if (board) {
        const n = board.columns.length;
        const readyIdx = n - 3;
        const doneCol = board.columns[n - 1]?.id;
        const reviewCol = board.columns[n - 2]?.id; // «На проверке» (QA)
        const readyCol = board.columns[readyIdx]?.id; // «Готов к тестированию» (dev handoff)
        const toIdx = board.columns.findIndex((c) => c.id === toColumnId);

        if (toColumnId === doneCol && moving.status !== "done") {
          statusPatch = {
            status: "done",
            completedAt: nowIso,
            testedAt: moving.testedAt ?? nowIso,
            readyAt: moving.readyAt ?? nowIso,
            photos: [], // освобождаем место: фото не нужны после завершения
          };
          action = "done";
        } else if (toColumnId !== doneCol && moving.status === "done") {
          statusPatch = { status: "active", completedAt: null, testedAt: null };
          removeDoneFor = moving.id;
          action = "moved";
        } else if (toColumnId === readyCol) {
          // dev handoff — record readiness and log to the journal
          statusPatch = { readyAt: moving.readyAt ?? nowIso };
          action = "review";
        } else if (toColumnId === reviewCol) {
          // QA started testing — keep readiness, but don't double-log
          statusPatch = { readyAt: moving.readyAt ?? nowIso };
          action = "moved";
        } else if (toIdx >= 0 && toIdx < readyIdx && moving.readyAt) {
          // карточку вернули из «Готов к тестированию»/«На проверке» назад в работу —
          // она больше не готова: убираем отметку, запись из журнала и фиксируем возврат
          const fromName = board.columns.find((c) => c.id === moving.columnId)?.name ?? "—";
          const toName = board.columns[toIdx]?.name ?? "—";
          const event: ReturnEvent = {
            at: nowIso,
            from: fromName,
            to: toName,
            seconds: secondsBetween(moving.stageEnteredAt ?? moving.createdAt, nowIso),
          };
          statusPatch = {
            readyAt: null,
            returnCount: (moving.returnCount ?? 0) + 1,
            returns: [...(moving.returns ?? []), event],
          };
          removeReadyFor = moving.id;
          action = "moved";
        }
      }

      if (changedColumn) {
        statusPatch.stageEnteredAt = nowIso;
        statusPatch.stageTimes = accrueStageTimes(moving, board, nowIso);
      }
      const finalMoving = { ...updatedMoving, ...statusPatch };

      const tasks = d.tasks.map((t) => {
        if (newOrder.has(t.id)) {
          const base = t.id === taskId ? finalMoving : t;
          return { ...base, order: newOrder.get(t.id)! };
        }
        return t;
      });

      // journal logging per user settings (only when the column actually changed)
      let journal = removeDoneFor
        ? d.journal.filter((j) => j.taskId !== removeDoneFor)
        : d.journal;
      if (removeReadyFor) {
        journal = journal.filter(
          (j) => !(j.taskId === removeReadyFor && j.stage === READY_COLUMN_NAME)
        );
      }
      let logged: JournalEntry | null = null;
      if (changedColumn) {
        // «Готово» не создаёт новую запись — только гарантирует запись разработчика
        const res =
          action === "done"
            ? ensureDevRecord(journal, finalMoving, board)
            : appendLog(journal, finalMoving, board, action);
        journal = res.journal;
        logged = res.entry;
      }

      apply({ ...d, tasks, journal });

      if (userId) {
        const affected = tasks.filter((t) => newOrder.has(t.id));
        persist(db.upsertTasks(affected, userId));
        if (logged) persist(db.insertJournal(logged, userId));
        if (removeDoneFor) persist(db.deleteJournalByTask(removeDoneFor));
        if (removeReadyFor) persist(db.deleteJournalByTask(removeReadyFor));
      }
    },
    [apply, persist, userId]
  );

  const toggleDone = useCallback(
    (id: string, doneColId?: string) => {
      const d = dataRef.current;
      const task = d.tasks.find((t) => t.id === id);
      if (!task) return;
      const becomingDone = task.status !== "done";
      const nowIso = new Date().toISOString();

      const movingColumn = becomingDone && doneColId && doneColId !== task.columnId;
      const board = d.boards.find((b) => b.id === task.boardId);

      const updatedTask: Task = becomingDone
        ? {
            ...task,
            status: "done",
            completedAt: nowIso,
            testedAt: task.testedAt ?? nowIso,
            readyAt: task.readyAt ?? nowIso,
            columnId: doneColId ?? task.columnId,
            stageEnteredAt: movingColumn ? nowIso : task.stageEnteredAt,
            stageTimes: movingColumn ? accrueStageTimes(task, board, nowIso) : task.stageTimes,
            photos: [], // фото удаляются при завершении
          }
        : { ...task, status: "active", completedAt: null, testedAt: null };

      const tasks = d.tasks.map((t) => (t.id === id ? updatedTask : t));

      let journal = d.journal;
      let journalEntry: JournalEntry | null = null;
      if (becomingDone) {
        const res = ensureDevRecord(d.journal, updatedTask, board);
        journal = res.journal;
        journalEntry = res.entry;
      } else {
        journal = d.journal.filter((j) => j.taskId !== id);
      }

      apply({ ...d, tasks, journal });

      persist(
        db.updateTaskRow(id, {
          status: updatedTask.status,
          completedAt: updatedTask.completedAt,
          testedAt: updatedTask.testedAt,
          readyAt: updatedTask.readyAt,
          columnId: updatedTask.columnId,
          stageEnteredAt: updatedTask.stageEnteredAt,
          stageTimes: updatedTask.stageTimes,
          photos: updatedTask.photos,
        })
      );
      if (userId) {
        if (becomingDone && journalEntry) persist(db.insertJournal(journalEntry, userId));
        if (!becomingDone) persist(db.deleteJournalByTask(id));
      }
    },
    [apply, persist, userId]
  );

  // ---------------- Team workflow ----------------
  const addComment = useCallback(
    (taskId: string, author: string, text: string, kind: CommentKind = "comment") => {
      if (!text.trim()) return;
      const c: TaskComment = {
        id: uuid(),
        taskId,
        author: author.trim(),
        text: text.trim(),
        kind,
        createdAt: new Date().toISOString(),
      };
      apply({ ...dataRef.current, comments: [...dataRef.current.comments, c] });
      if (userId) persist(db.insertComment(c, userId));
    },
    [apply, persist, userId]
  );

  const deleteComment = useCallback(
    (id: string) => {
      apply({
        ...dataRef.current,
        comments: dataRef.current.comments.filter((c) => c.id !== id),
      });
      persist(db.deleteCommentRow(id));
    },
    [apply, persist]
  );

  // ---------------- Members (team) ----------------
  const addMember = useCallback(
    (name: string, opts?: { email?: string; role?: string; color?: string }): Member | null => {
      const clean = name.trim();
      if (!clean) return null;
      // dedupe by name (case-insensitive) — reuse existing member
      const existing = dataRef.current.members.find(
        (m) => m.name.toLowerCase() === clean.toLowerCase()
      );
      if (existing) return existing;
      const member: Member = {
        id: uuid(),
        name: clean,
        email: opts?.email?.trim() ?? "",
        role: opts?.role?.trim() ?? "",
        color: opts?.color ?? avatarColor(clean),
        createdAt: new Date().toISOString(),
      };
      apply({ ...dataRef.current, members: [...dataRef.current.members, member] });
      if (userId) persist(db.insertMember(member, userId));
      return member;
    },
    [apply, persist, userId]
  );

  const updateMember = useCallback(
    (id: string, patch: Partial<Omit<Member, "id">>) => {
      const d = dataRef.current;
      const prev = d.members.find((m) => m.id === id);
      const renaming = !!patch.name && !!prev && patch.name !== prev.name;

      const renamedTasks: Task[] = [];
      const tasks = renaming
        ? d.tasks.map((t) => {
            if (t.assignee === prev!.name) {
              const nt = { ...t, assignee: patch.name! };
              renamedTasks.push(nt);
              return nt;
            }
            return t;
          })
        : d.tasks;

      apply({
        ...d,
        members: d.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        tasks,
      });
      persist(db.updateMemberRow(id, patch));
      if (userId && renamedTasks.length) persist(db.upsertTasks(renamedTasks, userId));
    },
    [apply, persist, userId]
  );

  const deleteMember = useCallback(
    (id: string) => {
      apply({
        ...dataRef.current,
        members: dataRef.current.members.filter((m) => m.id !== id),
      });
      persist(db.deleteMemberRow(id));
    },
    [apply, persist]
  );

  const sendToReview = useCallback(
    (id: string) => {
      const d = dataRef.current;
      const task = d.tasks.find((t) => t.id === id);
      if (!task) return;
      const board = d.boards.find((b) => b.id === task.boardId);
      const cols = board?.columns ?? [];
      // «Готов к тестированию» = третья с конца; fallback на предпоследнюю
      const readyCol =
        cols[cols.length - 3]?.id ?? cols[cols.length - 2]?.id ?? task.columnId;
      const nowIso = new Date().toISOString();
      const changed = readyCol !== task.columnId;
      const patch: Partial<Task> = {
        columnId: readyCol,
        readyAt: task.readyAt ?? nowIso,
        status: "active",
        completedAt: null,
        testedAt: null,
        stageEnteredAt: changed ? nowIso : task.stageEnteredAt,
        stageTimes: changed ? accrueStageTimes(task, board, nowIso) : task.stageTimes,
      };
      const updated = { ...task, ...patch };

      // if it was done, clear its done journal entries; then log the review action
      const baseJournal =
        task.status === "done" ? d.journal.filter((j) => j.taskId !== id) : d.journal;
      const { journal, entry } = appendLog(baseJournal, updated, board, "review");

      apply({
        ...d,
        tasks: d.tasks.map((t) => (t.id === id ? updated : t)),
        journal,
      });
      persist(db.updateTaskRow(id, patch));
      if (task.status === "done") persist(db.deleteJournalByTask(id));
      if (userId && entry) persist(db.insertJournal(entry, userId));
    },
    [apply, persist, userId]
  );

  const acceptTask = useCallback(
    (id: string) => {
      const d = dataRef.current;
      const task = d.tasks.find((t) => t.id === id);
      if (!task) return;
      const board = d.boards.find((b) => b.id === task.boardId);
      const doneCol = board?.columns[board.columns.length - 1]?.id ?? task.columnId;
      const nowIso = new Date().toISOString();
      const acceptChanged = doneCol !== task.columnId;
      const patch: Partial<Task> = {
        columnId: doneCol,
        status: "done",
        testedAt: nowIso,
        completedAt: nowIso,
        readyAt: task.readyAt ?? nowIso,
        stageEnteredAt: acceptChanged ? nowIso : task.stageEnteredAt,
        stageTimes: acceptChanged ? accrueStageTimes(task, board, nowIso) : task.stageTimes,
        photos: [], // фото удаляются при завершении
      };
      const updated = { ...task, ...patch };

      const { journal, entry } = ensureDevRecord(d.journal, updated, board);

      apply({
        ...d,
        tasks: d.tasks.map((t) => (t.id === id ? updated : t)),
        journal,
      });
      persist(db.updateTaskRow(id, patch));
      if (userId && entry) persist(db.insertJournal(entry, userId));
    },
    [apply, persist, userId]
  );

  const returnTask = useCallback(
    (id: string, author: string, reason: string) => {
      const d = dataRef.current;
      const task = d.tasks.find((t) => t.id === id);
      if (!task) return;
      const board = d.boards.find((b) => b.id === task.boardId);
      // back to "in progress": second column if exists, else first
      const inProgressCol = board?.columns[1]?.id ?? board?.columns[0]?.id ?? task.columnId;
      const nowIso = new Date().toISOString();

      const returnEvent: ReturnEvent = {
        at: nowIso,
        from: board?.columns.find((c) => c.id === task.columnId)?.name ?? "—",
        to: board?.columns.find((c) => c.id === inProgressCol)?.name ?? "—",
        seconds: secondsBetween(task.stageEnteredAt ?? task.createdAt, nowIso),
        reason: reason.trim() || undefined,
      };

      const patch: Partial<Task> = {
        columnId: inProgressCol,
        status: "active",
        readyAt: null,
        testedAt: null,
        completedAt: null,
        stageEnteredAt: nowIso,
        stageTimes:
          inProgressCol !== task.columnId
            ? accrueStageTimes(task, board, nowIso)
            : task.stageTimes,
        returnCount: (task.returnCount ?? 0) + 1,
        returns: [...(task.returns ?? []), returnEvent],
      };
      const updated = { ...task, ...patch };

      const comment: TaskComment = {
        id: uuid(),
        taskId: id,
        author: author.trim() || "QA",
        text: reason.trim(),
        kind: "return",
        createdAt: nowIso,
      };

      // returning to work — drop its «Готово»/«Готов к тестированию» entries,
      // then log the return action (with reason as note)
      const hadLogged = d.journal.some(
        (j) => j.taskId === id && (j.stage === "Готово" || j.stage === READY_COLUMN_NAME)
      );
      const baseJournal = d.journal.filter(
        (j) => !(j.taskId === id && (j.stage === "Готово" || j.stage === READY_COLUMN_NAME))
      );
      const { journal, entry } = appendLog(baseJournal, updated, board, "returned", reason.trim());

      apply({
        ...d,
        tasks: d.tasks.map((t) => (t.id === id ? updated : t)),
        comments: reason.trim() ? [...d.comments, comment] : d.comments,
        journal,
      });
      persist(db.updateTaskRow(id, patch));
      if (userId && reason.trim()) persist(db.insertComment(comment, userId));
      if (hadLogged) persist(db.deleteJournalByTask(id));
      if (userId && entry) persist(db.insertJournal(entry, userId));
    },
    [apply, persist, userId]
  );

  // ---------------- Journal ----------------
  const addJournalEntry = useCallback(
    (entry: Omit<JournalEntry, "id" | "createdAt">) => {
      const e: JournalEntry = { ...entry, id: uuid(), createdAt: new Date().toISOString() };
      apply({ ...dataRef.current, journal: [e, ...dataRef.current.journal] });
      if (userId) persist(db.insertJournal(e, userId));
    },
    [apply, persist, userId]
  );

  const updateJournalEntry = useCallback(
    (id: string, patch: Partial<JournalEntry>) => {
      apply({
        ...dataRef.current,
        journal: dataRef.current.journal.map((j) => (j.id === id ? { ...j, ...patch } : j)),
      });
      persist(db.updateJournalRow(id, patch));
    },
    [apply, persist]
  );

  // Удаление записи журнала = перенос в Корзину. Обратимо.
  const deleteJournalEntry = useCallback(
    (id: string) => {
      const d = dataRef.current;
      const entry = d.journal.find((j) => j.id === id);
      if (!entry) return;
      const at = new Date().toISOString();
      apply({ ...d, journal: d.journal.filter((j) => j.id !== id) });
      applyTrash({
        ...trashRef.current,
        journal: [{ ...entry, deletedAt: at }, ...trashRef.current.journal],
      });
      persist(db.softDeleteJournalRow(id));
    },
    [apply, applyTrash, persist]
  );

  // ---------------- Корзина: восстановление / полное удаление ----------------
  const restoreBoard = useCallback(
    (id: string) => {
      const t = trashRef.current;
      const board = t.boards.find((b) => b.id === id);
      if (!board) return;
      const boardTasks = t.tasks.filter((x) => x.boardId === id);
      applyTrash({
        boards: t.boards.filter((b) => b.id !== id),
        tasks: t.tasks.filter((x) => x.boardId !== id),
        journal: t.journal,
      });
      apply({
        ...dataRef.current,
        boards: [...dataRef.current.boards, { ...board, deletedAt: null }],
        tasks: [...dataRef.current.tasks, ...boardTasks.map((x) => ({ ...x, deletedAt: null }))],
      });
      persist(db.restoreBoardRow(id));
    },
    [apply, applyTrash, persist]
  );

  const restoreTask = useCallback(
    (id: string) => {
      const t = trashRef.current;
      const task = t.tasks.find((x) => x.id === id);
      if (!task) return;
      // если доска задачи тоже в Корзине — восстанавливаем доску целиком
      const boardVisible = dataRef.current.boards.some((b) => b.id === task.boardId);
      if (!boardVisible && t.boards.some((b) => b.id === task.boardId)) {
        restoreBoard(task.boardId);
        return;
      }
      applyTrash({ ...t, tasks: t.tasks.filter((x) => x.id !== id) });
      apply({
        ...dataRef.current,
        tasks: [...dataRef.current.tasks, { ...task, deletedAt: null }],
      });
      persist(db.restoreTaskRow(id));
    },
    [apply, applyTrash, persist, restoreBoard]
  );

  const restoreJournal = useCallback(
    (id: string) => {
      const t = trashRef.current;
      const entry = t.journal.find((x) => x.id === id);
      if (!entry) return;
      applyTrash({ ...t, journal: t.journal.filter((x) => x.id !== id) });
      apply({
        ...dataRef.current,
        journal: [{ ...entry, deletedAt: null }, ...dataRef.current.journal],
      });
      persist(db.restoreJournalRow(id));
    },
    [apply, applyTrash, persist]
  );

  const purgeBoard = useCallback(
    (id: string) => {
      const t = trashRef.current;
      applyTrash({
        boards: t.boards.filter((b) => b.id !== id),
        tasks: t.tasks.filter((x) => x.boardId !== id),
        journal: t.journal,
      });
      persist(db.deleteBoardRow(id)); // задачи каскадом
    },
    [applyTrash, persist]
  );

  const purgeTask = useCallback(
    (id: string) => {
      applyTrash({
        ...trashRef.current,
        tasks: trashRef.current.tasks.filter((x) => x.id !== id),
      });
      persist(db.deleteTaskRow(id));
    },
    [applyTrash, persist]
  );

  const purgeJournal = useCallback(
    (id: string) => {
      applyTrash({
        ...trashRef.current,
        journal: trashRef.current.journal.filter((x) => x.id !== id),
      });
      persist(db.deleteJournalRow(id));
    },
    [applyTrash, persist]
  );

  const emptyTrash = useCallback(async () => {
    // страховка: перед полной очисткой делаем авто-бэкап
    try {
      await db.createBackupRow("Перед очисткой Корзины", "auto", getMe() || userEmail || "", userId);
    } catch (e) {
      console.error("Не удалось создать авто-бэкап", e);
    }
    const t = trashRef.current;
    applyTrash(EMPTY_TRASH);
    t.boards.forEach((b) => persist(db.deleteBoardRow(b.id)));
    t.tasks.forEach((x) => persist(db.deleteTaskRow(x.id)));
    t.journal.forEach((j) => persist(db.deleteJournalRow(j.id)));
  }, [applyTrash, persist, userId, userEmail, EMPTY_TRASH]);

  // ---------------- Бэкапы ----------------
  const refreshBackups = useCallback(async () => {
    try {
      setBackups(await db.fetchBackups());
    } catch (e) {
      console.error("Не удалось загрузить бэкапы", e);
    }
  }, []);

  const createBackup = useCallback(
    async (label: string): Promise<BackupMeta | null> => {
      try {
        const meta = await db.createBackupRow(
          label.trim() || "Ручной бэкап",
          "manual",
          getMe() || userEmail || "",
          userId
        );
        setBackups((prev) => [meta, ...prev]);
        return meta;
      } catch (e) {
        console.error("Не удалось создать бэкап", e);
        return null;
      }
    },
    [userId, userEmail]
  );

  const deleteBackup = useCallback(async (id: string) => {
    try {
      await db.deleteBackupRow(id);
      setBackups((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error("Не удалось удалить бэкап", e);
    }
  }, []);

  const downloadBackup = useCallback(async (id: string) => {
    const data = await db.fetchBackupData(id);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulut-backup-${id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const restoreBackup = useCallback(
    async (id: string) => {
      const data = await db.fetchBackupData(id);
      if (!data) return;
      await db.restoreFromBackup(data);
      await refetch();
    },
    [refetch]
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      ...data,
      ready,
      createBoard,
      updateBoard,
      deleteBoard,
      addColumn,
      renameColumn,
      deleteColumn,
      createTask,
      updateTask,
      deleteTask,
      moveTask,
      toggleDone,
      sendToReview,
      acceptTask,
      returnTask,
      addComment,
      deleteComment,
      addMember,
      updateMember,
      deleteMember,
      addJournalEntry,
      updateJournalEntry,
      deleteJournalEntry,
      trash,
      refreshTrash,
      restoreBoard,
      restoreTask,
      restoreJournal,
      purgeBoard,
      purgeTask,
      purgeJournal,
      emptyTrash,
      backups,
      refreshBackups,
      createBackup,
      deleteBackup,
      downloadBackup,
      restoreBackup,
      refetch,
    }),
    [
      data,
      ready,
      createBoard,
      updateBoard,
      deleteBoard,
      addColumn,
      renameColumn,
      deleteColumn,
      createTask,
      updateTask,
      deleteTask,
      moveTask,
      toggleDone,
      sendToReview,
      acceptTask,
      returnTask,
      addComment,
      deleteComment,
      addMember,
      updateMember,
      deleteMember,
      addJournalEntry,
      updateJournalEntry,
      deleteJournalEntry,
      trash,
      refreshTrash,
      restoreBoard,
      restoreTask,
      restoreJournal,
      purgeBoard,
      purgeTask,
      purgeJournal,
      emptyTrash,
      backups,
      refreshBackups,
      createBackup,
      deleteBackup,
      downloadBackup,
      restoreBackup,
      refetch,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/** Helper: find the "done" column of a board (last column by convention). */
export function doneColumnId(board: Board): string {
  return board.columns[board.columns.length - 1]?.id ?? "";
}

/** "Review / QA" column — second from the end by convention. */
export function reviewColumnId(board: Board): string {
  const cols = board.columns;
  return cols.length >= 2 ? cols[cols.length - 2].id : doneColumnId(board);
}

/** "Ready for testing" column — third from the end (dev handoff). */
export function readyColumnId(board: Board): string {
  const cols = board.columns;
  return cols.length >= 3 ? cols[cols.length - 3].id : reviewColumnId(board);
}

/** Column role helpers for a given column within its board. */
export function columnRole(
  board: Board,
  columnId: string
): "todo" | "progress" | "ready" | "review" | "done" {
  const cols = board.columns;
  const last = cols.length - 1;
  const idx = cols.findIndex((c) => c.id === columnId);
  if (idx === last) return "done";
  if (idx === last - 1) return "review";
  if (idx === last - 2 && idx >= 1) return "ready";
  if (idx === 0) return "todo";
  return "progress";
}
