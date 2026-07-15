"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, Plus, Trash2, ArrowLeft, Loader2, X, Workflow, FolderClosed, Zap, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { METHOD_COLOR, KVEditor, AuthEditor, BodyEditor } from "./shared";
import {
  buildVarMap,
  runFlow,
  emptyRequest,
  uid,
  HTTP_METHODS,
  type Flow,
  type EdgeMapping,
  type EdgeCondition,
  type CondOp,
  type ApiRequest,
  type Environment,
  type Collection,
  type FlowNodeResult,
  type HttpMethod,
} from "@/lib/console";

interface RFNodeData {
  req: ApiRequest;
  [key: string]: unknown;
}
interface RFEdgeData {
  mappings: EdgeMapping[];
  condition?: EdgeCondition;
  [key: string]: unknown;
}

const ResultsContext = createContext<Record<string, FlowNodeResult>>({});
const EdgeActionsContext = createContext<{ select: (id: string) => void }>({ select: () => {} });

const COND_LABEL: Record<CondOp, string> = {
  always: "Всегда",
  exists: "значение есть",
  notExists: "значения нет",
  eq: "равно",
  ne: "не равно",
  contains: "содержит",
  gt: "больше",
  lt: "меньше",
};

// ─── узел-блок ───────────────────────────────────────────────────────────────────
function ReqBlockNode({ id, data, selected }: NodeProps) {
  const d = data as RFNodeData;
  const results = useContext(ResultsContext);
  const r = results[id];
  const color =
    r?.status === "ok"
      ? "#10b981"
      : r?.status === "error"
        ? "#ef4444"
        : r?.status === "running"
          ? "#f59e0b"
          : r?.status === "skipped"
            ? "#94a3b8"
            : "#cbd5e1";
  const passedKeys = r?.passed ? Object.keys(r.passed) : [];
  return (
    <div
      className={cn(
        "w-60 rounded-xl border-2 bg-surface p-2.5 shadow-sm transition",
        selected ? "border-brand shadow-brand" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-3.5 !w-3.5 !border-2 !border-surface !bg-brand" />
      <div className="flex items-center gap-1.5">
        <span className="rounded px-1 py-0.5 font-mono text-[10px] font-bold text-white" style={{ background: METHOD_COLOR[d.req.method] }}>
          {d.req.method}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{d.req.name}</span>
        {r?.status === "running" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color }} />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        )}
      </div>
      <p className="mt-0.5 truncate font-mono text-[10px] text-faint">{d.req.url}</p>
      {r && r.status !== "skipped" && (
        <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5 text-[10px] text-muted">
          <div className="truncate">
            📥{" "}
            {r.response ? (
              <span style={{ color: r.response.ok ? "#10b981" : "#ef4444" }}>
                {r.response.status} · {r.response.ms}ms
              </span>
            ) : (
              "—"
            )}
          </div>
          {passedKeys.length > 0 && (
            <div className="truncate text-brand">➡️ {passedKeys.map((k) => `{{${k}}}`).join(" ")}</div>
          )}
        </div>
      )}
      {r?.status === "skipped" && <div className="mt-1 text-[10px] text-faint">пропущено (условие)</div>}
      <Handle type="source" position={Position.Right} className="!h-3.5 !w-3.5 !border-2 !border-surface !bg-brand" />
    </div>
  );
}

// ─── стрелка с «инструментом» (маппинг + условие) ─────────────────────────────────
function MappedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const d = (data ?? {}) as RFEdgeData;
  const { select } = useContext(EdgeActionsContext);
  const mapCount = d.mappings?.length ?? 0;
  const hasCond = !!d.condition && d.condition.op !== "always";
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: "rgb(var(--brand))", strokeWidth: selected ? 3 : 2 }} />
      <EdgeLabelRenderer>
        <button
          onClick={(e) => {
            e.stopPropagation();
            select(id);
          }}
          className={cn(
            "nodrag nopan pointer-events-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shadow-sm transition",
            selected ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:border-brand hover:text-brand",
          )}
          style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
        >
          {hasCond && <GitBranch className="h-3 w-3" />}
          {mapCount > 0 && (
            <>
              <Zap className="h-3 w-3" /> {mapCount}
            </>
          )}
          {!hasCond && mapCount === 0 && <Plus className="h-3 w-3" />}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { reqBlock: ReqBlockNode };
