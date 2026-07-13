"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Trash2,
  UserPlus,
  Waypoints,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  CalendarDays,
  Tag,
  ListChecks,
  Image as ImageIcon,
  Activity,
  GitBranch,
  Target,
} from "lucide-react";
import { Modal } from "./Modal";
import { TagInput } from "./TagInput";
import { AssigneePicker } from "./AssigneePicker";
import { TaskWorkflow } from "./TaskWorkflow";
import { TaskExtras } from "./TaskExtras";
import { PhotoUploader } from "./PhotoUploader";
import { TaskSubtasks } from "./TaskSubtasks";
import { AutoTextarea } from "./AutoTextarea";
import { useStore } from "@/lib/store";
import { useCan } from "@/lib/access";
import { useMaps } from "@/lib/maps";
import { getMe } from "@/lib/me";
import { useNotifier } from "@/lib/notify";
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
import { withAlpha, cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/date";
import type { MapNode, MapEdge } from "@/lib/map-types";

/** Этапы под экраном — узлы вниз по стрелкам до следующего экрана. */
function stagesUnder(screenId: string, nodes: MapNode[], edges: MapEdge[]): MapNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const stages: MapNode[] = [];
  const seen = new Set<string>([screenId]);
  const queue = [...(adj.get(screenId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (!n) continue;
    const kind = n.data?.kind;
    if (kind === "screen" || kind === "terminator" || kind === "note" || kind === "group") continue;
    stages.push(n);
    for (const t of adj.get(id) ?? []) queue.push(t);
  }
  return stages;
}

/** Складная секция — прогрессивное раскрытие, чтобы форма не давила объёмом. */
function Section({
  title,
  icon: Icon,
  hint,
  defaultOpen,
  children,
}: {
  title: string;
  icon: typeof Tag;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2/25">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-surface-2/50"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted" />
        <span>{title}</span>
        {hint && <span className="text-xs font-normal text-faint">{hint}</span>}
        <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </div>
  );
}

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
  const notify = useNotifier();
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
  const [screenId, setScreenId] = useState<string>(""); // выбранный экран (kind=screen)
  const [mapNodeId, setMapNodeId] = useState<string>(""); // выбранный этап (узел под экраном)
  const [storyPoints, setStoryPoints] = useState<string>("");
  const [epic, setEpic] = useState("");
  const [sprint, setSprint] = useState("");
  const [watchers, setWatchers] = useState<string[]>([]);
  const [custom, setCustom] = useState<Record<string, string>>({});

  const allTags = useMemo(() => uniqueTags(tasks), [tasks]);
  const allEpics = useMemo(() => Array.from(new Set(tasks.map((t) => t.epic).filter(Boolean))), [tasks]);
  const allSprints = useMemo(() => Array.from(new Set(tasks.map((t) => t.sprint).filter(Boolean))), [tasks]);
  const people = useMemo(() => Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean))), [tasks]);

  const { maps } = useMaps();
  const selectedMap = useMemo(() => maps.find((m) => m.id === mapId) ?? null, [maps, mapId]);
  const allNodes = useMemo(() => selectedMap?.graph.nodes ?? [], [selectedMap]);
  const allEdges = useMemo(() => selectedMap?.graph.edges ?? [], [selectedMap]);
  // Все узлы-цели (без заметок/групп).
  const mapNodes = useMemo(
    () => allNodes.filter((n) => n.data?.kind !== "note" && n.data?.kind !== "group"),
    [allNodes],
  );
  // Экраны (kind=screen). Если они есть — включаем трёхуровневый выбор Экран→Этап.
  const screenNodes = useMemo(() => mapNodes.filter((n) => n.data?.kind === "screen"), [mapNodes]);
  const useScreenStage = screenNodes.length > 0;

  // Этапы под выбранным экраном — узлы вниз по стрелкам (до следующего экрана).
  const stageOptions = useMemo(() => {
    if (!useScreenStage || !screenId) return [];
    const screen = allNodes.find((n) => n.id === screenId);
    const down = stagesUnder(screenId, allNodes, allEdges);
    return screen ? [screen, ...down] : down;
  }, [useScreenStage, screenId, allNodes, allEdges]);

  // Эффективный привязанный узел = этап, иначе сам экран (в плоском режиме — просто выбранный узел).
  const effectiveNodeId = useScreenStage ? mapNodeId || screenId : mapNodeId;
  const linkedNode = useMemo(
    () => mapNodes.find((n) => n.id === effectiveNodeId) ?? null,
    [mapNodes, effectiveNodeId],
  );
  const nodeMissing = !!mapId && !!effectiveNodeId && !linkedNode;

  // При редактировании — вычислить экран по сохранённому узлу (map_node_id).
  useEffect(() => {
    if (!open || !useScreenStage || !mapNodeId || screenId) return;
    // сам узел — экран?
    if (screenNodes.some((s) => s.id === mapNodeId)) {
      setScreenId(mapNodeId);
      setMapNodeId("");
      return;
    }
    // найти экран, под которым лежит этот этап
    for (const s of screenNodes) {
      if (stagesUnder(s.id, allNodes, allEdges).some((n) => n.id === mapNodeId)) {
        setScreenId(s.id);
        return;
      }
    }
  }, [open, useScreenStage, mapNodeId, screenId, screenNodes, allNodes, allEdges]);

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
      setScreenId("");
      setMapNodeId(task.mapNodeId ?? "");
      setStoryPoints(task.storyPoints != null ? String(task.storyPoints) : "");
      setEpic(task.epic ?? "");
      setSprint(task.sprint ?? "");
      setWatchers(task.watchers ?? []);
      setCustom(task.custom ?? {});
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
      setScreenId("");
      setMapNodeId("");
      setStoryPoints("");
      setEpic("");
      setSprint("");
      setWatchers([]);
      setCustom({});
    }
  }, [open, task, defaultColumnId, board.columns]);

  const save = () => {
    if (!title.trim()) return;
    const who = assignee.trim();
    const notifyAssign = (taskId: string) => {
      // уведомляем при назначении на кого-то (кроме себя), при создании или смене исполнителя
      if (who && who !== getMe() && (!editing || who !== task?.assignee)) {
        notify(who, {
          type: "assign",
          title: "Вам назначили задачу",
          body: title.trim(),
          link: `/board/${board.id}?task=${taskId}`,
          email: true,
        });
      }
    };
    const points = storyPoints.trim() === "" ? null : Math.max(0, parseInt(storyPoints, 10) || 0);
    if (editing && task) {
      updateTask(task.id, {
        title: title.trim(),
        desc,
        assignee: who,
        priority,
        type,
        dueDate: dueDate || null,
        doneDueDate: doneDueDate || null,
        tags,
        columnId,
        mapId: mapId || null,
        mapNodeId: mapId ? effectiveNodeId || null : null,
        storyPoints: points,
        epic: epic.trim(),
        sprint: sprint.trim(),
        watchers,
        custom,
      });
      notifyAssign(task.id);
    } else {
      const created = createTask({
        boardId: board.id,
        columnId: columnId || board.columns[0].id,
        title,
        desc,
        assignee: who,
        priority,
        type,
        dueDate: dueDate || null,
        doneDueDate: doneDueDate || null,
        tags,
        mapId: mapId || null,
        mapNodeId: mapId ? effectiveNodeId || null : null,
        storyPoints: points,
        epic: epic.trim(),
        sprint: sprint.trim(),
        watchers,
        custom,
      });
      notifyAssign(created.id);
    }
    onClose();
  };

  const handleDelete = () => {
    if (task && confirm("Удалить задачу? Она попадёт в Корзину — можно восстановить.")) {
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
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-2/60 px-3 py-1.5 text-xs text-muted">
            <UserPlus className="h-3.5 w-3.5 text-brand" />
            Создал <span className="font-semibold text-fg">{task.createdBy}</span>
            <span className="text-faint">· {fmtDateTime(task.createdAt)}</span>
          </div>
        )}

        {/* ── Главное: название + описание ── */}
        <div>
          <input
            autoFocus
            className="input !text-base font-semibold"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название задачи — что нужно сделать?"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
          />
          <AutoTextarea
            className="input mt-2"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Описание, детали, критерии готовности…"
          />
        </div>

        {/* ── Тип (компактные чипы) ── */}
        <div>
          <label className="label">Тип</label>
          <div className="flex flex-wrap gap-1">
            {TASK_TYPE_KEYS.map((k) => {
              const meta = TASK_TYPES[k];
              const active = type === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setType(k)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[13px] font-medium transition"
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

        {/* ── Свойства: исполнитель / колонка / приоритет ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Исполнитель</label>
            <AssigneePicker value={assignee} onChange={setAssignee} />
          </div>

          <div>
            <label className="label">Колонка</label>
            <select className="input" value={columnId} onChange={(e) => setColumnId(e.target.value)}>
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
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
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIORITY_META[p].dot }} />
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Планирование: очки, эпик, спринт, наблюдатели, свои поля ── */}
        <Section
          key={`plan-${task?.id ?? "new"}`}
          title="Планирование"
          icon={Target}
          hint="очки · эпик · спринт · наблюдатели"
          defaultOpen={!!(epic || sprint || storyPoints || watchers.length || (board.customFields?.length ?? 0) > 0)}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Очки</label>
              <input
                type="number"
                min={0}
                className="input"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                placeholder="—"
              />
            </div>
            <div>
              <label className="label">Эпик</label>
              <input className="input" list="epics-list" value={epic} onChange={(e) => setEpic(e.target.value)} placeholder="напр. Регистрация" />
              <datalist id="epics-list">{allEpics.map((x) => <option key={x} value={x} />)}</datalist>
            </div>
            <div>
              <label className="label">Спринт</label>
              <input className="input" list="sprints-list" value={sprint} onChange={(e) => setSprint(e.target.value)} placeholder="напр. Спринт 5" />
              <datalist id="sprints-list">{allSprints.map((x) => <option key={x} value={x} />)}</datalist>
            </div>
          </div>
          <div className="mt-3">
            <label className="label">Наблюдатели (получают уведомления)</label>
            <TagInput tags={watchers} onChange={setWatchers} suggestions={people} />
          </div>
          {(board.customFields ?? []).length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(board.customFields ?? []).map((f) => (
                <div key={f.id}>
                  <label className="label">{f.name}</label>
                  <input
                    className="input"
                    value={custom[f.id] ?? ""}
                    onChange={(e) => setCustom((prev) => ({ ...prev, [f.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          key={`due-${task?.id ?? "new"}`}
          title="Сроки"
          icon={CalendarDays}
          hint="дедлайны, необязательно"
          defaultOpen={!!(dueDate || doneDueDate)}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Готов к тестированию</label>
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
              <label className="label">Готово</label>
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
        </Section>

        {maps.length > 0 && (
          <Section
            key={`map-${task?.id ?? "new"}`}
            title="Экран на карте"
            icon={Waypoints}
            hint="Bulut MAP, необязательно"
            defaultOpen={!!mapId}
          >
            <div className={cn("grid grid-cols-1 gap-2", useScreenStage ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              <select
                className="input"
                value={mapId}
                onChange={(e) => {
                  setMapId(e.target.value);
                  setScreenId("");
                  setMapNodeId("");
                }}
              >
                <option value="">— карта —</option>
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              {useScreenStage ? (
                <>
                  <select
                    className="input"
                    value={screenId}
                    onChange={(e) => {
                      setScreenId(e.target.value);
                      setMapNodeId("");
                    }}
                    disabled={!mapId}
                  >
                    <option value="">— экран —</option>
                    {screenNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {(n.data?.label as string) || "Экран"}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={mapNodeId}
                    onChange={(e) => setMapNodeId(e.target.value)}
                    disabled={!screenId}
                    title="Этап — узел под выбранным экраном"
                  >
                    <option value="">— весь экран —</option>
                    {stageOptions
                      .filter((n) => n.id !== screenId)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {(n.data?.label as string) || "Этап"}
                        </option>
                      ))}
                  </select>
                </>
              ) : (
                <select
                  className="input"
                  value={mapNodeId}
                  onChange={(e) => setMapNodeId(e.target.value)}
                  disabled={!mapId}
                >
                  <option value="">— узел —</option>
                  {nodeMissing && <option value={mapNodeId}>⚠ узел удалён</option>}
                  {mapNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {(n.data?.label as string) || "Без названия"}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {mapId && effectiveNodeId && (
              nodeMissing ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Экран удалён из карты.
                  <button
                    type="button"
                    className="ml-auto underline"
                    onClick={() => {
                      setMapId("");
                      setScreenId("");
                      setMapNodeId("");
                    }}
                  >
                    Очистить
                  </button>
                </div>
              ) : (
                <Link
                  href={`/maps/${mapId}?focus=${effectiveNodeId}`}
                  onClick={onClose}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-teal-600 hover:underline dark:text-teal-400"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Открыть на карте: {(linkedNode?.data?.label as string) || "экран"}
                </Link>
              )
            )}
          </Section>
        )}

        <Section
          key={`tags-${task?.id ?? "new"}`}
          title="Теги"
          icon={Tag}
          hint={tags.length ? `${tags.length}` : "необязательно"}
          defaultOpen={tags.length > 0}
        >
          <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        </Section>
      </fieldset>

      {editing && task && (
        <div className="mt-4 space-y-3">
          {canEdit && (
            <Section
              key={`subs-${task.id}`}
              title="Подзадачи и связи"
              icon={GitBranch}
              hint={(() => {
                const n = tasks.filter((t) => t.parentId === task.id && !t.deletedAt).length;
                return n ? `${n}` : task.blockedBy.length ? "блокировки" : undefined;
              })()}
              defaultOpen={tasks.some((t) => t.parentId === task.id) || task.blockedBy.length > 0}
            >
              <TaskSubtasks task={task} board={board} />
            </Section>
          )}

          {canEdit && (
            <Section
              key={`photos-${task.id}`}
              title="Фото"
              icon={ImageIcon}
              hint={task.photos?.length ? `${task.photos.length}` : undefined}
              defaultOpen={(task.photos?.length ?? 0) > 0}
            >
              <PhotoUploader taskId={task.id} />
            </Section>
          )}

          {canEdit && (
            <Section
              key={`extras-${task.id}`}
              title="Чек-лист и вложения"
              icon={ListChecks}
              hint={
                (task.checklist?.length ?? 0) + (task.attachments?.length ?? 0)
                  ? `${(task.checklist?.length ?? 0) + (task.attachments?.length ?? 0)}`
                  : undefined
              }
              defaultOpen={(task.checklist?.length ?? 0) + (task.attachments?.length ?? 0) > 0}
            >
              <TaskExtras taskId={task.id} />
            </Section>
          )}

          <Section key={`wf-${task.id}`} title="Статус, время и комментарии" icon={Activity} defaultOpen>
            <TaskWorkflow taskId={task.id} board={board} />
          </Section>
        </div>
      )}
    </Modal>
  );
}
