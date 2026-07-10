import type { Task, Board } from "./types";

/** Статус узла карты (светофор). */
export type NodeStatus = "empty" | "ok" | "wip" | "bug";
/** Ручной override (undefined = авто). */
export type StatusOverride = "ok" | "wip" | "bug";

export interface StageCount {
  name: string;
  count: number;
}

export interface NodeStats {
  total: number;
  active: number;
  done: number;
  bugsOpen: number;
  returns: number;
  byStage: StageCount[];
  auto: NodeStatus; // вычисленный статус
  status: NodeStatus; // эффективный (override или auto)
  overridden: boolean;
  tasks: Task[]; // привязанные задачи
}

export const STATUS_META: Record<NodeStatus, { color: string; label: string }> = {
  empty: { color: "#6b7280", label: "Нет задач" },
  ok: { color: "#10b981", label: "Работает" },
  wip: { color: "#f59e0b", label: "В работе" },
  bug: { color: "#ef4444", label: "Баг" },
};

/**
 * Считает статус узла из привязанных задач. Полностью null-safe:
 * если карта/узел/поля пустые — вернёт «пусто», без падений.
 */
export function computeNodeStats(
  tasks: Task[],
  boards: Board[],
  mapId: string | null | undefined,
  nodeId: string | null | undefined,
  override?: StatusOverride,
): NodeStats {
  const linked =
    mapId && nodeId
      ? tasks.filter((t) => t.mapId === mapId && t.mapNodeId === nodeId)
      : [];

  const done = linked.filter((t) => t.status === "done");
  const active = linked.filter((t) => t.status !== "done");
  const bugsOpen = active.filter((t) => t.type === "bug").length;
  const returns = linked.reduce((s, t) => s + (t.returnCount ?? 0), 0);

  const colName = new Map<string, string>();
  for (const b of boards) for (const c of b.columns ?? []) colName.set(c.id, c.name);
  const stageMap = new Map<string, number>();
  for (const t of linked) {
    const name = colName.get(t.columnId) || "—";
    stageMap.set(name, (stageMap.get(name) ?? 0) + 1);
  }
  const byStage = Array.from(stageMap, ([name, count]) => ({ name, count }));

  let auto: NodeStatus;
  if (linked.length === 0) auto = "empty";
  else if (bugsOpen > 0) auto = "bug";
  else if (active.length > 0) auto = "wip";
  else auto = "ok";

  const status: NodeStatus = override ?? auto;

  return {
    total: linked.length,
    active: active.length,
    done: done.length,
    bugsOpen,
    returns,
    byStage,
    auto,
    status,
    overridden: !!override,
    tasks: linked,
  };
}
