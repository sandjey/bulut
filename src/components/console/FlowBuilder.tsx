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
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, Plus, Trash2, ArrowLeft, Loader2, X, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { METHOD_COLOR, KVEditor, AuthEditor, BodyEditor } from "./shared";
import {
  buildVarMap,
  runFlow,
  emptyRequest,
  uid,
  HTTP_METHODS,
  type Flow,
  type ExtractRule,
  type ApiRequest,
  type Environment,
  type Collection,
  type FlowNodeResult,
  type HttpMethod,
} from "@/lib/console";

interface RFData {
  req: ApiRequest;
  extract: ExtractRule[];
  [key: string]: unknown;
}

// результаты запуска пробрасываем в узлы через контекст (не трогая структуру графа)
const ResultsContext = createContext<Record<string, FlowNodeResult>>({});

function ReqBlockNode({ id, data, selected }: NodeProps) {
  const d = data as RFData;
  const results = useContext(ResultsContext);
  const r = results[id];
  const color =
    r?.status === "ok" ? "#10b981" : r?.status === "error" ? "#ef4444" : r?.status === "running" ? "#f59e0b" : "#94a3b8";
  const passedKeys = r?.passed ? Object.keys(r.passed) : [];
  return (
    <div
      className={cn(
        "w-60 rounded-xl border-2 bg-surface p-2.5 shadow-sm transition",
        selected ? "border-brand" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-surface !bg-brand" />
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-bold" style={{ color: METHOD_COLOR[d.req.method] }}>
          {d.req.method}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{d.req.name}</span>
        {r?.status === "running" ? (
          <Loader2 className="h-3 w-3 animate-spin" style={{ color }} />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        )}
      </div>
      <p className="mt-0.5 truncate font-mono text-[10px] text-faint">{d.req.url}</p>
      {r && (
        <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5 text-[10px] text-muted">
          <div className="truncate">
            📤 <span className="font-mono">{r.sent?.method}</span>
          </div>
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
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-surface !bg-brand" />
    </div>
  );
}

const nodeTypes = { reqBlock: ReqBlockNode };
const edgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  style: { strokeWidth: 2, stroke: "rgb(var(--brand))" },
  animated: true,
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

  // ── список потоков ──
  if (!selectedFlow) {
    return (
      <FlowList
        flows={props.flows}
        onOpen={setSelectedFlowId}
        onCreate={() => {
          const flow: Flow = {
            id: uid(),
            name: "Новый поток",
            nodes: [
              {
                id: uid(),
                x: 80,
                y: 120,
                request: emptyRequest({ name: "Шаг 1", url: "{{base_url}}/api/tasks" }),
                extract: [],
              },
            ],
            edges: [],
          };
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
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-bold">Потоки автоматизации</h2>
        <button onClick={onCreate} className="btn-primary ml-auto">
          <Plus className="h-4 w-4" /> Новый поток
        </button>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Соедините запросы стрелками — данные из ответа (токен, id) передаются в следующие блоки. Запустите поток целиком.
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
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<RFData>>(
    flow.nodes.map((n) => ({ id: n.id, type: "reqBlock", position: { x: n.x, y: n.y }, data: { req: n.request, extract: n.extract } })),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    flow.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  );
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, FlowNodeResult>>({});
  const [running, setRunning] = useState(false);

  // сохранение структуры (позиции/связи/правки) — с задержкой
  const latest = useRef({ flow, flows, onChange });
  latest.current = { flow, flows, onChange };
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const { flow: f, flows: fs, onChange: oc } = latest.current;
      const updated: Flow = {
        ...f,
        nodes: nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, request: n.data.req, extract: n.data.extract })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      };
      oc(fs.map((x) => (x.id === updated.id ? updated : x)));
    }, 400);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const onConnect = (c: Connection) =>
    setEdges((es) => addEdge({ ...c, id: uid() }, es));

  const selNode = nodes.find((n) => n.id === selNodeId) ?? null;
  const updateNodeData = (id: string, patch: Partial<RFData>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  const updateReq = (id: string, reqPatch: Partial<ApiRequest>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, req: { ...n.data.req, ...reqPatch } } } : n)));

  const addBlock = (seed?: ApiRequest) => {
    const req = seed ? cloneReq(seed) : emptyRequest({ name: `Шаг ${nodes.length + 1}`, url: "{{base_url}}/api" });
    const node: Node<RFData> = {
      id: uid(),
      type: "reqBlock",
      position: { x: 120 + nodes.length * 40, y: 120 + (nodes.length % 4) * 40 },
      data: { req, extract: [] },
    };
    setNodes((ns) => [...ns, node]);
    setSelNodeId(node.id);
  };

  const deleteNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    if (selNodeId === id) setSelNodeId(null);
  };

  const allRequests = useMemo(
    () => collections.flatMap((c) => [...c.requests, ...c.folders.flatMap((f) => f.requests)]),
    [collections],
  );

  const run = async () => {
    const flowNow: Flow = {
      ...flow,
      nodes: nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, request: n.data.req, extract: n.data.extract })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };
    const hasWrite = flowNow.nodes.some((n) => n.request.method !== "GET" && n.request.method !== "HEAD");
    if (readOnly && hasWrite) {
      alert(
        "В потоке есть изменяющие запросы (POST/PATCH/DELETE), а сейчас включён режим «Только чтение». Снимите его вверху, чтобы запустить.",
      );
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
              <select
                className="input h-9 w-auto py-1 text-xs"
                value=""
                onChange={(e) => {
                  const r = allRequests.find((x) => x.id === e.target.value);
                  if (r) addBlock(r);
                  e.target.value = "";
                }}
              >
                <option value="">+ из коллекции</option>
                {allRequests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.method} · {r.name}
                  </option>
                ))}
              </select>
              <button onClick={() => addBlock()} className="btn-outline text-sm">
                <Plus className="h-4 w-4" /> Блок
              </button>
              <button onClick={run} disabled={running} className="btn-primary text-sm">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Запустить
              </button>
            </div>
          </div>

          {/* холст */}
          <div className="min-h-0 flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => setSelNodeId(n.id)}
              onPaneClick={() => setSelNodeId(null)}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={edgeOptions}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background id="dots" variant={BackgroundVariant.Dots} gap={20} size={1} color="rgb(var(--border) / 0.9)" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </div>

        {/* инспектор блока */}
        {selNode && (
          <NodeInspector
            key={selNode.id}
            req={selNode.data.req}
            extract={selNode.data.extract}
            result={results[selNode.id]}
            onReq={(patch) => updateReq(selNode.id, patch)}
            onExtract={(extract) => updateNodeData(selNode.id, { extract })}
            onDelete={() => deleteNode(selNode.id)}
            onClose={() => setSelNodeId(null)}
          />
        )}
      </ResultsContext.Provider>
    </div>
  );
}

