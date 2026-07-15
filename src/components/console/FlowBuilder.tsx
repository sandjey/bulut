"use client";

import { useMemo, useState } from "react";
import {
  Play,
  Plus,
  Trash2,
  ArrowLeft,
  Loader2,
  X,
  Workflow,
  FolderClosed,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  MousePointerClick,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { METHOD_COLOR, KVEditor, AuthEditor, BodyEditor } from "./shared";
import {
  buildVarMap,
  runFlow,
  uid,
  HTTP_METHODS,
  normalizeFlow,
  flattenJson,
  extractPlaceholders,
  type Flow,
  type FlowStep,
  type StepCapture,
  type CondOp,
  type ApiRequest,
  type Environment,
  type Collection,
  type FlowNodeResult,
  type HttpMethod,
} from "@/lib/console";

const COND_LABEL: Record<CondOp, string> = {
  exists: "есть значение",
  notExists: "нет значения",
  eq: "равно",
  ne: "не равно",
  contains: "содержит",
  gt: "больше",
  lt: "меньше",
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

function niceName(label: string, taken: Set<string>): string {
  let base = (label || "value").replace(/\[\d+\]/g, "").replace(/[^\w]/g, "");
  if (!base) base = "value";
  let name = base;
  let i = 2;
  while (taken.has(name)) name = `${base}${i++}`;
  return name;
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
  const flows = useMemo(() => props.flows.map(normalizeFlow), [props.flows]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = flows.find((f) => f.id === selectedId) ?? null;

  const update = (next: Flow[]) => props.onChange(next);

  if (!selected) {
    return (
      <FlowList
        flows={flows}
        onOpen={setSelectedId}
        onCreate={() => {
          const flow: Flow = { id: uid(), name: "Новый сценарий", steps: [] };
          update([...flows, flow]);
          setSelectedId(flow.id);
        }}
        onDelete={(id) => update(flows.filter((f) => f.id !== id))}
      />
    );
  }

  return (
    <StepFlowEditor
      key={selected.id}
      flow={selected}
      flows={flows}
      collections={props.collections}
      activeEnv={props.activeEnv}
      token={props.token}
      wsId={props.wsId}
      readOnly={props.readOnly}
      onChange={update}
      onBack={() => setSelectedId(null)}
    />
  );
}

// ─── список сценариев ─────────────────────────────────────────────────────────────
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
        <h2 className="text-lg font-bold">Сценарии</h2>
        <button onClick={onCreate} className="btn-primary ml-auto">
          <Plus className="h-4 w-4" /> Новый сценарий
        </button>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Сценарий — это список шагов сверху вниз. Добавляете API, запускаете, а из ответа одним кликом берёте нужное
        значение — оно само подставится в следующие шаги.
      </p>
      {flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <Workflow className="h-10 w-10 opacity-40" />
          <p className="text-sm">Пока нет сценариев. Создайте первый.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((f) => (
            <div key={f.id} className="group card flex flex-col gap-2 p-4">
              <div className="flex items-start gap-2">
                <Workflow className="mt-0.5 h-5 w-5 text-brand" />
                <button onClick={() => onOpen(f.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-semibold">{f.name}</div>
                  <div className="text-xs text-muted">{f.steps.length} шагов</div>
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

// ─── редактор сценария (список шагов) ─────────────────────────────────────────────
function StepFlowEditor({
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
  const [results, setResults] = useState<Record<string, FlowNodeResult>>({});
  const [running, setRunning] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [openStep, setOpenStep] = useState<string | null>(null);

  const setSteps = (steps: FlowStep[]) => onChange(flows.map((f) => (f.id === flow.id ? { ...flow, steps } : f)));
  const updateStep = (id: string, patch: Partial<FlowStep>) =>
    setSteps(flow.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const updateReq = (id: string, reqPatch: Partial<ApiRequest>) =>
    setSteps(flow.steps.map((s) => (s.id === id ? { ...s, request: { ...s.request, ...reqPatch } } : s)));

  const addStep = (req: ApiRequest) => {
    const step: FlowStep = { id: uid(), request: cloneReq(req), captures: [], bindings: {} };
    setSteps([...flow.steps, step]);
    setOpenStep(step.id);
    setAddOpen(false);
  };
  const removeStep = (id: string) => setSteps(flow.steps.filter((s) => s.id !== id));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= flow.steps.length) return;
    const arr = [...flow.steps];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setSteps(arr);
  };

  // имена значений, доступных ДО шага idx
  const varsBefore = (idx: number): string[] =>
    flow.steps
      .slice(0, idx)
      .flatMap((s) => s.captures.map((c) => c.to))
      .filter(Boolean);

  const doRun = async (upToIdx?: number) => {
    const steps = upToIdx == null ? flow.steps : flow.steps.slice(0, upToIdx + 1);
    if (steps.length === 0) return;
    const hasWrite = steps.some((s) => s.request.method !== "GET" && s.request.method !== "HEAD");
    if (readOnly && hasWrite) {
      alert("В сценарии есть изменяющие запросы (POST/PATCH/DELETE), а сейчас «Только чтение». Снимите режим вверху.");
      return;
    }
    setResults({});
    setRunning(true);
    const base = buildVarMap(activeEnv, {
      base_url: typeof window !== "undefined" ? window.location.origin : "",
      workspace_id: wsId,
      bulut_token: token,
    });
    await runFlow({ ...flow, steps }, base, token, wsId, (stepId, result) => {
      setResults((prev) => ({ ...prev, [stepId]: result }));
    });
    setRunning(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* панель */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={onBack} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title="К списку">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          value={flow.name}
          onChange={(e) => onChange(flows.map((f) => (f.id === flow.id ? { ...f, name: e.target.value } : f)))}
          className="bg-transparent text-sm font-semibold outline-none"
        />
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAddOpen(true)} className="btn-outline text-sm">
            <Plus className="h-4 w-4" /> Добавить шаг
          </button>
          <button onClick={() => doRun()} disabled={running || flow.steps.length === 0} className="btn-primary text-sm">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Запустить всё
          </button>
        </div>
      </div>

      {/* список шагов */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {flow.steps.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center text-muted">
            <Workflow className="h-10 w-10 opacity-40" />
            <p className="text-sm">Пусто. Начните с первого шага — выберите готовый API.</p>
            <button onClick={() => setAddOpen(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Добавить первый шаг
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2">
            {flow.steps.map((step, idx) => (
              <div key={step.id}>
                <StepCard
                  step={step}
                  index={idx}
                  total={flow.steps.length}
                  result={results[step.id]}
                  open={openStep === step.id}
                  available={varsBefore(idx)}
                  running={running}
                  onToggle={() => setOpenStep(openStep === step.id ? null : step.id)}
                  onReq={(patch) => updateReq(step.id, patch)}
                  onStep={(patch) => updateStep(step.id, patch)}
                  onRunHere={() => doRun(idx)}
                  onMove={(dir) => move(idx, dir)}
                  onDelete={() => removeStep(step.id)}
                />
                {idx < flow.steps.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <ChevronDown className="h-4 w-4 text-faint" />
                  </div>
                )}
              </div>
            ))}
            <div className="pt-2 text-center">
              <button onClick={() => setAddOpen(true)} className="btn-outline text-sm">
                <Plus className="h-4 w-4" /> Добавить шаг
              </button>
            </div>
          </div>
        )}
      </div>

      <AddApiModal open={addOpen} collections={collections} onClose={() => setAddOpen(false)} onPick={addStep} />
    </div>
  );
}

// ─── карточка шага ────────────────────────────────────────────────────────────────
function StepCard({
  step,
  index,
  total,
  result,
  open,
  available,
  running,
  onToggle,
  onReq,
  onStep,
  onRunHere,
  onMove,
  onDelete,
}: {
  step: FlowStep;
  index: number;
  total: number;
  result?: FlowNodeResult;
  open: boolean;
  available: string[];
  running: boolean;
  onToggle: () => void;
  onReq: (patch: Partial<ApiRequest>) => void;
  onStep: (patch: Partial<FlowStep>) => void;
  onRunHere: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const req = step.request;
  const st = result?.status;
  const dot =
    st === "ok" ? "#10b981" : st === "error" ? "#ef4444" : st === "running" ? "#f59e0b" : st === "skipped" ? "#94a3b8" : "#cbd5e1";
  const placeholders = extractPlaceholders(req);

  const captureLeaf = (fromPath: string, label: string) => {
    const taken = new Set(step.captures.map((c) => c.to));
    const to = niceName(label, taken);
    onStep({ captures: [...step.captures, { id: uid(), from: fromPath, to }] });
  };

  return (
    <div className={cn("card overflow-hidden p-0", open && "ring-1 ring-brand/40")}>
      {/* шапка */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">
          {index + 1}
        </span>
        <span className="rounded px-1 py-0.5 font-mono text-[10px] font-bold text-white" style={{ background: METHOD_COLOR[req.method] }}>
          {req.method}
        </span>
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-semibold">{req.name}</div>
          <div className="truncate font-mono text-[11px] text-faint">{req.url}</div>
        </button>
        {running && st === "running" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500" />
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} title={st ?? "не запускался"} />
        )}
        <button onClick={onRunHere} disabled={running} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-brand" title="Запустить до этого шага">
          <Play className="h-4 w-4" />
        </button>
        <div className="flex flex-col">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="text-faint hover:text-fg disabled:opacity-30">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-faint hover:text-fg disabled:opacity-30">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <button onClick={onToggle} className="rounded p-1 text-muted hover:bg-surface-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {/* результат + выбор данных из ответа */}
      {result && result.status !== "running" && (
        <div className="border-t border-border bg-surface-2/30 px-3 py-2">
          {result.status === "skipped" ? (
            <p className="text-xs text-muted">⏭️ Шаг пропущен — условие не выполнилось, сценарий остановлен.</p>
          ) : result.response ? (
            <>
              <div className="mb-1.5 flex items-center gap-2 text-xs">
                <span className="font-semibold" style={{ color: result.response.ok ? "#10b981" : "#ef4444" }}>
                  {result.response.status} {result.response.statusText}
                </span>
                <span className="text-muted">{result.response.ms} ms</span>
                {result.response.ok && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-brand">
                    <MousePointerClick className="h-3.5 w-3.5" /> нажми на значение, чтобы взять его
                  </span>
                )}
              </div>
              {result.response.error ? (
                <p className="text-xs text-red-500">{result.response.error}</p>
              ) : (
                <ResponsePicker body={result.response.body} onPick={captureLeaf} takenPaths={step.captures.map((c) => c.from)} />
              )}
            </>
          ) : null}

          {step.captures.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">Берём отсюда:</span>
              {step.captures.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 py-0.5 pl-2 pr-1 text-[11px]">
                  <span className="font-mono font-semibold text-brand">{`{{${c.to}}}`}</span>
                  <button onClick={() => onStep({ captures: step.captures.filter((x) => x.id !== c.id) })} className="rounded-full p-0.5 text-faint hover:bg-red-500/10 hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* редактор шага */}
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <input value={req.name} onChange={(e) => onReq({ name: e.target.value })} className="input text-sm font-semibold" placeholder="Название шага" />
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
            <input value={req.url} onChange={(e) => onReq({ url: e.target.value })} className="input flex-1 font-mono text-xs" spellCheck={false} />
          </div>

          {/* подстановка данных из прошлых шагов */}
          {placeholders.length > 0 && (
            <div className="rounded-lg border border-border p-2">
              <div className="mb-1.5 text-xs font-semibold">Подставить данные</div>
              <div className="space-y-1.5">
                {placeholders.map((ph) => (
                  <BindingRow
                    key={ph}
                    placeholder={ph}
                    value={step.bindings[ph] ?? (available.includes(ph) ? ph : "")}
                    available={available}
                    onChange={(v) => onStep({ bindings: { ...step.bindings, [ph]: v } })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* условие */}
          <ConditionEditor available={available} condition={step.condition} onChange={(condition) => onStep({ condition })} />

          <details className="rounded-lg border border-border p-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted">Заголовки, авторизация, тело</summary>
            <div className="mt-2 space-y-3">
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
          </details>

          <div className="flex justify-end">
            <button onClick={onDelete} className="btn-ghost text-xs text-red-500 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Удалить шаг
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── строка «подставить {{ph}} ← значение» ────────────────────────────────────────
function BindingRow({
  placeholder,
  value,
  available,
  onChange,
}: {
  placeholder: string;
  value: string;
  available: string[];
  onChange: (v: string) => void;
}) {
  const manual = value.startsWith("=");
  const selectVal = manual ? "__manual__" : available.includes(value) ? value : value === "" ? "" : "__manual__";
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-28 shrink-0 truncate font-mono text-[11px] text-muted">{`{{${placeholder}}}`}</span>
      <span className="text-faint">←</span>
      <select
        value={selectVal}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__manual__") onChange("=");
          else onChange(v);
        }}
        className="input flex-1 py-1.5 text-xs"
      >
        <option value="">— не задано —</option>
        {available.map((a) => (
          <option key={a} value={a}>
            значение «{a}» из прошлого шага
          </option>
        ))}
        <option value="__manual__">ввести вручную…</option>
      </select>
      {manual && (
        <input
          value={value.slice(1)}
          onChange={(e) => onChange("=" + e.target.value)}
          placeholder="значение"
          className="input flex-1 py-1.5 text-xs"
        />
      )}
    </div>
  );
}

// ─── условие «выполнять только если…» ─────────────────────────────────────────────
function ConditionEditor({
  available,
  condition,
  onChange,
}: {
  available: string[];
  condition?: FlowStep["condition"];
  onChange: (c: FlowStep["condition"]) => void;
}) {
  const on = !!condition?.enabled;
  return (
    <div className="rounded-lg border border-border p-2">
      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { enabled: true, left: condition?.left ?? available[0] ?? "", op: condition?.op ?? "exists", right: condition?.right ?? "" }
                : undefined,
            )
          }
          className="h-4 w-4 accent-[color:rgb(var(--brand))]"
        />
        Выполнять шаг, только если…
      </label>
      {on && condition && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <select
            value={condition.left}
            onChange={(e) => onChange({ ...condition, left: e.target.value })}
            className="input w-auto flex-1 py-1.5 text-xs"
          >
            {available.length === 0 && <option value="">нет данных из прошлых шагов</option>}
            {available.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={condition.op}
            onChange={(e) => onChange({ ...condition, op: e.target.value as CondOp })}
            className="input w-auto py-1.5 text-xs"
          >
            {(Object.keys(COND_LABEL) as CondOp[]).map((o) => (
              <option key={o} value={o}>
                {COND_LABEL[o]}
              </option>
            ))}
          </select>
          {condition.op !== "exists" && condition.op !== "notExists" && (
            <input
              value={condition.right}
              onChange={(e) => onChange({ ...condition, right: e.target.value })}
              placeholder="значение"
              className="input w-24 py-1.5 text-xs"
            />
          )}
        </div>
      )}
      {on && <p className="mt-1 text-[11px] text-muted">Если не выполнится — сценарий остановится на этом шаге.</p>}
    </div>
  );
}

// ─── ответ с кликабельными значениями ─────────────────────────────────────────────
function ResponsePicker({
  body,
  onPick,
  takenPaths,
}: {
  body: string;
  onPick: (path: string, label: string) => void;
  takenPaths: string[];
}) {
  const leaves = useMemo(() => flattenJson(body), [body]);
  if (leaves.length === 0) {
    return (
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface p-2 font-mono text-[11px] text-muted">
        {body.slice(0, 2000)}
      </pre>
    );
  }
  return (
    <div className="max-h-56 space-y-0.5 overflow-auto rounded-lg bg-surface p-1.5">
      {leaves.map((leaf) => {
        const taken = takenPaths.includes(leaf.path);
        return (
          <button
            key={leaf.path}
            onClick={() => onPick(leaf.path, leaf.label)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition hover:bg-brand/10",
              taken && "opacity-60",
            )}
            title={`Взять ${leaf.path}`}
          >
            <span className="shrink-0 font-mono font-semibold text-brand">{leaf.path}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-muted">{leaf.preview}</span>
            {taken ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <Plus className="h-3.5 w-3.5 shrink-0 text-faint" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── модалка «выбрать API» (группа → запрос) ──────────────────────────────────────
function AddApiModal({
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
    <Modal open={open} onClose={onClose} title="Выбрать API для шага" size="lg">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" className="input mb-3" />
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
      <Plus className="h-4 w-4 shrink-0 text-brand" />
    </button>
  );
}