const edgeTypes = { mapped: MappedEdge };
const defaultEdgeOptions = {
  type: "mapped",
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgb(var(--brand))" },
  style: { strokeWidth: 2 },
};

function cloneReq(req: ApiRequest): ApiRequest {
  return {
    ...req,
    id: uid(),
    params: req.params.map((p) => ({ ...p })),
    headers: req.headers.map((h) => ({ ...h })),
    form: req.form.map((f) => ({ ...f })),
    auth: { ...req.auth },
  };
}

// ─── корневой компонент ───────────────────────────────────────────────────────────
export function FlowBuilder(props: {
  flows: Flow[];
  collections: Collection[];
  activeEnv: Environment | null;
  token: string;
  wsId: string;
  readOnly: boolean;
  onChange: (flows: Flow[]) => void;
}) {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const selectedFlow = props.flows.find((f) => f.id === selectedFlowId) ?? null;

  if (!selectedFlow) {
    return (
      <FlowList
        flows={props.flows}
        onOpen={setSelectedFlowId}
        onCreate={() => {
          const flow: Flow = { id: uid(), name: "Новый поток", nodes: [], edges: [] };
          props.onChange([...props.flows, flow]);
          setSelectedFlowId(flow.id);
        }}
        onDelete={(id) => props.onChange(props.flows.filter((f) => f.id !== id))}
      />
    );
  }

  return (
    <ReactFlowProvider>
      <FlowCanvas key={selectedFlow.id} {...props} flow={selectedFlow} onBack={() => setSelectedFlowId(null)} />
    </ReactFlowProvider>
  );
}

