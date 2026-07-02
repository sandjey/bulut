"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Modal } from "./Modal";
import { TagInput } from "./TagInput";
import { AssigneePicker } from "./AssigneePicker";
import { TaskWorkflow } from "./TaskWorkflow";
import { TaskExtras } from "./TaskExtras";
import { PhotoUploader } from "./PhotoUploader";
import { AutoTextarea } from "./AutoTextarea";
import { useStore } from "@/lib/store";
import {
  Board,
  Priority,
  Task,
  TaskType,
  PRIORITY_META,
  TASK_TYPES,
  TASK_TYPE_KEYS,
} from "@/lib/types";
import { uniqueTags } from "@/lib/filters";
import { withAlpha } from "@/lib/utils";
import { fmtDateTime } from "@/lib/date";

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  /** existing task to edit, or null to create */
  task?: Task | null;
  /** default column when creating */
  defaultColumnId?: string;
}

export function TaskModal({ open, onClose, board, task, defaultColumnId }: TaskModalProps) {
  const { tasks, createTask, updateTask, deleteTask } = useStore();
  const editing = !!task;

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [type, setType] = useState<TaskType>("task");
  const [dueDate, setDueDate] = useState("");
  const [doneDueDate, setDoneDueDate] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [columnId, setColumnId] = useState("");

  const allTags = useMemo(() => uniqueTags(tasks), [tasks]);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDesc(task.desc);
      setAssignee(task.assignee);
      setPriority(task.priority);
      setType(task.type ?? "task");
      setDueDate(task.dueDate ?? "");
      setDoneDueDate(task.doneDueDate ?? "");
      setTags(task.tags);
      setColumnId(task.columnId);
    } else {
      setTitle("");
      setDesc("");
      setAssignee("");
      setPriority("medium");
      setType("task");
      setDueDate("");
      setDoneDueDate("");
      setTags([]);
      setColumnId(defaultColumnId ?? board.columns[0]?.id ?? "");
    }
  }, [open, task, defaultColumnId, board.columns]);

  const save = () => {
    if (!title.trim()) return;
    if (editing && task) {
      updateTask(task.id, {
        title: title.trim(),
        desc,
        assignee: assignee.trim(),
        priority,
        type,
        dueDate: dueDate || null,
        doneDueDate: doneDueDate || null,
        tags,
        columnId,
      });
    } else {
      createTask({
        boardId: board.id,
        columnId: columnId || board.columns[0].id,
        title,
        desc,
        assignee: assignee.trim(),
        priority,
        type,
        dueDate: dueDate || null,
        doneDueDate: doneDueDate || null,
        tags,
      });
    }
    onClose();
  };

  const handleDelete = () => {
    if (task && confirm("Удалить задачу?")) {
      deleteTask(task.id);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? "Редактировать задачу" : "Новая задача"}
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {editing && (
              <button className="btn-ghost text-red-500 hover:bg-red-500/10" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
                Удалить
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={onClose}>
              Отмена
            </button>
            <button className="btn-primary" onClick={save} disabled={!title.trim()}>
              {editing ? "Сохранить" : "Создать"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {editing && task?.createdBy && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted">
            <UserPlus className="h-3.5 w-3.5 text-brand" />
            Создал <span className="font-semibold text-fg">{task.createdBy}</span>
            <span className="text-faint">· {fmtDateTime(task.createdAt)}</span>
          </div>
        )}

        <div>
          <label className="label">Название</label>
          <input
            autoFocus
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Что нужно сделать?"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
          />
        </div>

        <div>
          <label className="label">Описание</label>
          <AutoTextarea
            className="input"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Детали задачи..."
          />
        </div>

        <div>
          <label className="label">Тип</label>
          <div className="flex flex-wrap gap-1.5">
            {TASK_TYPE_KEYS.map((k) => {
              const meta = TASK_TYPES[k];
              const active = type === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setType(k)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition"
                  style={{
                    borderColor: active ? meta.color : "rgb(var(--border))",
                    backgroundColor: active ? withAlpha(meta.color, 0.14) : "transparent",
                    color: active ? meta.color : "rgb(var(--muted))",
                  }}
                >
                  <span>{meta.icon}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Исполнитель</label>
            <AssigneePicker value={assignee} onChange={setAssignee} />
          </div>

          <div>
            <label className="label">Колонка</label>
            <select
              className="input"
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
            >
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Приоритет</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`btn text-xs ${
                    priority === p
                      ? "border-2 font-semibold"
                      : "border border-border bg-surface hover:bg-surface-2"
                  }`}
                  style={
                    priority === p
                      ? { borderColor: PRIORITY_META[p].dot, color: PRIORITY_META[p].dot }
                      : undefined
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: PRIORITY_META[p].dot }}
                  />
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Дедлайн · Готов к тестированию</label>
            <input
              type="date"
              className="input"
              value={dueDate}
              max={doneDueDate || undefined}
              onChange={(e) => setDueDate(e.target.value)}
              title="Срок разработчика — сдать в тест"
            />
          </div>

          <div>
            <label className="label">Дедлайн · Готово</label>
            <input
              type="date"
              className="input"
              value={doneDueDate}
              min={dueDate || undefined}
              onChange={(e) => setDoneDueDate(e.target.value)}
              title="Срок тестировщика — завершить задачу"
            />
          </div>
        </div>

        <div>
          <label className="label">Теги</label>
          <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        </div>

        {editing && task && (
          <div className="border-t border-border pt-4">
            <PhotoUploader taskId={task.id} />
          </div>
        )}

        {editing && task && (
          <div className="border-t border-border pt-4">
            <TaskExtras taskId={task.id} />
          </div>
        )}

        {editing && task && (
          <div className="border-t border-border pt-4">
            <TaskWorkflow taskId={task.id} board={board} />
          </div>
        )}
      </div>
    </Modal>
  );
}
