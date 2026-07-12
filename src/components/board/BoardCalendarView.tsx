"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { effectiveDueDate } from "@/lib/deadlines";
import { TASK_TYPES, type Task } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Простой месячный календарь: задачи по дедлайну. Клик по задаче — открыть. */
export function BoardCalendarView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const [cursor, setCursor] = useState(() => new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const d = effectiveDueDate(t);
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(t);
    }
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const today = new Date();
  const noDate = useMemo(() => tasks.filter((t) => !effectiveDueDate(t) && t.status !== "done"), [tasks]);

  return (
    <div className="board-scroll flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        {/* Навигация */}
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-bold">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setCursor((c) => addMonths(c, -1))} className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setCursor(new Date())} className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-fg">
              Сегодня
            </button>
            <button onClick={() => setCursor((c) => addMonths(c, 1))} className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Сетка */}
        <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border bg-surface text-center">
          {WD.map((d) => (
            <div key={d} className="border-b border-border py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const items = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, today);
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[92px] border-b border-r border-border p-1 text-left [&:nth-child(7n+7)]:border-r-0",
                  !inMonth && "bg-surface-2/30",
                )}
              >
                <div className={cn("mb-1 px-1 text-[11px] font-semibold", inMonth ? "text-muted" : "text-faint")}>
                  <span className={cn(isToday && "inline-grid h-5 w-5 place-items-center rounded-full bg-brand text-white")}>
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {items.slice(0, 3).map((t) => {
                    const meta = TASK_TYPES[t.type] ?? TASK_TYPES.task;
                    return (
                      <button
                        key={t.id}
                        onClick={() => onOpen(t)}
                        title={t.title}
                        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] transition hover:opacity-80"
                        style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                        <span className={cn("truncate", t.status === "done" && "line-through opacity-60")}>{t.title}</span>
                      </button>
                    );
                  })}
                  {items.length > 3 && (
                    <div className="px-1 text-[10px] text-faint">+{items.length - 3} ещё</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Без срока — чтобы не терялись */}
        {noDate.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Без срока · {noDate.length}</div>
            <div className="flex flex-wrap gap-1.5">
              {noDate.map((t) => {
                const meta = TASK_TYPES[t.type] ?? TASK_TYPES.task;
                return (
                  <button
                    key={t.id}
                    onClick={() => onOpen(t)}
                    className="max-w-[220px] truncate rounded-lg border border-border px-2 py-1 text-xs transition hover:bg-surface-2"
                    style={{ color: meta.color }}
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
