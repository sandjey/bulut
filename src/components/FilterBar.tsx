"use client";

import { Search, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { FilterState, SortKey, uniqueAssignees, uniqueTags } from "@/lib/filters";
import { Task, PRIORITY_META, Priority, TASK_TYPES, TASK_TYPE_KEYS } from "@/lib/types";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  tasks: Task[]; // pool to derive assignees/tags
}

const SORT_LABELS: Record<SortKey, string> = {
  created: "По порядку",
  due: "По дедлайну",
  priority: "По приоритету",
  title: "По названию",
};

export function FilterBar({ filters, onChange, tasks }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const assignees = useMemo(() => uniqueAssignees(tasks), [tasks]);
  const tags = useMemo(() => uniqueTags(tasks), [tasks]);

  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  const activeCount =
    (filters.assignee ? 1 : 0) +
    (filters.priority ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.tag ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.due !== "all" ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Поиск задач..."
            className="input pl-9"
          />
          {filters.query && (
            <button
              onClick={() => set({ query: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={filters.sort}
            onChange={(e) => set({ sort: e.target.value as SortKey })}
            className="input appearance-none pl-9 pr-8"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </div>

        <button
          onClick={() => setExpanded((e) => !e)}
          className={cn("btn-outline relative", expanded && "border-brand text-brand")}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Фильтры
          {activeCount > 0 && (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-brand-fg">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-3 animate-slide-up sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className="label">Исполнитель</label>
            <select
              className="input"
              value={filters.assignee}
              onChange={(e) => set({ assignee: e.target.value })}
            >
              <option value="">Все</option>
              {assignees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Приоритет</label>
            <select
              className="input"
              value={filters.priority}
              onChange={(e) => set({ priority: e.target.value })}
            >
              <option value="">Все</option>
              {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Тип</label>
            <select
              className="input"
              value={filters.type}
              onChange={(e) => set({ type: e.target.value })}
            >
              <option value="">Все</option>
              {TASK_TYPE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {TASK_TYPES[k].icon} {TASK_TYPES[k].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Тег</label>
            <select
              className="input"
              value={filters.tag}
              onChange={(e) => set({ tag: e.target.value })}
            >
              <option value="">Все</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Статус</label>
            <select
              className="input"
              value={filters.status}
              onChange={(e) => set({ status: e.target.value as FilterState["status"] })}
            >
              <option value="all">Все</option>
              <option value="active">Активные</option>
              <option value="done">Выполненные</option>
              <option value="overdue">Просроченные</option>
            </select>
          </div>

          <div>
            <label className="label">Дедлайн</label>
            <select
              className="input"
              value={filters.due}
              onChange={(e) => set({ due: e.target.value as FilterState["due"] })}
            >
              <option value="all">Любой</option>
              <option value="today">Сегодня</option>
              <option value="week">Эта неделя</option>
              <option value="overdue">Просрочен</option>
              <option value="none">Без срока</option>
            </select>
          </div>

          {activeCount > 0 && (
            <div className="col-span-full">
              <button
                onClick={() =>
                  set({ assignee: "", priority: "", type: "", tag: "", status: "all", due: "all" })
                }
                className="btn-ghost text-sm text-muted"
              >
                <X className="h-4 w-4" /> Сбросить фильтры
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
