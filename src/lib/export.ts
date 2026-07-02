import * as XLSX from "xlsx-js-style";
import {
  AppData,
  Board,
  JournalEntry,
  Task,
  PRIORITY_META,
  TASK_TYPES,
  READY_COLUMN_NAME,
  REVIEW_COLUMN_NAME,
} from "./types";
import { fmtDate, fmtDateTime, formatDuration } from "./date";
import { stageTimeList } from "./stages";
import { returnsSummary } from "./returns";
import { format, parseISO, isValid } from "date-fns";

/** Export only needs these slices of the app data. */
type ExportData = Pick<AppData, "boards" | "tasks" | "journal">;

export interface ExportFilter {
  from?: string | null; // yyyy-MM-dd
  to?: string | null;
  boardId?: string | "all";
  status?: "all" | "active" | "done";
  assignee?: string | "all";
  onlyDone?: boolean; // «Отчёт QA» — только выполненные
  query?: string; // текстовый поиск из журнала
}

/* ============================================================
   Стилевая система — фирменная палитра Bulut, читаемые таблицы
   ============================================================ */
const C = {
  brand: "4F46E5", // indigo — заголовки колонок
  brandDark: "312E81", // тёмный индиго — баннер
  white: "FFFFFF",
  ink: "1F2433", // основной текст
  band: "F4F5FB", // чётная строка
  line: "E2E5EF", // границы
  done: "059669",
  doneBg: "E7F6EF",
  warn: "B45309",
  warnBg: "FCF3E6",
  danger: "DC2626",
  dangerBg: "FBE9E9",
  muted: "6B7280",
};

type Style = Record<string, unknown>;

const thin = (rgb: string) => ({ style: "thin", color: { rgb } });
const boxBorder = {
  top: thin(C.line),
  bottom: thin(C.line),
  left: thin(C.line),
  right: thin(C.line),
};

function deepMerge(a: Style = {}, b: Style = {}): Style {
  const out: Style = { ...a, ...b };
  for (const k of ["font", "fill", "alignment", "border"]) {
    if (a[k] || b[k]) out[k] = { ...(a[k] as object), ...(b[k] as object) };
  }
  return out;
}

function setStyle(ws: XLSX.WorkSheet, r: number, c: number, style: Style) {
  const addr = XLSX.utils.encode_cell({ r, c });
  let cell = ws[addr] as { s?: Style } | undefined;
  if (!cell) {
    cell = { t: "s", v: "" } as unknown as { s?: Style };
    (ws as Record<string, unknown>)[addr] = cell;
  }
  cell.s = deepMerge(cell.s, style);
}

function autoWidth(rows: (string | number)[][], max = 46): { wch: number }[] {
  const widths: number[] = [];
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      const len = String(cell ?? "").length;
      widths[i] = Math.max(widths[i] ?? 10, Math.min(len + 3, max));
    });
  });
  return widths.map((w) => ({ wch: w }));
}

interface SheetOpts {
  colWidths?: { wch: number }[];
  centerCols?: number[]; // индексы колонок с центрированием
  wrapCols?: number[]; // индексы колонок с переносом текста
  /** Условная окраска ячейки данных: возвращает стиль или null. */
  cellPaint?: (colIndex: number, value: string | number) => Style | null;
}

/**
 * Собирает лист с фирменным оформлением: баннер, шапка, «зебра»,
 * тонкие границы, автофильтр, заморозка шапки.
 */
function styledSheet(
  title: string,
  headers: string[],
  data: (string | number)[][],
  opts: SheetOpts = {}
): XLSX.WorkSheet {
  const n = headers.length;
  const aoa: (string | number)[][] = [
    [title, ...Array(Math.max(0, n - 1)).fill("")],
    headers,
    ...data,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!cols"] = opts.colWidths ?? autoWidth([headers, ...data]);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: n - 1 } }];
  ws["!rows"] = [{ hpt: 30 }, { hpt: 22 }];
  // автофильтр по строке-шапке (строка 1)
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: 1, c: n - 1 } }),
  };

  // баннер
  for (let c = 0; c < n; c++) {
    setStyle(ws, 0, c, {
      font: { bold: true, sz: 13, color: { rgb: C.white } },
      fill: { fgColor: { rgb: C.brandDark } },
      alignment: { vertical: "center", horizontal: "left", indent: 1 },
    });
  }
  // шапка
  for (let c = 0; c < n; c++) {
    setStyle(ws, 1, c, {
      font: { bold: true, sz: 11, color: { rgb: C.white } },
      fill: { fgColor: { rgb: C.brand } },
      alignment: { vertical: "center", horizontal: "center", wrapText: true },
      border: boxBorder,
    });
  }
  // данные
  data.forEach((row, i) => {
    const r = i + 2;
    const banded = i % 2 === 1;
    for (let c = 0; c < n; c++) {
      const center = opts.centerCols?.includes(c);
      const wrap = opts.wrapCols?.includes(c);
      let style: Style = {
        font: { sz: 10.5, color: { rgb: C.ink } },
        fill: { fgColor: { rgb: banded ? C.band : C.white } },
        alignment: {
          vertical: "center",
          horizontal: center ? "center" : "left",
          wrapText: !!wrap,
          indent: center ? 0 : 1,
        },
        border: boxBorder,
      };
      const paint = opts.cellPaint?.(c, row[c]);
      if (paint) style = deepMerge(style, paint);
      setStyle(ws, r, c, style);
    }
  });

  return ws;
}

