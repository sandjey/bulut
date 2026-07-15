"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Plus,
  Trash2,
  Upload,
  ChevronRight,
  ChevronDown,
  Copy,
  TerminalSquare,
  X,
  Loader2,
  Eye,
  Pencil,
  FolderClosed,
  Settings2,
  Server,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  loadState,
  saveState,
  defaultState,
  buildVarMap,
  buildFinal,
  execute,
  toCurl,
  highlightJson,
  importPostman,
  emptyRequest,
  seedBulutCollection,
  kv,
  uid,
  HTTP_METHODS,
  type ConsoleState,
  type ApiRequest,
  type Environment,
  type KV,
  type ResponseData,
  type HttpMethod,
  type BodyMode,
  type AuthType,
} from "@/lib/console";

const METHOD_COLOR: Record<string, string> = {
  GET: "#10b981",
  POST: "#f59e0b",
  PUT: "#3b82f6",
  PATCH: "#8b5cf6",
  DELETE: "#ef4444",
  HEAD: "#64748b",
  OPTIONS: "#64748b",
};

// ─── поиск/обновление запроса в дереве ─────────────────────────────────────────
function findRequest(state: ConsoleState, id: string | null): ApiRequest | null {
  if (!id) return null;
  for (const c of state.collections) {
    const r = c.requests.find((x) => x.id === id);
    if (r) return r;
    for (const f of c.folders) {
      const fr = f.requests.find((x) => x.id === id);
      if (fr) return fr;
    }
  }
  return null;
}

