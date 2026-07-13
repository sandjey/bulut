"use client";

import { useMemo } from "react";
import { differenceInCalendarDays, parseISO, isValid, format, min as dmin, max as dmax } from "date-fns";
import { PriorityDot } from "@/components/PriorityDot";
import { Avatar } from "@/components/Avatar";
import type { Task } from "@/lib/types";
import { PRIORITY_META } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Простой таймлайн (Гант-lite): задачи полосами по датам, связи «блокируется» — красной точкой. */
export function BoardTimelineView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const rows = useMemo(() => {
    return tasks
      .map((t) => {
        const start = t.createdAt ? parseISO(t.createdAt) : null;
        const endStr = t.doneDueDate || t.dueDate || t.completedAt || t.createdAt;
        const end = endStr ? parseISO(endStr) : null;
        return { t, start, end };
      })
      .filter((r) => r.start && isValid(r.start) && r.end && isValid(r.end)) as {
      t: Task;
      start: Date;
      end: Date;
    }[];
  }, [tasks]);

  if (rows.length === 0) {
    return <div className="board-scroll flex-1 overflow-auto p-6 text-center text-sm text-faint">Нет задач с датами</div>;
  }

  const rangeStart = dmin(rows.map((r) => r.start));
  const rangeEnd = dmax(rows.map((r) => r.end));
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart)) + 1;
  const dayW = Math.max(6, Math.min(28, Math.floor(900 / totalDays))); // px на день
  const width = totalDays * dayW;

  // месячные метки
  const marks: { x: number; label: string }[] = [];
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    if (d.getDate() === 1 || i === 0) marks.push({ x: i * dayW, label: `${MONTHS[d.getMonth()]} ${d.getFullYear() % 100}` });
  }

  return (
    <div className="board-scroll flex-1 overflow-auto p-4 sm:p-6">
      <div className="min-w-fit">
        {/* шкала месяцев */}
        <div className="relative mb-2 ml-[220px] h-5 border-b border-border" style={{ width }}>
          {marks.map((m, i) => (
            <span key={i} className="absolute top-0 text-[11px] font-medium text-muted" style={{ left: m.x }}>
              {m.label}
            </span>
          ))}
        </div>

        <div className="space-y-1.5">
          {rows.map(({ t, start, end }) => {
            const offset = differenceInCalendarDays(start, rangeStart) * dayW;
            const len = Math.max(dayW, (differenceInCalendarDays(end, start) + 1) * dayW);
            const done = t.status === "done";
            const blocked = (t.blockedBy?.length ?? 0) > 0;
            return (
              <div key={t.id} className="flex items-center gap-2">
                <button
                  onClick={() => onOpen(t)}
                  className="flex w-[212px] shrink-0 items-center gap-2 truncate rounded px-1 py-0.5 text-left text-sm transition hover:bg-surface-2/50"
                >
                  <PriorityDot priority={t.priority} />
                  <span className={cn("truncate", done && "text-muted line-through")}>{t.title}</span>
                </button>
                <div className="relative h-7" style={{ width }}>
                  <button
                    onClick={() => onOpen(t)}
                    title={`${format(start, "d.MM")} — ${format(end, "d.MM")}`}
                    className={cn(
                      "absolute top-1 flex h-5 items-center gap-1 overflow-hidden rounded-md px-1.5 text-[11px] font-medium text-white transition hover:brightness-110",
                      done && "opacity-60",
                    )}
                    style={{ left: offset, width: len, backgroundColor: PRIORITY_META[t.priority].dot }}
                  >
                    {blocked && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" title="Заблокирована" />}
                    {t.assignee && <Avatar name={t.assignee} size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
