import type { Task, Board } from "./types";

/** Статус узла карты (светофор). По умолчанию зелёный «работает».
 *  fixed = баг исправлен и передан на тестирование/проверку (ещё не «Готово»). */
export type NodeStatus = "ok" | "wip" | "bug" | "fixed";
/** Ручной override (undefined = авто). Только 3 «ручных» цвета. */
export type StatusOverride = "ok" | "wip" | "bug";

export interface StageCount {
  name: string;
  count: number;
}

export interface NodeStats {
  total: number;
  active: number;
  done: number;
  bugsOpen: number; // баги в работе (ранние этапы) — «красные»
  bugsFixed: number; // баги исправлены, на тестировании/проверке — «синие»
  returns: number;
  byStage: StageCount[];
  auto: NodeStatus; // вычисленный статус
  status: NodeStatus; // эффективный (override или auto)
  overridden: boolean;
  isEmpty: boolean; // нет привязанных задач
  tasks: Task[]; // привязанные задачи
}

export const STATUS_META: Record<NodeStatus, { color: string; label: string }> = {
  ok: { color: "#10b981", label: "Работает" },
  wip: { color: "#f59e0b", label: "В работе" },
  bug: { color: "#ef4444", label: "Баг" },
  fixed: { color: "#3b82f6", label: "Исправлен · на проверке" },
};

/**
 * Индекс для быстрого расчёта статусов: строится ОДИН раз на (tasks, boards, mapId),
 * а не заново для каждого узла. На больших картах это убирает лаги.
 */
export interface StatsIndex {
  byNode: Map<string, Task[]>; // задачи узла по mapNodeId
  colName: Map<string, string>; // columnId → название этапа
  colZone: Map<string, boolean>; // columnId → в «зоне тестирования»
}

export function buildStatsIndex(tasks: Task[], boards: Board[], mapId: string | null | undefined): StatsIndex {
  const byNode = new Map<string, Task[]>();
  if (mapId) {
    for (const t of tasks) {
      if (t.mapId === mapId && t.mapNodeId) {
        const arr = byNode.get(t.mapNodeId);
        if (arr) arr.push(t);
        else byNode.set(t.mapNodeId, [t]);
      }
    }
  }
  const colName = new Map<string, string>();
  const colZone = new Map<string, boolean>();
  for (const b of boards) {
    const cols = b.columns ?? [];
    const readyIdx = cols.length - 3; // «Готов к тестированию» и позже
    cols.forEach((c, i) => {
      colName.set(c.id, c.name);
      colZone.set(c.id, readyIdx >= 1 && i >= readyIdx);
    });
  }
  return { byNode, colName, colZone };
}

const EMPTY_INDEX: StatsIndex = { byNode: new Map(), colName: new Map(), colZone: new Map() };

/** Расчёт статуса узла по готовому индексу — O(число задач узла). */
export function statsFromIndex(index: StatsIndex, nodeId: string | null | undefined, override?: StatusOverride): NodeStats {
  const linked = (nodeId && index.byNode.get(nodeId)) || [];

  let done = 0;
  let bugsFixed = 0;
  let bugsOpenActiveBugs = 0;
  let returns = 0;
  const stageMap = new Map<string, number>();
  for (const t of linked) {
    if (t.status === "done") done++;
    else if (t.type === "bug") {
      if (index.colZone.get(t.columnId)) bugsFixed++;
      else bugsOpenActiveBugs++;
    }
    returns += t.returnCount ?? 0;
    const name = index.colName.get(t.columnId) || "—";
    stageMap.set(name, (stageMap.get(name) ?? 0) + 1);
  }
  const active = linked.length - done;
  const bugsOpen = bugsOpenActiveBugs;
  const byStage = Array.from(stageMap, ([name, count]) => ({ name, count }));

  let auto: NodeStatus;
  if (bugsOpen > 0) auto = "bug";
  else if (bugsFixed > 0) auto = "fixed";
  else if (active > 0) auto = "wip";
  else auto = "ok";

  return {
    total: linked.length,
    active,
    done,
    bugsOpen,
    bugsFixed,
    returns,
    byStage,
    auto,
    status: override ?? auto,
    overridden: !!override,
    isEmpty: linked.length === 0,
    tasks: linked,
  };
}

/**
 * Считает статус узла из привязанных задач (совместимость: строит индекс сам).
 * Для множества узлов используйте buildStatsIndex + statsFromIndex.
 */
export function computeNodeStats(
  tasks: Task[],
  boards: Board[],
  mapId: string | null | undefined,
  nodeId: string | null | undefined,
  override?: StatusOverride,
): NodeStats {
  if (!mapId || !nodeId) return statsFromIndex(EMPTY_INDEX, null, override);
  return statsFromIndex(buildStatsIndex(tasks, boards, mapId), nodeId, override);
}
