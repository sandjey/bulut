"use client";

import { memo, useEffect, useState } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  NodeToolbar,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import { useRouter } from "next/navigation";
import {
  Flag,
  MonitorSmartphone,
  MousePointerClick,
  GitBranch,
  Cog,
  StickyNote,
  ExternalLink,
  AlertTriangle,
  Copy,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useCan } from "@/lib/access";
import type { MapNode, MapNodeKind, MapNodeData } from "@/lib/map-types";
import { NODE_KIND_META } from "@/lib/map-types";
import { BOARD_COLORS } from "@/lib/types";
import { cn, withAlpha } from "@/lib/utils";

const KIND_ICON: Record<MapNodeKind, typeof Flag> = {
  terminator: Flag,
  screen: MonitorSmartphone,
  action: MousePointerClick,
  decision: GitBranch,
  process: Cog,
  note: StickyNote,
  group: Cog,
  link: ExternalLink,
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Ручки на всех четырёх сторонах (соединять можно с любой на любую). */
function Handles({ color }: { color: string }) {
  const s = { borderColor: color } as React.CSSProperties;
  return (
    <>
      <Handle type="target" position={Position.Left} id="l" style={s} />
      <Handle type="target" position={Position.Top} id="t" style={s} />
      <Handle type="source" position={Position.Right} id="r" style={s} />
      <Handle type="source" position={Position.Bottom} id="b" style={s} />
    </>
  );
}

/** Текст с инлайн-редактированием по двойному клику. */
function EditableText({
  value,
  onCommit,
  className,
  placeholder,
  multiline,
  editable,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (editing && editable) {
    const commit = () => {
      onCommit(draft.trim());
      setEditing(false);
    };
    const common = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
      className: cn("nodrag nopan w-full rounded bg-black/20 px-1 outline-none ring-1 ring-brand", className),
    };
    return multiline ? (
      <textarea
        {...common}
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      />
    ) : (
      <input
        {...common}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className={cn(className, editable && "cursor-text")}
      onDoubleClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        setEditing(true);
      }}
      title={editable ? "Двойной клик — изменить" : undefined}
    >
      {value || <span className="opacity-40">{placeholder}</span>}
    </div>
  );
}

