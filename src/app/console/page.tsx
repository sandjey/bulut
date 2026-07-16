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
  FolderPlus,
  Settings2,
  Server,
  Workflow,
  Download,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Search,
  Cookie,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { getSupabase } from "@/lib/supabase";
import * as db from "@/lib/db";
import { cn } from "@/lib/utils";
import { METHOD_COLOR, KVEditor, AuthEditor, BodyEditor } from "@/components/console/shared";
import { FlowBuilder } from "@/components/console/FlowBuilder";
import {
  loadState,
  saveState,
  defaultState,
  buildVarMap,
  buildFinal,
  execute,
  flattenJson,
  getByPath,
  toStringVal,
  importPostman,
  importPostmanEnv,
  requestVars,
  emptyRequest,
  seedBulutCollection,
  splitUrl,
  joinUrl,
  parseCurl,
  exportPostman,
  generateCode,
  CODE_LANGS,
  runAssertions,
  normalizeRequestUrls,
  clearCookies,
  cookieCount,
  fileStore,
  kv,
  uid,
  HTTP_METHODS,
  type ConsoleState,
  type ApiRequest,
  type Environment,
  type ResponseData,
  type HttpMethod,
  type Flow,
  type Collection,
  type Assertion,
  type CodeLang,
} from "@/lib/console";

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
  const [mode, setMode] = useState<"requests" | "flows">("requests");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [sending, setSending] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [tab, setTab] = useState<"params" | "headers" | "auth" | "body" | "tests">("params");
  const [resTab, setResTab] = useState<"body" | "raw" | "headers" | "pick">("body");
  const [logOpen, setLogOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [curlOpen, setCurlOpen] = useState(false);
  const [codeLang, setCodeLang] = useState<CodeLang | null>(null);
  const [cookieN, setCookieN] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Загрузка: сначала база (синхронизация между устройствами), затем локальный кэш.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const local = loadState(userId);
      const remote = await db.fetchConsoleState(userId);
      if (cancelled) return;
      let s = local;
      if (remote && typeof remote === "object") {
        const r = remote as Partial<ConsoleState>;
        s = {
          collections: r.collections?.length ? r.collections : local.collections,
          environments: r.environments?.length ? r.environments : local.environments,
          activeEnvId: r.activeEnvId ?? local.activeEnvId,
          history: local.history, // журнал запросов — только локально
          flows: r.flows ?? local.flows ?? [],
        };
      }
      s = normalizeRequestUrls(s);
      setState(s);
      const first = s.collections[0]?.requests[0] ?? s.collections[0]?.folders[0]?.requests[0] ?? null;
      setSelectedId(first?.id ?? null);
      loadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Локальный кэш (моментально, офлайн-фолбэк).
  useEffect(() => {
    if (userId) saveState(userId, state);
  }, [userId, state]);

  // Сохранение в базу (с задержкой) — коллекции и окружения. Журнал не шлём.
  useEffect(() => {
    if (!userId || !loadedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      db.saveConsoleState(userId, {
        collections: state.collections,
        environments: state.environments,
        activeEnvId: state.activeEnvId,
        flows: state.flows,
      }).catch(() => {
        /* миграция не применена / офлайн — остаётся локальный кэш */
      });
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [userId, state.collections, state.environments, state.activeEnvId, state.flows]);

  // токен текущей сессии — для «Bulut»-авторизации
  useEffect(() => {
    const sb = getSupabase();
    sb?.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? ""));
    setCookieN(cookieCount());
  }, []);

  const activeEnv = useMemo(
    () => state.environments.find((e) => e.id === state.activeEnvId) ?? null,
    [state.environments, state.activeEnvId],
  );
  const current = useMemo(() => findRequest(state, selectedId), [state, selectedId]);

  const varMap = useMemo(
    () =>
      buildVarMap(activeEnv, {
        base_url: typeof window !== "undefined" ? window.location.origin : "",
        workspace_id: wsId ?? "",
        bulut_token: token,
      }),
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
    const req = emptyRequest({ url: "/api", auth: { type: "bulut" } });
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

  // управление коллекциями/папками/запросами
  const mapList = (cols: Collection[], id: string, fn: (arr: ApiRequest[]) => ApiRequest[]) =>
    cols.map((c) => {
      if (c.requests.some((r) => r.id === id)) return { ...c, requests: fn(c.requests) };
      return { ...c, folders: c.folders.map((f) => (f.requests.some((r) => r.id === id) ? { ...f, requests: fn(f.requests) } : f)) };
    });
  const duplicateReq = (id: string) => {
    const src = findRequest(state, id);
    if (!src) return;
    const copy: ApiRequest = { ...JSON.parse(JSON.stringify(src)), id: uid(), name: `${src.name} (копия)` };
    setState((s) => ({
      ...s,
      collections: mapList(s.collections, id, (arr) => {
        const i = arr.findIndex((r) => r.id === id);
        const a = [...arr];
        a.splice(i + 1, 0, copy);
        return a;
      }),
    }));
    setSelectedId(copy.id);
  };
  const reorderReq = (id: string, dir: -1 | 1) =>
    setState((s) => ({
      ...s,
      collections: mapList(s.collections, id, (arr) => {
        const i = arr.findIndex((r) => r.id === id);
        const j = i + dir;
        if (j < 0 || j >= arr.length) return arr;
        const a = [...arr];
        [a[i], a[j]] = [a[j], a[i]];
        return a;
      }),
    }));
  const moveReq = (id: string, toColId: string, toFolderId: string | null) => {
    const src = findRequest(state, id);
    if (!src) return;
    setState((s) => {
      let cols = s.collections.map((c) => ({
        ...c,
        requests: c.requests.filter((r) => r.id !== id),
        folders: c.folders.map((f) => ({ ...f, requests: f.requests.filter((r) => r.id !== id) })),
      }));
      cols = cols.map((c) => {
        if (c.id !== toColId) return c;
        if (toFolderId) return { ...c, folders: c.folders.map((f) => (f.id === toFolderId ? { ...f, requests: [...f.requests, src] } : f)) };
        return { ...c, requests: [...c.requests, src] };
      });
      return { ...s, collections: cols };
    });
  };
  const renameCollection = (id: string, name: string) =>
    setState((s) => ({ ...s, collections: s.collections.map((c) => (c.id === id ? { ...c, name } : c)) }));
  const renameFolder = (colId: string, fid: string, name: string) =>
    setState((s) => ({
      ...s,
      collections: s.collections.map((c) => (c.id === colId ? { ...c, folders: c.folders.map((f) => (f.id === fid ? { ...f, name } : f)) } : c)),
    }));
  const addFolder = (colId: string) =>
    setState((s) => ({
      ...s,
      collections: s.collections.map((c) => (c.id === colId ? { ...c, folders: [...c.folders, { id: uid(), name: "Новая папка", requests: [] }] } : c)),
    }));

  const restoreBulut = () =>
    setState((s) => ({ ...s, collections: [seedBulutCollection(), ...s.collections] }));

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        const col = importPostman(json);
        const env = importPostmanEnv(json); // переменные коллекции → окружение
        setState((s) => ({
          ...s,
          collections: [...s.collections, col],
          environments: env ? [...s.environments, env] : s.environments,
          activeEnvId: env ? env.id : s.activeEnvId,
        }));
      } catch {
        alert("Не удалось разобрать файл. Нужен экспорт Postman Collection (v2.1, JSON).");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── отправка ──
  const send = async () => {
    if (!current) return;
    const isWrite = current.method !== "GET" && current.method !== "HEAD";
    if (isWrite && readOnly) {
      alert("Включён режим «Только чтение». Снимите его, чтобы отправлять изменяющие запросы.");
      return;
    }
    setSending(true);
    // свежий токен сессии (не протухший) для Bulut-авторизации
    let tok = token;
    if (current.auth.type === "bulut") {
      try {
        const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
        if (data.session?.access_token) {
          tok = data.session.access_token;
          setToken(tok);
        }
      } catch {
        /* оставим текущий */
      }
    }
    const vmap = buildVarMap(activeEnv, {
      base_url: typeof window !== "undefined" ? window.location.origin : "",
      workspace_id: wsId ?? "",
      bulut_token: tok,
    });
    const f = buildFinal(current, vmap, tok, wsId ?? "");
    // form-data с файлами → multipart
    let formData: FormData | undefined;
    if (current.bodyMode === "form" && current.form.some((r) => r.isFile && fileStore.get(r.id))) {
      formData = new FormData();
      current.form
        .filter((r) => r.enabled && r.key)
        .forEach((r) => {
          if (r.isFile) {
            const file = fileStore.get(r.id);
            if (file) formData!.append(r.key, file);
          } else {
            formData!.append(r.key, r.value);
          }
        });
    }
    const res = await execute(f, formData);
    setSending(false);
    setResponse(res);
    setResTab("body");
    setCookieN(cookieCount());
    setState((s) => ({
      ...s,
      history: [
        { id: uid(), at: Date.now(), method: current.method, url: f.url, status: res.status, ms: res.ms, ok: res.ok },
        ...s.history,
      ].slice(0, 50),
    }));
  };

  const copyCode = (lang: CodeLang) => {
    if (final) navigator.clipboard?.writeText(generateCode(final, lang));
    setCodeLang(null);
  };
  const doExport = (col: Collection) => {
    const blob = new Blob([JSON.stringify(exportPostman(col), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${col.name || "collection"}.postman_collection.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importCurl = (text: string) => {
    const req = parseCurl(text);
    if (!req) {
      alert("Не похоже на команду curl. Проверьте текст.");
      return;
    }
    setState((s) => {
      const cols = s.collections.length ? s.collections : [{ id: uid(), name: "Импорт", folders: [], requests: [] }];
      const firstId = cols[0].id;
      return { ...s, collections: cols.map((c) => (c.id === firstId ? { ...c, requests: [...c.requests, req] } : c)) };
    });
    setSelectedId(req.id);
    setCurlOpen(false);
  };

  // управление переменными активного окружения (задать/удалить)
  const setVar = (name: string, value: string) => {
    if (!activeEnv) return;
    setState((s) => ({
      ...s,
      environments: s.environments.map((e) => {
        if (e.id !== activeEnv.id) return e;
        const exists = e.vars.some((v) => v.key === name);
        const vars = exists
          ? e.vars.map((v) => (v.key === name ? { ...v, value, enabled: true } : v))
          : [...e.vars, kv(name, value)];
        return { ...e, vars };
      }),
    }));
  };
  const deleteVar = (name: string) => {
    if (!activeEnv) return;
    setState((s) => ({
      ...s,
      environments: s.environments.map((e) =>
        e.id === activeEnv.id ? { ...e, vars: e.vars.filter((v) => v.key !== name) } : e,
      ),
    }));
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Верхняя панель ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-bold">
          <TerminalSquare className="h-5 w-5 text-brand" />
          Bulut API
        </div>

        {/* переключатель Запросы / Потоки */}
        <div className="ml-2 flex items-center rounded-lg border border-border p-0.5 text-sm">
          <button
            onClick={() => setMode("requests")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition",
              mode === "requests" ? "bg-brand/10 font-semibold text-brand" : "text-muted hover:text-fg",
            )}
          >
            <Send className="h-4 w-4" /> Запросы
          </button>
          <button
            onClick={() => setMode("flows")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition",
              mode === "flows" ? "bg-brand/10 font-semibold text-brand" : "text-muted hover:text-fg",
            )}
          >
            <Workflow className="h-4 w-4" /> Потоки
          </button>
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

          {cookieN > 0 && (
            <button
              onClick={() => {
                if (confirm("Очистить сохранённые куки внешних API?")) {
                  clearCookies();
                  setCookieN(0);
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-sm text-muted hover:text-fg"
              title="Куки внешних API — клик, чтобы очистить"
            >
              <Cookie className="h-4 w-4" /> {cookieN}
            </button>
          )}

          <button onClick={() => setLogOpen((v) => !v)} className="btn-outline text-sm" title="Журнал запросов">
            <TerminalSquare className="h-4 w-4" /> Консоль
          </button>
        </div>
      </div>

      <CurlModal open={curlOpen} onClose={() => setCurlOpen(false)} onImport={importCurl} />

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
            const e = { id: uid(), name: "Новое окружение", vars: [kv("", "")] };
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

      {/* ── Потоки (Часть B) ── */}
      {mode === "flows" && (
        <FlowBuilder
          flows={state.flows}
          collections={state.collections}
          activeEnv={activeEnv}
          token={token}
          wsId={wsId ?? ""}
          readOnly={readOnly}
          onChange={(flows: Flow[]) => setState((s) => ({ ...s, flows }))}
        />
      )}

      {/* ── Основная область (запросы) ── */}
      <div className={cn("flex min-h-0 flex-1", mode === "flows" && "hidden")}>
        {/* левая колонка — коллекции */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-faint">Коллекции</span>
            <div className="ml-auto flex items-center gap-0.5">
              <button onClick={() => setCurlOpen(true)} className="rounded px-1.5 py-1 text-[10px] font-bold text-muted hover:bg-surface-2 hover:text-fg" title="Импорт из cURL">
                cURL
              </button>
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
                collections={state.collections}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAddRequest={() => addRequest(col.id)}
                onAddFolder={() => addFolder(col.id)}
                onDeleteCollection={() => deleteCollection(col.id)}
                onRenameCollection={(name) => renameCollection(col.id, name)}
                onRenameFolder={renameFolder}
                onExport={() => doExport(col)}
                onDeleteRequest={deleteReq}
                onDuplicate={duplicateReq}
                onReorder={reorderReq}
                onMove={moveReq}
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
                    value={joinUrl(current.url, current.params)}
                    onChange={(e) => {
                      const { base, params } = splitUrl(e.target.value);
                      updateReq(current.id, { url: base, params });
                    }}
                    className="input flex-1 font-mono text-sm"
                    placeholder="/api/tasks"
                    spellCheck={false}
                  />
                  <button onClick={send} disabled={sending} className="btn-primary shrink-0">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Отправить
                  </button>
                  <div className="relative shrink-0">
                    <button onClick={() => setCodeLang((v) => (v ? null : "curl"))} className="btn-outline" title="Скопировать как код">
                      <Copy className="h-4 w-4" />
                    </button>
                    {codeLang && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-surface p-1 shadow-md">
                        {CODE_LANGS.map((l) => (
                          <button
                            key={l.key}
                            onClick={() => copyCode(l.key)}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-surface-2"
                          >
                            Скопировать: {l.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {final && (
                  <p className="truncate font-mono text-[11px] text-faint" title={final.url}>
                    → {final.url}
                  </p>
                )}
                <VariablesBar req={current} env={activeEnv} onSet={setVar} onDelete={deleteVar} />
              </div>

              {/* вкладки запроса */}
              <div className="flex items-center gap-1 border-b border-border px-2">
                {(
                  [
                    ["params", `Параметры${current.params.length ? ` (${current.params.length})` : ""}`],
                    ["headers", `Заголовки${current.headers.length ? ` (${current.headers.length})` : ""}`],
                    ["auth", "Авторизация"],
                    ["body", "Тело"],
                    ["tests", `Проверки${current.tests?.length ? ` (${current.tests.length})` : ""}`],
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
                {tab === "tests" && (
                  <TestsEditor tests={current.tests ?? []} onChange={(tests) => updateReq(current.id, { tests })} results={response ? runAssertions(current.tests ?? [], response) : []} />
                )}
              </div>

              {/* ответ */}
              <ResponseView response={response} tab={resTab} setTab={setResTab} onSaveVar={setVar} envName={activeEnv?.name} tests={current.tests ?? []} />
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
interface TreeActions {
  collections: Collection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
  onMove: (id: string, colId: string, folderId: string | null) => void;
  onRenameFolder: (colId: string, fid: string, name: string) => void;
}

/** Инлайн-редактируемое название (двойной клик). */
function EditableName({ value, onSave, className }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onSave(draft.trim() || value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="min-w-0 flex-1 rounded bg-surface px-1 text-[13px] outline-none ring-1 ring-brand"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <span className={cn("truncate", className)} onDoubleClick={() => { setDraft(value); setEditing(true); }} title="Двойной клик — переименовать">
      {value}
    </span>
  );
}

function CollectionTree({
  collection,
  onAddRequest,
  onAddFolder,
  onDeleteCollection,
  onRenameCollection,
  onExport,
  ...a
}: {
  collection: Collection;
  onAddRequest: () => void;
  onAddFolder: () => void;
  onDeleteCollection: () => void;
  onRenameCollection: (name: string) => void;
  onExport: () => void;
} & TreeActions) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <div className="group flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-surface-2">
        <button onClick={() => setOpen((v) => !v)} className="shrink-0">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
        </button>
        <EditableName value={collection.name} onSave={onRenameCollection} className="flex-1 text-[13px] font-semibold" />
        <button onClick={onExport} className="rounded p-0.5 text-faint opacity-0 hover:bg-surface-3 hover:text-fg group-hover:opacity-100" title="Экспорт (Postman JSON)">
          <Download className="h-3.5 w-3.5" />
        </button>
        <button onClick={onAddFolder} className="rounded p-0.5 text-faint opacity-0 hover:bg-surface-3 hover:text-fg group-hover:opacity-100" title="Новая папка">
          <FolderPlus className="h-3.5 w-3.5" />
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
            <RequestRow key={r.id} req={r} a={a} />
          ))}
          {collection.folders.map((f) => (
            <FolderRow key={f.id} colId={collection.id} folder={f} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderRow({ colId, folder, a }: { colId: string; folder: { id: string; name: string; requests: ApiRequest[] }; a: TreeActions }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div className="group flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-surface-2">
        <button onClick={() => setOpen((v) => !v)} className="shrink-0">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
        </button>
        <FolderClosed className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <EditableName value={folder.name} onSave={(name) => a.onRenameFolder(colId, folder.id, name)} className="flex-1 text-[13px] text-muted" />
      </div>
      {open && (
        <div className="ml-2 border-l border-border pl-1">
          {folder.requests.map((r) => (
            <RequestRow key={r.id} req={r} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestRow({ req, a }: { req: ApiRequest; a: TreeActions }) {
  const [menu, setMenu] = useState(false);
  const active = req.id === a.selectedId;
  const targets = a.collections.flatMap((c) => [
    { colId: c.id, folderId: null as string | null, label: c.name },
    ...c.folders.map((f) => ({ colId: c.id, folderId: f.id, label: `${c.name} / ${f.name}` })),
  ]);
  return (
    <div className={cn("group relative flex items-center gap-1.5 rounded-lg px-1.5 py-1", active ? "bg-brand/10" : "hover:bg-surface-2")}>
      <button onClick={() => a.onSelect(req.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <span className="w-11 shrink-0 text-right font-mono text-[10px] font-bold" style={{ color: METHOD_COLOR[req.method] }}>
          {req.method}
        </span>
        <span className={cn("truncate text-[13px]", active ? "font-semibold text-fg" : "text-muted")}>{req.name}</span>
      </button>
      <button onClick={() => a.onReorder(req.id, -1)} className="rounded p-0.5 text-faint opacity-0 hover:text-fg group-hover:opacity-100" title="Выше">
        <ArrowUp className="h-3 w-3" />
      </button>
      <button onClick={() => a.onReorder(req.id, 1)} className="rounded p-0.5 text-faint opacity-0 hover:text-fg group-hover:opacity-100" title="Ниже">
        <ArrowDown className="h-3 w-3" />
      </button>
      <button onClick={() => setMenu((v) => !v)} className="rounded p-0.5 text-faint opacity-0 hover:text-fg group-hover:opacity-100" title="Ещё">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-1 top-full z-20 mt-0.5 w-48 rounded-lg border border-border bg-surface p-1 text-xs shadow-md">
            <button onClick={() => { a.onDuplicate(req.id); setMenu(false); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2">
              <Copy className="h-3.5 w-3.5" /> Дублировать
            </button>
            <div className="my-1 border-t border-border" />
            <div className="px-2 py-0.5 text-[10px] uppercase tracking-wide text-faint">Переместить в</div>
            <div className="max-h-40 overflow-y-auto">
              {targets.map((t) => (
                <button
                  key={`${t.colId}:${t.folderId}`}
                  onClick={() => { a.onMove(req.id, t.colId, t.folderId); setMenu(false); }}
                  className="block w-full truncate rounded px-2 py-1 text-left hover:bg-surface-2"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="my-1 border-t border-border" />
            <button onClick={() => { a.onDeleteRequest(req.id); setMenu(false); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-red-500 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Удалить
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── ответ ────────────────────────────────────────────────────────────────────
function ResponseView({
  response,
  tab,
  setTab,
  onSaveVar,
  envName,
  tests,
}: {
  response: ResponseData | null;
  tab: "body" | "raw" | "headers" | "pick";
  setTab: (t: "body" | "raw" | "headers" | "pick") => void;
  onSaveVar: (name: string, value: string) => void;
  envName?: string;
  tests: Assertion[];
}) {
  const [q, setQ] = useState("");
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
  const results = runAssertions(tests, response);
  const passed = results.filter((r) => r.ok).length;
  return (
    <div className="flex h-[42%] min-h-[200px] shrink-0 flex-col border-t border-border">
      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs">
        <span className="font-bold" style={{ color: statusColor }}>
          {response.error ? "Ошибка" : `${response.status} ${response.statusText}`}
        </span>
        <span className="text-muted">{response.ms} ms</span>
        <span className="text-muted">{(response.sizeBytes / 1024).toFixed(1)} KB</span>
        {results.length > 0 && (
          <span className={cn("rounded-full px-2 py-0.5 font-semibold", passed === results.length ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-500")}>
            Проверки: {passed}/{results.length}
          </span>
        )}
        {(tab === "body" || tab === "raw") && (
          <div className="ml-auto flex items-center gap-1 rounded border border-border px-1.5">
            <Search className="h-3 w-3 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="поиск" className="w-24 bg-transparent py-0.5 text-xs outline-none" />
          </div>
        )}
        <div className={cn("flex gap-1", (tab === "body" || tab === "raw") ? "" : "ml-auto")}>
          {(["body", "pick", "raw", "headers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("rounded px-2 py-0.5 transition", tab === t ? "bg-brand/10 font-semibold text-fg" : "text-muted hover:text-fg")}
            >
              {t === "body" ? "Тело" : t === "pick" ? "Взять значение" : t === "raw" ? "Сырое" : `Заголовки (${Object.keys(response.headers).length})`}
            </button>
          ))}
        </div>
      </div>
      {results.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-1.5">
          {results.map((r) => (
            <span
              key={r.assertion.id}
              className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", r.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500")}
              title={`Факт: ${r.actual}`}
            >
              {r.ok ? "✓" : "✗"} {r.label}
            </span>
          ))}
        </div>
      )}
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
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-fg">{filterText(response.body, q)}</pre>
        ) : tab === "pick" ? (
          <ResponseVarPicker body={response.body} onSave={onSaveVar} envName={envName} />
        ) : (
          <ResponseBody body={response.body} q={q} />
        )}
      </div>
    </div>
  );
}

// ─── взять значение из ответа → переменную ────────────────────────────────────────
function ResponseVarPicker({
  body,
  onSave,
  envName,
}: {
  body: string;
  onSave: (name: string, value: string) => void;
  envName?: string;
}) {
  const leaves = useMemo(() => flattenJson(body), [body]);
  const [pick, setPick] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const valueOf = (path: string) => {
    try {
      return toStringVal(getByPath(JSON.parse(body), path));
    } catch {
      return "";
    }
  };
  const save = (path: string) => {
    const n = name.trim();
    if (!n) return;
    onSave(n, valueOf(path));
    setPick(null);
    setSaved(n);
  };

  if (leaves.length === 0) {
    return <p className="text-xs text-muted">В ответе нет полей для выбора (это не JSON).</p>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted">
        Нажми на значение — оно сохранится в переменную{envName ? ` окружения «${envName}»` : ""} и станет доступно как{" "}
        <span className="font-mono">{"{{имя}}"}</span> в других запросах.
      </p>
      {saved && (
        <div className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-600">
          Сохранено: <span className="font-mono font-semibold">{`{{${saved}}}`}</span>
        </div>
      )}
      <div className="space-y-0.5">
        {leaves.map((leaf) => (
          <div key={leaf.path}>
            <button
              onClick={() => {
                setPick(leaf.path);
                setName((leaf.label || "value").replace(/\[\d+\]/g, "").replace(/[^\w]/g, "") || "value");
                setSaved(null);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition hover:bg-brand/10",
                pick === leaf.path && "bg-brand/10",
              )}
            >
              <span className="shrink-0 font-mono font-semibold text-brand">{leaf.path}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-muted">{leaf.preview}</span>
              <Plus className="h-3.5 w-3.5 shrink-0 text-faint" />
            </button>
            {pick === leaf.path && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-2/40 p-2">
                <span className="text-[11px] text-muted">сохранить в</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save(leaf.path);
                    if (e.key === "Escape") setPick(null);
                  }}
                  placeholder="имя переменной"
                  className="input min-w-[140px] flex-1 py-1 font-mono text-xs"
                />
                <button onClick={() => save(leaf.path)} className="btn-primary py-1 text-xs">
                  Сохранить
                </button>
                <button onClick={() => setPick(null)} className="btn-ghost py-1 text-xs">
                  Отмена
                </button>
              </div>
            )}
          </div>
        ))}
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
        Здесь можно задать свои значения и вставлять их в URL/заголовки/тело как{" "}
        <span className="font-mono">{"{{имя}}"}</span>. Адрес сайта и авторизация подставляются сами — их указывать не нужно.
        Для своего API пишите полный адрес, напр. <span className="font-mono">https://api.site.com/…</span>.
      </p>
      <KVEditor rows={env.vars} onChange={(vars) => onChange({ vars })} kPlaceholder="имя" vPlaceholder="значение" />
    </div>
  );
}

// ─── переменные запроса (задать/удалить прямо здесь) ──────────────────────────────
const SYSTEM_VARS = new Set(["base_url", "workspace_id", "bulut_token"]);
function VariablesBar({
  req,
  env,
  onSet,
  onDelete,
}: {
  req: ApiRequest | null;
  env: Environment | null;
  onSet: (name: string, value: string) => void;
  onDelete: (name: string) => void;
}) {
  const vars = useMemo(() => (req ? requestVars(req) : []), [req]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (!req || vars.length === 0) return null;

  const envVal = (n: string) => env?.vars.find((v) => v.key === n && v.enabled)?.value ?? "";
  const status = (n: string) => {
    const val = envVal(n);
    if (val) return { defined: true, text: val };
    if (SYSTEM_VARS.has(n)) return { defined: true, text: "авто" };
    return { defined: false, text: "не задана" };
  };
  const startEdit = (n: string) => {
    setEditing(n);
    setDraft(envVal(n));
  };

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted">Переменные:</span>
        {vars.map((n) => {
          const st = status(n);
          return (
            <button
              key={n}
              onClick={() => startEdit(n)}
              title={st.defined ? `${n} = ${st.text}` : `${n} — не задана, нажмите чтобы задать`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] transition",
                editing === n
                  ? "border-brand bg-brand/10 text-brand"
                  : st.defined
                    ? "border-border text-muted hover:border-brand hover:text-brand"
                    : "border-amber-500/50 bg-amber-500/10 text-amber-600 hover:border-amber-500",
              )}
            >
              {`{{${n}}}`}
              {!st.defined && <span className="text-[9px] font-bold">!</span>}
            </button>
          );
        })}
      </div>
      {editing && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-2/40 p-2">
          <span className="font-mono text-xs font-semibold text-brand">{`{{${editing}}}`}</span>
          <span className="text-faint">=</span>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSet(editing, draft);
                setEditing(null);
              }
              if (e.key === "Escape") setEditing(null);
            }}
            placeholder={SYSTEM_VARS.has(editing) ? "пусто — подставится автоматически" : "значение переменной"}
            className="input min-w-[180px] flex-1 py-1 font-mono text-xs"
          />
          <button
            onClick={() => {
              onSet(editing, draft);
              setEditing(null);
            }}
            className="btn-primary py-1 text-xs"
          >
            Сохранить
          </button>
          <button
            onClick={() => {
              onDelete(editing);
              setEditing(null);
            }}
            className="btn-ghost py-1 text-xs text-red-500 hover:bg-red-500/10"
            title="Удалить переменную из окружения"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setEditing(null)} className="btn-ghost py-1 text-xs">
            Отмена
          </button>
        </div>
      )}
    </div>
  );
}

// ─── просмотр тела ответа (дерево / поиск / копирование) ──────────────────────────
function filterText(text: string, q: string): string {
  if (!q.trim()) return text;
  const lines = text.split("\n").filter((l) => l.toLowerCase().includes(q.toLowerCase()));
  return lines.length ? lines.join("\n") : "(ничего не найдено)";
}

function ResponseBody({ body, q }: { body: string; q: string }) {
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    return <pre className="whitespace-pre-wrap break-all font-mono text-xs text-fg">{filterText(body, q)}</pre>;
  }
  if (q.trim()) {
    const leaves = flattenJson(body).filter(
      (l) => l.path.toLowerCase().includes(q.toLowerCase()) || l.preview.toLowerCase().includes(q.toLowerCase()),
    );
    if (!leaves.length) return <p className="text-xs text-faint">Ничего не найдено.</p>;
    return (
      <div className="space-y-0.5">
        {leaves.map((l) => (
          <div key={l.path} className="flex gap-2 font-mono text-xs">
            <span className="shrink-0 font-semibold text-brand">{l.path}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{l.preview}</span>
          </div>
        ))}
      </div>
    );
  }
  return <JsonNode value={obj} name={null} path="" depth={0} />;
}

function JsonNode({ value, name, path, depth }: { value: unknown; name: string | null; path: string; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const copy = (t: string) => navigator.clipboard?.writeText(t);
  const isObj = value !== null && typeof value === "object";

  if (!isObj) {
    const color = typeof value === "string" ? "#10b981" : typeof value === "number" ? "#f59e0b" : value === null ? "#94a3b8" : "rgb(var(--brand-2))";
    return (
      <div className="group flex items-start gap-1 font-mono text-xs leading-relaxed">
        {name !== null && <span className="shrink-0 text-brand">{name}:</span>}
        <span className="min-w-0 break-all" style={{ color }}>
          {typeof value === "string" ? `"${value}"` : String(value)}
        </span>
        <button onClick={() => copy(typeof value === "string" ? value : String(value))} className="shrink-0 text-faint opacity-0 hover:text-fg group-hover:opacity-100" title="Копировать значение">
          <Copy className="h-3 w-3" />
        </button>
      </div>
    );
  }
  const entries: [string, unknown][] = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value as Record<string, unknown>);
  return (
    <div className="font-mono text-xs">
      <div className="group flex items-center gap-1">
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-muted">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {name !== null && <span className="text-brand">{name}:</span>}
        <span className="text-faint">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
        {path && (
          <button onClick={() => copy(path)} className="text-[9px] text-faint opacity-0 hover:text-fg group-hover:opacity-100" title="Копировать путь">
            путь
          </button>
        )}
      </div>
      {open && (
        <div className="ml-3 border-l border-border pl-2">
          {entries.map(([k, v]) => (
            <JsonNode key={k} value={v} name={k} path={path ? `${path}.${k}` : k} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── редактор проверок (Tests) ────────────────────────────────────────────────────
function TestsEditor({
  tests,
  onChange,
  results,
}: {
  tests: Assertion[];
  onChange: (t: Assertion[]) => void;
  results: ReturnType<typeof runAssertions>;
}) {
  const add = () => onChange([...tests, { id: uid(), kind: "status", expected: "200" }]);
  const upd = (id: string, patch: Partial<Assertion>) => onChange(tests.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const del = (id: string) => onChange(tests.filter((t) => t.id !== id));
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Проверки выполняются после отправки — результат показывается над ответом (зелёное/красное).</p>
      {tests.map((t) => {
        const res = results.find((r) => r.assertion.id === t.id);
        const needPath = t.kind === "hasPath" || t.kind === "equals" || t.kind === "contains";
        return (
          <div key={t.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border p-2">
            <select value={t.kind} onChange={(e) => upd(t.id, { kind: e.target.value as Assertion["kind"] })} className="input w-auto py-1 text-xs">
              <option value="status">Статус =</option>
              <option value="time">Время ≤ (мс)</option>
              <option value="hasPath">Есть поле</option>
              <option value="equals">Поле равно</option>
              <option value="contains">Поле содержит</option>
            </select>
            {needPath && (
              <input value={t.path ?? ""} onChange={(e) => upd(t.id, { path: e.target.value })} placeholder="путь (data.token)" className="input w-40 py-1 font-mono text-xs" />
            )}
            {t.kind !== "hasPath" && (
              <input
                value={t.expected ?? ""}
                onChange={(e) => upd(t.id, { expected: e.target.value })}
                placeholder={t.kind === "status" ? "200" : t.kind === "time" ? "1000" : "значение"}
                className="input w-28 py-1 text-xs"
              />
            )}
            {res && <span className={cn("text-sm font-bold", res.ok ? "text-emerald-600" : "text-red-500")}>{res.ok ? "✓" : "✗"}</span>}
            <button onClick={() => del(t.id)} className="ml-auto rounded p-1 text-faint hover:bg-red-500/10 hover:text-red-500">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <button onClick={add} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
        <Plus className="h-3.5 w-3.5" /> Добавить проверку
      </button>
    </div>
  );
}

// ─── модалка импорта из cURL ──────────────────────────────────────────────────────
function CurlModal({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (text: string) => void }) {
  const [text, setText] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-bold">Импорт из cURL</span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-muted hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted">Вставь команду curl — создастся готовый запрос (метод, URL, заголовки, тело).</p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"curl -X POST 'https://api.site.com/login' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"phone\":\"...\"}'"}
          className="input min-h-[160px] w-full resize-y font-mono text-xs"
          spellCheck={false}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline">
            Отмена
          </button>
          <button onClick={() => onImport(text)} disabled={!text.trim()} className="btn-primary">
            Создать запрос
          </button>
        </div>
      </div>
    </div>
  );
}