// ─── список потоков ─────────────────────────────────────────────────────────────
function FlowList({
  flows,
  onOpen,
  onCreate,
  onDelete,
}: {
  flows: Flow[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold">Потоки автоматизации</h2>
        <button onClick={onCreate} className="btn-primary ml-auto">
          <Plus className="h-4 w-4" /> Новый поток
        </button>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Добавьте блоки (готовые API из коллекций), соедините стрелками. На стрелке настройте, какие данные передать
        дальше и при каком условии переходить. Запустите поток целиком.
      </p>
      {flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <Workflow className="h-10 w-10 opacity-40" />
          <p className="text-sm">Пока нет потоков. Создайте первый.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((f) => (
            <div key={f.id} className="group card flex flex-col gap-2 p-4">
              <div className="flex items-start gap-2">
                <Workflow className="mt-0.5 h-5 w-5 text-brand" />
                <button onClick={() => onOpen(f.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-semibold">{f.name}</div>
                  <div className="text-xs text-muted">
                    {f.nodes.length} блоков · {f.edges.length} связей
                  </div>
                </button>
                <button
                  onClick={() => onDelete(f.id)}
                  className="rounded p-1 text-faint opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <button onClick={() => onOpen(f.id)} className="btn-outline justify-center text-sm">
                Открыть
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── холст потока ────────────────────────────────────────────────────────────────
function FlowCanvas({
  flow,
  flows,
  collections,
  activeEnv,
  token,
  wsId,
  readOnly,
  onChange,
  onBack,
}: {
  flow: Flow;
  flows: Flow[];
  collections: Collection[];
  activeEnv: Environment | null;
  token: string;
  wsId: string;
  readOnly: boolean;
  onChange: (flows: Flow[]) => void;
  onBack: () => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<RFNodeData>>(
    flow.nodes.map((n) => ({ id: n.id, type: "reqBlock", position: { x: n.x, y: n.y }, data: { req: n.request } })),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<RFEdgeData>>(
    flow.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: "mapped", data: { mappings: e.mappings ?? [], condition: e.condition } })),
  );
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const [selEdgeId, setSelEdgeId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, FlowNodeResult>>({});
  const [running, setRunning] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // сохранение структуры (с задержкой)
  const latest = useRef({ flow, flows, onChange });
  latest.current = { flow, flows, onChange };
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const { flow: f, flows: fs, onChange: oc } = latest.current;
      const updated: Flow = {
        ...f,
        nodes: nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, request: n.data.req })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          mappings: e.data?.mappings ?? [],
          condition: e.data?.condition,
        })),
      };
      oc(fs.map((x) => (x.id === updated.id ? updated : x)));
    }, 400);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const edgeActions = useMemo(
    () => ({
      select: (id: string) => {
        setSelEdgeId(id);
        setSelNodeId(null);
      },
    }),
    [],
  );

  const onConnect = (c: Connection) =>
    setEdges((es) => addEdge({ ...c, id: uid(), type: "mapped", data: { mappings: [], condition: undefined } }, es));

  const selNode = nodes.find((n) => n.id === selNodeId) ?? null;
  const selEdge = edges.find((e) => e.id === selEdgeId) ?? null;

  const updateReq = (id: string, reqPatch: Partial<ApiRequest>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, req: { ...n.data.req, ...reqPatch } } } : n)));
  const updateEdgeData = (id: string, patch: Partial<RFEdgeData>) =>
    setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { ...(e.data as RFEdgeData), ...patch } } : e)));

  const addBlock = (seed: ApiRequest) => {
    const req = cloneReq(seed);
    const node: Node<RFNodeData> = {
      id: uid(),
      type: "reqBlock",
      position: { x: 120 + nodes.length * 50, y: 100 + (nodes.length % 5) * 90 },
      data: { req },
    };
    setNodes((ns) => [...ns, node]);
    setSelNodeId(node.id);
    setSelEdgeId(null);
  };

  const deleteNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    if (selNodeId === id) setSelNodeId(null);
  };
  const deleteEdge = (id: string) => {
    setEdges((es) => es.filter((e) => e.id !== id));
    if (selEdgeId === id) setSelEdgeId(null);
  };

  const nodeName = (nid: string) => nodes.find((n) => n.id === nid)?.data.req.name ?? "?";

  const run = async () => {
    const flowNow: Flow = {
      ...flow,
      nodes: nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, request: n.data.req })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        mappings: e.data?.mappings ?? [],
        condition: e.data?.condition,
      })),
    };
    if (flowNow.nodes.length === 0) return;
    const hasWrite = flowNow.nodes.some((n) => n.request.method !== "GET" && n.request.method !== "HEAD");
    if (readOnly && hasWrite) {
      alert("В потоке есть изменяющие запросы (POST/PATCH/DELETE), а сейчас «Только чтение». Снимите режим вверху, чтобы запустить.");
      return;
    }
    setResults({});
    setRunning(true);
    const base = buildVarMap(activeEnv, { workspace_id: wsId, bulut_token: token });
    await runFlow(flowNow, base, token, wsId, (nodeId, result) => {
      setResults((prev) => ({ ...prev, [nodeId]: result }));
    });
    setRunning(false);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <ResultsContext.Provider value={results}>
        <EdgeActionsContext.Provider value={edgeActions}>
          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* панель потока */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <button onClick={onBack} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title="К списку потоков">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <input
                value={flow.name}
                onChange={(e) => onChange(flows.map((f) => (f.id === flow.id ? { ...f, name: e.target.value } : f)))}
                className="bg-transparent text-sm font-semibold outline-none"
              />
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setAddOpen(true)} className="btn-outline text-sm">
                  <Plus className="h-4 w-4" /> Добавить API
                </button>
                <button onClick={run} disabled={running} className="btn-primary text-sm">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Запустить
                </button>
              </div>
            </div>

            {/* холст */}
            <div className="min-h-0 flex-1">
              {nodes.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
                  <Workflow className="h-10 w-10 opacity-40" />
                  <p className="text-sm">Пусто. Начните с кнопки «Добавить API».</p>
                  <button onClick={() => setAddOpen(true)} className="btn-primary">
                    <Plus className="h-4 w-4" /> Добавить API
                  </button>
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={(_, n) => {
                    setSelNodeId(n.id);
                    setSelEdgeId(null);
                  }}
                  onEdgeClick={(_, e) => edgeActions.select(e.id)}
                  onPaneClick={() => {
                    setSelNodeId(null);
                    setSelEdgeId(null);
                  }}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  defaultEdgeOptions={defaultEdgeOptions}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
                  <Background id="dots" variant={BackgroundVariant.Dots} gap={20} size={1} color="rgb(var(--border) / 0.9)" />
                  <Controls showInteractive={false} />
                </ReactFlow>
              )}
            </div>
          </div>

          {/* инспектор блока */}
          {selNode && (
            <NodeInspector
              key={selNode.id}
              req={selNode.data.req}
              result={results[selNode.id]}
              onReq={(patch) => updateReq(selNode.id, patch)}
              onDelete={() => deleteNode(selNode.id)}
              onClose={() => setSelNodeId(null)}
            />
          )}

          {/* инспектор стрелки */}
          {selEdge && (
            <EdgeInspector
              key={selEdge.id}
              fromName={nodeName(selEdge.source)}
              toName={nodeName(selEdge.target)}
              data={(selEdge.data as RFEdgeData) ?? { mappings: [] }}
              onData={(patch) => updateEdgeData(selEdge.id, patch)}
              onDelete={() => deleteEdge(selEdge.id)}
              onClose={() => setSelEdgeId(null)}
            />
          )}
        </EdgeActionsContext.Provider>
      </ResultsContext.Provider>

      {/* модалка выбора API */}
      <AddBlockModal open={addOpen} collections={collections} onClose={() => setAddOpen(false)} onPick={(r) => { addBlock(r); setAddOpen(false); }} />
    </div>
  );
}

