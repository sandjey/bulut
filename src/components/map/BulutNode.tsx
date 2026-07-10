"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
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
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { MapNode, MapNodeKind } from "@/lib/map-types";
import { NODE_KIND_META } from "@/lib/map-types";
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

function Handles({ color }: { color: string }) {
  const style = { borderColor: color } as React.CSSProperties;
  return (
    <>
      <Handle type="target" position={Position.Left} style={style} />
      <Handle type="target" position={Position.Top} style={style} />
      <Handle type="source" position={Position.Right} style={style} />
      <Handle type="source" position={Position.Bottom} style={style} />
    </>
  );
}

function BulutNodeInner({ data, selected }: NodeProps<MapNode>) {
  const kind = data.kind;
  const color = data.color || NODE_KIND_META[kind]?.color || "#6366f1";
  const Icon = KIND_ICON[kind] ?? MousePointerClick;

  // ── Заметка ──
  if (kind === "note") {
    return (
      <div
        className={cn(
          "min-h-[64px] w-[200px] rotate-[-1deg] rounded-md p-3 text-sm shadow-md transition",
          selected && "ring-2 ring-brand",
        )}
        style={{ background: withAlpha(color, 0.16), border: `1px solid ${withAlpha(color, 0.4)}` }}
      >
        <Handles color={color} />
        <div className="whitespace-pre-wrap font-medium text-fg">{data.label || "Заметка…"}</div>
        {data.description && <div className="mt-1 text-xs text-muted">{data.description}</div>}
      </div>
    );
  }

  // ── Группа / зона ──
  if (kind === "group") {
    return (
      <div
        className={cn(
          "h-full min-h-[160px] w-full min-w-[260px] rounded-2xl border-2 border-dashed p-3 transition",
          selected && "ring-2 ring-brand",
        )}
        style={{ borderColor: withAlpha(color, 0.6), background: withAlpha(color, 0.05) }}
      >
        <Handles color={color} />
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
          style={{ background: withAlpha(color, 0.18), color }}
        >
          {data.label || "Группа"}
        </span>
      </div>
    );
  }

  // ── Ссылка на доску/задачу ──
  if (kind === "link") {
    return <LinkNode data={data} selected={selected} color={color} />;
  }

  const terminator = kind === "terminator";
  const decision = kind === "decision";

  return (
    <div
      className={cn(
        "group relative flex min-w-[168px] max-w-[260px] items-start gap-2.5 border bg-surface px-3.5 py-2.5 shadow-sm transition",
        terminator ? "rounded-full" : "rounded-xl",
        selected ? "ring-2 ring-brand border-transparent" : "border-border hover:shadow-md",
      )}
    >
      <Handles color={color} />
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: withAlpha(color, 0.16), color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-snug text-fg">
          {data.label || NODE_KIND_META[kind]?.label || "Узел"}
        </div>
        {data.description && (
          <div className="mt-0.5 line-clamp-3 text-xs text-muted">{data.description}</div>
        )}
        {decision && (
          <div className="mt-1 inline-flex rounded bg-amber-500/10 px-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            да / нет
          </div>
        )}
      </div>
      {/* colored rail */}
      <span
        className={cn("absolute left-0 top-2 h-[calc(100%-1rem)] w-1", terminator ? "hidden" : "rounded-full")}
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

function LinkNode({
  data,
  selected,
  color,
}: {
  data: MapNode["data"];
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
    if (link.url) {
      window.open(link.url, "_blank");
      return;
    }
    if (board) router.push(task ? `/board/${board.id}?task=${task.id}` : `/board/${board.id}`);
  };

  return (
    <div
      className={cn(
        "flex w-[220px] items-center gap-2.5 rounded-xl border bg-surface px-3 py-2.5 shadow-sm transition",
        selected ? "ring-2 ring-brand border-transparent" : "border-border hover:shadow-md",
      )}
      onDoubleClick={open}
      title="Двойной клик — открыть"
    >
      <Handles color={color} />
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: withAlpha(color, 0.16), color }}
      >
        {missing ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <ExternalLink className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-fg">{title}</div>
        <div className="truncate text-xs text-muted">
          {missing ? "источник удалён" : subtitle}
        </div>
      </div>
    </div>
  );
}

export const BulutNode = memo(BulutNodeInner);

export const nodeTypes = { bulut: BulutNode };
