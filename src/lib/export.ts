import * as XLSX from "xlsx";
import { AppData, Board, JournalEntry, Task, PRIORITY_META, TASK_TYPES } from "./types";

/** Export only needs these slices of the app data. */
type ExportData = Pick<AppData, "boards" | "tasks" | "journal">;
import { fmtDate, fmtDateTime, formatDuration } from "./date";
import { stageTimeList } from "./stages";
import { format, parseISO, isValid } from "date-fns";

export interface ExportFilter {
  from?: string | null; // yyyy-MM-dd
  to?: string | null;
  boardId?: string | "all";
  status?: "all" | "active" | "done";
  assignee?: string | "all";
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
  return data.tasks.filter((t) => {
    if (f.boardId && f.boardId !== "all" && t.boardId !== f.boardId) return false;
    if (f.status && f.status !== "all" && t.status !== f.status) return false;
    if (f.assignee && f.assignee !== "all" && t.assignee !== f.assignee) return false;
    // date filter: use completedAt for done, dueDate otherwise (fallback createdAt)
    const ref = t.status === "done" ? t.completedAt : t.dueDate ?? t.createdAt;
    if ((f.from || f.to) && !inRange(ref, f.from, f.to)) return false;
    return true;
  });
}

function autoWidth(rows: (string | number)[][]): { wch: number }[] {
  const widths: number[] = [];
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      const len = String(cell ?? "").length;
      widths[i] = Math.max(widths[i] ?? 10, Math.min(len + 2, 50));
    });
  });
  return widths.map((w) => ({ wch: w }));
}

function styleHeader(ws: XLSX.WorkSheet, cols: number) {
  for (let c = 0; c < cols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = ws[addr] as Record<string, unknown> | undefined;
    if (!cell) continue;
    cell.s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { fgColor: { rgb: "4F46E5" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }
}

export function buildTasksSheet(data: ExportData, tasks: Task[]): XLSX.WorkSheet {
  const header = [
    "№",
    "Задача",
    "Тип",
    "Доска",
    "Исполнитель",
    "Приоритет",
    "Дедлайн",
    "Статус",
    "Возвратов",
    "Создано",
    "Отправлено на проверку",
    "Протестировано",
    "Дата выполнения",
    "Время по этапам",
    "Теги",
  ];
  const rows: (string | number)[][] = [header];

  tasks.forEach((t, i) => {
    const board = data.boards.find((b) => b.id === t.boardId);
    const stageSummary = board
      ? stageTimeList(t, board)
          .map((s) => `${s.name}: ${formatDuration(s.seconds)}`)
          .join("; ")
      : "—";
    rows.push([
      i + 1,
      t.title,
      (TASK_TYPES[t.type] ?? TASK_TYPES.task).label,
      board?.name ?? "—",
      t.assignee || "—",
      PRIORITY_META[t.priority].label,
      t.dueDate ? fmtDate(t.dueDate) : "—",
      statusLabel(t, board),
      t.returnCount ?? 0,
      fmtDateTime(t.createdAt),
      t.readyAt ? fmtDateTime(t.readyAt) : "—",
      t.testedAt ? fmtDateTime(t.testedAt) : "—",
      t.completedAt ? fmtDateTime(t.completedAt) : "—",
      stageSummary,
      t.tags.join(", "),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = autoWidth(rows);
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }) };
  styleHeader(ws, header.length);
  return ws;
}

export function buildJournalSheet(entries: JournalEntry[]): XLSX.WorkSheet {
  const header = [
    "Дата",
    "Создано",
    "Доска",
    "Этап",
    "Источник",
    "Тип",
    "Задача",
    "Исполнитель",
    "Заметки",
  ];
  const rows: (string | number)[][] = [header];
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  sorted.forEach((e) => {
    rows.push([
      fmtDate(e.date),
      fmtDateTime(e.createdAt),
      e.boardName,
      e.stage || "—",
      e.taskId ? "Из доски" : "Вручную",
      (TASK_TYPES[e.type] ?? TASK_TYPES.task).label,
      e.taskTitle,
      e.assignee || "—",
      e.notes || "",
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = autoWidth(rows);
  styleHeader(ws, header.length);
  return ws;
}

export function buildSummarySheet(data: ExportData): XLSX.WorkSheet {
  const header = ["Доска / Направление", "Всего", "Выполнено", "В процессе", "Просрочено"];
  const rows: (string | number)[][] = [header];
  const today = format(new Date(), "yyyy-MM-dd");

  data.boards.forEach((b) => {
    const bt = data.tasks.filter((t) => t.boardId === b.id);
    const done = bt.filter((t) => t.status === "done").length;
    const active = bt.filter((t) => t.status !== "done").length;
    const overdue = bt.filter(
      (t) => t.status !== "done" && t.dueDate && t.dueDate < today
    ).length;
    rows.push([b.name, bt.length, done, active, overdue]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = autoWidth(rows);
  styleHeader(ws, header.length);
  return ws;
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
    let entries = data.journal;
    const { from, to, boardId } = opts.filter;
    entries = entries.filter((e) => {
      if (boardId && boardId !== "all") {
        const board = data.boards.find((b) => b.id === boardId);
        if (board && e.boardName !== board.name) return false;
      }
      if ((from || to) && !inRange(e.date, from, to)) return false;
      return true;
    });
    XLSX.utils.book_append_sheet(wb, buildJournalSheet(entries), "Журнал");
  }

  if (opts.includeSummary) {
    XLSX.utils.book_append_sheet(wb, buildSummarySheet(data), "Сводка");
  }

  const stamp = format(new Date(), "yyyy-MM-dd_HHmm");
  XLSX.writeFile(wb, `bulut_export_${stamp}.xlsx`);
}