// ─── модалка «выбрать группу → API» ───────────────────────────────────────────────
function AddBlockModal({
  open,
  collections,
  onClose,
  onPick,
}: {
  open: boolean;
  collections: Collection[];
  onClose: () => void;
  onPick: (req: ApiRequest) => void;
}) {
  const [q, setQ] = useState("");
  const match = (name: string) => name.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <Modal open={open} onClose={onClose} title="Добавить API в поток" size="lg">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск запроса…"
        className="input mb-3"
      />
      <div className="max-h-[55vh] space-y-4 overflow-y-auto">
        {collections.map((c) => {
          const rootReqs = c.requests.filter((r) => match(r.name));
          const folders = c.folders
            .map((f) => ({ ...f, requests: f.requests.filter((r) => match(r.name)) }))
            .filter((f) => f.requests.length > 0);
          if (rootReqs.length === 0 && folders.length === 0) return null;
          return (
            <div key={c.id}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{c.name}</div>
              <div className="space-y-1">
                {rootReqs.map((r) => (
                  <ReqPick key={r.id} req={r} onPick={onPick} />
                ))}
                {folders.map((f) => (
                  <div key={f.id}>
                    <div className="mb-0.5 mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                      <FolderClosed className="h-3.5 w-3.5 text-amber-500" /> {f.name}
                    </div>
                    <div className="ml-4 space-y-1">
                      {f.requests.map((r) => (
                        <ReqPick key={r.id} req={r} onPick={onPick} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function ReqPick({ req, onPick }: { req: ApiRequest; onPick: (r: ApiRequest) => void }) {
  return (
    <button
      onClick={() => onPick(req)}
      className="flex w-full items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left text-sm transition hover:border-brand hover:bg-surface-2"
    >
      <span className="w-12 shrink-0 text-right font-mono text-[10px] font-bold" style={{ color: METHOD_COLOR[req.method] }}>
        {req.method}
      </span>
      <span className="min-w-0 flex-1 truncate">{req.name}</span>
      <span className="hidden truncate font-mono text-[10px] text-faint sm:block">{req.url}</span>
      <Plus className="h-4 w-4 shrink-0 text-brand" />
    </button>
  );
}

// ─── инспектор блока ─────────────────────────────────────────────────────────────
function NodeInspector({
  req,
  result,
  onReq,
  onDelete,
  onClose,
}: {
  req: ApiRequest;
  result?: FlowNodeResult;
  onReq: (patch: Partial<ApiRequest>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"req" | "result">("req");
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Блок API</span>
        <button onClick={onDelete} className="ml-auto rounded p-1 text-red-500 hover:bg-red-500/10" title="Удалить блок">
          <Trash2 className="h-4 w-4" />
        </button>
        <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-1 border-b border-border px-2">
        {(
          [
            ["req", "Запрос"],
            ["result", "Результат"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "border-b-2 px-2.5 py-2 text-xs transition",
              tab === k ? "border-brand font-semibold text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "req" ? (
          <div className="space-y-3">
            <input value={req.name} onChange={(e) => onReq({ name: e.target.value })} className="input text-sm font-semibold" placeholder="Название блока" />
            <div className="flex gap-1.5">
              <select
                value={req.method}
                onChange={(e) => onReq({ method: e.target.value as HttpMethod })}
                className="rounded-lg border border-border bg-surface px-2 text-sm font-bold outline-none"
                style={{ color: METHOD_COLOR[req.method] }}
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input value={req.url} onChange={(e) => onReq({ url: e.target.value })} className="input flex-1 font-mono text-xs" placeholder="{{base_url}}/api/…" spellCheck={false} />
            </div>
            <div>
              <label className="label">Заголовки</label>
              <KVEditor rows={req.headers} onChange={(headers) => onReq({ headers })} kPlaceholder="Header" vPlaceholder="значение" />
            </div>
            <div>
              <label className="label">Авторизация</label>
              <AuthEditor req={req} onChange={onReq} />
            </div>
            <div>
              <label className="label">Тело</label>
              <BodyEditor req={req} onChange={onReq} />
            </div>
          </div>
        ) : (
          <ResultView result={result} />
        )}
      </div>
    </aside>
  );
}

function ResultView({ result }: { result?: FlowNodeResult }) {
  if (!result) return <p className="text-xs text-muted">Запустите поток, чтобы увидеть результат.</p>;
  if (result.status === "skipped") return <p className="text-xs text-muted">Блок пропущен — условие входящей стрелки не выполнилось.</p>;
  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="mb-1 font-semibold text-muted">📤 Отправлено</div>
        <p className="break-all rounded-lg bg-surface-2/50 p-2 font-mono">
          {result.sent?.method} {result.sent?.url}
        </p>
      </div>
      <div>
        <div className="mb-1 font-semibold text-muted">📥 Ответ</div>
        {result.response ? (
          <>
            <p className="mb-1 font-semibold" style={{ color: result.response.ok ? "#10b981" : "#ef4444" }}>
              {result.response.status} {result.response.statusText} · {result.response.ms}ms
            </p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2/50 p-2 font-mono">
              {result.response.error || result.response.body}
            </pre>
          </>
        ) : (
          <p className="text-muted">—</p>
        )}
      </div>
      {result.passed && Object.keys(result.passed).length > 0 && (
        <div>
          <div className="mb-1 font-semibold text-muted">➡️ Передано дальше</div>
          <div className="space-y-1">
            {Object.entries(result.passed).map(([k, v]) => (
              <div key={k} className="flex gap-1.5 rounded-lg bg-brand/5 px-2 py-1 font-mono">
                <span className="font-semibold text-brand">{`{{${k}}}`}</span>
                <span className="min-w-0 flex-1 truncate text-muted">= {v || "∅"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── инспектор стрелки (маппинг + условие) ────────────────────────────────────────
function EdgeInspector({
  fromName,
  toName,
  data,
  onData,
  onDelete,
  onClose,
}: {
  fromName: string;
  toName: string;
  data: RFEdgeData;
  onData: (patch: Partial<RFEdgeData>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const mappings = data.mappings ?? [];
  const cond = data.condition;
  const op: CondOp = cond?.op ?? "always";

  const setOp = (newOp: CondOp) => {
    if (newOp === "always") onData({ condition: undefined });
    else onData({ condition: { left: cond?.left ?? "", op: newOp, right: cond?.right ?? "" } });
  };
  const setCond = (patch: Partial<EdgeCondition>) =>
    onData({ condition: { left: cond?.left ?? "", op: op === "always" ? "exists" : op, right: cond?.right ?? "", ...patch } });

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Стрелка</span>
        <button onClick={onDelete} className="ml-auto rounded p-1 text-red-500 hover:bg-red-500/10" title="Удалить стрелку">
          <Trash2 className="h-4 w-4" />
        </button>
        <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border px-3 py-2 text-xs text-muted">
        <span className="font-semibold text-fg">{fromName}</span> → <span className="font-semibold text-fg">{toName}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {/* Передать данные */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <Zap className="h-4 w-4 text-brand" /> Передать данные
          </div>
          <p className="mb-2 text-[11px] text-muted">
            Берём значение из ответа блока «{fromName}» и кладём в переменную. Дальше её используют как{" "}
            <span className="font-mono">{"{{имя}}"}</span>.
          </p>
          <div className="space-y-1.5">
            {mappings.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5">
                <input
                  value={m.from}
                  onChange={(e) => onData({ mappings: mappings.map((x) => (x.id === m.id ? { ...x, from: e.target.value } : x)) })}
                  placeholder="из ответа: data.0.id"
                  className="input flex-1 py-1.5 font-mono text-xs"
                  spellCheck={false}
                />
                <span className="text-faint">→</span>
                <input
                  value={m.to}
                  onChange={(e) => onData({ mappings: mappings.map((x) => (x.id === m.id ? { ...x, to: e.target.value } : x)) })}
                  placeholder="в {{token}}"
                  className="input flex-1 py-1.5 font-mono text-xs"
                  spellCheck={false}
                />
                <button
                  onClick={() => onData({ mappings: mappings.filter((x) => x.id !== m.id) })}
                  className="rounded p-1 text-faint hover:bg-red-500/10 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => onData({ mappings: [...mappings, { id: uid(), from: "", to: "" }] })}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Добавить передачу
            </button>
          </div>
        </div>

        {/* Условие перехода */}
        <div className="border-t border-border pt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <GitBranch className="h-4 w-4 text-brand" /> Когда переходить
          </div>
          <select className="input text-sm" value={op} onChange={(e) => setOp(e.target.value as CondOp)}>
            {(Object.keys(COND_LABEL) as CondOp[]).map((o) => (
              <option key={o} value={o}>
                {o === "always" ? "Всегда переходить" : `Если ${COND_LABEL[o]}`}
              </option>
            ))}
          </select>
          {op !== "always" && (
            <div className="mt-2 space-y-1.5">
              <input
                value={cond?.left ?? ""}
                onChange={(e) => setCond({ left: e.target.value })}
                placeholder="что проверяем: data.status или {{token}}"
                className="input py-1.5 font-mono text-xs"
                spellCheck={false}
              />
              {op !== "exists" && op !== "notExists" && (
                <input
                  value={cond?.right ?? ""}
                  onChange={(e) => setCond({ right: e.target.value })}
                  placeholder="значение для сравнения"
                  className="input py-1.5 font-mono text-xs"
                  spellCheck={false}
                />
              )}
              <p className="text-[11px] text-muted">
                Если условие не выполнится — по этой стрелке данные не пойдут и следующий блок не запустится (можно
                сделать вторую стрелку с другим условием — получится ветвление).
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
