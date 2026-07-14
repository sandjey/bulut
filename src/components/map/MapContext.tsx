"use client";

import { createContext, useContext, useMemo } from "react";
import { statsFromIndex, buildStatsIndex, type StatusOverride, type NodeStats, type StatsIndex } from "@/lib/map-stats";

export type MapFilter = "all" | "bug" | "fixed" | "work" | "empty" | "ok";

const EMPTY_INDEX = buildStatsIndex([], [], null);

/** Контекст текущей карты — mapId + фильтр + предрасчитанный индекс статусов. */
export const MapContext = createContext<{ mapId: string | null; filter: MapFilter; index: StatsIndex }>({
  mapId: null,
  filter: "all",
  index: EMPTY_INDEX,
});

export function useMapId(): string | null {
  return useContext(MapContext).mapId;
}

export function useMapFilter(): MapFilter {
  return useContext(MapContext).filter;
}

/** Статистика узла — из общего индекса (быстро, без пересчёта всех задач на каждый узел). */
export function useNodeStats(nodeId: string, override?: StatusOverride): NodeStats {
  const { index } = useContext(MapContext);
  return useMemo(() => statsFromIndex(index, nodeId, override), [index, nodeId, override]);
}
