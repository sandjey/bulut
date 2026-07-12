"use client";

import { useMemo, useState } from "react";
import { Plus, Check, Trash2, Link2Off, Lock } from "lucide-react";
import { useStore } from "@/lib/store";
import { AssigneePicker } from "./AssigneePicker";
import type { Board, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Подзадачи и связь «блокируется». Просто: список с галочками + один пикер блокеров. */
export function TaskSubtasks({ task, board }: { task: Task; board: Board }) {
  const { tasks, createTask, updateTask, deleteTask } = useStore();
  const [newSub, setNewSub] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [q, setQ] = useState("");

  const subs = useMemo(
    () => tasks.filter((t) => t.parentId === task.id && !t.deletedAt).sort((a, b) => a.order - b.order),
    [tasks, task.id],
  );
  const done = subs.filter((s) => s.status === "done").length;

  const blockers = useMemo(
    () => task.blockedBy.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as Task[],
    [tasks, task.blockedBy],
  );

  const candidates = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.boardId === board.id &&
            t.id !== task.id &&
            !t.parentId &&
            !t.deletedAt &&
            !task.blockedBy.includes(t.id) &&
            (!q.trim() || t.title.toLowerCase().includes(q.toLowerCase())),
        )
        .slice(0, 8),
    [tasks, board.id, task.id, task.blockedBy, q],
  );

  const addSub = () => {
    if (!newSub.trim()) return;
    createTask({ boardId: board.id, columnId: task.columnId, title: newSub.trim(), parentId: task.id });
    setNewSub("");
  };
  const toggleSub = (s: Task) =>
    updateTask(s.id, s.status === "done" ? { status: "active", completedAt: null } : { status: "done", completedAt: new Date().toISOString() });
  const addBlocker = (id: string) => {
    updateTask(task.id, { blockedBy: [...task.blockedBy, id] });
    setPickOpen(false);
    setQ("");
  };
  const removeBlocker = (id: string) => updateTask(task.id, { blockedBy: task.blockedBy.filter((x) => x !== id) });

  return (
    <div className="space-y-4">
      {/* Подзадачи */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
          Подзадачи {subs.length > 0 && <span className="text-xs font-normal text-muted">{done}/{subs.length}</span>}
        </div>
        {subs.length > 0 && (
          <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / subs.length) * 100}%` }} />
          </div>
        )}
        <div className="space-y-1">
          {subs.map((s) => (
            <div key={s.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2/50">
              <button
                onClick={() => toggleSub(s)}
                className={cn(
                  "grid h-4.5 w-4.5 shrink-0 place-items-center rounded border transition",
                  s.status === "done" ? "border-brand bg-brand text-white" : "border-border hover:border-brand",
                )}
                style={{ height: 18, width: 18 }}
              >
                {s.status === "done" && <Check className="h-3 w-3" />}
              </button>
              <input
                defaultValue={s.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== s.title) updateTask(s.id, { title: v });
                  else e.target.value = s.title;
                }}
                className={cn(
                  "min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none focus:bg-surface focus:ring-1 focus:ring-brand",
                  s.status === "done" && "text-muted line-through",
                )}
              />
              <div className="w-32 shrink-0">
                <AssigneePicker value={s.assignee} onChange={(v) => updateTask(s.id, { assignee: v })} placeholder="—" />
              </div>
              <button
                onClick={() => deleteTask(s.id)}
                className="shrink-0 rounded p-1 text-muted opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                title="Удалить подзадачу"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSub()}
            placeholder="+ подзадача"
            className="flex-1 rounded-lg border border-border bg-surface-2/40 px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
          <button onClick={addSub} disabled={!newSub.trim()} className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white disabled:opacity-40">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Блокируется */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
          Блокируется задачами
          {blockers.some((b) => b.status !== "done") && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/12 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
              <Lock className="h-3 w-3" /> заблокирована
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {blockers.map((b) => (
            <span
              key={b.id}
              className={cn(
                "inline-flex max-w-[220px] items-center gap-1 rounded-lg border px-2 py-1 text-xs",
                b.status === "done" ? "border-border text-muted line-through" : "border-red-500/30 text-red-600 dark:text-red-400",
              )}
            >
              <span className="truncate">{b.title}</span>
              <button onClick={() => removeBlocker(b.id)} className="shrink-0 hover:opacity-70" title="Убрать связь">
                <Link2Off className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <div className="relative">
            <button
              onClick={() => setPickOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted transition hover:border-brand hover:text-brand"
            >
              <Plus className="h-3.5 w-3.5" /> добавить
            </button>
            {pickOpen && (
              <div className="absolute z-40 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl">
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Найти задачу…"
                  className="mb-1 w-full rounded-md border border-border bg-surface-2/40 px-2 py-1 text-sm outline-none focus:border-brand"
                />
                <div className="max-h-48 overflow-y-auto">
                  {candidates.length === 0 && <p className="px-2 py-2 text-xs text-faint">Ничего не найдено</p>}
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => addBlocker(c.id)}
                      className="block w-full truncate rounded px-2 py-1.5 text-left text-sm transition hover:bg-surface-2"
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