/** Панель действий над выделенным узлом. */
function Toolbar({
  id,
  data,
  onColor,
  onDuplicate,
  onDelete,
}: {
  id: string;
  data: MapNodeData;
  onColor: (c: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <NodeToolbar position={Position.Top} offset={10} className="nodrag nopan">
      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface/95 p-1 shadow-lg backdrop-blur">
        {BOARD_COLORS.slice(0, 6).map((c) => (
          <button
            key={c}
            onClick={() => onColor(c)}
            className="h-4 w-4 rounded-full transition hover:scale-125"
            style={{ backgroundColor: c, outline: data.color === c ? `2px solid ${c}` : "none", outlineOffset: 1 }}
          />
        ))}
        <span className="mx-0.5 h-4 w-px bg-border" />
        <button onClick={onDuplicate} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" title="Дублировать">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete} className="rounded-lg p-1 text-muted hover:bg-red-500/15 hover:text-red-500" title="Удалить">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </NodeToolbar>
  );
}

function BulutNodeInner({ id, data, selected }: NodeProps<MapNode>) {
  const rf = useReactFlow();
  const canEdit = useCan()("map.edit");
  const kind = data.kind;
  const color = data.color || NODE_KIND_META[kind]?.color || "#6366f1";
  const Icon = KIND_ICON[kind] ?? MousePointerClick;
  const isSelected = !!selected;

  const patch = (p: Partial<MapNodeData>) =>
    rf.setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)));
  const setColor = (c: string) => patch({ color: c });
  const duplicate = () => {
    const n = rf.getNode(id) as MapNode | undefined;
    if (!n) return;
    const copy: MapNode = {
      ...n,
      id: uid(),
      position: { x: n.position.x + 28, y: n.position.y + 28 },
      selected: true,
    };
    rf.setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), copy] as MapNode[]);
  };
  const remove = () => {
    rf.setNodes((ns) => ns.filter((n) => n.id !== id));
    rf.setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  };

  const toolbar = canEdit ? (
    <Toolbar id={id} data={data} onColor={setColor} onDuplicate={duplicate} onDelete={remove} />
  ) : null;

  // ── Заметка ──
  if (kind === "note") {
    return (
      <>
        {isSelected && toolbar}
        {canEdit && <NodeResizer isVisible={isSelected} minWidth={140} minHeight={64} lineClassName="!border-brand" handleClassName="!bg-brand !border-white" />}
        <div
          className={cn("bulut-node h-full min-h-[64px] w-full min-w-[140px] rotate-[-1deg] rounded-lg p-3 text-sm shadow-md", isSelected && "ring-2 ring-brand")}
          style={{ background: withAlpha(color, 0.16), border: `1px solid ${withAlpha(color, 0.4)}` }}
        >
          <Handles color={color} />
          <EditableText
            value={data.label}
            editable={canEdit}
            multiline
            placeholder="Заметка…"
            onCommit={(v) => patch({ label: v })}
            className="whitespace-pre-wrap font-medium text-fg"
          />
        </div>
      </>
    );
  }

  // ── Группа ──
  if (kind === "group") {
    return (
      <>
        {isSelected && toolbar}
        {canEdit && <NodeResizer isVisible={isSelected} minWidth={200} minHeight={140} lineClassName="!border-brand" handleClassName="!bg-brand !border-white" />}
        <div
          className={cn("bulut-node h-full min-h-[140px] w-full min-w-[200px] rounded-2xl border-2 border-dashed p-3", isSelected && "ring-2 ring-brand")}
          style={{ borderColor: withAlpha(color, 0.6), background: withAlpha(color, 0.05) }}
        >
          <Handles color={color} />
          <EditableText
            value={data.label}
            editable={canEdit}
            placeholder="Группа"
            onCommit={(v) => patch({ label: v })}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
          />
        </div>
      </>
    );
  }

  // ── Ссылка ──
  if (kind === "link") {
    return (
      <>
        {isSelected && toolbar}
        <LinkNode id={id} data={data} selected={isSelected} color={color} />
      </>
    );
  }

  const terminator = kind === "terminator";
  const decision = kind === "decision";

  return (
    <>
      {isSelected && toolbar}
      <div
        className={cn(
          "bulut-node group relative flex min-w-[172px] max-w-[280px] items-start gap-2.5 border bg-surface px-3.5 py-2.5 shadow-lg",
          terminator ? "rounded-full" : "rounded-2xl",
          isSelected ? "ring-2 ring-brand border-transparent" : "border-border hover:border-border-strong",
        )}
      >
        <Handles color={color} />
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: withAlpha(color, 0.16), color }}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <EditableText
            value={data.label}
            editable={canEdit}
            placeholder={NODE_KIND_META[kind]?.label ?? "Узел"}
            onCommit={(v) => patch({ label: v })}
            className="text-sm font-semibold leading-snug text-fg"
          />
          {(data.description || decision) && (
            <EditableText
              value={data.description ?? ""}
              editable={canEdit}
              multiline
              placeholder="описание…"
              onCommit={(v) => patch({ description: v })}
              className="mt-0.5 text-xs text-muted"
            />
          )}
          {decision && (
            <div className="mt-1 inline-flex rounded bg-amber-500/10 px-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              да / нет
            </div>
          )}
        </div>
        {!terminator && (
          <span className="absolute left-0 top-2 h-[calc(100%-1rem)] w-1 rounded-full" style={{ backgroundColor: color }} />
        )}
      </div>
    </>
  );
}

function LinkNode({
  id,
  data,
  selected,
  color,
}: {
  id: string;
  data: MapNodeData;
  selected: boolean;
  color: string;
}) {
  const { boards, tasks } = useStore();
  const router = useRouter();
  const link = data.link ?? {};
  const board = link.boardId ? boards.find((b) => b.id === link.boardId) : undefined;
  const task = link.taskId ? tasks.find((t) => t.id === link.taskId) : undefined;
  const missing = (link.boardId && !board) || (link.taskId && !task);
  const title = task?.title || board?.name || data.label || "Ссылка";
  const subtitle = task ? board?.name : link.url || "Доска";

  const open = () => {
    if (link.url) return window.open(link.url, "_blank");
    if (board) router.push(task ? `/board/${board.id}?task=${task.id}` : `/board/${board.id}`);
  };

  return (
    <div
      className={cn(
        "bulut-node flex w-[224px] items-center gap-2.5 rounded-2xl border bg-surface px-3 py-2.5 shadow-lg",
        selected ? "ring-2 ring-brand border-transparent" : "border-border hover:border-border-strong",
      )}
      onDoubleClick={open}
      title="Двойной клик — открыть"
    >
      <Handles color={color} />
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: withAlpha(color, 0.16), color }}>
        {missing ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <ExternalLink className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-fg">{title}</div>
        <div className="truncate text-xs text-muted">{missing ? "источник удалён" : subtitle}</div>
      </div>
    </div>
  );
}

export const BulutNode = memo(BulutNodeInner);
export const nodeTypes = { bulut: BulutNode };
