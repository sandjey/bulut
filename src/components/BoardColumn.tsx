"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, Pencil, Maximize2 } from "lucide-react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Board, Task } from "@/lib/types";
import { useStore } from "@/lib/store";
import { TaskCard } from "./TaskCard";
import { cn } from "@/lib/utils";

interface BoardColumnProps {
  board: Board;
  columnId: string;
  columnName: string;
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onQuickAdd: (columnId: string, title: string) => void;
  onOpenTask: (task: Task) => void;
}

export function BoardColumn({
  board,
  columnId,
  columnName,
  tasks,
  onAddTask,
  onQuickAdd,
  onOpenTask,
}: BoardColumnProps) {
  const { renameColumn, deleteColumn } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(columnName);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const addRef = useRef<HTMLTextAreaElement>(null);

  const commitAdd = () => {
    const v = draft.trim();
    if (v) {
      onQuickAdd(columnId, v);
      setDraft("");
      // keep composer open + focused for rapid entry
      setTimeout(() => addRef.current?.focus(), 0);
    } else {
      setAdding(false);
    }
  };

  const commitRename = () => {
    if (name.trim()) renameColumn(board.id, columnId, name.trim());
    else setName(columnName);
    setRenaming(false);
  };

  return (
    <div className="flex max-h-full w-[300px] shrink-0 flex-col rounded-xl bg-surface-2/60">
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {renaming ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setName(columnName);
                  setRenaming(false);
                }
              }}
              className="input py-1 text-sm"
            />
          </div>
        ) : (
          <>
            <h3 className="flex-1 truncate text-sm font-semibold">{columnName}</h3>
            <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-surface px-1.5 text-xs font-medium text-muted">
              {tasks.length}
            </span>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="rounded p-1 text-muted transition hover:bg-surface hover:text-fg"
              >
                <MoreHorizontalIcon />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg animate-scale-in">
                    <button
                      onClick={() => {
                        setRenaming(true);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-2"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Переименовать
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Удалить колонку «${columnName}»? Задачи будут перемещены.`))
                          deleteColumn(board.id, columnId);
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
          </>
        )}
      </div>

      {/* droppable list */}
      <Droppable droppableId={columnId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "board-scroll flex-1 space-y-2 overflow-y-auto px-2 pb-2 transition-colors min-h-[60px]",
              snapshot.isDraggingOver && "bg-brand/5"
            )}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                  >
                    <TaskCard
                      task={task}
                      board={board}
                      onOpen={() => onOpenTask(task)}
                      dragHandleProps={dragProvided.dragHandleProps}
                      isDragging={dragSnapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <p className="px-2 py-4 text-center text-xs text-muted">Нет задач</p>
            )}
          </div>
        )}
      </Droppable>

      {/* add */}
      {adding ? (
        <div className="m-2 rounded-lg border border-brand/40 bg-surface p-2 shadow-sm">
          <textarea
            ref={addRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitAdd();
              } else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder="Название задачи… (Enter — добавить)"
            rows={2}
            className="w-full resize-none rounded-md border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted"
          />
          <div className="mt-1 flex items-center gap-1.5">
            <button onClick={commitAdd} className="btn-primary px-3 py-1.5 text-xs" disabled={!draft.trim()}>
              <Plus className="h-3.5 w-3.5" /> Добавить
            </button>
            <button
              onClick={() => onAddTask(columnId)}
              className="btn-ghost px-2 py-1.5 text-xs text-muted"
              title="Открыть подробную форму"
            >
              <Maximize2 className="h-3.5 w-3.5" /> Детально
            </button>
            <button
              onClick={() => {
                setDraft("");
                setAdding(false);
              }}
              className="btn-ghost ml-auto px-2 py-1.5 text-xs text-muted"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="m-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-surface hover:text-fg"
        >
          <Plus className="h-4 w-4" /> Добавить задачу
        </button>
      )}
    </div>
  );
}

function MoreHorizontalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}
