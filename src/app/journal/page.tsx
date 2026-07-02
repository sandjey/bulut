"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Trash2,
  Search,
  Plus,
  CornerDownLeft,
  Table2,
  ChevronDown,
  CheckCircle2,
  FlaskConical,
  ClipboardCheck,
  CornerUpLeft,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { ExportModal } from "@/components/ExportModal";
import { Avatar } from "@/components/Avatar";
import { AssigneePicker } from "@/components/AssigneePicker";
import { TypeBadge } from "@/components/TypeBadge";
import { GroupBy, fmtDate, groupKey, groupLabel, todayISO, formatDuration } from "@/lib/date";
import {
  JournalEntry,
  Task,
  TaskType,
  TASK_TYPES,
  TASK_TYPE_KEYS,
  READY_COLUMN_NAME,
  REVIEW_COLUMN_NAME,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { returnsSummary } from "@/lib/returns";

type GroupMode = GroupBy | "direction";

const STAGE_STYLE: Record<string, string> = {
  Готово: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "Готов к тестированию": "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "На проверке": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  Возврат: "bg-red-500/10 text-red-600 dark:text-red-400",
  Вручную: "bg-surface-2 text-muted",
};

export default function JournalPage() {
  const { journal, boards, tasks, addJournalEntry, updateJournalEntry, deleteJournalEntry } = useStore();
  const [groupBy, setGroupBy] = useState<GroupMode>("day");
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [boardFilter, setBoardFilter] = useState<string>("all");
  const [onlyDone, setOnlyDone] = useState(false);

  const activeBoard = boards.find((b) => b.id === boardFilter) ?? null;

  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    tasks.forEach((t) => m.set(t.id, t));
    return m;
  }, [tasks]);

  const isEntryDone = (e: JournalEntry) =>
    !!e.taskId && taskById.get(e.taskId)?.status === "done";

  const doneCount = useMemo(() => journal.filter(isEntryDone).length, [journal, taskById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return journal
      .filter((e) => (activeBoard ? e.boardName === activeBoard.name : true))
      .filter((e) => (onlyDone ? isEntryDone(e) : true))
      .filter((e) =>
        !q ? true : `${e.taskTitle} ${e.boardName} ${e.assignee} ${e.notes} ${e.stage}`.toLowerCase().includes(q)
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [journal, query, activeBoard, onlyDone, taskById]);

  const groups = useMemo(() => {
    const map = new Map<string, { sort: string; label: string; color?: string; entries: JournalEntry[] }>();
    filtered.forEach((e) => {
      if (groupBy === "direction") {
        const key = e.boardName || "—";
        if (!map.has(key)) {
          const board = boards.find((b) => b.name === e.boardName);
          map.set(key, { sort: key.toLowerCase(), label: key, color: board?.color, entries: [] });
        }
        map.get(key)!.entries.push(e);
      } else {
        const key = groupKey(e.date, groupBy);
        if (!map.has(key)) map.set(key, { sort: key, label: groupLabel(e.date, groupBy), entries: [] });
        map.get(key)!.entries.push(e);
      }
    });
    const arr = Array.from(map.values());
    return groupBy === "direction"
      ? arr.sort((a, b) => a.sort.localeCompare(b.sort))
      : arr.sort((a, b) => b.sort.localeCompare(a.sort));
  }, [filtered, groupBy, boards]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader
          title="Журнал"
          subtitle="Разработчик сдаёт задачу — она попадает в журнал. Когда задача готова, на записи появляется метка «Готово» и время по этапам."
        >
          <button
            onClick={() => setOnlyDone((v) => !v)}
            className={cn(
              "btn",
              onlyDone
                ? "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400"
                : "btn-outline"
            )}
            title="Показать только выполненные — отчёт для тестировщика"
          >
            <ClipboardCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Отчёт QA</span>
            {doneCount > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {doneCount}
              </span>
            )}
          </button>
          <button className="btn-primary" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Скачать Excel</span>
          </button>
        </PageHeader>

        {/* Быстрое добавление */}
        <QuickAdd boards={boards} lockedBoard={activeBoard?.name} onAdd={addJournalEntry} />

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-9"
              placeholder="Поиск по журналу…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="input w-auto"
            value={boardFilter}
            onChange={(e) => setBoardFilter(e.target.value)}
            title="Журнал по доске"
          >
            <option value="all">Все доски</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap rounded-lg border border-border bg-surface p-0.5">
            {(["day", "week", "month", "direction"] as GroupMode[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  groupBy === g ? "btn-primary !px-3 !py-1.5" : "text-muted hover:text-fg"
                )}
              >
                {g === "day" ? "День" : g === "week" ? "Неделя" : g === "month" ? "Месяц" : "Направления"}
              </button>
            ))}
          </div>
        </div>

        {/* tables */}
        {groups.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-border py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">
              <Table2 className="h-6 w-6" />
            </div>
            <p className="mt-3 font-medium">Журнал пуст</p>
            <p className="mt-1 text-sm text-muted">
              Добавьте запись сверху или отметьте задачу выполненной.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {groups.map((group) => (
              <div
                key={group.label}
                className="overflow-hidden rounded-xl border border-border shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold capitalize">
                    {group.color && (
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                    )}
                    {group.label}
                  </h3>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
                    {group.entries.length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <colgroup>
                      <col className="w-[100px]" />
                      <col className="w-[120px]" />
                      <col className="w-[168px]" />
                      <col className="w-[110px]" />
                      <col className="w-[22%]" />
                      <col className="w-[150px]" />
                      <col />
                      <col className="w-[44px]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-surface text-left text-[11px] uppercase tracking-wide text-muted">
                        <Th>Дата</Th>
                        <Th>Доска</Th>
                        <Th>Этап</Th>
                        <Th>Источник</Th>
                        <Th>Задача</Th>
                        <Th>Исполнитель</Th>
                        <Th>Заметки</Th>
                        <th className="border-b border-border px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((e, i) => {
                        const board = boards.find((b) => b.name === e.boardName);
                        const task = e.taskId ? taskById.get(e.taskId) : undefined;
                        const done = task?.status === "done";
                        const readySec = task?.stageTimes?.[READY_COLUMN_NAME] ?? 0;
                        const reviewSec = task?.stageTimes?.[REVIEW_COLUMN_NAME] ?? 0;
                        return (
                          <tr
                            key={e.id}
                            className={cn(
                              "group transition hover:bg-brand/[0.04]",
                              i % 2 === 1 && "bg-surface-2/40"
                            )}
                          >
                            <Td className="whitespace-nowrap text-muted">{fmtDate(e.date)}</Td>
                            <Td>
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: board?.color ?? "#94a3b8" }}
                                />
                                <span className="truncate">{e.boardName || "—"}</span>
                              </span>
                            </Td>
                            <Td>
                              <div className="space-y-1.5">
                                {e.stage ? (
                                  <span className={cn("chip", STAGE_STYLE[e.stage] ?? "bg-surface-2 text-muted")}>
                                    {e.stage}
                                  </span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                                {done && (
                                  <div className="space-y-1">
                                    <span className="chip bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                      <CheckCircle2 className="h-3 w-3" /> Готово
                                    </span>
                                    {(readySec > 0 || reviewSec > 0) && (
                                      <div className="flex flex-col gap-0.5 text-[10px] text-muted">
                                        {readySec > 0 && (
                                          <span
                                            className="inline-flex items-center gap-1"
                                            title="Время в «Готов к тестированию»"
                                          >
                                            <FlaskConical className="h-3 w-3 text-sky-500" />
                                            Готов: {formatDuration(readySec)}
                                          </span>
                                        )}
                                        {reviewSec > 0 && (
                                          <span
                                            className="inline-flex items-center gap-1"
                                            title="Время в «На проверке» (работа QA)"
                                          >
                                            <Search className="h-3 w-3 text-violet-500" />
                                            Проверка: {formatDuration(reviewSec)}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </Td>
                            <Td>
                              {e.taskId ? (
                                <span className="chip bg-brand/10 text-brand">📋 Из доски</span>
                              ) : (
                                <span className="chip bg-surface-2 text-muted">✍️ Вручную</span>
                              )}
                            </Td>
                            <Td className="font-medium">
                              <span className="flex items-center gap-2">
                                <TypeBadge type={e.type} size="xs" />
                                <span>{e.taskTitle}</span>
                              </span>
                              {task && (task.returnCount ?? 0) > 0 && (
                                <div className="mt-1 flex items-start gap-1 text-[11px] font-normal text-red-600 dark:text-red-400">
                                  <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span>Возвраты: {returnsSummary(task.returns) || `×${task.returnCount}`}</span>
                                </div>
                              )}
                            </Td>
                            <Td>
                              <span className="inline-flex items-center gap-2">
                                {e.assignee && <Avatar name={e.assignee} size={22} />}
                                <span className="truncate">{e.assignee || "—"}</span>
                              </span>
                            </Td>
                            <Td className="p-0">
                              <NotesCell
                                value={e.notes}
                                onCommit={(v) => {
                                  if (v !== e.notes) updateJournalEntry(e.id, { notes: v });
                                }}
                              />
                            </Td>
                            <td className="border-b border-border px-1 text-center align-top">
                              <button
                                onClick={() => deleteJournalEntry(e.id)}
                                className="mt-1.5 rounded p-1 text-muted opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                                title="Удалить"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaultBoardId={boardFilter}
        defaultOnlyDone={onlyDone}
        defaultQuery={query}
      />
    </div>
  );
}

/* ---------------- Quick add row ---------------- */

function QuickAdd({
  boards,
  lockedBoard,
  onAdd,
}: {
  boards: { id: string; name: string; color: string }[];
  lockedBoard?: string;
  onAdd: (entry: Omit<JournalEntry, "id" | "createdAt">) => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [boardName, setBoardName] = useState(lockedBoard ?? boards[0]?.name ?? "");
  const [taskTitle, setTaskTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [type, setType] = useState<TaskType>("task");
  const [notes, setNotes] = useState("");
  const taskRef = useRef<HTMLInputElement>(null);

  // when a board filter is active, lock the quick-add to that board
  useEffect(() => {
    if (lockedBoard) setBoardName(lockedBoard);
    else if (!boardName && boards[0]) setBoardName(boards[0].name);
  }, [lockedBoard, boards, boardName]);

  const submit = (keepFocus = true) => {
    if (!taskTitle.trim()) {
      taskRef.current?.focus();
      return;
    }
    onAdd({
      taskId: null,
      date,
      boardName: boardName || "—",
      taskTitle: taskTitle.trim(),
      assignee: assignee.trim(),
      notes: notes.trim(),
      stage: "Вручную",
      type,
    });
    // keep date / board / assignee for fast sequential entry
    setTaskTitle("");
    setNotes("");
    if (keepFocus) setTimeout(() => taskRef.current?.focus(), 0);
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <Plus className="h-3.5 w-3.5" /> Быстрое добавление
        <span className="ml-auto hidden items-center gap-1 normal-case text-muted/80 sm:flex">
          <CornerDownLeft className="h-3 w-3" /> Enter — добавить и продолжить
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[110px_150px_150px_1fr_170px_1fr_auto]">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input py-2"
        />
        <select
          value={boardName}
          onChange={(e) => setBoardName(e.target.value)}
          className="input py-2"
          disabled={!!lockedBoard}
          title={lockedBoard ? "Доска зафиксирована фильтром" : undefined}
        >
          {boards.length === 0 && <option value="">— нет досок —</option>}
          {boards.map((b) => (
            <option key={b.id} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TaskType)}
          className="input py-2"
          title="Тип"
        >
          {TASK_TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {TASK_TYPES[k].icon} {TASK_TYPES[k].label}
            </option>
          ))}
        </select>
        <input
          ref={taskRef}
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Что сделано…"
          className="input py-2"
        />
        <AssigneePicker value={assignee} onChange={setAssignee} placeholder="Исполнитель" />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Заметки…"
          className="input py-2"
        />
        <button onClick={() => submit()} className="btn-primary px-4" disabled={!taskTitle.trim()}>
          <Plus className="h-4 w-4" />
          <span className="lg:hidden">Добавить</span>
        </button>
      </div>
    </div>
  );
}

/* ---------------- Cells ---------------- */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-r border-border px-3 py-2 font-semibold last:border-r-0">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("border-b border-r border-border px-3 py-2.5 align-top last:border-r-0", className)}>
      {children}
    </td>
  );
}

function NotesCell({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // measure whether the collapsed text is clipped (needs a toggle)
  useEffect(() => {
    if (editing) return;
    const el = textRef.current;
    if (el) setOverflows(el.scrollHeight - el.clientHeight > 1);
  }, [value, editing, expanded]);

  const resize = () => {
    const el = areaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  const startEditing = () => {
    setEditing(true);
    setExpanded(true);
    setTimeout(() => {
      resize();
      areaRef.current?.focus();
    }, 0);
  };

  if (editing) {
    return (
      <textarea
        ref={areaRef}
        defaultValue={value}
        rows={1}
        onInput={resize}
        onBlur={(e) => {
          onCommit(e.target.value);
          setEditing(false);
          setExpanded(false);
        }}
        placeholder="Добавить заметку…"
        className="block w-full resize-none border-0 bg-brand/[0.04] px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted/60"
      />
    );
  }

  if (!value) {
    return (
      <button
        onClick={startEditing}
        className="block w-full px-3 py-2.5 text-left text-sm text-muted/60 transition hover:bg-brand/[0.04]"
      >
        Добавить заметку…
      </button>
    );
  }

  return (
    <div className="px-3 py-2.5">
      <p
        ref={textRef}
        onClick={startEditing}
        className={cn(
          "cursor-text whitespace-pre-wrap text-sm leading-relaxed",
          !expanded && "line-clamp-2"
        )}
      >
        {value}
      </p>
      {(overflows || expanded) && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-brand transition hover:opacity-80"
        >
          {expanded ? "Свернуть" : "Показать полностью"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}
