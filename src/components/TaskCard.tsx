"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  GripVertical,
  MessageSquare,
  CornerUpLeft,
  FlaskConical,
  Clock,
  CheckSquare,
  Paperclip,
  ImageIcon,
  UserPlus,
} from "lucide-react";
import { durationSince } from "@/lib/date";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { Board, Task } from "@/lib/types";
import { useStore, doneColumnId, columnRole } from "@/lib/store";
import { PriorityDot } from "./PriorityDot";
import { DeadlineBadge } from "./DeadlineBadge";
import { TypeBadge } from "./TypeBadge";
import { Avatar } from "./Avatar";
import { cn } from "@/lib/utils";
import { returnsSummary } from "@/lib/returns";

interface TaskCardProps {
  task: Task;
  board: Board;
  onOpen: () => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  isDragging?: boolean;
}

export function TaskCard({ task, board, onOpen, dragHandleProps, isDragging }: TaskCardProps) {
  const { toggleDone, updateTask, comments } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const taskComments = useMemo(() => comments.filter((c) => c.taskId === task.id), [comments, task.id]);
  const returnCount = task.returnCount ?? 0;
  const hasReturn = returnCount > 0 && task.status !== "done";
  const checklist = task.checklist ?? [];
  const checkDone = checklist.filter((i) => i.done).length;
  const attachCount = (task.attachments ?? []).length;
  const photoCount = (task.photos ?? []).length;
  // badge reflects the card's ACTUAL column (fixes: badge stuck after moving back)
  const role = columnRole(board, task.columnId);
  const isReady = role === "ready" && task.status !== "done";
  const inReview = role === "review" && task.status !== "done";

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== task.title) updateTask(task.id, { title: v });
    else setDraft(task.title);
    setEditing(false);
  };

  const done = task.status === "done";

  return (
    <div
      className={cn(
        "card group relative overflow-hidden p-3 transition-all hover:border-border-strong hover:shadow-float",
        isDragging && "rotate-[1.5deg] shadow-pop ring-2 ring-brand/50",
        done && "opacity-60"
      )}
    >
      {/* left accent rail by priority */}
      <span
        className="absolute left-0 top-2.5 h-[calc(100%-1.25rem)] w-1 rounded-full"
        style={{
          backgroundColor:
            task.priority === "high" ? "#ef4444" : task.priority === "medium" ? "#f59e0b" : "#10b981",
        }}
      />

      <div className="flex items-start gap-2 pl-1.5">
        <button
          onClick={() => toggleDone(task.id, doneColumnId(board))}
          className="mt-0.5 shrink-0 text-muted transition hover:text-emerald-500"
          title={done ? "Вернуть в работу" : "Выполнено"}
        >
          {done ? (
            <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
          ) : (
            <Circle className="h-[18px] w-[18px]" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {editing ? (
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  setDraft(task.title);
                  setEditing(false);
                }
              }}
              className="w-full resize-none rounded border border-brand bg-surface px-1.5 py-1 text-sm outline-none"
              rows={2}
            />
          ) : (
            <p
              onDoubleClick={() => setEditing(true)}
              onClick={onOpen}
              className={cn(
                "cursor-pointer text-sm font-medium leading-snug",
                done && "line-through"
              )}
            >
              {task.title}
            </p>
          )}

          {task.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.tags.map((t) => (
                <span key={t} className="chip bg-surface-2 text-muted">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <TypeBadge type={task.type} size="xs" />
            <DeadlineBadge dueDate={task.dueDate} done={done} />
            {hasReturn && (
              <span
                className="chip bg-red-500/10 text-red-600 dark:text-red-400"
                title={returnsSummary(task.returns) || `Возвращена на доработку: ${returnCount} раз`}
              >
                <CornerUpLeft className="h-3 w-3" /> Возврат{returnCount > 1 ? ` ×${returnCount}` : ""}
              </span>
            )}
            {isReady && (
              <span className="chip bg-violet-500/10 text-violet-600 dark:text-violet-400" title="Готов к тестированию">
                <FlaskConical className="h-3 w-3" /> Готов к тесту
              </span>
            )}
            {inReview && (
              <span className="chip bg-sky-500/10 text-sky-600 dark:text-sky-400" title="На проверке">
                <FlaskConical className="h-3 w-3" /> Проверка
              </span>
            )}
            {checklist.length > 0 && (
              <span
                className={cn(
                  "chip bg-surface-2 text-muted",
                  checkDone === checklist.length && "text-emerald-600 dark:text-emerald-400"
                )}
                title="Чек-лист"
              >
                <CheckSquare className="h-3 w-3" /> {checkDone}/{checklist.length}
              </span>
            )}
            {attachCount > 0 && (
              <span className="chip bg-surface-2 text-muted" title="Вложения">
                <Paperclip className="h-3 w-3" /> {attachCount}
              </span>
            )}
            {photoCount > 0 && (
              <span className="chip bg-surface-2 text-muted" title="Фото">
                <ImageIcon className="h-3 w-3" /> {photoCount}
              </span>
            )}
            {taskComments.length > 0 && (
              <span className="chip bg-surface-2 text-muted" title="Комментарии">
                <MessageSquare className="h-3 w-3" /> {taskComments.length}
              </span>
            )}
            {!done && (
              <span className="chip bg-surface-2 text-muted" title="Время в текущем этапе">
                <Clock className="h-3 w-3" /> {durationSince(task.stageEnteredAt)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <PriorityDot priority={task.priority} />
              {task.assignee && <Avatar name={task.assignee} size={22} />}
            </div>
          </div>

          {task.createdBy && (
            <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-faint">
              <UserPlus className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Добавил: <span className="font-medium text-muted">{task.createdBy}</span>
              </span>
            </div>
          )}
        </div>

        {/* drag handle */}
        <button
          {...dragHandleProps}
          className="absolute right-1 top-1 cursor-grab rounded p-1 text-muted opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
          tabIndex={-1}
          aria-label="Перетащить"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
