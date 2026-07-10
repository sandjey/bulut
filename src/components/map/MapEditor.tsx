"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  MarkerType,
  type Connection,
  type Viewport,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Plus,
  Maximize,
  Trash2,
  Lock,
  Pencil,
  X,
  Link2,
} from "lucide-react";
import { useMaps } from "@/lib/maps";
import { useCan } from "@/lib/access";
import { useStore } from "@/lib/store";
import { nodeTypes } from "./BulutNode";
import {
  NODE_KINDS,
  NODE_KIND_META,
  type MapNode,
  type MapEdge,
  type MapNodeKind,
  type ProjectMap,
} from "@/lib/map-types";
import { BOARD_COLORS } from "@/lib/types";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const edgeDefaults = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  type: "default" as const,
};

export function MapEditor({ map }: { map: ProjectMap }) {
  return (
    <ReactFlowProvider>
      <EditorInner key={map.id} map={map} />
    </ReactFlowProvider>
  );
}

function EditorInner({ map }: { map: ProjectMap }) {
  const { renameMap, setMapColor, saveGraph } = useMaps();
  const can = useCan();
  const canEdit = can("map.edit");

  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(map.graph.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<MapEdge>(map.graph.edges ?? []);
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const [selEdgeId, setSelEdgeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(map.name);

  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const vpRef = useRef<Viewport>(map.graph.viewport ?? { x: 0, y: 0, zoom: 1 });
  const first = useRef(true);

  // Автосейв графа при изменениях (стор дебаунсит запись в БД)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!canEdit) return;
    // не сохраняем временные поля выделения/перетаскивания
    const cleanNodes = nodes.map(({ selected, dragging, ...n }) => n) as MapNode[];
    const cleanEdges = edges.map(({ selected, ...e }) => e) as MapEdge[];
    saveGraph(map.id, { nodes: cleanNodes, edges: cleanEdges, viewport: vpRef.current });
  }, [nodes, edges, canEdit, map.id, saveGraph]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (!canEdit) return;
      setEdges((eds) => addEdge({ ...c, ...edgeDefaults, id: uuid() }, eds));
    },
    [canEdit, setEdges],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelNodeId(params.nodes[0]?.id ?? null);
    setSelEdgeId(params.edges[0]?.id ?? null);
  }, []);

  const addNode = useCallback(
    (kind: MapNodeKind) => {
      if (!canEdit) return;
      const meta = NODE_KIND_META[kind];
      const rect = wrapper.current?.getBoundingClientRect();
      const center = rect
        ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 200, y: 160 };
      const id = uuid();
      const node: MapNode = {
        id,
        type: "bulut",
        position: { x: center.x - 90 + Math.random() * 40, y: center.y - 30 + Math.random() * 40 },
        data: {
          label: kind === "note" ? "" : meta.label,
          kind,
          color: meta.color,
        },
        ...(kind === "group" ? { style: { width: 300, height: 200 }, zIndex: -1 } : {}),
      };
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat({ ...node, selected: true }));
      setSelNodeId(id);
    },
    [canEdit, rf, setNodes],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Partial<MapNode["data"]>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelNodeId(null);
    },
    [setNodes, setEdges],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== id));
      setSelEdgeId(null);
    },
    [setEdges],
  );

  const commitName = () => {
    if (nameDraft.trim() && nameDraft.trim() !== map.name) renameMap(map.id, nameDraft.trim());
    setEditingName(false);
  };

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selNodeId) ?? null, [nodes, selNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selEdgeId) ?? null, [edges, selEdgeId]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface/80 px-3 py-2 backdrop-blur">
        <Link href="/maps" className="btn-ghost p-1.5" title="К картам">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: map.color }} />
        {editingName && canEdit ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setEditingName(false);
            }}
            className="input py-1 text-base font-bold"
          />
        ) : (
          <button
            onClick={() => {
              if (!canEdit) return;
              setNameDraft(map.name);
              setEditingName(true);
            }}
            className="group flex items-center gap-1.5"
          >
            <h1 className="text-base font-bold">{map.name}</h1>
            {canEdit && (
              <Pencil className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
            )}
          </button>
        )}

        {canEdit && (
          <div className="ml-1 hidden items-center gap-1 sm:flex">
            {BOARD_COLORS.slice(0, 6).map((c) => (
              <button
                key={c}
                onClick={() => setMapColor(map.id, c)}
                className="h-3.5 w-3.5 rounded-full transition hover:scale-125"
                style={{
                  backgroundColor: c,
                  outline: map.color === c ? `2px solid ${c}` : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!canEdit && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Lock className="h-3.5 w-3.5" /> Только просмотр
            </span>
          )}
          <button className="btn-outline" onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}>
            <Maximize className="h-4 w-4" /> <span className="hidden sm:inline">Показать всё</span>
          </button>
        </div>
      </div>

      {/* Canvas + panels */}
      <div className="relative flex min-h-0 flex-1">
        {/* Palette */}
        {canEdit && (
          <div className="absolute left-3 top-3 z-10 w-[168px] rounded-2xl border border-border bg-surface/90 p-2 shadow-md backdrop-blur">
            <div className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
              Добавить узел
            </div>
            <div className="space-y-1">
              {NODE_KINDS.map((k) => (
                <button
                  key={k.kind}
                  onClick={() => addNode(k.kind)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-fg transition hover:bg-surface-2"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: k.color }}
                  />
                  <span className="truncate">{k.label}</span>
                  <Plus className="ml-auto h-3.5 w-3.5 text-faint" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={wrapper} className="h-full w-full">
          <ReactFlow
            className="bulut-flow"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onMoveEnd={(_, vp) => {
              vpRef.current = vp;
            }}
            defaultViewport={map.graph.viewport}
            fitView={!map.graph.viewport}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
            proOptions={{ hideAttribution: false }}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} color="rgb(var(--border-strong))" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.data as MapNode["data"])?.color ?? "#6366f1"}
              maskColor="rgb(var(--bg) / 0.6)"
            />
          </ReactFlow>
        </div>

        {/* Inspector */}
        {canEdit && selectedNode && (
          <NodeInspector
            key={selectedNode.id}
            node={selectedNode}
            onChange={(patch) => updateNodeData(selectedNode.id, patch)}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setSelNodeId(null)}
          />
        )}
        {canEdit && !selectedNode && selectedEdge && (
          <EdgeInspector
            key={selectedEdge.id}
            edge={selectedEdge}
            onLabel={(label) =>
              setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? { ...e, label } : e)))
            }
            onAnimated={(animated) =>
              setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? { ...e, animated } : e)))
            }
            onDelete={() => deleteEdge(selectedEdge.id)}
            onClose={() => setSelEdgeId(null)}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------- Node inspector ---------------- */

function NodeInspector({
  node,
  onChange,
  onDelete,
  onClose,
}: {
  node: MapNode;
  onChange: (patch: Partial<MapNode["data"]>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const data = node.data;
  const isLink = data.kind === "link";
  return (
    <div className="absolute right-3 top-3 z-10 w-[264px] rounded-2xl border border-border bg-surface/95 p-3 shadow-md backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Свойства узла</span>
        <button onClick={onClose} className="rounded p-1 text-muted hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="label">Заголовок</label>
      <input
        className="input"
        value={data.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Название узла"
      />

      <label className="label mt-3">Описание</label>
      <textarea
        className="input min-h-[64px] resize-y"
        value={data.description ?? ""}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Детали…"
      />

      <label className="label mt-3">Цвет</label>
      <div className="flex flex-wrap gap-1.5">
        {BOARD_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange({ color: c })}
            className="h-5 w-5 rounded-full transition hover:scale-110"
            style={{
              backgroundColor: c,
              outline: data.color === c ? `2px solid ${c}` : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </div>

      {isLink && <LinkPicker data={data} onChange={onChange} />}

      <button
        onClick={onDelete}
        className="btn-ghost mt-4 w-full justify-center text-red-500 hover:bg-red-500/10"
      >
        <Trash2 className="h-4 w-4" /> Удалить узел
      </button>
    </div>
  );
}

function LinkPicker({
  data,
  onChange,
}: {
  data: MapNode["data"];
  onChange: (patch: Partial<MapNode["data"]>) => void;
}) {
  const { boards, tasks } = useStore();
  const link = data.link ?? {};
  const boardTasks = link.boardId ? tasks.filter((t) => t.boardId === link.boardId) : [];

  return (
    <div className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/[0.06] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400">
        <Link2 className="h-3.5 w-3.5" /> Привязка
      </div>
      <label className="label">Доска</label>
      <select
        className="input"
        value={link.boardId ?? ""}
        onChange={(e) => onChange({ link: { boardId: e.target.value || undefined, taskId: undefined } })}
      >
        <option value="">— не выбрана —</option>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      {link.boardId && (
        <>
          <label className="label mt-2">Задача (необязательно)</label>
          <select
            className="input"
            value={link.taskId ?? ""}
            onChange={(e) => onChange({ link: { ...link, taskId: e.target.value || undefined } })}
          >
            <option value="">— вся доска —</option>
            {boardTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

/* ---------------- Edge inspector ---------------- */

function EdgeInspector({
  edge,
  onLabel,
  onAnimated,
  onDelete,
  onClose,
}: {
  edge: MapEdge;
  onLabel: (v: string) => void;
  onAnimated: (v: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-10 w-[240px] rounded-2xl border border-border bg-surface/95 p-3 shadow-md backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Свойства связи</span>
        <button onClick={onClose} className="rounded p-1 text-muted hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>
      <label className="label">Подпись</label>
      <input
        className="input"
        value={typeof edge.label === "string" ? edge.label : ""}
        onChange={(e) => onLabel(e.target.value)}
        placeholder="напр. «да» / «нет»"
      />
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!edge.animated}
          onChange={(e) => onAnimated(e.target.checked)}
        />
        Анимация потока
      </label>
      <button
        onClick={onDelete}
        className="btn-ghost mt-4 w-full justify-center text-red-500 hover:bg-red-500/10"
      >
        <Trash2 className="h-4 w-4" /> Удалить связь
      </button>
    </div>
  );
}
