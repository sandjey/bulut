"use client";

import { useMemo, useState } from "react";
import {
  Send,
  CheckCheck,
  CornerUpLeft,
  RotateCcw,
  Trash2,
  MessageSquarePlus,
  Plus,
  Flag,
  FlaskConical,
  CheckCircle2,
  CircleDashed,
  Clock,
} from "lucide-react";
import { useStore, columnRole, reviewColumnId } from "@/lib/store";
import { useCan } from "@/lib/access";
import { Board } from "@/lib/types";
import { Avatar } from "./Avatar";
import { AssigneePicker } from "./AssigneePicker";
import { MentionInput } from "./MentionInput";
import { fmtDateTime, durationSince, formatDuration } from "@/lib/date";
import { stageTimeList } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { getMe } from "@/lib/me";
import { Markdown } from "@/lib/markdown";
import { useNotifier, useMentionExtractor } from "@/lib/notify";

export function TaskWorkflow({ taskId, board }: { taskId: string; board: Board }) {
  const { tasks, comments, sendToReview, acceptTask, returnTask, toggleDone, addComment, deleteComment, moveTask } =
    useStore();
  const can = useCan();
  const canStatus = can("card.status");
  const canComment = can("card.comment");
  const notify = useNotifier();
  const extractMentions = useMentionExtractor();
  const task = tasks.find((t) => t.id === taskId);

  const [returning, setReturning] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnAuthor, setReturnAuthor] = useState("");
  const [commentText, setCommentText] = useState("");

  const taskComments = useMemo(
    () =>
      comments
        .filter((c) => c.taskId === taskId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [comments, taskId]
  );

  if (!task) return null;
  const role = columnRole(board, task.columnId);
  const stageDurations = stageTimeList(task, board);

  const doReturn = () => {
    if (!returnReason.trim()) return;
    returnTask(task.id, returnAuthor, returnReason);
    setReturnReason("");
    setReturning(false);
  };

  const doComment = () => {
    const text = commentText.trim();
    if (!text) return;
    const author = getMe() || "";
    addComment(task.id, author, text);
    setCommentText("");

    // Уведомления: упомянутые (+письмо), исполнитель и автор задачи (в приложении)
    const link = `/board/${board.id}?task=${task.id}`;
    const mentioned = new Set(extractMentions(text));
    mentioned.forEach((name) => {
      if (name !== author) notify(name, { type: "mention", title: "Вас упомянули в задаче", body: `${task.title}: ${text}`, link, email: true });
    });
    const notifyComment = (name?: string | null) => {
      if (name && name !== author && !mentioned.has(name)) {
        notify(name, { type: "comment", title: "Новый комментарий", body: `${author}: ${text}`, link });
      }
    };
    notifyComment(task.assignee);
    notifyComment(task.createdBy);
  };

  const startReview = () => moveTask(task.id, reviewColumnId(board), 0);

  const stages = [
    { label: "Создано", at: task.createdAt, Icon: Flag, done: true },
    { label: "Готов к тестированию", at: task.readyAt, Icon: FlaskConical, done: !!task.readyAt },
    { label: "Протестировано", at: task.testedAt, Icon: CheckCheck, done: !!task.testedAt },
    { label: "Готово", at: task.completedAt, Icon: CheckCircle2, done: task.status === "done" },
  ];

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <Metric label="В этапе" value={durationSince(task.stageEnteredAt)} />
        <Metric label="Всего в работе" value={durationSince(task.createdAt)} />
        <Metric
          label="Возвратов"
          value={String(task.returnCount ?? 0)}
          danger={(task.returnCount ?? 0) > 0}
        />
      </div>

      {/* Time per stage */}
      <div>
        <span className="label">Время по этапам</span>
        <div className="space-y-1">
          {stageDurations.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between rounded-md border border-border bg-surface-2/40 px-2.5 py-1.5 text-sm"
            >
              <span className={cn("flex items-center gap-1.5", s.current && "font-semibold")}>
                {s.current && <span className="h-2 w-2 rounded-full bg-brand" />}
                {s.name}
              </span>
              <span className={cn("tabular-nums", s.current ? "text-brand" : "text-muted")}>
                {formatDuration(s.seconds)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Stage timeline */}
      <div>
        <span className="label">Этапы</span>
        <div className="flex flex-wrap gap-1.5">
          {stages.map((s) => (
            <div
              key={s.label}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
                s.done
                  ? "border-brand/30 bg-brand/5 text-fg"
                  : "border-border bg-surface-2/40 text-muted"
              )}
              title={s.at ? fmtDateTime(s.at) : "ещё не пройдено"}
            >
              {s.done ? <s.Icon className="h-3.5 w-3.5 text-brand" /> : <CircleDashed className="h-3.5 w-3.5" />}
              <span className="font-medium">{s.label}</span>
              {s.at && <span className="text-muted">· {fmtDateTime(s.at)}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* История возвратов */}
      {(task.returns?.length ?? 0) > 0 && (
        <div>
          <span className="label flex items-center gap-1.5">
            <CornerUpLeft className="h-3.5 w-3.5" /> История возвратов
            <span className="text-muted">({task.returns.length})</span>
          </span>
          <div className="space-y-1">
            {[...task.returns]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((r, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-red-500/25 bg-red-500/5 px-2.5 py-1.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {r.from} → {r.to}
                    </span>
                    <span className="chip bg-surface-2 text-muted">
                      <Clock className="h-3 w-3" /> {formatDuration(r.seconds)}
                    </span>
                    <span className="ml-auto text-xs text-muted">{fmtDateTime(r.at)}</span>
                  </div>
                  {r.reason && (
                    <p className="mt-0.5 text-xs text-muted">Причина: {r.reason}</p>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Workflow actions */}
      {canStatus && (
      <div className="flex flex-wrap gap-2">
        {/* dev handoff → «Готов к тестированию» (пишется в журнал) */}
        {(role === "todo" || role === "progress") && (
          <button
            className="btn bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:text-sky-400"
            onClick={() => sendToReview(task.id)}
          >
            <Send className="h-4 w-4" /> Готов к тестированию
          </button>
        )}

        {/* QA берёт в работу → «На проверке» */}
        {role === "ready" && (
          <button
            className="btn bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:text-violet-400"
            onClick={startReview}
          >
            <FlaskConical className="h-4 w-4" /> На проверку
          </button>
        )}

        {role === "review" && (
          <>
            <button
              className="btn bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
              onClick={() => acceptTask(task.id)}
            >
              <CheckCheck className="h-4 w-4" /> Принять (протестировано)
            </button>
            <button
              className="btn bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400"
              onClick={() => setReturning((v) => !v)}
            >
              <CornerUpLeft className="h-4 w-4" /> Вернуть на доработку
            </button>
          </>
        )}

        {role === "done" || task.status === "done" ? (
          <button className="btn-outline" onClick={() => toggleDone(task.id)}>
            <RotateCcw className="h-4 w-4" /> Вернуть в работу
          </button>
        ) : (
          role !== "review" && (
            <button
              className="btn bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
              onClick={() => acceptTask(task.id)}
            >
              <CheckCircle2 className="h-4 w-4" /> Завершить
            </button>
          )
        )}
      </div>
      )}

      {/* Return form */}
      {canStatus && returning && (
        <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 animate-slide-up">
          <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
            <CornerUpLeft className="h-4 w-4" /> Причина возврата
          </div>
          <div className="flex gap-2">
            <div className="w-44 shrink-0">
              <AssigneePicker value={returnAuthor} onChange={setReturnAuthor} placeholder="Кто (QA)" />
            </div>
            <input
              className="input flex-1"
              autoFocus
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doReturn()}
              placeholder="Что не так — почему возвращаете…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setReturning(false)}>
              Отмена
            </button>
            <button
              className="btn bg-red-500 text-white hover:bg-red-600"
              onClick={doReturn}
              disabled={!returnReason.trim()}
            >
              Вернуть с комментарием
            </button>
          </div>
        </div>
      )}

      {/* Comments */}
      <div>
        <span className="label flex items-center gap-1.5">
          <MessageSquarePlus className="h-3.5 w-3.5" /> Комментарии
          {taskComments.length > 0 && <span className="text-muted">({taskComments.length})</span>}
        </span>

        {/* composer */}
        {canComment && (
        <div className="mb-3 flex gap-2">
          <MentionInput
            value={commentText}
            onChange={setCommentText}
            onSubmit={doComment}
            placeholder="Комментарий… (@ — упомянуть, **жирный**, - список)"
          />
          <button className="btn-primary px-3" onClick={doComment} disabled={!commentText.trim()}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
        )}

        {/* list */}
        <div className="space-y-2">
          {taskComments.length === 0 && (
            <p className="text-sm text-muted">Пока нет комментариев</p>
          )}
          {taskComments.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex gap-2.5 rounded-lg border p-2.5",
                c.kind === "return"
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-border bg-surface-2/40"
              )}
            >
              <Avatar name={c.author || "?"} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{c.author || "Аноним"}</span>
                  {c.kind === "return" && (
                    <span className="chip bg-red-500/15 text-red-600 dark:text-red-400">
                      <CornerUpLeft className="h-3 w-3" /> Возврат
                    </span>
                  )}
                  <span className="text-xs text-muted">{fmtDateTime(c.createdAt)}</span>
                  {canComment && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="ml-auto rounded p-1 text-muted opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Markdown text={c.text} className="mt-0.5 break-words text-sm leading-relaxed" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold", danger && "text-red-600 dark:text-red-400")}>
        {value}
      </div>
    </div>
  );
}
