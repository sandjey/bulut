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
  Hash,
} from "lucide-react";
import type { NodeAnim } from "@/lib/map-types";
import { useStore } from "@/lib/store";
import { useCan } from "@/lib/access";
import { useNodeStats, useMapFilter } from "./MapContext";
import { STATUS_META, type NodeStats } from "@/lib/map-stats";
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
  number: Hash,
  link: ExternalLink,
};

/** CSS-класс анимации узла (Tailwind + кастомные из globals.css). */
const ANIM_CLASS: Record<NodeAnim, string> = {
  none: "",
  pulse: "animate-pulse",
  bounce: "animate-bounce",
  float: "bulut-float",
  glow: "bulut-glow",
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Ручки на всех четырёх сторонах. Все — type="source": в режиме
 * ConnectionMode.Loose source-хендл принимает и исходящие, и входящие связи,
 * поэтому тянуть стрелку можно от ЛЮБОЙ стороны к любой, и она сохраняется
 * (ребро всегда ссылается на существующий source-хендл).
 */
function Handles({ color }: { color: string }) {
  const s = { borderColor: color } as React.CSSProperties;
  return (
    <>
      <Handle type="source" position={Position.Left} id="l" style={s} />
      <Handle type="source" position={Position.Top} id="t" style={s} />
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
  style,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  editable: boolean;
  style?: React.CSSProperties;
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
      style,
      className: cn("nodrag nopan w-full rounded bg-black/20 px-1 outline-none ring-1 ring-brand", className),
    };
    return multiline ? (
      <textarea
        {...common}
        rows={Math.min(8, Math.max(2, draft.split("\n").length))}
        className={cn(common.className, "resize-none")}
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
      style={style}
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

/**
 * Угловой светофор: тихий цветной кружок по умолчанию (зелёный «работает»),
 * а если есть задачи — пилюля со счётчиком. Баг пульсирует. Ничего лишнего.
 */
function StatusBadge({ stats }: { stats: NodeStats }) {
  const meta = STATUS_META[stats.status];
  const title =
    `${meta.label}` +
    (stats.total ? ` · задач: ${stats.total}` : "") +
    (stats.bugsOpen ? ` · багов: ${stats.bugsOpen}` : "") +
    (stats.bugsFixed ? ` · исправлено (на проверке): ${stats.bugsFixed}` : "");

  if (stats.total === 0) {
    return (
      <span
        title={title}
        className={cn(
          "nodrag absolute -right-1.5 -top-1.5 z-30 h-3.5 w-3.5 rounded-full border-2 border-black/40 shadow",
          stats.status === "bug" && "bulut-pulse",
        )}
        style={{ backgroundColor: meta.color }}
      />
    );
  }
  return (
    <div
      title={title}
      className="nodrag absolute -right-2 -top-2 z-30 grid h-5 min-w-5 place-items-center rounded-full border-2 border-black/40 px-1 text-[11px] font-extrabold text-white shadow-lg"
      style={{ backgroundColor: meta.color }}
    >
      <span className={cn("absolute -inset-0.5 rounded-full", stats.status === "bug" && "bulut-pulse")} />
      {stats.total}
    </div>
  );
}

/** Свечение/обводка карточки по статусу (зелёная/жёлтая/красная) — без изменения размера. */
function statusShadow(status: NodeStats["status"]): string {
  const c = STATUS_META[status].color;
  const outline = status === "ok" ? "" : `, 0 0 0 1.5px ${withAlpha(c, 0.8)}`;
  return `0 10px 26px -14px ${withAlpha(c, status === "bug" ? 0.6 : 0.45)}${outline}`;
}

/**
 * Подпись-статус ПОД карточкой (снаружи): подпись + счётчик + полоска по этапам.
 * absolute + pointer-events-none — не меняет размер узла и не мешает соединять.
 * Показывается только когда есть задачи/ручной статус (пустые узлы — чисто).
 */
function StatusCaption({ stats, override }: { stats: NodeStats; override?: "ok" | "wip" | "bug" }) {
  if (stats.total === 0 && !override) return null;
  const m = STATUS_META[stats.status];
  return (
    <div className="pointer-events-none absolute left-1/2 top-full z-[5] mt-1.5 w-[94%] -translate-x-1/2">
      <div
        className="rounded-md px-2 py-1 text-[10px] shadow-sm"
        style={{ background: withAlpha(m.color, 0.14), border: `1px solid ${withAlpha(m.color, 0.4)}` }}
      >
        <div className="flex items-center gap-1.5 font-bold" style={{ color: m.color }}>
          <span className={cn("h-2 w-2 rounded-full", stats.status === "bug" && "bulut-pulse")} style={{ backgroundColor: m.color }} />
          <span>{m.label}</span>
          {stats.total > 0 && (
            <span className="ml-auto font-semibold text-fg/70">
              {stats.total}
              {stats.bugsOpen ? ` · 🐞${stats.bugsOpen}` : ""}
              {stats.bugsFixed ? ` · 🔧${stats.bugsFixed}` : ""}
            </span>
          )}
        </div>
        {stats.total > 0 && (
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-black/25">
            {stats.byStage.map((s) => (
              <div
                key={s.name}
                style={{ width: `${(s.count / stats.total) * 100}%`, backgroundColor: withAlpha(m.color, 0.85) }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BulutNodeInner({ id, data, selected }: NodeProps<MapNode>) {
  const rf = useReactFlow();
  const canEdit = useCan()("map.edit");
  const stats = useNodeStats(id, data.statusOverride);
  const filter = useMapFilter();
  const kind = data.kind;
  const matchesFilter =
    filter === "all"
      ? true
      : kind === "note" || kind === "group"
        ? false
        : filter === "bug"
          ? stats.status === "bug"
          : filter === "fixed"
            ? stats.status === "fixed"
            : filter === "work"
              ? stats.status === "wip"
              : filter === "ok"
                ? stats.status === "ok"
                : filter === "empty"
                  ? stats.total === 0
                  : true;
  const dim = filter !== "all" && !matchesFilter ? "opacity-20 saturate-0 transition" : "transition";
  const color = data.color || NODE_KIND_META[kind]?.color || "#6366f1";
  const Icon = KIND_ICON[kind] ?? MousePointerClick;
  const isSelected = !!selected;
  const animClass = ANIM_CLASS[(data.anim as NodeAnim) ?? "none"] ?? "";

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

  // Ресайзер рендерим ПОСЛЕ карточки, чтобы ручки были поверх и ловились мышью.
  const resizer = canEdit ? (
    <NodeResizer
      isVisible={isSelected}
      minWidth={120}
      minHeight={44}
      lineClassName="!border-brand"
      handleClassName="!h-2.5 !w-2.5 !rounded-full !bg-brand !border-2 !border-white"
    />
  ) : null;

  // ── Заметка ──
  if (kind === "note") {
    return (
      <>
        {isSelected && toolbar}
        <div
          className={cn("bulut-node min-h-[64px] w-full min-w-[140px] rotate-[-1deg] rounded-lg p-3 text-sm shadow-md", isSelected && "ring-2 ring-brand", dim, animClass)}
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
        {resizer}
      </>
    );
  }

  // ── Группа ──
  if (kind === "group") {
    return (
      <>
        {isSelected && toolbar}
        <div
          className={cn("bulut-node h-full min-h-[140px] w-full min-w-[200px] rounded-2xl border-2 border-dashed p-3", isSelected && "ring-2 ring-brand", dim, animClass)}
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
        {resizer}
      </>
    );
  }

  // ── Номер (крупная цифра для нумерации флоу) ──
  if (kind === "number") {
    return (
      <>
        {isSelected && toolbar}
        <div
          className={cn(
            "bulut-node relative flex h-full min-h-[56px] w-full min-w-[56px] items-center justify-center rounded-2xl border",
            isSelected && "ring-2 ring-brand",
            dim,
            animClass,
          )}
          style={{
            containerType: "size",
            background: `linear-gradient(140deg, ${withAlpha(color, 0.22)}, ${withAlpha(color, 0.04)} 60%), rgb(var(--surface))`,
            borderColor: withAlpha(color, 0.45),
            boxShadow: `0 12px 30px -12px ${withAlpha(color, 0.6)}`,
          }}
        >
          <Handles color={color} />
          <EditableText
            value={data.label}
            editable={canEdit}
            placeholder="1"
            onCommit={(v) => patch({ label: v })}
            className="flex w-full items-center justify-center text-center font-black leading-none tabular-nums"
            style={{ fontSize: "60cqmin", color }}
          />
        </div>
        {resizer}
      </>
    );
  }

  // ── Ссылка ──
  if (kind === "link") {
    return (
      <>
        {isSelected && toolbar}
        <LinkNode id={id} data={data} selected={isSelected} color={color} stats={stats} dim={dim} animClass={animClass} />
        {resizer}
      </>
    );
  }

  const terminator = kind === "terminator";
  const decision = kind === "decision";

  const cardStyle: React.CSSProperties = terminator
    ? {
        background: `linear-gradient(135deg, ${color}, ${withAlpha(color, 0.72)})`,
        borderColor: "transparent",
        boxShadow: statusShadow(stats.status),
      }
    : {
        background: `linear-gradient(140deg, ${withAlpha(color, 0.16)}, ${withAlpha(color, 0.02)} 58%), rgb(var(--surface))`,
        borderColor: isSelected ? "transparent" : withAlpha(color, 0.3),
        boxShadow: statusShadow(stats.status),
      };

  return (
    <>
      {isSelected && toolbar}
      <div
        className={cn(
          "bulut-node group relative flex w-full flex-col items-center justify-center gap-1.5 border px-3.5 py-3 text-center",
          terminator ? "min-h-[52px] rounded-full" : "min-h-[70px] rounded-2xl",
          isSelected && "ring-2 ring-brand",
          dim,
          animClass,
        )}
        style={cardStyle}
      >
        <Handles color={color} />
        <StatusBadge stats={stats} />
        <StatusCaption stats={stats} override={data.statusOverride} />
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-white ring-1 ring-white/15"
          style={{
            background: `linear-gradient(135deg, ${color}, ${withAlpha(color, 0.68)})`,
            boxShadow: `0 5px 14px -4px ${withAlpha(color, 0.65)}`,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <EditableText
          value={data.label}
          editable={canEdit}
          multiline
          placeholder={NODE_KIND_META[kind]?.label ?? "Узел"}
          onCommit={(v) => patch({ label: v })}
          className={cn(
            "w-full whitespace-pre-wrap break-words text-center text-sm font-semibold leading-snug",
            terminator ? "text-white" : "text-fg",
          )}
        />
        {(data.description || (decision && canEdit)) && (
          <EditableText
            value={data.description ?? ""}
            editable={canEdit}
            multiline
            placeholder="описание…"
            onCommit={(v) => patch({ description: v })}
            className={cn(
              "w-full whitespace-pre-wrap break-words text-center text-xs",
              terminator ? "text-white/80" : "text-muted",
            )}
          />
        )}
        {decision && (
          <div className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            <GitBranch className="h-2.5 w-2.5" /> да / нет
          </div>
        )}
      </div>
      {resizer}
    </>
  );
}

function LinkNode({
  data,
  selected,
  color,
  stats,
  dim,
  animClass,
}: {
  id: string;
  data: MapNodeData;
  selected: boolean;
  color: string;
  stats: NodeStats;
  dim?: string;
  animClass?: string;
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
        "bulut-node relative flex min-h-[64px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 py-3 text-center",
        selected && "ring-2 ring-brand",
        dim,
        animClass,
      )}
      style={{
        background: `linear-gradient(140deg, ${withAlpha(color, 0.16)}, ${withAlpha(color, 0.02)} 58%), rgb(var(--surface))`,
        borderColor: selected ? "transparent" : withAlpha(color, 0.3),
        boxShadow: statusShadow(stats.status),
      }}
      onDoubleClick={open}
      title="Двойной клик — открыть"
    >
      <Handles color={color} />
      <StatusBadge stats={stats} />
      <StatusCaption stats={stats} override={data.statusOverride} />
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-white ring-1 ring-white/15"
        style={{ background: `linear-gradient(135deg, ${color}, ${withAlpha(color, 0.68)})`, boxShadow: `0 5px 14px -4px ${withAlpha(color, 0.65)}` }}
      >
        {missing ? <AlertTriangle className="h-4 w-4 text-white" /> : <ExternalLink className="h-4 w-4" />}
      </span>
      <div className="w-full">
        <div className="break-words text-sm font-semibold text-fg">{title}</div>
        <div className="break-words text-xs text-muted">{missing ? "источник удалён" : subtitle}</div>
      </div>
    </div>
  );
}

export const BulutNode = memo(BulutNodeInner);
export const nodeTypes = { bulut: BulutNode };
