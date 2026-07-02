"use client";

import { useMemo, useState, useEffect } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Modal } from "./Modal";
import { useStore } from "@/lib/store";
import { exportToExcel, ExportFilter, filterTasksForExport } from "@/lib/export";
import { uniqueAssignees } from "@/lib/filters";

export function ExportModal({
  open,
  onClose,
  defaultBoardId = "all",
  defaultOnlyDone = false,
  defaultQuery = "",
}: {
  open: boolean;
  onClose: () => void;
  defaultBoardId?: string;
  /** «Отчёт QA» — предвыбрать только выполненные (из журнала). */
  defaultOnlyDone?: boolean;
  /** Текст активного поиска из журнала. */
  defaultQuery?: string;
}) {
  const store = useStore();
  const { boards, tasks, journal } = store;

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [boardId, setBoardId] = useState<string>(defaultBoardId);
  const [status, setStatus] = useState<"all" | "active" | "done">("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeJournal, setIncludeJournal] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);

  useEffect(() => {
    if (open) {
      setBoardId(defaultBoardId);
      setStatus(defaultOnlyDone ? "done" : "all");
      setQuery(defaultQuery);
    }
  }, [open, defaultBoardId, defaultOnlyDone, defaultQuery]);

  const assignees = useMemo(() => uniqueAssignees(tasks), [tasks]);

  const filter: ExportFilter = {
    from: from || null,
    to: to || null,
    boardId,
    status,
    assignee,
    onlyDone: status === "done",
    query: query || undefined,
  };

  const previewCount = useMemo(
    () => filterTasksForExport({ boards, tasks, journal }, filter),
    // filter is derived from the primitive deps below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boards, tasks, journal, from, to, boardId, status, assignee, query]
  ).length;

  const activeBoardName = boards.find((b) => b.id === boardId)?.name;
  const filterHints = [
    activeBoardName && `доска «${activeBoardName}»`,
    status === "done" && "только выполненные (QA)",
    status === "active" && "только активные",
    query && `поиск «${query}»`,
    (from || to) && `${from || "…"} — ${to || "…"}`,
  ].filter(Boolean) as string[];

  const doExport = () => {
    exportToExcel(
      { boards, tasks, journal },
      { filter, includeTasks, includeJournal, includeSummary }
    );
    onClose();
  };

  const canExport = includeTasks || includeJournal || includeSummary;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Экспорт в Excel"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary" onClick={doExport} disabled={!canExport}>
            <Download className="h-4 w-4" /> Скачать .xlsx
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-400">
          <FileSpreadsheet className="h-8 w-8 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Оформленный файл .xlsx</p>
            <p className="text-emerald-700/70 dark:text-emerald-400/70">
              Фирменные заголовки, «зебра», цветные статусы и автофильтр.
            </p>
          </div>
        </div>

        {filterHints.length > 0 && (
          <div className="rounded-xl border border-brand/30 bg-brand/[0.06] p-3 text-sm">
            <span className="font-medium text-brand">Учитываются фильтры:</span>{" "}
            <span className="text-fg">{filterHints.join(" · ")}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Дата от</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Дата до</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Доска</label>
            <select className="input" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              <option value="all">Все доски</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Статус</label>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="all">Все</option>
              <option value="active">Активные</option>
              <option value="done">Выполненные</option>
            </select>
          </div>
          <div>
            <label className="label">Исполнитель</label>
            <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="all">Все</option>
              {assignees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Листы в файле</label>
          <div className="space-y-2">
            <Check label="Задачи (№, Задача, Тип, Доска, Исполнитель, Приоритет, Дедлайн, Статус, время по этапам)" checked={includeTasks} onChange={setIncludeTasks} />
            <Check label="Журнал (Дата, Этап, Готово, время «Готов к тесту» и «На проверке», Задача, Заметки)" checked={includeJournal} onChange={setIncludeJournal} />
            <Check label="Сводка по направлениям" checked={includeSummary} onChange={setIncludeSummary} />
          </div>
        </div>

        <p className="text-sm text-muted">
          Под текущий фильтр попадает <span className="font-semibold text-fg">{previewCount}</span> задач.
        </p>
      </div>
    </Modal>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 transition hover:bg-surface-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
