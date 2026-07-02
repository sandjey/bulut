import { ReturnEvent } from "./types";
import { formatDuration } from "./date";

/** Возвраты, сгруппированные по этапу, с которого вернули: этап → счётчик + суммарное время. */
export function returnsByStage(
  returns: ReturnEvent[] | undefined
): { stage: string; count: number; seconds: number }[] {
  const map = new Map<string, { count: number; seconds: number }>();
  (returns ?? []).forEach((r) => {
    const cur = map.get(r.from) ?? { count: 0, seconds: 0 };
    cur.count += 1;
    cur.seconds += r.seconds || 0;
    map.set(r.from, cur);
  });
  return [...map.entries()].map(([stage, v]) => ({ stage, ...v }));
}

/** Краткая сводка: «На проверке ×2 (1 ч 30 мин); Готов к тестированию ×1 (20 мин)». */
export function returnsSummary(returns: ReturnEvent[] | undefined): string {
  const groups = returnsByStage(returns);
  if (groups.length === 0) return "";
  return groups
    .map(
      (g) => `${g.stage} ×${g.count}${g.seconds > 0 ? ` (${formatDuration(g.seconds)})` : ""}`
    )
    .join("; ");
}
