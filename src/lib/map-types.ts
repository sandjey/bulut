import type { Node, Edge, Viewport } from "@xyflow/react";

/** Типы узлов карты (палитра конструктора). */
export type MapNodeKind =
  | "terminator" // начало / конец
  | "screen" // экран / страница
  | "action" // действие
  | "decision" // решение (ромб)
  | "process" // процесс / шаг
  | "note" // заметка / стикер
  | "group" // контейнер / зона
  | "link"; // ссылка на доску / задачу

export interface MapNodeLink {
  boardId?: string;
  taskId?: string;
  url?: string;
}

/** Данные внутри узла (React Flow требует Record<string, unknown>). */
export interface MapNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  color?: string; // акцентный цвет узла (hex)
  kind: MapNodeKind;
  link?: MapNodeLink;
  /** Ручной override статуса-светофора (undefined = авто из задач). */
  statusOverride?: "ok" | "wip" | "bug";
}

export type MapNode = Node<MapNodeData>;
export type MapEdge = Edge;

export interface MapGraph {
  nodes: MapNode[];
  edges: MapEdge[];
  viewport?: Viewport;
}

export interface ProjectMap {
  id: string;
  name: string;
  description: string;
  color: string;
  graph: MapGraph;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // ISO — в Корзине, если задано
}

export const EMPTY_GRAPH: MapGraph = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };

/** Метаданные типов узлов для палитры/инспектора. */
export interface NodeKindMeta {
  kind: MapNodeKind;
  label: string;
  color: string;
  hint: string;
}

export const NODE_KINDS: NodeKindMeta[] = [
  { kind: "terminator", label: "Начало / конец", color: "#10b981", hint: "Старт или финал флоу" },
  { kind: "screen", label: "Экран", color: "#6366f1", hint: "Экран или страница" },
  { kind: "action", label: "Действие", color: "#0ea5e9", hint: "Действие пользователя/системы" },
  { kind: "decision", label: "Решение", color: "#f59e0b", hint: "Ветвление (да / нет)" },
  { kind: "process", label: "Процесс", color: "#8b5cf6", hint: "Шаг процесса" },
  { kind: "link", label: "Ссылка на доску/задачу", color: "#14b8a6", hint: "Связь с реальной работой" },
  { kind: "note", label: "Заметка", color: "#eab308", hint: "Комментарий на холсте" },
  { kind: "group", label: "Группа", color: "#64748b", hint: "Рамка-зона (этап)" },
];

export const NODE_KIND_META: Record<MapNodeKind, NodeKindMeta> = Object.fromEntries(
  NODE_KINDS.map((k) => [k.kind, k]),
) as Record<MapNodeKind, NodeKindMeta>;

/** Размеры узлов по умолчанию (узлы можно свободно ресайзить). */
export const NODE_SIZE: Record<MapNodeKind, { w: number; h: number }> = {
  terminator: { w: 190, h: 58 },
  screen: { w: 212, h: 76 },
  action: { w: 212, h: 76 },
  decision: { w: 212, h: 84 },
  process: { w: 212, h: 76 },
  link: { w: 230, h: 78 },
  note: { w: 200, h: 112 },
  group: { w: 330, h: 220 },
};

