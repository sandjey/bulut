"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Clock, AlertTriangle, MoreVertical, Trash2, Pencil } from "lucide-react";
import { Board, Task } from "@/lib/types";
import { useStore } from "@/lib/store";
import { withAlpha } from "@/lib/utils";
import { todayISO } from "@/lib/date";

export function BoardCard({ board, tasks }: { board: Board; tasks: Task[] }) {
  const { deleteBoard, updateBoard } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);

  const bt = tasks.filter((t) => t.boardId === board.id);
  const done = bt.filter((t) => t.status === "done").length;
  const total = bt.length;
  const today = todayISO();
  const overdue = bt.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length;
  const active = total - done;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const commitName = () => {
    if (name.trim()) updateBoard(board.id, { name: name.trim() });
    else setName(board.name);
    setEditing(false);
  };

  return (
    <div
      className="hover-lift card group relative overflow-hidden rounded-2xl p-0"
    >
      {/* top color rail */}
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${board.color}, ${withAlpha(board.color, 0.35)})` }}
      />
      <Link href={`/board/${board.id}`} className="block p-5 pt-6">
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full opacity-[0.12] blur-xl"
          style={{ background: board.color }}
        />
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-bold"
            style={{
              backgroundColor: withAlpha(board.color, 0.14),
              color: board.color,
              boxShadow: `inset 0 0 0 1px ${withAlpha(board.color, 0.22)}`,
            }}
          >
            {board.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                autoFocus
                value={name}
                onClick={(e) => e.preventDefault()}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") {
                    setName(board.name);
                    setEditing(false);
                  }
                }}
                className="input py-1"
              />
            ) : (
              <h3 className="truncate text-lg font-semibold">{board.name}</h3>
            )}
            <p className="text-sm text-muted">{total} задач</p>
          </div>
        </div>

        {/* progress */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>Прогресс</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: `linear-gradient(90deg, ${withAlpha(board.color, 0.7)}, ${board.color})`,
              }}
            />
          </div>
        </div>

        {/* stats */}
        <div className="mt-4 flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> {done}
          </span>
          <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
            <Clock className="h-3.5 w-3.5" /> {active}
          </span>
          {overdue > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {overdue}
            </span>
          )}
        </div>
      </Link>

      {/* menu */}
      <div className="absolute right-3 top-3">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-surface-2 hover:text-fg group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg animate-scale-in">
              <button
                onClick={() => {
                  setEditing(true);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                <Pencil className="h-3.5 w-3.5" /> Переименовать
              </button>
              <button
                onClick={() => {
                  if (confirm(`Удалить доску «${board.name}» со всеми задачами?`))
                    deleteBoard(board.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Удалить
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
