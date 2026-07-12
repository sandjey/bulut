"use client";

import { TypeBadge } from "@/components/TypeBadge";
import { PriorityDot } from "@/components/PriorityDot";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { Avatar } from "@/components/Avatar";
import { effectiveDueDate } from "@/lib/deadlines";
import type { Board, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Простой список: задачи по этапам, строками. Клик — открыть. Ничего лишнего. */
export function BoardListView({
  board,
  tasks,
  onOpen,
}: {
  board: Board;
  tasks: Task[];
  onOpen: (t: Task) => void;
}) {
  const groups = board.columns
    .map((c) => ({ col: c, items: tasks.filter((t) => t.columnId === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="board-scroll flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {groups.length === 0 && (
          <p className="py-16 text-center text-sm text-faint">Задач нет</p>
        )}
        {groups.map(({ col, items }) => (
          <div key={col.id}>
            <div className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              {col.name} <span className="opacity-60">{items.length}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpen(t)}
                  className="flex w-full items-center gap-3 border-t border-border px-3 py-2.5 text-left transition first:border-t-0 hover:bg-surface-2/50"
                >
                  <PriorityDot priority={t.priority} />
                  <span className={cn("min-w-0 flex-1 truncate text-sm", t.status === "done" && "text-muted line-through")}>
                    {t.title}
                  </span>
                  <span className="hidden sm:block">
                    <TypeBadge type={t.type} size="xs" />
                  </span>
                  {effectiveDueDate(t) && (
                    <DeadlineBadge dueDate={effectiveDueDate(t)} done={t.status === "done"} />
                  )}
                  {t.assignee && <Avatar name={t.assignee} size={22} />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
