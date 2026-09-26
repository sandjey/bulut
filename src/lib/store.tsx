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
  TaskPhoto,
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
import { scopeKey, taskInScope, type TaskScope, type BoardStats } from "./db";
import { loadCache, saveCache } from "./cache";
import { useAuth } from "./auth";
import { useWorkspace } from "./workspace";
import { getMe } from "./me";
import { avatarColor } from "./utils";
import { JournalTrigger } from "./settings";
import { formatDuration, todayISO } from "./date";
import { accrueStageTimes, stageTimeList } from "./stages";
import { isTaskOverdue } from "./deadlines";
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

export type { TaskScope, BoardStats } from "./db";
export type JournalScope = "none" | "slim" | "full";

/** Сколько открытых карточек держим «в деталях» (описание + комментарии). */
const DETAIL_LRU = 30;

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
  /** true — на экране кэш с прошлого раза, идёт первая проверка с сервером. */
  syncing: boolean;
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
  /** Безопасный перенос карточки (и её подзадач) в другую доску. */
  moveTaskToBoard: (taskId: string, toBoardId: string, toColumnId: string) => void;
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
  /** Подгрузить фото задачи (открыли карточку) — они не приходят с общей загрузкой. */
  loadTaskPhotos: (taskId: string) => Promise<void>;
  // ---- слои загрузки ----
  /** Счётчики по доскам (для главной): считает база, для загруженных досок — из памяти. */
  boardStats: Record<string, BoardStats>;
  /** Догрузить набор задач (доска / мои / карта / все). Повторный вызов — no-op. */
  ensureTasks: (scope: TaskScope) => Promise<void>;
  /** Набор уже в памяти (с сервера, не из кэша). */
  isScopeLoaded: (scope: TaskScope) => boolean;
  /** Набор сейчас грузится. */
  isScopeLoading: (scope: TaskScope) => boolean;
  /** Журнал: none — не грузили, slim — без заметок, full — с заметками. */
  journalScope: JournalScope;
  ensureJournal: (full?: boolean) => Promise<void>;
  /** Описание, кастомные поля и комментарии карточки — при её открытии. */
  ensureTaskDetails: (taskId: string) => Promise<Task | undefined>;
  /** Растёт после каждой сверки с сервером — чтобы перезапросить свои данные. */
  dataVersion: number;
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
  // true — на экране кэш с прошлого раза, идёт первая сверка с сервером.
  // Без этого флага смена «старое → новое» число карточек выглядит как баг.
  const [syncing, setSyncing] = useState(false);
  const dataRef = useRef<AppData>(EMPTY);
  // Сколько наших записей «в полёте» — пока > 0, не перезагружаем данные с сервера,
  // чтобы чужое realtime-событие не затёрло наши оптимистичные изменения.
  const pending = useRef(0);

  // ---- что именно загружено (слои) ----
  // Наборы задач, которые уже пришли с сервера, и те, что грузятся прямо сейчас.
  const scopesRef = useRef<Map<string, TaskScope>>(new Map());
  const [loadedScopes, setLoadedScopes] = useState<string[]>([]);
  const scopeInflight = useRef<Map<string, Promise<void>>>(new Map());
  const [loadingScopes, setLoadingScopes] = useState<string[]>([]);
  // Журнал — отдельный слой: без заметок хватает отчётам и логике этапов.
  const journalScopeRef = useRef<JournalScope>("none");
  const [journalScope, setJournalScope] = useState<JournalScope>("none");
  const journalInflight = useRef<Promise<void> | null>(null);
  // Карточки, у которых на руках детали (описание + комментарии), по давности.
  const detailIds = useRef<string[]>([]);
  const detailInflight = useRef<Map<string, Promise<Task | undefined>>>(new Map());
  const [serverStats, setServerStats] = useState<Record<string, BoardStats>>({});
  const [dataVersion, setDataVersion] = useState(0);

  const EMPTY_TRASH: TrashData = useMemo(() => ({ boards: [], tasks: [], journal: [] }), []);
  const [trash, setTrash] = useState<TrashData>({ boards: [], tasks: [], journal: [] });
  const trashRef = useRef<TrashData>({ boards: [], tasks: [], journal: [] });
  const applyTrash = useCallback((next: TrashData) => {
    trashRef.current = next;
    setTrash(next);
  }, []);
  const [backups, setBackups] = useState<BackupMeta[]>([]);

  // Метка синхронизации комнаты (db.fetchSyncStamp): пока она не изменилась,
  // опрос вообще не качает данные — только ~200 байт на проверку.
  // null — сервер метку не отдаёт (миграция 20240131 не применена): тогда
  // работаем по-старому, полной перезагрузкой загруженных слоёв.
  const syncStamp = useRef<string | null>(null);

  const apply = useCallback((next: AppData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const syncScopeState = useCallback(() => {
    setLoadedScopes(Array.from(scopesRef.current.keys()));
    setLoadingScopes(Array.from(scopeInflight.current.keys()));
  }, []);

  /**
   * Перенести в свежую сводку то, что есть только у нас на руках: детали
   * (описание, кастомные поля), фото и счётчик комментариев. Иначе открытая
   * карточка теряла бы содержимое на каждом опросе.
   */
  const carryOver = useCallback((old: Task | undefined, fresh: Task): Task => {
    if (!old) return fresh;
    let t = fresh;
    if (old.detailsLoaded && !fresh.detailsLoaded) {
      t = { ...t, desc: old.desc, custom: old.custom, detailsLoaded: true };
    }
    if (fresh.photos === undefined && old.photos !== undefined) {
      // Счётчик с сервера разошёлся с тем, что у нас на руках — значит фото
      // поменял кто-то другой. Оставляем поле пустым: карточка перекачает их.
      if (fresh.photoCount === undefined || fresh.photoCount === old.photos.length) {
        t = { ...t, photos: old.photos };
      }
    }
    if (fresh.commentCount === undefined && old.commentCount !== undefined) {
      t = { ...t, commentCount: old.commentCount };
    }
    return t;
  }, []);

  /**
   * Влить свежие сводки наборов в память. Задача, которая по нашим данным
   * входила в один из наборов, но с сервера не пришла — выпала (удалена или
   * переехала): убираем. Остальное (задачи из незагруженных наборов) не трогаем.
   */
  const mergeTasks = useCallback(
    (current: Task[], fresh: Task[], scopes: TaskScope[]): Task[] => {
      const byId = new Map(current.map((t) => [t.id, t]));
      const freshIds = new Set(fresh.map((t) => t.id));
      const inAny = (t: Task) => scopes.some((s) => taskInScope(t, s));
      const kept = current.filter((t) => !freshIds.has(t.id) && !inAny(t));
      const seen = new Set<string>();
      const merged: Task[] = [];
      for (const f of fresh) {
        if (seen.has(f.id)) continue; // одна задача может прийти из двух наборов
        seen.add(f.id);
        merged.push(carryOver(byId.get(f.id), f));
      }
      return [...kept, ...merged];
    },
    [carryOver],
  );

  /** Записать в память детали и комментарии карточек (после fetchTaskDetails/fetchCommentsFor). */
  const applyDetails = useCallback(
    (
      base: AppData,
      details: { id: string; desc: string; custom: Record<string, string> }[],
      comments: TaskComment[],
      ids: string[],
    ): AppData => {
      const byId = new Map(details.map((d) => [d.id, d]));
      const idSet = new Set(ids);
      const countByTask = new Map<string, number>();
      for (const c of comments) countByTask.set(c.taskId, (countByTask.get(c.taskId) ?? 0) + 1);
      const fetchedIds = new Set(comments.map((c) => c.id));
      // Свои свежие комментарии (ещё не подтверждённые сервером) не теряем.
      const local = base.comments.filter((c) => idSet.has(c.taskId) && !fetchedIds.has(c.id) && pending.current > 0);
      const tasks = base.tasks.map((t) => {
        if (!idSet.has(t.id)) return t;
        const d = byId.get(t.id);
        return {
          ...t,
          desc: d?.desc ?? t.desc,
          custom: d?.custom ?? t.custom,
          detailsLoaded: true,
          commentCount: (countByTask.get(t.id) ?? 0) + local.filter((c) => c.taskId === t.id).length,
        };
      });
      const others = base.comments.filter((c) => !idSet.has(c.taskId));
      return { ...base, tasks, comments: [...others, ...comments, ...local] };
    },
    [],
  );

  /** Отметить карточку как «с деталями»; самые старые сверх лимита — облегчить. */
  const rememberDetails = useCallback(
    (id: string) => {
      const list = detailIds.current.filter((x) => x !== id);
      list.push(id);
      const dropped: string[] = [];
      while (list.length > DETAIL_LRU) dropped.push(list.shift()!);
      detailIds.current = list;
      if (!dropped.length) return;
      const drop = new Set(dropped);
      const d = dataRef.current;
      apply({
        ...d,
        tasks: d.tasks.map((t) =>
          drop.has(t.id) ? { ...t, desc: "", custom: {}, photos: undefined, detailsLoaded: false } : t,
        ),
        comments: d.comments.filter((c) => !drop.has(c.taskId)),
      });
    },
    [apply],
  );

  /** Счётчики комментариев для карточек доски (значок), без текстов. */
  const loadCommentCounts = useCallback(
    async (boardId: string) => {
      const ids = dataRef.current.tasks.filter((t) => t.boardId === boardId).map((t) => t.id);
      if (!ids.length) return;
      try {
        const counts = await db.fetchCommentCounts(boardId, ids);
        const d = dataRef.current;
        apply({
          ...d,
          tasks: d.tasks.map((t) => (t.boardId === boardId ? { ...t, commentCount: counts.get(t.id) ?? 0 } : t)),
        });
      } catch (e) {
        console.error("Не удалось загрузить счётчики комментариев", e);
      }
    },
    [apply],
  );

  /**
   * Полная сверка загруженных слоёв с сервером: ядро (доски, счётчики),
   * все загруженные наборы задач, журнал (если грузили), детали и комментарии
   * открытых карточек. Ничего сверх того, что уже показываем.
   */
  const refresh = useCallback(async () => {
    const scopes = Array.from(scopesRef.current.values());
    // «все» покрывает остальные наборы — их отдельно не тянем
    const toFetch = scopes.some((s) => s.kind === "all") ? [{ kind: "all" } as TaskScope] : scopes;
    const ids = detailIds.current.slice();
    const jScope = journalScopeRef.current;
    // Метку берём параллельно с данными: если что-то изменится между двумя
    // запросами, метка окажется «старее» данных — тогда следующий опрос
    // просто перезагрузит лишний раз. Пропустить изменение так нельзя.
    const [stamp, boards, stats, scopeResults, journal, details, comments] = await Promise.all([
      db.fetchSyncStamp(),
      db.fetchBoards(),
      db.fetchBoardStats(todayISO()),
      Promise.all(toFetch.map((s) => db.fetchTaskSummaries(s))),
      jScope === "none" ? Promise.resolve(null) : db.fetchJournal(jScope === "full"),
      ids.length ? db.fetchTaskDetails(ids) : Promise.resolve([]),
      ids.length ? db.fetchCommentsFor(ids) : Promise.resolve([]),
    ]);
    syncStamp.current = stamp;
    const cur = dataRef.current;
    let next: AppData = {
      ...cur,
      boards,
      tasks: mergeTasks(cur.tasks, scopeResults.flat(), scopes),
      journal: journal ?? cur.journal,
      members: [],
    };
    if (ids.length) next = applyDetails(next, details, comments, ids);
    apply(next);
    setServerStats(stats);
    setDataVersion((v) => v + 1);
    // счётчики комментариев — по загруженным доскам (дёшево: только id)
    for (const s of scopes) if (s.kind === "board") void loadCommentCounts(s.boardId);
  }, [apply, mergeTasks, applyDetails, loadCommentCounts]);

  const refreshTrash = useCallback(() => {
    db.fetchTrash().then(applyTrash).catch(() => {});
  }, [applyTrash]);

  const refetch = useCallback(async () => {
    if (!userId) return;
    try {
      await refresh();
      refreshTrash();
    } catch (e) {
      console.error("Не удалось загрузить данные", e);
    }
  }, [userId, refresh, refreshTrash]);

  /** Догрузить набор задач. Повторный вызов для того же набора — ничего не делает. */
  const ensureTasks = useCallback(
    (scope: TaskScope): Promise<void> => {
      if (!userId || !activeId) return Promise.resolve();
      if (scope.kind === "ids" && scope.ids.length === 0) return Promise.resolve();
      const key = scopeKey(scope);
      const hasAll = scopesRef.current.has("all");
      if (scopesRef.current.has(key) || (hasAll && scope.kind !== "all")) {
        // доска уже в памяти через «все» — не хватает только значков комментариев
        if (scope.kind === "board" && !scopesRef.current.has(key)) {
          scopesRef.current.set(key, scope);
          syncScopeState();
          void loadCommentCounts(scope.boardId);
        }
        return Promise.resolve();
      }
      const inflight = scopeInflight.current.get(key);
      if (inflight) return inflight;
      const p = (async () => {
        try {
          const fresh = await db.fetchTaskSummaries(scope);
          const d = dataRef.current;
          apply({ ...d, tasks: mergeTasks(d.tasks, fresh, [scope]) });
          scopesRef.current.set(key, scope);
          if (scope.kind === "board") await loadCommentCounts(scope.boardId);
        } catch (e) {
          console.error("Не удалось загрузить задачи", e);
        } finally {
          scopeInflight.current.delete(key);
          syncScopeState();
        }
      })();
      scopeInflight.current.set(key, p);
      syncScopeState();
      return p;
    },
    [userId, activeId, apply, mergeTasks, loadCommentCounts, syncScopeState],
  );

  const isScopeLoaded = useCallback(
    (scope: TaskScope) => loadedScopes.includes("all") || loadedScopes.includes(scopeKey(scope)),
    [loadedScopes],
  );
  const isScopeLoading = useCallback(
    (scope: TaskScope) => loadingScopes.includes(scopeKey(scope)),
    [loadingScopes],
  );

  /** Догрузить журнал: без заметок (отчёты, логика этапов) или целиком (страница журнала, экспорт). */
  const ensureJournal = useCallback(
    (full = false): Promise<void> => {
      if (!userId || !activeId) return Promise.resolve();
      const cur = journalScopeRef.current;
      if (cur === "full" || (cur === "slim" && !full)) return Promise.resolve();
      if (journalInflight.current) return journalInflight.current;
      const p = (async () => {
        try {
          const journal = await db.fetchJournal(full);
          apply({ ...dataRef.current, journal });
          journalScopeRef.current = full ? "full" : "slim";
          setJournalScope(journalScopeRef.current);
        } catch (e) {
          console.error("Не удалось загрузить журнал", e);
        } finally {
          journalInflight.current = null;
        }
      })();
      journalInflight.current = p;
      return p;
    },
    [userId, activeId, apply],
  );

  /** Описание, кастомные поля и комментарии одной карточки — при её открытии. */
  const ensureTaskDetails = useCallback(
    (taskId: string): Promise<Task | undefined> => {
      const t = dataRef.current.tasks.find((x) => x.id === taskId);
      if (!t) return Promise.resolve(undefined);
      if (t.detailsLoaded) {
        rememberDetails(taskId);
        return Promise.resolve(t);
      }
      const inflight = detailInflight.current.get(taskId);
      if (inflight) return inflight;
      const p = (async () => {
        try {
          const [details, comments] = await Promise.all([db.fetchTaskDetails([taskId]), db.fetchCommentsFor([taskId])]);
          const next = applyDetails(dataRef.current, details, comments, [taskId]);
          apply(next);
          rememberDetails(taskId);
          return next.tasks.find((x) => x.id === taskId);
        } catch (e) {
          console.error("Не удалось загрузить карточку", e);
          return dataRef.current.tasks.find((x) => x.id === taskId);
        } finally {
          detailInflight.current.delete(taskId);
        }
      })();
      detailInflight.current.set(taskId, p);
      return p;
    },
    [apply, applyDetails, rememberDetails],
  );

  /**
   * Подгрузить фото одной задачи (открыли карточку). Единственное место, где
   * base64 идёт по сети. Повторно не качаем — если фото уже в состоянии, выходим.
   */
  const loadTaskPhotos = useCallback(
    async (taskId: string) => {
      if (dataRef.current.tasks.find((t) => t.id === taskId)?.photos !== undefined) return;
      try {
        const photos = await db.fetchTaskPhotos(taskId);
        apply({
          ...dataRef.current,
          tasks: dataRef.current.tasks.map((t) =>
            t.id === taskId ? { ...t, photos, photoCount: photos.length } : t
          ),
        });
      } catch (e) {
        console.error("Не удалось загрузить фото задачи", e);
      }
    },
    [apply]
  );

  // (Re)load whenever the signed-in user or room changes.
  // Cache-first: hydrate instantly from localStorage (offline-safe, no empty
  // flash on reload / navigation), then load the core from Supabase. Task
  // sets are pulled by pages on demand (ensureTasks).
  useEffect(() => {
    let cancelled = false;
    // другая комната/пользователь — слои прошлой не годятся
    scopesRef.current = new Map();
    scopeInflight.current = new Map();
    journalScopeRef.current = "none";
    journalInflight.current = null;
    detailIds.current = [];
    detailInflight.current = new Map();
    syncStamp.current = null;
    setLoadedScopes([]);
    setLoadingScopes([]);
    setJournalScope("none");
    setServerStats({});

    if (!userId || !activeId) {
      apply(EMPTY);
      applyTrash(EMPTY_TRASH);
      setBackups([]);
      setReady(false);
      setSyncing(false);
      return;
    }

    const cached = cacheKey ? loadCache(cacheKey) : null;
    if (cached) {
      apply(cached);
      setReady(true); // show cached data immediately
      setSyncing(true); // но это может быть устаревший снимок — сверяем с сервером
    } else {
      apply(EMPTY); // другая комната — не показываем чужие данные из прошлого стейта
      setReady(false);
      setSyncing(false);
    }

    refresh()
      .then(() => {
        if (!cancelled) {
          setReady(true);
          setSyncing(false);
          refreshTrash();
        }
      })
      .catch((e) => {
        // offline / server unreachable — keep whatever the cache gave us
        console.error("Не удалось загрузить данные (работаем из кэша)", e);
        if (!cancelled) {
          setReady(true);
          setSyncing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, activeId, cacheKey, apply, applyTrash, refresh, refreshTrash, EMPTY_TRASH]);

  // Write-through: persist every state change to the offline cache (по комнате)
  useEffect(() => {
    if (cacheKey && ready) saveCache(cacheKey, data);
  }, [data, cacheKey, ready]);

  // Раньше здесь была realtime-подписка (websocket). Она держит активной
  // тяжёлую функцию realtime.list_changes() на стороне Postgres (10+ секунд
  // на вызов на тарифе Nano — см. Logs → Postgres) — платно чинится апгрейдом
  // компьюта. Бесплатная альтернатива: обычный опрос раз в 25с + сразу при
  // возврате на вкладку. Без нагрузки на WAL, чуть медленнее видно чужие правки.
  //
  // Опрос устроен в два шага, иначе он съедает трафик: сначала спрашиваем
  // короткую метку синхронизации (~200 байт), и только если она изменилась —
  // качаем данные. Свёрнутую вкладку не опрашиваем вообще.
  useEffect(() => {
    if (!userId || !activeId) return;

    let busy = false;
    const poll = async () => {
      if (busy) return; // предыдущий опрос ещё идёт (медленная сеть)
      if (pending.current > 0) return; // не затираем свои неподтверждённые записи
      if (typeof document !== "undefined" && document.hidden) return; // вкладка не на экране
      busy = true;
      try {
        const stamp = await db.fetchSyncStamp();
        // Метка есть и не менялась — в комнате ничего не произошло, данные не тянем.
        if (stamp && stamp === syncStamp.current) return;
        if (pending.current > 0) return; // пока проверяли метку, начали писать свои правки
        await refresh();
      } catch (e) {
        console.error(e);
      } finally {
        busy = false;
      }
    };

    const interval = setInterval(poll, 25000);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [userId, activeId, refresh]);

  /** Fire-and-forget DB write; on failure, re-sync from server. */
  const persist = useCallback(
    (p: Promise<unknown>) => {
      pending.current++;
      p.then(
        () => {},
        (e) => {
          console.error("Ошибка синхронизации", e);
          refetch();
        },
      ).finally(() => {
        pending.current = Math.max(0, pending.current - 1);
      });
    },
    [refetch]
  );

  /**
   * Запись в журнал при смене этапа. Заметка строится из описания карточки,
   * а в памяти обычно только сводка — поэтому сначала дотягиваем детали.
   * Если журнал не загружен, дубликаты отсекает база (insertJournalIfNoStage).
   */
  const logStage = useCallback(
    (task: Task, board: Board | undefined, mode: "review" | "ensureDev") => {
      const run = (full: Task) => {
        const d = dataRef.current;
        const res =
          mode === "review" ? appendLog(d.journal, full, board, "review") : ensureDevRecord(d.journal, full, board);
        if (!res.entry) return;
        if (journalScopeRef.current !== "none") apply({ ...d, journal: res.journal });
        if (userId) {
          persist(
            mode === "ensureDev" ? db.insertJournalIfNoStage(res.entry, userId) : db.insertJournal(res.entry, userId),
          );
        }
      };
      if (task.detailsLoaded) {
        run(task);
        return;
      }
      pending.current++; // чтобы опрос не сработал между переносом и записью в журнал
      ensureTaskDetails(task.id)
        .then((full) => run(full ? { ...task, desc: full.desc } : task))
        .catch(() => run(task))
        .finally(() => {
          pending.current = Math.max(0, pending.current - 1);
        });
    },
    [apply, persist, userId, ensureTaskDetails],
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
        detailsLoaded: true, // создали сами — описание уже на руках
        commentCount: 0,
      };
      apply({ ...dataRef.current, tasks: [...dataRef.current.tasks, task] });
      rememberDetails(task.id);
      if (userId) persist(db.insertTask(task, userId));
      return task;
    },
    [apply, persist, userId, userEmail, rememberDetails]
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
      apply({ ...d, tasks, journal });

      if (userId) {
        const affected = tasks.filter((t) => newOrder.has(t.id));
        persist(db.upsertTasks(affected, userId));
        if (removeDoneFor) persist(db.deleteJournalByTask(removeDoneFor));
        if (removeReadyFor) persist(db.deleteJournalByTask(removeReadyFor));
      }
      // «Готово» не создаёт новую запись — только гарантирует запись разработчика
      if (changedColumn && (action === "done" || action === "review")) {
        logStage(finalMoving, board, action === "done" ? "ensureDev" : "review");
      }
    },
    [apply, persist, userId, logStage]
  );

  // Безопасный перенос карточки в другую доску. Сохраняет всё содержимое
  // (описание, чек-лист, вложения, комментарии, историю возвратов); переносит
  // подзадачи вместе с родителем; журнал по этим задачам (привязан к этапам
  // прежней доски) очищается, чтобы не показывать несуществующие этапы.
  const moveTaskToBoard = useCallback(
    (taskId: string, toBoardId: string, toColumnId: string) => {
      const d = dataRef.current;
      const task = d.tasks.find((t) => t.id === taskId);
      const toBoard = d.boards.find((b) => b.id === toBoardId);
      if (!task || !toBoard || task.boardId === toBoardId) return;
      const col = toBoard.columns.find((c) => c.id === toColumnId) ?? toBoard.columns[0];
      if (!col) return;

      const nowIso = new Date().toISOString();
      const doneCol = toBoard.columns[toBoard.columns.length - 1]?.id;
      const becomingDone = col.id === doneCol;

      // семья: сама карточка + её прямые подзадачи (переезжают вместе)
      const children = d.tasks.filter((t) => t.parentId === taskId);
      const family = [task, ...children];
      const familyIds = new Set(family.map((t) => t.id));

      let order = d.tasks
        .filter((t) => t.boardId === toBoardId && t.columnId === col.id)
        .reduce((m, t) => Math.max(m, t.order), Date.now());

      const patched = family.map((t): Task => {
        order += 1;
        return {
          ...t,
          boardId: toBoardId,
          columnId: col.id,
          order,
          stageEnteredAt: nowIso,
          stageTimes: {}, // новая доска — тайминги этапов считаем заново
          status: becomingDone ? "done" : "active",
          completedAt: becomingDone ? t.completedAt ?? nowIso : null,
          testedAt: becomingDone ? t.testedAt ?? nowIso : t.testedAt,
          readyAt: becomingDone ? t.readyAt ?? nowIso : t.readyAt,
          // подзадача, чей родитель НЕ переезжает вместе — отвязывается
          parentId: t.parentId && !familyIds.has(t.parentId) ? null : t.parentId,
        };
      });
      const patchedById = new Map(patched.map((t) => [t.id, t]));

      const tasks = d.tasks.map((t) => patchedById.get(t.id) ?? t);
      const journal = d.journal.filter((j) => !(j.taskId && familyIds.has(j.taskId)));
      apply({ ...d, tasks, journal });

      if (userId) {
        persist(db.upsertTasks(patched, userId));
        familyIds.forEach((id) => persist(db.deleteJournalByTask(id)));
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

      const journal = becomingDone ? d.journal : d.journal.filter((j) => j.taskId !== id);

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
      if (userId && !becomingDone) persist(db.deleteJournalByTask(id));
      if (becomingDone) logStage(updatedTask, board, "ensureDev");
    },
    [apply, persist, userId, logStage]
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
      const d = dataRef.current;
      apply({
        ...d,
        comments: [...d.comments, c],
        tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, commentCount: (t.commentCount ?? 0) + 1 } : t)),
      });
      if (userId) persist(db.insertComment(c, userId));
    },
    [apply, persist, userId]
  );

  const deleteComment = useCallback(
    (id: string) => {
      const d = dataRef.current;
      const gone = d.comments.find((c) => c.id === id);
      apply({
        ...d,
        comments: d.comments.filter((c) => c.id !== id),
        tasks: gone
          ? d.tasks.map((t) =>
              t.id === gone.taskId ? { ...t, commentCount: Math.max(0, (t.commentCount ?? 1) - 1) } : t,
            )
          : d.tasks,
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
      const journal = task.status === "done" ? d.journal.filter((j) => j.taskId !== id) : d.journal;

      apply({
        ...d,
        tasks: d.tasks.map((t) => (t.id === id ? updated : t)),
        journal,
      });
      persist(db.updateTaskRow(id, patch));
      if (task.status === "done") persist(db.deleteJournalByTask(id));
      logStage(updated, board, "review");
    },
    [apply, persist, logStage]
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

      apply({
        ...d,
        tasks: d.tasks.map((t) => (t.id === id ? updated : t)),
      });
      persist(db.updateTaskRow(id, patch));
      logStage(updated, board, "ensureDev");
    },
    [apply, persist, logStage]
  );

  const returnTask = useCallback(
    (id: string, author: string, reason: string) => {
      const d = dataRef.current;
      const task = d.tasks.find((t) => t.id === id);
      if (!task) return;
      const board = d.boards.find((b) => b.id === task.boardId);
      // возврат тестировщиком → в первую колонку «К выполнению»
      const backCol = board?.columns[0]?.id ?? task.columnId;
      const nowIso = new Date().toISOString();

      const returnEvent: ReturnEvent = {
        at: nowIso,
        from: board?.columns.find((c) => c.id === task.columnId)?.name ?? "—",
        to: board?.columns.find((c) => c.id === backCol)?.name ?? "—",
        seconds: secondsBetween(task.stageEnteredAt ?? task.createdAt, nowIso),
        reason: reason.trim() || undefined,
      };

      const patch: Partial<Task> = {
        columnId: backCol,
        status: "active",
        readyAt: null,
        testedAt: null,
        completedAt: null,
        stageEnteredAt: nowIso,
        stageTimes:
          backCol !== task.columnId
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

      // returning to work — drop its «Готово»/«Готов к тестированию» entries.
      // Журнал может быть не загружен — тогда проверить нечего, чистим в базе всегда.
      const hadLogged =
        journalScopeRef.current === "none" ||
        d.journal.some((j) => j.taskId === id && (j.stage === "Готово" || j.stage === READY_COLUMN_NAME));
      const journal = d.journal.filter(
        (j) => !(j.taskId === id && (j.stage === "Готово" || j.stage === READY_COLUMN_NAME))
      );
      const withComment = reason.trim().length > 0;
      const updatedWithCount = withComment ? { ...updated, commentCount: (updated.commentCount ?? 0) + 1 } : updated;

      apply({
        ...d,
        tasks: d.tasks.map((t) => (t.id === id ? updatedWithCount : t)),
        comments: withComment ? [...d.comments, comment] : d.comments,
        journal,
      });
      persist(db.updateTaskRow(id, patch));
      if (userId && withComment) persist(db.insertComment(comment, userId));
      if (hadLogged) persist(db.deleteJournalByTask(id));
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

  // Счётчики по доскам: для загруженных досок считаем из памяти (мгновенно
  // отражают правки), для остальных — то, что посчитала база.
  const boardStats = useMemo(() => {
    const today = todayISO();
    const out: Record<string, BoardStats> = { ...serverStats };
    const hasAll = loadedScopes.includes("all");
    for (const b of data.boards) {
      if (!hasAll && !loadedScopes.includes(`board:${b.id}`)) continue;
      const bt = data.tasks.filter((t) => t.boardId === b.id);
      const done = bt.filter((t) => t.status === "done").length;
      out[b.id] = {
        total: bt.length,
        done,
        active: bt.length - done,
        overdue: bt.filter((t) => isTaskOverdue(t, today)).length,
      };
    }
    return out;
  }, [serverStats, loadedScopes, data.boards, data.tasks]);

  const value = useMemo<StoreContextValue>(
    () => ({
      ...data,
      ready,
      syncing,
      boardStats,
      ensureTasks,
      isScopeLoaded,
      isScopeLoading,
      journalScope,
      ensureJournal,
      ensureTaskDetails,
      dataVersion,
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
      moveTaskToBoard,
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
      loadTaskPhotos,
    }),
    [
      data,
      ready,
      syncing,
      boardStats,
      ensureTasks,
      isScopeLoaded,
      isScopeLoading,
      journalScope,
      ensureJournal,
      ensureTaskDetails,
      dataVersion,
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
      moveTaskToBoard,
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
      loadTaskPhotos,
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