function statusLabel(t: Task, board?: Board): string {
  if (t.status === "done") return "Готово";
  const col = board?.columns.find((c) => c.id === t.columnId);
  return col?.name ?? "В работе";
}

function inRange(dateIso: string | null, from?: string | null, to?: string | null): boolean {
  if (!from && !to) return true;
  if (!dateIso) return false;
  const d = parseISO(dateIso);
  if (!isValid(d)) return false;
  const key = format(d, "yyyy-MM-dd");
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function filterTasksForExport(data: ExportData, f: ExportFilter): Task[] {
  const q = f.query?.trim().toLowerCase();
  return data.tasks.filter((t) => {
    if (f.boardId && f.boardId !== "all" && t.boardId !== f.boardId) return false;
    if (f.onlyDone && t.status !== "done") return false;
    if (f.status && f.status !== "all" && t.status !== f.status) return false;
    if (f.assignee && f.assignee !== "all" && t.assignee !== f.assignee) return false;
    if (q) {
      const hay = `${t.title} ${t.assignee} ${t.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // дата: completedAt для готовых, иначе dueDate (fallback createdAt)
    const ref = t.status === "done" ? t.completedAt : t.dueDate ?? t.createdAt;
    if ((f.from || f.to) && !inRange(ref, f.from, f.to)) return false;
    return true;
  });
}

/* ---------------- Листы ---------------- */

const priorityPaint = (v: string | number): Style | null => {
  const s = String(v);
  if (s === PRIORITY_META.high.label)
    return { font: { color: { rgb: C.danger }, bold: true }, fill: { fgColor: { rgb: C.dangerBg } } };
  if (s === PRIORITY_META.medium.label)
    return { font: { color: { rgb: C.warn } }, fill: { fgColor: { rgb: C.warnBg } } };
  return null;
};

const statusPaint = (v: string | number): Style | null => {
  const s = String(v);
  if (s === "Готово")
    return { font: { color: { rgb: C.done }, bold: true }, fill: { fgColor: { rgb: C.doneBg } } };
  return null;
};

export function buildTasksSheet(data: ExportData, tasks: Task[]): XLSX.WorkSheet {
  const headers = [
    "№",
    "Задача",
    "Тип",
    "Доска",
    "Исполнитель",
    "Приоритет",
    "Дедлайн: тест",
    "Дедлайн: готово",
    "Статус",
    "Возвратов",
    "Возвраты (детально)",
    "Создано",
    "Сдано в тест",
    "Протестировано",
    "Выполнено",
    "Время по этапам",
    "Теги",
  ];
  const rows: (string | number)[][] = tasks.map((t, i) => {
    const board = data.boards.find((b) => b.id === t.boardId);
    const stageSummary = board
      ? stageTimeList(t, board)
          .map((s) => `${s.name}: ${formatDuration(s.seconds)}`)
          .join("; ")
      : "—";
    return [
      i + 1,
      t.title,
      (TASK_TYPES[t.type] ?? TASK_TYPES.task).label,
      board?.name ?? "—",
      t.assignee || "—",
      PRIORITY_META[t.priority].label,
      t.dueDate ? fmtDate(t.dueDate) : "—",
      t.doneDueDate ? fmtDate(t.doneDueDate) : "—",
      statusLabel(t, board),
      t.returnCount ?? 0,
      returnsSummary(t.returns) || "—",
      fmtDateTime(t.createdAt),
      t.readyAt ? fmtDateTime(t.readyAt) : "—",
      t.testedAt ? fmtDateTime(t.testedAt) : "—",
      t.completedAt ? fmtDateTime(t.completedAt) : "—",
      stageSummary,
      t.tags.join(", "),
    ];
  });

  return styledSheet("Bulut · Задачи", headers, rows, {
    colWidths: [
      { wch: 5 }, { wch: 40 }, { wch: 12 }, { wch: 18 }, { wch: 16 },
      { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 34 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 40 }, { wch: 20 },
    ],
    centerCols: [0, 5, 6, 7, 8, 9],
    wrapCols: [1, 10, 15],
    cellPaint: (c, v) => (c === 5 ? priorityPaint(v) : c === 8 ? statusPaint(v) : null),
  });
}

export function buildJournalSheet(entries: JournalEntry[], data: ExportData): XLSX.WorkSheet {
  const headers = [
    "Дата",
    "Доска",
    "Этап",
    "Готово",
    "Время: Готов к тесту",
    "Время: На проверке",
    "Возвраты",
    "Дедлайн: тест",
    "Дедлайн: готово",
    "Тип",
    "Задача",
    "Исполнитель",
    "Заметки",
  ];
  const taskById = new Map(data.tasks.map((t) => [t.id, t]));
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const rows: (string | number)[][] = sorted.map((e) => {
    const task = e.taskId ? taskById.get(e.taskId) : undefined;
    const done = task?.status === "done";
    const readySec = task?.stageTimes?.[READY_COLUMN_NAME] ?? 0;
    const reviewSec = task?.stageTimes?.[REVIEW_COLUMN_NAME] ?? 0;
    return [
      fmtDate(e.date),
      e.boardName,
      e.stage || "—",
      done ? "✓ Готово" : "—",
      done && readySec > 0 ? formatDuration(readySec) : "—",
      done && reviewSec > 0 ? formatDuration(reviewSec) : "—",
      returnsSummary(task?.returns) || "—",
      task?.dueDate ? fmtDate(task.dueDate) : "—",
      task?.doneDueDate ? fmtDate(task.doneDueDate) : "—",
      (TASK_TYPES[e.type] ?? TASK_TYPES.task).label,
      e.taskTitle,
      e.assignee || "—",
      e.notes || "",
    ];
  });

  return styledSheet("Bulut · Журнал", headers, rows, {
    colWidths: [
      { wch: 13 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 18 },
      { wch: 18 }, { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 40 }, { wch: 16 }, { wch: 46 },
    ],
    centerCols: [0, 3, 4, 5, 7, 8, 9],
    wrapCols: [6, 10, 12],
    cellPaint: (c, v) => (c === 3 ? statusPaint(String(v).includes("Готово") ? "Готово" : v) : null),
  });
}

export function buildSummarySheet(data: ExportData): XLSX.WorkSheet {
  const headers = ["Доска / Направление", "Всего", "Выполнено", "В процессе", "Просрочено"];
  const today = format(new Date(), "yyyy-MM-dd");
  const rows: (string | number)[][] = data.boards.map((b) => {
    const bt = data.tasks.filter((t) => t.boardId === b.id);
    const done = bt.filter((t) => t.status === "done").length;
    const active = bt.filter((t) => t.status !== "done").length;
    const overdue = bt.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length;
    return [b.name, bt.length, done, active, overdue];
  });

  return styledSheet("Bulut · Сводка по направлениям", headers, rows, {
    colWidths: [{ wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }],
    centerCols: [1, 2, 3, 4],
    cellPaint: (c, v) =>
      c === 2 && Number(v) > 0
        ? { font: { color: { rgb: C.done }, bold: true } }
        : c === 4 && Number(v) > 0
        ? { font: { color: { rgb: C.danger }, bold: true } }
        : null,
  });
}

export interface ExportOptions {
  filter: ExportFilter;
  includeTasks: boolean;
  includeJournal: boolean;
  includeSummary: boolean;
}

export function exportToExcel(data: ExportData, opts: ExportOptions): void {
  const wb = XLSX.utils.book_new();

  if (opts.includeTasks) {
    const tasks = filterTasksForExport(data, opts.filter);
    XLSX.utils.book_append_sheet(wb, buildTasksSheet(data, tasks), "Задачи");
  }

  if (opts.includeJournal) {
    const { from, to, boardId, onlyDone, query } = opts.filter;
    const q = query?.trim().toLowerCase();
    const taskById = new Map(data.tasks.map((t) => [t.id, t]));
    const entries = data.journal.filter((e) => {
      if (boardId && boardId !== "all") {
        const board = data.boards.find((b) => b.id === boardId);
        if (board && e.boardName !== board.name) return false;
      }
      if (onlyDone && !(e.taskId && taskById.get(e.taskId)?.status === "done")) return false;
      if ((from || to) && !inRange(e.date, from, to)) return false;
      if (q) {
        const hay = `${e.taskTitle} ${e.boardName} ${e.assignee} ${e.notes} ${e.stage}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    XLSX.utils.book_append_sheet(wb, buildJournalSheet(entries, data), "Журнал");
  }

  if (opts.includeSummary) {
    XLSX.utils.book_append_sheet(wb, buildSummarySheet(data), "Сводка");
  }

  const stamp = format(new Date(), "yyyy-MM-dd_HHmm");
  XLSX.writeFile(wb, `bulut_export_${stamp}.xlsx`);
}
