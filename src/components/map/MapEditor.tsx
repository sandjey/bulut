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
  ConnectionLineType,
  ConnectionMode,
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
  Undo2,
  Redo2,
  Wand2,
  ImageDown,
  FileJson,
  Upload,
  Copy,
} from "lucide-react";
import { useMaps } from "@/lib/maps";
import { useCan } from "@/lib/access";
import { useStore } from "@/lib/store";
import { nodeTypes } from "./BulutNode";
import { autoLayout, exportPng, exportJson, parseImport } from "./mapUtils";
import {
  NODE_KINDS,
  NODE_KIND_META,
  NODE_SIZE,
  type MapNode,
  type MapEdge,
  type MapNodeKind,
  type ProjectMap,
} from "@/lib/map-types";
import { BOARD_COLORS } from "@/lib/types";
import { cn } from "@/lib/utils";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const DND_KEY = "application/bulut-kind";

const edgeDefaults = {
  type: "default" as const, // плавная bezier-кривая — ровно и красиво
  markerEnd: { type: MarkerType.ArrowClosed, width: 22, height: 22 },
  labelBgPadding: [7, 4] as [number, number],
  labelBgBorderRadius: 8,
  labelBgStyle: { fill: "#16161b", fillOpacity: 0.96, stroke: "#2a2a34", strokeWidth: 1 },
  labelStyle: { fill: "#f0f1f5", fontWeight: 700, fontSize: 11 },
};

/** Нормализует размер узла в top-level width/height (их обновляет NodeResizer). */
function withSize(n: MapNode): MapNode {
  const k = (n.data?.kind ?? "action") as MapNodeKind;
  const sw = typeof n.style?.width === "number" ? n.style.width : undefined;
  const sh = typeof n.style?.height === "number" ? n.style.height : undefined;
  const w = n.width ?? sw ?? n.measured?.width ?? NODE_SIZE[k].w;
  const h = n.height ?? sh ?? n.measured?.height ?? NODE_SIZE[k].h;
  const style = { ...n.style };
  delete style.width;
  delete style.height;
  return { ...n, width: w, height: h, style };
}

interface Snap {
  nodes: MapNode[];
  edges: MapEdge[];
}

export function MapEditor({ map }: { map: ProjectMap }) {
  return (
    <ReactFlowProvider>
      <EditorInner key={map.id} map={map} />
    </ReactFlowProvider>
  );
}

