"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth";
import { getSupabase } from "./supabase";
import * as db from "./db";
import { ProjectMap, MapGraph, EMPTY_GRAPH } from "./map-types";
import { BOARD_COLORS } from "./types";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface MapsContextValue {
  maps: ProjectMap[];
  ready: boolean;
  getMap: (id: string) => ProjectMap | undefined;
  createMap: (name?: string, color?: string) => ProjectMap;
  renameMap: (id: string, name: string) => void;
  setMapColor: (id: string, color: string) => void;
  deleteMap: (id: string) => void;
  /** Мгновенно обновляет граф локально и сохраняет в БД с задержкой (autosave). */
  saveGraph: (id: string, graph: MapGraph) => void;
}

const MapsContext = createContext<MapsContextValue | null>(null);

export function MapsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [maps, setMaps] = useState<ProjectMap[]>([]);
  const [ready, setReady] = useState(false);
  const mapsRef = useRef<ProjectMap[]>([]);
  const dirty = useRef<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const apply = useCallback((next: ProjectMap[]) => {
    mapsRef.current = next;
    setMaps(next);
  }, []);

  // Загрузка
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      apply([]);
      setReady(false);
      return;
    }
    setReady(false);
    db.fetchProjectMaps()
      .then((list) => {
        if (!cancelled) {
          apply(list);
          setReady(true);
        }
      })
      .catch((e) => {
        console.error("Не удалось загрузить карты", e);
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, apply]);

  // Realtime: обновляем список, но не затираем карту с несохранёнными правками
  useEffect(() => {
    if (!userId) return;
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel("bulut-maps")
      .on("postgres_changes", { event: "*", schema: "public", table: "project_maps" }, () => {
        db.fetchProjectMaps()
          .then((incoming) => {
            const prev = mapsRef.current;
            const merged = incoming.map((inc) =>
              dirty.current.has(inc.id) ? prev.find((p) => p.id === inc.id) ?? inc : inc,
            );
            apply(merged);
          })
          .catch(console.error);
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [userId, apply]);

  const persist = useCallback((p: Promise<unknown>) => {
    p.catch((e) => console.error("Ошибка синхронизации карты", e));
  }, []);

  const getMap = useCallback((id: string) => mapsRef.current.find((m) => m.id === id), []);

  const createMap = useCallback(
    (name?: string, color?: string): ProjectMap => {
      const now = new Date().toISOString();
      const map: ProjectMap = {
        id: uuid(),
        name: name?.trim() || "Новая карта",
        description: "",
        color: color || BOARD_COLORS[Math.floor(Math.random() * BOARD_COLORS.length)],
        graph: { ...EMPTY_GRAPH, nodes: [], edges: [] },
        createdAt: now,
        updatedAt: now,
      };
      apply([...mapsRef.current, map]);
      if (userId) {
        persist(
          db.insertProjectMap(
            { id: map.id, name: map.name, color: map.color, graph: map.graph },
            userId,
            mapsRef.current.length,
          ),
        );
      }
      return map;
    },
    [apply, persist, userId],
  );

  const renameMap = useCallback(
    (id: string, name: string) => {
      apply(mapsRef.current.map((m) => (m.id === id ? { ...m, name } : m)));
      persist(db.updateProjectMapRow(id, { name }));
    },
    [apply, persist],
  );

  const setMapColor = useCallback(
    (id: string, color: string) => {
      apply(mapsRef.current.map((m) => (m.id === id ? { ...m, color } : m)));
      persist(db.updateProjectMapRow(id, { color }));
    },
    [apply, persist],
  );

  const deleteMap = useCallback(
    (id: string) => {
      apply(mapsRef.current.filter((m) => m.id !== id));
      persist(db.deleteProjectMapRow(id));
    },
    [apply, persist],
  );

  const saveGraph = useCallback(
    (id: string, graph: MapGraph) => {
      // мгновенно локально
      apply(mapsRef.current.map((m) => (m.id === id ? { ...m, graph } : m)));
      dirty.current.add(id);
      // дебаунс записи в БД
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        timers.current.delete(id);
        persist(
          db.updateProjectMapRow(id, { graph }).then(() => {
            dirty.current.delete(id);
          }),
        );
      }, 700);
      timers.current.set(id, t);
    },
    [apply, persist],
  );

  const value = useMemo<MapsContextValue>(
    () => ({ maps, ready, getMap, createMap, renameMap, setMapColor, deleteMap, saveGraph }),
    [maps, ready, getMap, createMap, renameMap, setMapColor, deleteMap, saveGraph],
  );

  return <MapsContext.Provider value={value}>{children}</MapsContext.Provider>;
}

export function useMaps(): MapsContextValue {
  const ctx = useContext(MapsContext);
  if (!ctx) throw new Error("useMaps must be used within MapsProvider");
  return ctx;
}
