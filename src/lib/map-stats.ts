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
 * Этап задачи в «зоне тестирования» (Готов к тестированию / На проверке и позже,
 * но НЕ «Готово»). По умолчанию доска: …, Готов к тестированию, На проверке, Готово —
 * «зона» начинается с третьей колонки с конца.
 */
function isInTestingZone(task: Task, boards: Board[]): boolean {
  const board = boards.find((b) => b.id === task.boardId);
  const cols = board?.columns ?? [];
  const idx = cols.findIndex((c) => c.id === task.columnId);
  if (idx < 0) return false;
  const readyIdx = cols.length - 3; // «Готов к тестированию»
  return readyIdx >= 1 && idx >= readyIdx;
}

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
  const activeBugs = active.filter((t) => t.type === "bug");
  // баг «исправлен, на проверке» — уже в зоне тестирования; иначе «в работе» (красный)
  const bugsFixed = activeBugs.filter((t) => isInTestingZone(t, boards)).length;
  const bugsOpen = activeBugs.length - bugsFixed;
  const returns = linked.reduce((s, t) => s + (t.returnCount ?? 0), 0);

  const colName = new Map<string, string>();
  for (const b of boards) for (const c of b.columns ?? []) colName.set(c.id, c.name);
  const stageMap = new Map<string, number>();
  for (const t of linked) {
    const name = colName.get(t.columnId) || "—";
    stageMap.set(name, (stageMap.get(name) ?? 0) + 1);
  }
  const byStage = Array.from(stageMap, ([name, count]) => ({ name, count }));

  // Приоритет: открытый баг (красный) → исправленный на проверке (синий) →
  // прочая работа (жёлтый) → всё готово/пусто (зелёный).
  let auto: NodeStatus;
  if (bugsOpen > 0) auto = "bug";
  else if (bugsFixed > 0) auto = "fixed";
  else if (active.length > 0) auto = "wip";
  else auto = "ok";

  const status: NodeStatus = override ?? auto;

  return {
    total: linked.length,
    active: active.length,
    done: done.length,
    bugsOpen,
    bugsFixed,
    returns,
    byStage,
    auto,
    status,
    overridden: !!override,
    isEmpty: linked.length === 0,
    tasks: linked,
  };
}