function EditorInner({ map }: { map: ProjectMap }) {
  const { renameMap, setMapColor, saveGraph } = useMaps();
  const canEdit = useCan()("map.edit");

  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>((map.graph.nodes ?? []).map(withSize));
  const [edges, setEdges, onEdgesChange] = useEdgesState<MapEdge>(map.graph.edges ?? []);
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const [selEdgeId, setSelEdgeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(map.name);
  const [busy, setBusy] = useState(false);

  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const vpRef = useRef<Viewport>(map.graph.viewport ?? { x: 0, y: 0, zoom: 1 });
  const first = useRef(true);

  // refs для истории/хоткеев
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => void (nodesRef.current = nodes), [nodes]);
  useEffect(() => void (edgesRef.current = edges), [edges]);

  // ── История (undo/redo) ──
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const [, forceHist] = useState(0);
  const bumpHist = () => forceHist((t) => t + 1);

  const snapshot = useCallback(() => {
    past.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    if (past.current.length > 60) past.current.shift();
    future.current = [];
    bumpHist();
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    setNodes(prev.nodes);
    setEdges(prev.edges);
    bumpHist();
  }, [setNodes, setEdges]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    setNodes(next.nodes);
    setEdges(next.edges);
    bumpHist();
  }, [setNodes, setEdges]);

  // Автосейв
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!canEdit) return;
    const cleanNodes = nodes.map(({ selected, dragging, ...n }) => n) as MapNode[];
    const cleanEdges = edges.map(({ selected, ...e }) => e) as MapEdge[];
    saveGraph(map.id, { nodes: cleanNodes, edges: cleanEdges, viewport: vpRef.current });
  }, [nodes, edges, canEdit, map.id, saveGraph]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (!canEdit) return;
      snapshot();
      setEdges((eds) => addEdge({ ...c, ...edgeDefaults, id: uid() }, eds));
    },
    [canEdit, setEdges, snapshot],
  );

  const onSelectionChange = useCallback((p: OnSelectionChangeParams) => {
    setSelNodeId(p.nodes[0]?.id ?? null);
    setSelEdgeId(p.edges[0]?.id ?? null);
  }, []);

  const makeNode = (kind: MapNodeKind, pos: { x: number; y: number }): MapNode => {
    const meta = NODE_KIND_META[kind];
    const sz = NODE_SIZE[kind];
    return {
      id: uid(),
      type: "bulut",
      position: pos,
      data: { label: kind === "note" ? "" : meta.label, kind, color: meta.color },
      width: sz.w,
      height: sz.h,
      ...(kind === "group" ? { zIndex: -1 } : {}),
    };
  };

  const addNode = useCallback(
    (kind: MapNodeKind, screenPos?: { x: number; y: number }) => {
      if (!canEdit) return;
      const rect = wrapper.current?.getBoundingClientRect();
      const at = screenPos
        ? rf.screenToFlowPosition(screenPos)
        : rect
          ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          : { x: 200, y: 160 };
      const node = makeNode(kind, { x: at.x - 90, y: at.y - 30 });
      snapshot();
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...node, selected: true }] as MapNode[]);
      setSelNodeId(node.id);
      setSelEdgeId(null);
    },
    [canEdit, rf, setNodes, snapshot],
  );

  // Drag & drop из палитры
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(DND_KEY) as MapNodeKind;
      if (kind) addNode(kind, { x: e.clientX, y: e.clientY });
    },
    [addNode],
  );

  const updateNodeData = useCallback(
    (id: string, p: Partial<MapNode["data"]>) => {
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)));
    },
    [setNodes],
  );
  const deleteNode = useCallback(
    (id: string) => {
      snapshot();
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      setSelNodeId(null);
    },
    [setNodes, setEdges, snapshot],
  );
  const duplicateNode = useCallback(
    (id: string) => {
      const n = nodesRef.current.find((x) => x.id === id);
      if (!n) return;
      snapshot();
      const copy: MapNode = { ...n, id: uid(), position: { x: n.position.x + 28, y: n.position.y + 28 }, selected: true };
      setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), copy] as MapNode[]);
      setSelNodeId(copy.id);
    },
    [setNodes, snapshot],
  );

  const patchEdge = useCallback(
    (id: string, p: Partial<MapEdge>) => setEdges((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e))),
    [setEdges],
  );
  const deleteEdge = useCallback(
    (id: string) => {
      snapshot();
      setEdges((es) => es.filter((e) => e.id !== id));
      setSelEdgeId(null);
    },
    [setEdges, snapshot],
  );

  const deleteSelected = useCallback(() => {
    const selN = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
    const selE = edgesRef.current.filter((e) => e.selected).map((e) => e.id);
    if (!selN.length && !selE.length) return;
    snapshot();
    if (selN.length) {
      setNodes((ns) => ns.filter((n) => !selN.includes(n.id)));
      setEdges((es) => es.filter((e) => !selN.includes(e.source) && !selN.includes(e.target)));
    }
    if (selE.length) setEdges((es) => es.filter((e) => !selE.includes(e.id)));
    setSelNodeId(null);
    setSelEdgeId(null);
  }, [setNodes, setEdges, snapshot]);

  const doLayout = useCallback(
    (dir: "LR" | "TB") => {
      snapshot();
      setNodes((ns) => autoLayout(ns, edgesRef.current, dir));
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 60);
    },
    [rf, setNodes, snapshot],
  );

  const doImport = useCallback(
    (text: string) => {
      const parsed = parseImport(text);
      if (!parsed) return alert("Не удалось прочитать файл карты");
      snapshot();
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setTimeout(() => rf.fitView({ padding: 0.2 }), 60);
    },
    [rf, setNodes, setEdges, snapshot],
  );

  // Хоткеи
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selNodeId) duplicateNode(selNodeId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, undo, redo, duplicateNode, deleteSelected, selNodeId]);

  const commitName = () => {
    if (nameDraft.trim() && nameDraft.trim() !== map.name) renameMap(map.id, nameDraft.trim());
    setEditingName(false);
  };

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selNodeId) ?? null, [nodes, selNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selEdgeId) ?? null, [edges, selEdgeId]);
  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  const exportPngNow = async () => {
    setBusy(true);
    try {
      await exportPng(nodesRef.current, map.name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulut-map-root flex h-full flex-col bg-bg">
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
            {canEdit && <Pencil className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />}
          </button>
        )}

        {canEdit && (
          <div className="ml-1 hidden items-center gap-1 sm:flex">
            {BOARD_COLORS.slice(0, 6).map((c) => (
              <button
                key={c}
                onClick={() => setMapColor(map.id, c)}
                className="h-3.5 w-3.5 rounded-full transition hover:scale-125"
                style={{ backgroundColor: c, outline: map.color === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
              />
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {canEdit && (
            <>
              <ToolbarBtn onClick={undo} disabled={!canUndo} title="Отменить (Ctrl+Z)"><Undo2 className="h-4 w-4" /></ToolbarBtn>
              <ToolbarBtn onClick={redo} disabled={!canRedo} title="Повторить (Ctrl+Shift+Z)"><Redo2 className="h-4 w-4" /></ToolbarBtn>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn onClick={() => doLayout("LR")} title="Автораскладка →"><Wand2 className="h-4 w-4" /></ToolbarBtn>
              <ToolbarBtn onClick={exportPngNow} disabled={busy} title="Экспорт PNG"><ImageDown className="h-4 w-4" /></ToolbarBtn>
              <ToolbarBtn onClick={() => exportJson(nodesRef.current, edgesRef.current, map.name)} title="Экспорт JSON"><FileJson className="h-4 w-4" /></ToolbarBtn>
              <ToolbarBtn onClick={() => fileRef.current?.click()} title="Импорт JSON"><Upload className="h-4 w-4" /></ToolbarBtn>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) f.text().then(doImport);
                  e.target.value = "";
                }}
              />
              <span className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          {!canEdit && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Lock className="h-3.5 w-3.5" /> Только просмотр
            </span>
          )}
          <ToolbarBtn onClick={() => rf.fitView({ padding: 0.2, duration: 300 })} title="Показать всё"><Maximize className="h-4 w-4" /></ToolbarBtn>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex min-h-0 flex-1">
        {canEdit && <Palette onAdd={addNode} />}

        <div ref={wrapper} className="h-full w-full" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            className="bulut-flow"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeDragStart={snapshot}
            onMoveEnd={(_, vp) => (vpRef.current = vp)}
            defaultViewport={map.graph.viewport}
            fitView={!map.graph.viewport}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            connectionMode={ConnectionMode.Loose}
            connectionLineType={ConnectionLineType.SmoothStep}
            defaultEdgeOptions={edgeDefaults}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: false }}
            minZoom={0.2}
            maxZoom={2}
          >
            {/* Сетка: крупные линии + мелкие точки — как дизайн-канвас */}
            <Background id="grid" variant={BackgroundVariant.Lines} gap={100} lineWidth={1} color="rgb(var(--border) / 0.55)" />
            <Background id="dots" variant={BackgroundVariant.Dots} gap={20} size={1} color="rgb(var(--border) / 0.9)" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.data as MapNode["data"])?.color ?? "#6366f1"}
              maskColor="rgb(var(--bg) / 0.6)"
            />
          </ReactFlow>
        </div>

        {canEdit && selectedNode && (
          <NodeInspector
            key={selectedNode.id}
            node={selectedNode}
            onChange={(p) => updateNodeData(selectedNode.id, p)}
            onDuplicate={() => duplicateNode(selectedNode.id)}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setSelNodeId(null)}
          />
        )}
        {canEdit && !selectedNode && selectedEdge && (
          <EdgeInspector
            key={selectedEdge.id}
            edge={selectedEdge}
            onChange={(p) => patchEdge(selectedEdge.id, p)}
            onDelete={() => deleteEdge(selectedEdge.id)}
            onClose={() => setSelEdgeId(null)}
          />
        )}
      </div>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* ---------------- Палитра (клик + drag&drop) ---------------- */

function Palette({ onAdd }: { onAdd: (k: MapNodeKind) => void }) {
  return (
    <div className="absolute left-3 top-3 z-10 w-[176px] rounded-2xl border border-border bg-surface/90 p-2 shadow-md backdrop-blur">
      <div className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
        Добавить узел
      </div>
      <div className="space-y-1">
        {NODE_KINDS.map((k) => (
          <button
            key={k.kind}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_KEY, k.kind);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onAdd(k.kind)}
            className="flex w-full cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-fg transition hover:bg-surface-2 active:cursor-grabbing"
            title="Клик — добавить, или перетащи на холст"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: k.color }} />
            <span className="truncate">{k.label}</span>
            <Plus className="ml-auto h-3.5 w-3.5 text-faint" />
          </button>
        ))}
      </div>
      <p className="mt-2 px-1.5 text-[10px] leading-tight text-faint">
        Перетащи на холст или кликни. Соединяй узлы за точки на любой стороне.
      </p>
    </div>
  );
}

