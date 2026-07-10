"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trash2, UserPlus, Waypoints, ExternalLink, AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { TagInput } from "./TagInput";
import { AssigneePicker } from "./AssigneePicker";
import { TaskWorkflow } from "./TaskWorkflow";
import { TaskExtras } from "./TaskExtras";
import { PhotoUploader } from "./PhotoUploader";
import { AutoTextarea } from "./AutoTextarea";
import { useStore } from "@/lib/store";
import { useCan } from "@/lib/access";
import { useMaps } from "@/lib/maps";
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
  const can = useCan();
  const editing = !!task;
  const canEdit = can("card.edit");
  const canCreate = can("card.create");
  const canDelete = can("card.delete");
  // В режиме редактирования поля доступны при праве card.edit; при создании — card.create.
  const fieldsDisabled = editing ? !canEdit : !canCreate;
  const canSave = editing ? canEdit : canCreate;

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [type, setType] = useState<TaskType>("task");
  const [dueDate, setDueDate] = useState("");
  const [doneDueDate, setDoneDueDate] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [columnId, setColumnId] = useState("");
  const [mapId, setMapId] = useState<string>("");
  const [mapNodeId, setMapNodeId] = useState<string>("");

  const allTags = useMemo(() => uniqueTags(tasks), [tasks]);

  const { maps } = useMaps();
  const selectedMap = useMemo(() => maps.find((m) => m.id === mapId) ?? null, [maps, mapId]);
  // Узлы-«экраны» карты (без заметок и групп) для выбора привязки.
  const mapNodes = useMemo(
    () =>
      (selectedMap?.graph.nodes ?? []).filter(
        (n) => n.data?.kind !== "note" && n.data?.kind !== "group",
      ),
    [selectedMap],
  );
  const linkedNode = useMemo(
    () => mapNodes.find((n) => n.id === mapNodeId) ?? null,
    [mapNodes, mapNodeId],
  );
  const nodeMissing = !!mapId && !!mapNodeId && !linkedNode;

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
      setMapId(task.mapId ?? "");
      setMapNodeId(task.mapNodeId ?? "");
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
      setMapId("");
      setMapNodeId("");
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
        mapId: mapId || null,
        mapNodeId: mapId ? mapNodeId || null : null,
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
        mapId: mapId || null,
        mapNodeId: mapId ? mapNodeId || null : null,
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
            {editing && canDelete && (
              <button className="btn-ghost text-red-500 hover:bg-red-500/10" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
                Удалить
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!canSave && (
              <span className="text-xs text-muted">Только просмотр</span>
            )}
            <button className="btn-outline" onClick={onClose}>
              {canSave ? "Отмена" : "Закрыть"}
            </button>
            {canSave && (
              <button className="btn-primary" onClick={save} disabled={!title.trim()}>
                {editing ? "Сохранить" : "Создать"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <fieldset disabled={fieldsDisabled} className="space-y-4 border-0 p-0 disabled:opacity-90">
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

        {/* Bulut MAP: привязка задачи к экрану карты */}
        {maps.length > 0 && (
          <div className="rounded-xl border border-teal-500/25 bg-teal-500/[0.05] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
              <Waypoints className="h-3.5 w-3.5" /> Экран на карте (необязательно)
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                className="input"
                value={mapId}
                onChange={(e) => {
                  setMapId(e.target.value);
                  setMapNodeId("");
                }}
              >
                <option value="">— карта не выбрана —</option>
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={mapNodeId}
                onChange={(e) => setMapNodeId(e.target.value)}
                disabled={!mapId}
              >
                <option value="">— экран —</option>
                {nodeMissing && <option value={mapNodeId}>⚠ экран удалён</option>}
                {mapNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {(n.data?.label as string) || "Без названия"}
                  </option>
                ))}
              </select>
            </div>
            {mapId && mapNodeId && (
              nodeMissing ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Экран удалён из карты.
                  <button
                    type="button"
                    className="ml-auto underline"
                    onClick={() => {
                      setMapId("");
                      setMapNodeId("");
                    }}
                  >
                    Очистить
                  </button>
                </div>
              ) : (
                <Link
                  href={`/maps/${mapId}?focus=${mapNodeId}`}
                  onClick={onClose}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-teal-600 hover:underline dark:text-teal-400"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Открыть на карте: {(linkedNode?.data?.label as string) || "экран"}
                </Link>
              )
            )}
          </div>
        )}

        <div>
          <label className="label">Теги</label>
          <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        </div>
      </fieldset>

      {editing && task && canEdit && (
        <div className="mt-4 border-t border-border pt-4">
          <PhotoUploader taskId={task.id} />
        </div>
      )}

      {editing && task && canEdit && (
        <div className="mt-4 border-t border-border pt-4">
          <TaskExtras taskId={task.id} />
        </div>
      )}

      {editing && task && (
        <div className="mt-4 border-t border-border pt-4">
          <TaskWorkflow taskId={task.id} board={board} />
        </div>
      )}
    </Modal>
  );
}
