"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, KanbanSquare, CheckCircle2, Circle } from "lucide-react";
import { Modal } from "./Modal";
import { useStore } from "@/lib/store";
import { PriorityDot } from "./PriorityDot";

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { boards, tasks } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { boards: [], tasks: [] };
    const matchedBoards = boards.filter((b) => b.name.toLowerCase().includes(term));
    const matchedTasks = tasks
      .filter((t) => {
        const hay = `${t.title} ${t.desc} ${t.assignee} ${t.tags.join(" ")}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 30);
    return { boards: matchedBoards, tasks: matchedTasks };
  }, [q, boards, tasks]);

  const go = (href: string) => {
    onClose();
    setQ("");
    router.push(href);
  };

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="-m-1">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <Search className="h-5 w-5 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по всем доскам и задачам..."
            className="w-full bg-transparent pr-8 text-base outline-none placeholder:text-muted"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto pt-3">
          {!q.trim() && (
            <p className="py-8 text-center text-sm text-muted">
              Начните вводить, чтобы искать задачи и доски
            </p>
          )}

          {q.trim() && results.boards.length === 0 && results.tasks.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">Ничего не найдено</p>
          )}

          {results.boards.length > 0 && (
            <div className="mb-3">
              <p className="px-2 pb-1 text-xs font-semibold uppercase text-muted">Доски</p>
              {results.boards.map((b) => (
                <button
                  key={b.id}
                  onClick={() => go(`/board/${b.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-surface-2"
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
                  <KanbanSquare className="h-4 w-4 text-muted" />
                  {b.name}
                </button>
              ))}
            </div>
          )}

          {results.tasks.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-xs font-semibold uppercase text-muted">Задачи</p>
              {results.tasks.map((t) => {
                const board = boards.find((b) => b.id === t.boardId);
                return (
                  <button
                    key={t.id}
                    onClick={() => go(`/board/${t.boardId}?task=${t.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-surface-2"
                  >
                    {t.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted" />
                    )}
                    <span className="flex-1 truncate">{t.title}</span>
                    <PriorityDot priority={t.priority} />
                    <span className="hidden shrink-0 text-xs text-muted sm:flex sm:items-center sm:gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: board?.color }} />
                      {board?.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