/* ---------------- Инспектор узла ---------------- */

function NodeInspector({
  node,
  onChange,
  onDuplicate,
  onDelete,
  onClose,
}: {
  node: MapNode;
  onChange: (p: Partial<MapNode["data"]>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const data = node.data;
  const isLink = data.kind === "link";
  return (
    <div className="absolute right-3 top-3 z-10 w-[270px] rounded-2xl border border-border bg-surface/95 p-3 shadow-md backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Узел</span>
        <button onClick={onClose} className="rounded p-1 text-muted hover:text-fg"><X className="h-4 w-4" /></button>
      </div>

      <label className="label">Заголовок</label>
      <input className="input" value={data.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Название" />

      <label className="label mt-3">Описание</label>
      <textarea className="input min-h-[56px] resize-y" value={data.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} placeholder="Детали…" />

      <label className="label mt-3">Тип узла</label>
      <div className="grid grid-cols-4 gap-1">
        {NODE_KINDS.map((k) => (
          <button
            key={k.kind}
            onClick={() => onChange({ kind: k.kind })}
            title={k.label}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[9px] leading-tight transition",
              data.kind === k.kind ? "border-brand bg-brand/10 text-fg" : "border-border text-muted hover:bg-surface-2",
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: k.color }} />
            <span className="w-full truncate text-center">{k.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      <label className="label mt-3">Цвет</label>
      <div className="flex flex-wrap gap-1.5">
        {BOARD_COLORS.map((c) => (
          <button key={c} onClick={() => onChange({ color: c })} className="h-5 w-5 rounded-full transition hover:scale-110" style={{ backgroundColor: c, outline: data.color === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />
        ))}
      </div>

      {isLink && <LinkPicker data={data} onChange={onChange} />}

      <div className="mt-4 flex gap-2">
        <button onClick={onDuplicate} className="btn-outline flex-1 justify-center"><Copy className="h-4 w-4" /> Дубль</button>
        <button onClick={onDelete} className="btn-ghost flex-1 justify-center text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /> Удалить</button>
      </div>
    </div>
  );
}

function LinkPicker({ data, onChange }: { data: MapNode["data"]; onChange: (p: Partial<MapNode["data"]>) => void }) {
  const { boards, tasks } = useStore();
  const link = data.link ?? {};
  const boardTasks = link.boardId ? tasks.filter((t) => t.boardId === link.boardId) : [];
  return (
    <div className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/[0.06] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400"><Link2 className="h-3.5 w-3.5" /> Привязка</div>
      <label className="label">Доска</label>
      <select className="input" value={link.boardId ?? ""} onChange={(e) => onChange({ link: { boardId: e.target.value || undefined, taskId: undefined } })}>
        <option value="">— не выбрана —</option>
        {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {link.boardId && (
        <>
          <label className="label mt-2">Задача (необязательно)</label>
          <select className="input" value={link.taskId ?? ""} onChange={(e) => onChange({ link: { ...link, taskId: e.target.value || undefined } })}>
            <option value="">— вся доска —</option>
            {boardTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </>
      )}
    </div>
  );
}

/* ---------------- Инспектор стрелки ---------------- */

const EDGE_TYPES: { key: string; label: string }[] = [
  { key: "smoothstep", label: "Плавная" },
  { key: "default", label: "Кривая" },
  { key: "straight", label: "Прямая" },
  { key: "step", label: "Ступень" },
];

function EdgeInspector({
  edge,
  onChange,
  onDelete,
  onClose,
}: {
  edge: MapEdge;
  onChange: (p: Partial<MapEdge>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const label = typeof edge.label === "string" ? edge.label : "";
  const stroke = (edge.style?.stroke as string) ?? "";
  const hasStart = !!edge.markerStart;
  const hasEnd = edge.markerEnd !== undefined ? !!edge.markerEnd : true;

  const setMarkers = (start: boolean, end: boolean) =>
    onChange({
      markerStart: start ? { type: MarkerType.ArrowClosed, width: 16, height: 16 } : undefined,
      markerEnd: end ? { type: MarkerType.ArrowClosed, width: 16, height: 16 } : undefined,
    });

  return (
    <div className="absolute right-3 top-3 z-10 w-[250px] rounded-2xl border border-border bg-surface/95 p-3 shadow-md backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Связь</span>
        <button onClick={onClose} className="rounded p-1 text-muted hover:text-fg"><X className="h-4 w-4" /></button>
      </div>

      <label className="label">Подпись</label>
      <input className="input" value={label} onChange={(e) => onChange({ label: e.target.value })} placeholder="напр. условие" />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {["да", "нет", "иначе"].map((t) => (
          <button key={t} onClick={() => onChange({ label: t })} className="rounded-md border border-border px-2 py-0.5 text-xs text-muted transition hover:border-brand hover:text-brand">
            {t}
          </button>
        ))}
      </div>

      <label className="label mt-3">Линия</label>
      <div className="grid grid-cols-4 gap-1">
        {EDGE_TYPES.map((t) => (
          <button key={t.key} onClick={() => onChange({ type: t.key })} className={cn("rounded-lg border px-1 py-1 text-[10px] transition", (edge.type ?? "default") === t.key ? "border-brand bg-brand/10 text-fg" : "border-border text-muted hover:bg-surface-2")}>
            {t.label}
          </button>
        ))}
      </div>

      <label className="label mt-3">Стрелки</label>
      <div className="grid grid-cols-3 gap-1">
        <button onClick={() => setMarkers(false, true)} className={cn("rounded-lg border px-1 py-1 text-[11px] transition", !hasStart && hasEnd ? "border-brand bg-brand/10 text-fg" : "border-border text-muted hover:bg-surface-2")}>→</button>
        <button onClick={() => setMarkers(true, true)} className={cn("rounded-lg border px-1 py-1 text-[11px] transition", hasStart && hasEnd ? "border-brand bg-brand/10 text-fg" : "border-border text-muted hover:bg-surface-2")}>↔</button>
        <button onClick={() => setMarkers(false, false)} className={cn("rounded-lg border px-1 py-1 text-[11px] transition", !hasStart && !hasEnd ? "border-brand bg-brand/10 text-fg" : "border-border text-muted hover:bg-surface-2")}>—</button>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!edge.animated} onChange={(e) => onChange({ animated: e.target.checked })} /> Анимация потока
      </label>

      <label className="label mt-3">Цвет</label>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => onChange({ style: { ...edge.style, stroke: undefined } })} className={cn("grid h-5 w-5 place-items-center rounded-full border border-border text-[9px]", !stroke && "ring-2 ring-brand")} title="По умолчанию">A</button>
        {BOARD_COLORS.map((c) => (
          <button key={c} onClick={() => onChange({ style: { ...edge.style, stroke: c } })} className="h-5 w-5 rounded-full transition hover:scale-110" style={{ backgroundColor: c, outline: stroke === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />
        ))}
      </div>

      <button onClick={onDelete} className="btn-ghost mt-4 w-full justify-center text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /> Удалить связь</button>
    </div>
  );
}