// ─── инспектор блока ─────────────────────────────────────────────────────────────
function NodeInspector({
  req,
  extract,
  result,
  onReq,
  onExtract,
  onDelete,
  onClose,
}: {
  req: ApiRequest;
  extract: ExtractRule[];
  result?: FlowNodeResult;
  onReq: (patch: Partial<ApiRequest>) => void;
  onExtract: (rules: ExtractRule[]) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"req" | "extract" | "result">("req");
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Блок</span>
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
            ["extract", "Достать из ответа"],
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
        {tab === "req" && (
          <div className="space-y-3">
            <input
              value={req.name}
              onChange={(e) => onReq({ name: e.target.value })}
              className="input text-sm font-semibold"
              placeholder="Название блока"
            />
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
              <input
                value={req.url}
                onChange={(e) => onReq({ url: e.target.value })}
                className="input flex-1 font-mono text-xs"
                placeholder="{{base_url}}/api/…"
                spellCheck={false}
              />
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
        )}

        {tab === "extract" && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Достаём значения из ответа в переменные — их используют следующие блоки как{" "}
              <span className="font-mono">{"{{имя}}"}</span>.
            </p>
            {extract.map((rule) => (
              <div key={rule.id} className="flex items-center gap-1.5">
                <input
                  value={rule.varName}
                  onChange={(e) => onExtract(extract.map((x) => (x.id === rule.id ? { ...x, varName: e.target.value } : x)))}
                  placeholder="имя (token)"
                  className="input flex-1 py-1.5 font-mono text-xs"
                  spellCheck={false}
                />
                <span className="text-xs text-faint">←</span>
                <input
                  value={rule.path}
                  onChange={(e) => onExtract(extract.map((x) => (x.id === rule.id ? { ...x, path: e.target.value } : x)))}
                  placeholder="путь (data.0.id)"
                  className="input flex-1 py-1.5 font-mono text-xs"
                  spellCheck={false}
                />
                <button
                  onClick={() => onExtract(extract.filter((x) => x.id !== rule.id))}
                  className="rounded p-1 text-faint hover:bg-red-500/10 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => onExtract([...extract, { id: uid(), varName: "", path: "" }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Добавить правило
            </button>
          </div>
        )}

        {tab === "result" && (
          <div className="space-y-2 text-xs">
            {!result ? (
              <p className="text-muted">Запустите поток, чтобы увидеть результат.</p>
            ) : (
              <>
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
                    <div className="mb-1 font-semibold text-muted">➡️ Передаётся дальше</div>
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
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