export default function ConsolePage() {
  const { user } = useAuth();
  const { activeId: wsId } = useWorkspace();
  const userId = user?.id ?? "";

  const [state, setState] = useState<ConsoleState>(defaultState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [sending, setSending] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [tab, setTab] = useState<"params" | "headers" | "auth" | "body">("params");
  const [resTab, setResTab] = useState<"body" | "raw" | "headers">("body");
  const [logOpen, setLogOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // загрузка/сохранение состояния (localStorage, как Postman)
  useEffect(() => {
    if (!userId) return;
    const s = loadState(userId);
    setState(s);
    const first = s.collections[0]?.requests[0] ?? s.collections[0]?.folders[0]?.requests[0] ?? null;
    setSelectedId(first?.id ?? null);
  }, [userId]);
  useEffect(() => {
    if (userId) saveState(userId, state);
  }, [userId, state]);

  // токен текущей сессии — для «Bulut»-авторизации
  useEffect(() => {
    const sb = getSupabase();
    sb?.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? ""));
  }, []);

  const activeEnv = useMemo(
    () => state.environments.find((e) => e.id === state.activeEnvId) ?? null,
    [state.environments, state.activeEnvId],
  );
  const current = useMemo(() => findRequest(state, selectedId), [state, selectedId]);

  const varMap = useMemo(
    () => buildVarMap(activeEnv, { workspace_id: wsId ?? "", bulut_token: token }),
    [activeEnv, wsId, token],
  );
  const final = useMemo(
    () => (current ? buildFinal(current, varMap, token, wsId ?? "") : null),
    [current, varMap, token, wsId],
  );

  // ── мутации состояния ──
  const updateReq = (id: string, patch: Partial<ApiRequest>) =>
    setState((s) => ({
      ...s,
      collections: s.collections.map((c) => ({
        ...c,
        requests: c.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        folders: c.folders.map((f) => ({
          ...f,
          requests: f.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),
      })),
    }));

  const deleteReq = (id: string) => {
    setState((s) => ({
      ...s,
      collections: s.collections.map((c) => ({
        ...c,
        requests: c.requests.filter((r) => r.id !== id),
        folders: c.folders.map((f) => ({ ...f, requests: f.requests.filter((r) => r.id !== id) })),
      })),
    }));
    if (selectedId === id) setSelectedId(null);
  };

  const addRequest = (collectionId: string) => {
    const req = emptyRequest({ url: "{{base_url}}/api", auth: { type: "bulut" } });
    setState((s) => ({
      ...s,
      collections: s.collections.map((c) =>
        c.id === collectionId ? { ...c, requests: [...c.requests, req] } : c,
      ),
    }));
    setSelectedId(req.id);
  };

  const addCollection = () => {
    const c = { id: uid(), name: "Новая коллекция", folders: [], requests: [] };
    setState((s) => ({ ...s, collections: [...s.collections, c] }));
  };
  const deleteCollection = (id: string) =>
    setState((s) => ({ ...s, collections: s.collections.filter((c) => c.id !== id) }));

  const restoreBulut = () =>
    setState((s) => ({ ...s, collections: [seedBulutCollection(), ...s.collections] }));

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const col = importPostman(JSON.parse(String(reader.result)));
        setState((s) => ({ ...s, collections: [...s.collections, col] }));
      } catch {
        alert("Не удалось разобрать файл. Нужен экспорт Postman Collection (v2.1, JSON).");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── отправка ──
  const send = async () => {
    if (!current || !final) return;
    const isWrite = current.method !== "GET" && current.method !== "HEAD";
    if (isWrite && readOnly) {
      alert("Включён режим «Только чтение». Снимите его, чтобы отправлять изменяющие запросы.");
      return;
    }
    if (isWrite && !window.confirm(`Отправить ${current.method} ${final.url}?\nЭто может изменить данные.`)) {
      return;
    }
    setSending(true);
    const res = await execute(final);
    setSending(false);
    setResponse(res);
    setResTab("body");
    setState((s) => ({
      ...s,
      history: [
        {
          id: uid(),
          at: Date.now(),
          method: current.method,
          url: final.url,
          status: res.status,
          ms: res.ms,
          ok: res.ok,
        },
        ...s.history,
      ].slice(0, 50),
    }));
  };

  const copyCurl = () => {
    if (final) navigator.clipboard?.writeText(toCurl(final));
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Верхняя панель ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-bold">
          <TerminalSquare className="h-5 w-5 text-brand" />
          Bulut API
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* окружение */}
          <div className="flex items-center gap-1 rounded-lg border border-border px-1.5 py-1">
            <Server className="h-3.5 w-3.5 text-muted" />
            <select
              className="bg-transparent text-sm outline-none"
              value={state.activeEnvId ?? ""}
              onChange={(e) => setState((s) => ({ ...s, activeEnvId: e.target.value }))}
            >
              {state.environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setEnvOpen((v) => !v)}
              className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
              title="Настроить переменные окружения"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* только чтение / редактирование */}
          <button
            onClick={() => setReadOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition",
              readOnly
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                : "border-amber-500/50 bg-amber-500/10 text-amber-600",
            )}
            title={
              readOnly
                ? "Только чтение — изменяющие запросы (POST/PATCH/DELETE) заблокированы"
                : "Изменения разрешены — POST/PATCH/DELETE будут выполняться"
            }
          >
            {readOnly ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            <span className="hidden sm:inline">{readOnly ? "Только чтение" : "Изменения вкл."}</span>
          </button>

          <button onClick={() => setLogOpen((v) => !v)} className="btn-outline text-sm" title="Журнал запросов">
            <TerminalSquare className="h-4 w-4" /> Консоль
          </button>
        </div>
      </div>

      {/* редактор окружения */}
      {envOpen && activeEnv && (
        <EnvEditor
          env={activeEnv}
          onChange={(patch) =>
            setState((s) => ({
              ...s,
              environments: s.environments.map((e) => (e.id === activeEnv.id ? { ...e, ...patch } : e)),
            }))
          }
          onAddEnv={() => {
            const e = { id: uid(), name: "Новое окружение", vars: [kv("base_url", "")] };
            setState((s) => ({ ...s, environments: [...s.environments, e], activeEnvId: e.id }));
          }}
          onDeleteEnv={() =>
            setState((s) => {
              const rest = s.environments.filter((e) => e.id !== activeEnv.id);
              return { ...s, environments: rest, activeEnvId: rest[0]?.id ?? null };
            })
          }
          onClose={() => setEnvOpen(false)}
        />
      )}

      {/* ── Основная область ── */}
      <div className="flex min-h-0 flex-1">
        {/* левая колонка — коллекции */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-faint">Коллекции</span>
            <div className="ml-auto flex items-center gap-0.5">
              <button onClick={() => fileRef.current?.click()} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title="Импорт Postman (JSON)">
                <Upload className="h-4 w-4" />
              </button>
              <button onClick={addCollection} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title="Новая коллекция">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onImport} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {state.collections.length === 0 && (
              <div className="p-3 text-center text-xs text-muted">
                Нет коллекций.{" "}
                <button onClick={restoreBulut} className="text-brand underline">
                  Вернуть Bulut API
                </button>
              </div>
            )}
            {state.collections.map((col) => (
              <CollectionTree
                key={col.id}
                collection={col}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAddRequest={() => addRequest(col.id)}
                onDeleteCollection={() => deleteCollection(col.id)}
                onDeleteRequest={deleteReq}
              />
            ))}
          </div>
        </aside>

        {/* правая колонка — запрос + ответ */}
        <main className="flex min-w-0 flex-1 flex-col">
          {!current ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted">
              <TerminalSquare className="h-10 w-10 opacity-40" />
              <p className="text-sm">Выберите запрос слева или создайте новый.</p>
            </div>
          ) : (
            <>
              {/* строка запроса */}
              <div className="flex flex-col gap-2 border-b border-border p-3">
                <input
                  value={current.name}
                  onChange={(e) => updateReq(current.id, { name: e.target.value })}
                  className="bg-transparent text-sm font-semibold outline-none"
                  placeholder="Название запроса"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={current.method}
                    onChange={(e) => updateReq(current.id, { method: e.target.value as HttpMethod })}
                    className="rounded-lg border border-border bg-surface px-2 py-2 text-sm font-bold outline-none"
                    style={{ color: METHOD_COLOR[current.method] }}
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m} style={{ color: METHOD_COLOR[m] }}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    value={current.url}
                    onChange={(e) => updateReq(current.id, { url: e.target.value })}
                    className="input flex-1 font-mono text-sm"
                    placeholder="{{base_url}}/api/tasks"
                    spellCheck={false}
                  />
                  <button onClick={send} disabled={sending} className="btn-primary shrink-0">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Отправить
                  </button>
                  <button onClick={copyCurl} className="btn-outline shrink-0" title="Скопировать как curl">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                {final && (
                  <p className="truncate font-mono text-[11px] text-faint" title={final.url}>
                    → {final.url}
                  </p>
                )}
              </div>

              {/* вкладки запроса */}
              <div className="flex items-center gap-1 border-b border-border px-2">
                {(
                  [
                    ["params", `Параметры${current.params.length ? ` (${current.params.length})` : ""}`],
                    ["headers", `Заголовки${current.headers.length ? ` (${current.headers.length})` : ""}`],
                    ["auth", "Авторизация"],
                    ["body", "Тело"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={cn(
                      "border-b-2 px-3 py-2 text-sm transition",
                      tab === key ? "border-brand font-semibold text-fg" : "border-transparent text-muted hover:text-fg",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {tab === "params" && (
                  <KVEditor rows={current.params} onChange={(params) => updateReq(current.id, { params })} kPlaceholder="ключ" vPlaceholder="значение" />
                )}
                {tab === "headers" && (
                  <KVEditor rows={current.headers} onChange={(headers) => updateReq(current.id, { headers })} kPlaceholder="Header" vPlaceholder="значение" />
                )}
                {tab === "auth" && <AuthEditor req={current} onChange={(patch) => updateReq(current.id, patch)} />}
                {tab === "body" && <BodyEditor req={current} onChange={(patch) => updateReq(current.id, patch)} />}
              </div>

              {/* ответ */}
              <ResponseView response={response} tab={resTab} setTab={setResTab} />
            </>
          )}
        </main>
      </div>

      {/* нижний журнал */}
      {logOpen && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted">
            <TerminalSquare className="h-4 w-4" /> Журнал запросов
            <button onClick={() => setState((s) => ({ ...s, history: [] }))} className="ml-auto text-faint hover:text-fg">
              очистить
            </button>
            <button onClick={() => setLogOpen(false)} className="rounded p-0.5 hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto px-2 pb-2">
            {state.history.length === 0 && <p className="p-2 text-xs text-faint">Пока пусто. Отправьте запрос.</p>}
            {state.history.map((h) => (
              <div key={h.id} className="flex items-center gap-2 rounded px-2 py-1 font-mono text-[11px] hover:bg-surface-2">
                <span className="font-bold" style={{ color: METHOD_COLOR[h.method] }}>
                  {h.method}
                </span>
                <span className={cn("font-semibold", h.ok ? "text-emerald-500" : "text-red-500")}>{h.status || "—"}</span>
                <span className="text-faint">{h.ms}ms</span>
                <span className="min-w-0 flex-1 truncate text-muted">{h.url}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── дерево коллекции ─────────────────────────────────────────────────────────
function CollectionTree({
  collection,
  selectedId,
  onSelect,
  onAddRequest,
  onDeleteCollection,
  onDeleteRequest,
}: {
  collection: { id: string; name: string; folders: { id: string; name: string; requests: ApiRequest[] }[]; requests: ApiRequest[] };
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddRequest: () => void;
  onDeleteCollection: () => void;
  onDeleteRequest: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <div className="group flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-surface-2">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1 text-left">
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
          <span className="truncate text-[13px] font-semibold">{collection.name}</span>
        </button>
        <button onClick={onAddRequest} className="rounded p-0.5 text-faint opacity-0 hover:bg-surface-3 hover:text-fg group-hover:opacity-100" title="Добавить запрос">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDeleteCollection} className="rounded p-0.5 text-faint opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100" title="Удалить коллекцию">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="ml-2 border-l border-border pl-1">
          {collection.requests.map((r) => (
            <RequestRow key={r.id} req={r} active={r.id === selectedId} onSelect={() => onSelect(r.id)} onDelete={() => onDeleteRequest(r.id)} />
          ))}
          {collection.folders.map((f) => (
            <FolderRow key={f.id} folder={f} selectedId={selectedId} onSelect={onSelect} onDeleteRequest={onDeleteRequest} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderRow({
  folder,
  selectedId,
  onSelect,
  onDeleteRequest,
}: {
  folder: { id: string; name: string; requests: ApiRequest[] };
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleteRequest: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-surface-2">
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
        <FolderClosed className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span className="truncate text-[13px] text-muted">{folder.name}</span>
      </button>
      {open && (
        <div className="ml-2 border-l border-border pl-1">
          {folder.requests.map((r) => (
            <RequestRow key={r.id} req={r} active={r.id === selectedId} onSelect={() => onSelect(r.id)} onDelete={() => onDeleteRequest(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestRow({ req, active, onSelect, onDelete }: { req: ApiRequest; active: boolean; onSelect: () => void; onDelete: () => void }) {
  return (
    <div className={cn("group flex items-center gap-1.5 rounded-lg px-1.5 py-1", active ? "bg-brand/10" : "hover:bg-surface-2")}>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <span className="w-11 shrink-0 text-right font-mono text-[10px] font-bold" style={{ color: METHOD_COLOR[req.method] }}>
          {req.method}
        </span>
        <span className={cn("truncate text-[13px]", active ? "font-semibold text-fg" : "text-muted")}>{req.name}</span>
      </button>
      <button onClick={onDelete} className="rounded p-0.5 text-faint opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100" title="Удалить">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── редактор ключ-значение ───────────────────────────────────────────────────
function KVEditor({
  rows,
  onChange,
  kPlaceholder,
  vPlaceholder,
}: {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  kPlaceholder: string;
  vPlaceholder: string;
}) {
  const set = (id: string, patch: Partial<KV>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, kv()]);
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-1.5">
          <input type="checkbox" checked={r.enabled} onChange={(e) => set(r.id, { enabled: e.target.checked })} className="h-4 w-4 accent-[color:rgb(var(--brand))]" />
          <input value={r.key} onChange={(e) => set(r.id, { key: e.target.value })} placeholder={kPlaceholder} className="input flex-1 py-1.5 font-mono text-xs" spellCheck={false} />
          <input value={r.value} onChange={(e) => set(r.id, { value: e.target.value })} placeholder={vPlaceholder} className="input flex-1 py-1.5 font-mono text-xs" spellCheck={false} />
          <button onClick={() => remove(r.id)} className="rounded p-1 text-faint hover:bg-red-500/10 hover:text-red-500">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button onClick={add} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
        <Plus className="h-3.5 w-3.5" /> Добавить строку
      </button>
    </div>
  );
}

// ─── авторизация ──────────────────────────────────────────────────────────────
function AuthEditor({ req, onChange }: { req: ApiRequest; onChange: (patch: Partial<ApiRequest>) => void }) {
  const type = req.auth.type;
  const setType = (t: AuthType) => onChange({ auth: { ...req.auth, type: t } });
  return (
    <div className="max-w-md space-y-3">
      <div>
        <label className="label">Тип</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as AuthType)}>
          <option value="bulut">Bulut (моя сессия) — токен и комната автоматически</option>
          <option value="none">Без авторизации</option>
          <option value="bearer">Bearer-токен</option>
          <option value="basic">Basic (логин/пароль)</option>
        </select>
      </div>
      {type === "bulut" && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
          Заголовок <b>Authorization: Bearer …</b> и <b>X-Workspace-Id</b> подставятся сами из текущей сессии. Копировать токены не нужно.
        </p>
      )}
      {type === "bearer" && (
        <div>
          <label className="label">Токен</label>
          <input className="input font-mono text-xs" value={req.auth.token ?? ""} onChange={(e) => onChange({ auth: { ...req.auth, token: e.target.value } })} placeholder="eyJhbGciOi… или {{token}}" />
        </div>
      )}
      {type === "basic" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Логин</label>
            <input className="input text-sm" value={req.auth.username ?? ""} onChange={(e) => onChange({ auth: { ...req.auth, username: e.target.value } })} />
          </div>
          <div>
            <label className="label">Пароль</label>
            <input className="input text-sm" value={req.auth.password ?? ""} onChange={(e) => onChange({ auth: { ...req.auth, password: e.target.value } })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── тело запроса ─────────────────────────────────────────────────────────────
function BodyEditor({ req, onChange }: { req: ApiRequest; onChange: (patch: Partial<ApiRequest>) => void }) {
  const modes: { key: BodyMode; label: string }[] = [
    { key: "none", label: "Нет" },
    { key: "json", label: "JSON" },
    { key: "raw", label: "Текст" },
    { key: "urlencoded", label: "x-www-form-urlencoded" },
    { key: "form", label: "form-data" },
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => onChange({ bodyMode: m.key })}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs transition",
              req.bodyMode === m.key ? "border-brand bg-brand/10 text-fg" : "border-border text-muted hover:bg-surface-2",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {(req.bodyMode === "json" || req.bodyMode === "raw") && (
        <textarea
          value={req.body}
          onChange={(e) => onChange({ body: e.target.value })}
          className="input min-h-[180px] w-full resize-y font-mono text-xs"
          placeholder={req.bodyMode === "json" ? '{\n  "title": "Задача"\n}' : "текст тела запроса"}
          spellCheck={false}
        />
      )}
      {(req.bodyMode === "form" || req.bodyMode === "urlencoded") && (
        <KVEditor rows={req.form} onChange={(form) => onChange({ form })} kPlaceholder="поле" vPlaceholder="значение" />
      )}
      {req.bodyMode === "none" && <p className="text-xs text-muted">Тело не отправляется.</p>}
    </div>
  );
}

// ─── ответ ────────────────────────────────────────────────────────────────────
function ResponseView({
  response,
  tab,
  setTab,
}: {
  response: ResponseData | null;
  tab: "body" | "raw" | "headers";
  setTab: (t: "body" | "raw" | "headers") => void;
}) {
  if (!response) {
    return (
      <div className="flex h-40 shrink-0 items-center justify-center border-t border-border text-xs text-faint">
        Ответ появится здесь после отправки.
      </div>
    );
  }
  const statusColor = response.error
    ? "#ef4444"
    : response.ok
      ? "#10b981"
      : response.status >= 400
        ? "#ef4444"
        : "#f59e0b";
  return (
    <div className="flex h-[38%] min-h-[180px] shrink-0 flex-col border-t border-border">
      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs">
        <span className="font-bold" style={{ color: statusColor }}>
          {response.error ? "Ошибка" : `${response.status} ${response.statusText}`}
        </span>
        <span className="text-muted">{response.ms} ms</span>
        <span className="text-muted">{(response.sizeBytes / 1024).toFixed(1)} KB</span>
        <div className="ml-auto flex gap-1">
          {(["body", "raw", "headers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("rounded px-2 py-0.5 transition", tab === t ? "bg-brand/10 font-semibold text-fg" : "text-muted hover:text-fg")}
            >
              {t === "body" ? "Тело" : t === "raw" ? "Сырое" : `Заголовки (${Object.keys(response.headers).length})`}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {response.error ? (
          <p className="text-sm text-red-500">{response.error}</p>
        ) : tab === "headers" ? (
          <div className="space-y-0.5 font-mono text-xs">
            {Object.entries(response.headers).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="shrink-0 font-semibold text-brand">{k}:</span>
                <span className="min-w-0 break-all text-muted">{v}</span>
              </div>
            ))}
          </div>
        ) : tab === "raw" ? (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-fg">{response.body}</pre>
        ) : (
          <pre className="json-view whitespace-pre-wrap break-all text-xs" dangerouslySetInnerHTML={{ __html: highlightJson(response.body) }} />
        )}
      </div>
    </div>
  );
}

// ─── редактор окружения ───────────────────────────────────────────────────────
function EnvEditor({
  env,
  onChange,
  onAddEnv,
  onDeleteEnv,
  onClose,
}: {
  env: Environment;
  onChange: (patch: Partial<Environment>) => void;
  onAddEnv: () => void;
  onDeleteEnv: () => void;
  onClose: () => void;
}) {
  return (
    <div className="border-b border-border bg-surface-2/40 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={env.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="bg-transparent text-sm font-semibold outline-none"
        />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onAddEnv} className="btn-ghost text-xs">
            <Plus className="h-3.5 w-3.5" /> Окружение
          </button>
          <button onClick={onDeleteEnv} className="btn-ghost text-xs text-red-500 hover:bg-red-500/10">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-faint">
        Используйте переменные как <span className="font-mono">{"{{base_url}}"}</span> в URL, заголовках и теле. Доступны также{" "}
        <span className="font-mono">{"{{workspace_id}}"}</span> и <span className="font-mono">{"{{bulut_token}}"}</span>.
      </p>
      <KVEditor rows={env.vars} onChange={(vars) => onChange({ vars })} kPlaceholder="имя" vPlaceholder="значение" />
    </div>
  );
}
