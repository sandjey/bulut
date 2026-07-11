"use client";

import { createContext, useContext, useMemo } from "react";
import { useStore } from "@/lib/store";
import { computeNodeStats, type StatusOverride, type NodeStats } from "@/lib/map-stats";

export type MapFilter = "all" | "bug" | "fixed" | "work" | "empty" | "ok";

/** Контекст текущей карты — mapId для агрегации задач + активный фильтр подсветки. */
export const MapContext = createContext<{ mapId: string | null; filter: MapFilter }>({
  mapId: null,
  filter: "all",
});

export function useMapId(): string | null {
  return useContext(MapContext).mapId;
}

export function useMapFilter(): MapFilter {
  return useContext(MapContext).filter;
}

/** Статистика узла по привязанным задачам (реалтайм из стора). */
export function useNodeStats(nodeId: string, override?: StatusOverride): NodeStats {
  const mapId = useMapId();
  const { tasks, boards } = useStore();
  return useMemo(
    () => computeNodeStats(tasks, boards, mapId, nodeId, override),
    [tasks, boards, mapId, nodeId, override],
  );
}
