import { Board, Task } from "./types";

export interface StageTime {
  name: string;
  seconds: number;
  current: boolean;
}

/**
 * Per-stage durations for a task: stored accumulated time plus the live time
 * currently being spent in the active column (unless the task is done).
 */
export function stageTimeList(task: Task, board: Board): StageTime[] {
  const map: Record<string, number> = { ...(task.stageTimes ?? {}) };
  const curName = board.columns.find((c) => c.id === task.columnId)?.name;
  if (curName) {
    const enteredMs = Date.parse(task.stageEnteredAt ?? task.createdAt);
    const live =
      task.status === "done" ? 0 : Math.max(0, Math.floor((Date.now() - enteredMs) / 1000));
    map[curName] = (map[curName] ?? 0) + live;
  }
  return board.columns
    .map((c) => ({ name: c.name, seconds: map[c.name] ?? 0, current: c.id === task.columnId }))
    .filter((s) => s.seconds > 0 || s.current);
}

/** Accumulate the time spent in the task's CURRENT column into a new stageTimes map. */
export function accrueStageTimes(
  task: Task,
  board: Board | undefined,
  nowIso: string
): Record<string, number> {
  const prevName = board?.columns.find((c) => c.id === task.columnId)?.name ?? "—";
  const enteredMs = Date.parse(task.stageEnteredAt ?? task.createdAt);
  const elapsed = Math.max(0, Math.floor((Date.parse(nowIso) - enteredMs) / 1000));
  const prev = task.stageTimes ?? {};
  return { ...prev, [prevName]: (prev[prevName] ?? 0) + elapsed };
}
