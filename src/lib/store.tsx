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
  BOARD_COLORS,
  DEFAULT_COLUMN_NAMES,
  READY_COLUMN_NAME,
  REVIEW_COLUMN_NAME,
} from "./types";
import * as db from "./db";
import { loadCache, saveCache } from "./cache";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth";
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
  // data
  refetch: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const EMPTY: AppData = { boards: [], tasks: [], journal: [], comments: [], members: [] };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? "";

  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const dataRef = useRef<AppData>(EMPTY);

  const apply = useCallback((next: AppData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const refetch = useCallback(async () => {
    if (!userId) return;
    try {
      const fresh = await db.fetchAll(userId);
      apply(fresh);
    } catch (e) {
      console.error("Не удалось загрузить данные", e);
    }
  }, [userId, apply]);

  // (Re)load whenever the signed-in user changes.
  // Cache-first: hydrate instantly from localStorage (offline-safe, no empty
  // flash on reload / navigation), then refresh from Supabase in the background.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      apply(EMPTY);
      setReady(false);
      return;
    }

    const cached = loadCache(userId);
    if (cached) {
      apply(cached);
      setReady(true); // show cached data immediately
    } else {
      setReady(false);
    }

    db.fetchAll(userId)
      .then((fresh) => {
        if (!cancelled) {
          apply(fresh);
          setReady(true);
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
  }, [userId, apply]);

  // Write-through: persist every state change to the offline cache
  useEffect(() => {
    if (userId && ready) saveCache(userId, data);
  }, [data, userId, ready]);

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
  }, [userId, apply]);

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

  const deleteBoard = useCallback(
    (id: string) => {
      apply({
        ...dataRef.current,
        boards: dataRef.current.boards.filter((b) => b.id !== id),
        tasks: dataRef.current.tasks.filter((t) => t.boardId !== id),
      });
      persist(db.deleteBoardRow(id)); // tasks cascade-delete in DB
    },
    [apply, persist]
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

  const deleteTask = useCallback(
    (id: string) => {
      apply({
        ...dataRef.current,
        tasks: dataRef.current.tasks.filter((t) => t.id !== id),
        journal: dataRef.current.journal.filter((j) => j.taskId !== id),
      });
      persist(db.deleteTaskRow(id)); // journal cascade-deletes in DB
    },
    [apply, persist]
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

  const deleteJournalEntry = useCallback(
    (id: string) => {
      apply({
        ...dataRef.current,
        journal: dataRef.current.journal.filter((j) => j.id !== id),
      });
      persist(db.deleteJournalRow(id));
    },
    [apply, persist]
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
