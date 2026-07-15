// Bulut Console — «Postman внутри Bulut». Часть A: коллекции + одиночный запуск.
// Данные храним локально (как Postman — local-first): коллекции, окружения, история.

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export type BodyMode = "none" | "json" | "raw" | "form" | "urlencoded";
export type AuthType = "none" | "bulut" | "bearer" | "basic";

export interface KV {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface AuthConfig {
  type: AuthType;
  token?: string; // bearer
  username?: string; // basic
  password?: string; // basic
}

export interface ApiRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KV[];
  headers: KV[];
  auth: AuthConfig;
  bodyMode: BodyMode;
  body: string; // json / raw text
  form: KV[]; // form-data + urlencoded
}

export interface Folder {
  id: string;
  name: string;
  requests: ApiRequest[];
}

export interface Collection {
  id: string;
  name: string;
  folders: Folder[];
  requests: ApiRequest[]; // корневые запросы (вне папок)
}

export interface Environment {
  id: string;
  name: string;
  vars: KV[];
}

export interface HistoryEntry {
  id: string;
  at: number;
  method: string;
  url: string;
  status: number;
  ms: number;
  ok: boolean;
}

export interface ResponseData {
  status: number;
  statusText: string;
  ms: number;
  sizeBytes: number;
  headers: Record<string, string>;
  body: string;
  ok: boolean;
  error?: string;
}

// ─── Сценарии (простой список шагов сверху вниз) ─────────────────────────────────
export type CondOp = "exists" | "notExists" | "eq" | "ne" | "contains" | "gt" | "lt";

/** Значение, взятое из ответа шага (клик по полю). */
export interface StepCapture {
  id: string;
  from: string; // путь в ответе: access_token / data.0.id
  to: string; // понятное имя переменной: token
}

/** Условие «выполнять шаг только если …». */
export interface StepCondition {
  enabled: boolean;
  left: string; // имя ранее взятого значения
  op: CondOp;
  right: string; // значение для сравнения
}

export interface FlowStep {
  id: string;
  request: ApiRequest; // сам API (заполнен из коллекции)
  captures: StepCapture[]; // что взять из ответа этого шага
  bindings: Record<string, string>; // {{плейсхолдер}} → имя значения (или "=литерал")
  condition?: StepCondition;
}

export interface Flow {
  id: string;
  name: string;
  steps: FlowStep[];
}

export type FlowRunStatus = "idle" | "running" | "ok" | "error" | "skipped";

export interface FlowNodeResult {
  status: FlowRunStatus;
  sent?: { method: string; url: string; headers: Record<string, string>; body?: string };
  response?: ResponseData;
  passed?: Record<string, string>;
}

export interface ConsoleState {
  collections: Collection[];
  environments: Environment[];
  activeEnvId: string | null;
  history: HistoryEntry[];
  flows: Flow[];
}

// ─── id / фабрики ──────────────────────────────────────────────────────────────
export const uid = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

export const kv = (key = "", value = "", enabled = true): KV => ({ id: uid(), key, value, enabled });

export function emptyRequest(partial: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: uid(),
    name: partial.name ?? "Новый запрос",
    method: partial.method ?? "GET",
    url: partial.url ?? "/api",
    params: partial.params ?? [],
    headers: partial.headers ?? [],
    auth: partial.auth ?? { type: "bulut" },
    bodyMode: partial.bodyMode ?? "none",
    body: partial.body ?? "",
    form: partial.form ?? [],
  };
}

// ─── подстановка {{переменных}} ──────────────────────────────────────────────────
export function resolveVars(input: string, vars: Record<string, string>): string {
  if (!input) return input;
  return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name: string) =>
    name in vars ? vars[name] : m,
  );
}

/** Собрать карту переменных: окружение + служебные (base_url, workspace_id, bulut_token).
 * Пустые значения окружения НЕ перекрывают служебные (напр. base_url подставляется сам). */
export function buildVarMap(
  env: Environment | null,
  builtin: Record<string, string>,
): Record<string, string> {
  const map: Record<string, string> = { ...builtin };
  env?.vars.forEach((v) => {
    if (v.enabled && v.key && v.value !== "") map[v.key] = v.value;
  });
  return map;
}

/** Финальный запрос после подстановки переменных и авторизации. */
export function buildFinal(
  req: ApiRequest,
  vars: Record<string, string>,
  bulutToken: string,
  workspaceId: string,
): { method: string; url: string; headers: Record<string, string>; body?: string } {
  const S = (s: string) => resolveVars(s, vars);

  // URL + query-параметры
  let url = S(req.url).trim();
  const query = req.params
    .filter((p) => p.enabled && p.key)
    .map((p) => `${encodeURIComponent(S(p.key))}=${encodeURIComponent(S(p.value))}`);
  if (query.length) url += (url.includes("?") ? "&" : "?") + query.join("&");

  // Заголовки
  const headers: Record<string, string> = {};
  req.headers.filter((h) => h.enabled && h.key).forEach((h) => (headers[S(h.key)] = S(h.value)));

  // Авторизация
  if (req.auth.type === "bulut") {
    if (bulutToken) headers["Authorization"] = `Bearer ${bulutToken}`;
    if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
  } else if (req.auth.type === "bearer" && req.auth.token) {
    headers["Authorization"] = `Bearer ${S(req.auth.token)}`;
  } else if (req.auth.type === "basic") {
    const raw = `${S(req.auth.username ?? "")}:${S(req.auth.password ?? "")}`;
    headers["Authorization"] = `Basic ${typeof btoa !== "undefined" ? btoa(raw) : raw}`;
  }

  // Тело
  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.bodyMode === "json") {
      body = S(req.body);
      if (!headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = "application/json";
    } else if (req.bodyMode === "raw") {
      body = S(req.body);
    } else if (req.bodyMode === "urlencoded") {
      body = req.form
        .filter((f) => f.enabled && f.key)
        .map((f) => `${encodeURIComponent(S(f.key))}=${encodeURIComponent(S(f.value))}`)
        .join("&");
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/x-www-form-urlencoded";
    } else if (req.bodyMode === "form") {
      // form-data со строковыми значениями (файлы — вне области Части A)
      const params = new URLSearchParams();
      req.form.filter((f) => f.enabled && f.key).forEach((f) => params.append(S(f.key), S(f.value)));
      body = params.toString();
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  }

  return { method: req.method, url, headers, body };
}

// ─── выполнение запроса (свой домен — напрямую; внешний — через прокси) ──────────
function isExternal(url: string): boolean {
  if (url.startsWith("/")) return false;
  try {
    const u = new URL(url);
    if (typeof window !== "undefined") return u.origin !== window.location.origin;
    return true;
  } catch {
    return false;
  }
}

export async function execute(final: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}): Promise<ResponseData> {
  const started = Date.now();
  try {
    if (isExternal(final.url)) {
      // Внешний адрес → серверный прокси (обходит CORS, защищён от приватных адресов).
      const res = await fetch("/api/console/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(final),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Прокси вернул ${res.status}`);
      return {
        status: j.status,
        statusText: j.statusText ?? "",
        ms: j.ms ?? Date.now() - started,
        sizeBytes: new Blob([j.body ?? ""]).size,
        headers: j.headers ?? {},
        body: j.body ?? "",
        ok: j.status >= 200 && j.status < 300,
      };
    }
    // Свой домен → напрямую из браузера.
    const res = await fetch(final.url, {
      method: final.method,
      headers: final.headers,
      body: final.body,
    });
    const text = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return {
      status: res.status,
      statusText: res.statusText,
      ms: Date.now() - started,
      sizeBytes: new Blob([text]).size,
      headers,
      body: text,
      ok: res.ok,
    };
  } catch (e) {
    return {
      status: 0,
      statusText: "Ошибка сети",
      ms: Date.now() - started,
      sizeBytes: 0,
      headers: {},
      body: "",
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось выполнить запрос",
    };
  }
}

// ─── выполнение потока (Часть B) ─────────────────────────────────────────────────
/** Достать значение из ответа по пути «data.0.id» / «access_token». */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function toStringVal(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** Плоский список «путь → значение» из ответа (для клика-выбора). */
export interface JsonLeaf {
  path: string;
  label: string; // последний ключ
  preview: string;
}
export function flattenJson(raw: string, max = 100): JsonLeaf[] {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: JsonLeaf[] = [];
  const walk = (val: unknown, path: string, key: string) => {
    if (out.length >= max) return;
    if (val === null || typeof val !== "object") {
      out.push({ path, label: key || path, preview: toStringVal(val).slice(0, 70) });
    } else if (Array.isArray(val)) {
      val.slice(0, 8).forEach((v, i) => walk(v, path ? `${path}.${i}` : `${i}`, `${key}[${i}]`));
    } else {
      Object.entries(val as Record<string, unknown>).forEach(([k, v]) => walk(v, path ? `${path}.${k}` : k, k));
    }
  };
  walk(obj, "", "");
  return out;
}

/** {{плейсхолдеры}}, которые нужны запросу (без служебных base_url/workspace_id/bulut_token). */
const SYSTEM_VARS = new Set(["base_url", "workspace_id", "bulut_token"]);
export function extractPlaceholders(req: ApiRequest, extraKnown: Set<string> = new Set()): string[] {
  const texts: string[] = [req.url, req.body, req.auth.token ?? "", req.auth.username ?? "", req.auth.password ?? ""];
  req.headers.filter((h) => h.enabled).forEach((h) => texts.push(h.key, h.value));
  req.params.filter((p) => p.enabled).forEach((p) => texts.push(p.key, p.value));
  req.form.filter((f) => f.enabled).forEach((f) => texts.push(f.key, f.value));
  const set = new Set<string>();
  texts.forEach((t) => {
    const re = /\{\{\s*([\w.-]+)\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t || ""))) if (!SYSTEM_VARS.has(m[1]) && !extraKnown.has(m[1])) set.add(m[1]);
  });
  return [...set];
}

/** Значение слева в условии: имя ранее взятого значения (или путь / {{перем}}). */
function condLeft(left: string, parsed: unknown, vars: Record<string, string>): unknown {
  if (!left) return undefined;
  if (left.includes("{{")) return resolveVars(left, vars);
  if (left in vars) return vars[left];
  return getByPath(parsed, left);
}

export function evalCondition(
  cond: { left: string; op: CondOp; right: string } | undefined,
  parsed: unknown,
  vars: Record<string, string>,
): boolean {
  if (!cond) return true;
  const leftRaw = condLeft(cond.left, parsed, vars);
  const l = toStringVal(leftRaw);
  const r = resolveVars(cond.right ?? "", vars);
  switch (cond.op) {
    case "exists":
      return leftRaw !== undefined && leftRaw !== null && l !== "";
    case "notExists":
      return leftRaw === undefined || leftRaw === null || l === "";
    case "eq":
      return l === r;
    case "ne":
      return l !== r;
    case "contains":
      return l.includes(r);
    case "gt":
      return parseFloat(l) > parseFloat(r);
    case "lt":
      return parseFloat(l) < parseFloat(r);
    default:
      return true;
  }
}

/** Совместимость: старые потоки (nodes/edges) приводим к списку шагов. */
export function normalizeFlow(raw: unknown): Flow {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(r.steps)) {
    return {
      id: (r.id as string) ?? uid(),
      name: (r.name as string) ?? "Сценарий",
      steps: (r.steps as FlowStep[]).map((s) => ({
        id: s.id ?? uid(),
        request: s.request,
        captures: s.captures ?? [],
        bindings: s.bindings ?? {},
        condition: s.condition,
      })),
    };
  }
  // старый граф → линейный список в порядке узлов; маппинги стрелок → captures источника
  const nodes = (r.nodes as { id: string; request: ApiRequest }[]) ?? [];
  const edges = (r.edges as { source: string; target: string; mappings?: StepCapture[] }[]) ?? [];
  const steps: FlowStep[] = nodes.map((n) => {
    const outs = edges.filter((e) => e.source === n.id);
    const captures = outs.flatMap((e) => (e.mappings ?? []).map((m) => ({ id: uid(), from: m.from, to: m.to })));
    return { id: n.id, request: n.request, captures, bindings: {} };
  });
  return { id: (r.id as string) ?? uid(), name: (r.name as string) ?? "Сценарий", steps };
}

/**
 * Запуск сценария: шаги сверху вниз. У каждого шага — привязки (плейсхолдеры →
 * взятые значения), условие «выполнять если…», и что взять из ответа. Переменные
 * копятся между шагами. Стоп на ошибке или невыполненном условии.
 */
export async function runFlow(
  flow: Flow,
  baseVars: Record<string, string>,
  token: string,
  wsId: string,
  onProgress: (stepId: string, result: FlowNodeResult) => void,
): Promise<Record<string, string>> {
  const vars: Record<string, string> = { ...baseVars };

  for (const step of flow.steps) {
    // привязки: плейсхолдер ← имя значения (или "=литерал")
    Object.entries(step.bindings ?? {}).forEach(([ph, src]) => {
      if (!src) return;
      if (src.startsWith("=")) vars[ph] = src.slice(1);
      else if (src in vars) vars[ph] = vars[src];
    });

    if (step.condition?.enabled) {
      const ok = evalCondition(
        { left: step.condition.left, op: step.condition.op, right: step.condition.right },
        undefined,
        vars,
      );
      if (!ok) {
        onProgress(step.id, { status: "skipped" });
        break; // «выполнять только если…» не выполнилось → останавливаем сценарий
      }
    }

    const final = buildFinal(step.request, vars, token, wsId);
    onProgress(step.id, { status: "running", sent: final });
    const res = await execute(final);

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      parsed = undefined;
    }

    const passed: Record<string, string> = {};
    if (res.ok) {
      (step.captures ?? []).forEach((c) => {
        if (!c.to) return;
        const val = toStringVal(getByPath(parsed, c.from));
        vars[c.to] = val;
        passed[c.to] = val;
      });
    }
    onProgress(step.id, { status: res.ok ? "ok" : "error", sent: final, response: res, passed });
    if (!res.ok) break;
  }
  return vars;
}

// ─── экспорт как curl ────────────────────────────────────────────────────────────
export function toCurl(final: { method: string; url: string; headers: Record<string, string>; body?: string }): string {
  const parts = [`curl -X ${final.method} '${final.url}'`];
  Object.entries(final.headers).forEach(([k, v]) => parts.push(`  -H '${k}: ${v}'`));
  if (final.body) parts.push(`  -d '${final.body.replace(/'/g, "'\\''")}'`);
  return parts.join(" \\\n");
}

// ─── подсветка JSON ──────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Возвращает HTML c подсветкой JSON (для dangerouslySetInnerHTML). */
export function highlightJson(text: string): string {
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return escapeHtml(text);
  }
  return escapeHtml(pretty).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "tok-num";
      if (/^"/.test(match)) cls = /:$/.test(match) ? "tok-key" : "tok-str";
      else if (/true|false/.test(match)) cls = "tok-bool";
      else if (/null/.test(match)) cls = "tok-null";
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

// ─── импорт Postman Collection v2.1 ──────────────────────────────────────────────
interface PmUrl {
  raw?: string;
  query?: { key: string; value: string; disabled?: boolean }[];
}
interface PmRequest {
  method?: string;
  header?: { key: string; value: string; disabled?: boolean }[];
  url?: PmUrl | string;
  body?: {
    mode?: string;
    raw?: string;
    formdata?: { key: string; value: string; disabled?: boolean }[];
    urlencoded?: { key: string; value: string; disabled?: boolean }[];
  };
  auth?: { type?: string; bearer?: { key: string; value: string }[] };
}
interface PmItem {
  name?: string;
  item?: PmItem[];
  request?: PmRequest;
}

function pmUrlRaw(u: PmUrl | string | undefined): string {
  if (!u) return "";
  return typeof u === "string" ? u : u.raw ?? "";
}

function parsePmRequest(item: PmItem): ApiRequest {
  const r = item.request ?? {};
  const url = pmUrlRaw(r.url);
  const bodyMode: BodyMode =
    r.body?.mode === "raw"
      ? "json"
      : r.body?.mode === "formdata"
        ? "form"
        : r.body?.mode === "urlencoded"
          ? "urlencoded"
          : "none";
  const form =
    r.body?.mode === "formdata"
      ? (r.body.formdata ?? [])
      : r.body?.mode === "urlencoded"
        ? (r.body.urlencoded ?? [])
        : [];
  const auth: AuthConfig =
    r.auth?.type === "bearer"
      ? { type: "bearer", token: r.auth.bearer?.find((b) => b.key === "token")?.value ?? "" }
      : { type: "none" };
  const q = typeof r.url === "object" ? r.url.query ?? [] : [];
  return {
    id: uid(),
    name: item.name ?? r.method ?? "Запрос",
    method: (r.method?.toUpperCase() as HttpMethod) ?? "GET",
    url,
    params: q.map((p) => kv(p.key, p.value, !p.disabled)),
    headers: (r.header ?? []).map((h) => kv(h.key, h.value, !h.disabled)),
    auth,
    bodyMode,
    body: r.body?.raw ?? "",
    form: form.map((f) => kv(f.key, f.value, !f.disabled)),
  };
}

/** Разбирает Postman-коллекцию в структуру Bulut (папки одного уровня; вложенные — через « / »). */
export function importPostman(json: unknown): Collection {
  const root = json as { info?: { name?: string }; item?: PmItem[]; variable?: { key: string; value: string }[] };
  const collection: Collection = {
    id: uid(),
    name: root.info?.name ?? "Импорт Postman",
    folders: [],
    requests: [],
  };

  const walk = (items: PmItem[], folderName: string | null) => {
    items.forEach((it) => {
      if (it.item) {
        // это папка
        const name = folderName ? `${folderName} / ${it.name ?? ""}` : it.name ?? "Папка";
        walk(it.item, name);
      } else if (it.request) {
        const req = parsePmRequest(it);
        if (folderName) {
          let folder = collection.folders.find((f) => f.name === folderName);
          if (!folder) {
            folder = { id: uid(), name: folderName, requests: [] };
            collection.folders.push(folder);
          }
          folder.requests.push(req);
        } else {
          collection.requests.push(req);
        }
      }
    });
  };
  walk(root.item ?? [], null);
  return collection;
}

// ─── встроенная коллекция Bulut API ──────────────────────────────────────────────
export function seedBulutCollection(): Collection {
  const req = (
    name: string,
    method: HttpMethod,
    url: string,
    extra: Partial<ApiRequest> = {},
  ): ApiRequest => emptyRequest({ name, method, url, auth: { type: "bulut" }, ...extra });

  return {
    id: uid(),
    name: "Bulut API",
    requests: [req("Живая справка", "GET", "/api", { auth: { type: "none" } })],
    folders: [
      {
        id: uid(),
        name: "Авторизация",
        requests: [
          req("Вход → токен", "POST", "/api/auth/token", {
            auth: { type: "none" },
            bodyMode: "json",
            body: `{\n  "email": "you@example.com",\n  "password": "ваш-пароль"\n}`,
          }),
        ],
      },
      {
        id: uid(),
        name: "Комнаты",
        requests: [req("Мои комнаты", "GET", "/api/workspaces")],
      },
      {
        id: uid(),
        name: "Доски",
        requests: [
          req("Список досок", "GET", "/api/boards"),
          req("Создать доску", "POST", "/api/boards", {
            bodyMode: "json",
            body: `{\n  "name": "Новая доска"\n}`,
          }),
        ],
      },
      {
        id: uid(),
        name: "Задачи",
        requests: [
          req("Список задач", "GET", "/api/tasks"),
          req("Создать задачу", "POST", "/api/tasks", {
            bodyMode: "json",
            body: `{\n  "boardId": "{{board_id}}",\n  "columnId": "{{column_id}}",\n  "title": "Задача из консоли"\n}`,
          }),
          req("Задача по id", "GET", "/api/tasks/{{task_id}}"),
          req("Изменить/переместить", "PATCH", "/api/tasks/{{task_id}}", {
            bodyMode: "json",
            body: `{\n  "columnId": "{{column_id}}"\n}`,
          }),
          req("Удалить задачу", "DELETE", "/api/tasks/{{task_id}}"),
          req("Комментарии", "GET", "/api/tasks/{{task_id}}/comments"),
        ],
      },
      {
        id: uid(),
        name: "Журнал",
        requests: [req("Журнал комнаты", "GET", "/api/journal")],
      },
      {
        id: uid(),
        name: "Карты",
        requests: [
          req("Список карт", "GET", "/api/maps"),
          req("Карта по id", "GET", "/api/maps/{{map_id}}"),
        ],
      },
    ],
  };
}

// ─── хранилище (localStorage, по пользователю) ───────────────────────────────────
const KEY = (userId: string) => `bulut.console.${userId || "anon"}`;

export function defaultState(): ConsoleState {
  const bulutEnv: Environment = {
    id: uid(),
    name: "Bulut (эта сессия)",
    vars: [
      kv("board_id", ""),
      kv("column_id", ""),
      kv("task_id", ""),
      kv("map_id", ""),
    ],
  };
  return {
    collections: [seedBulutCollection()],
    environments: [bulutEnv],
    activeEnvId: bulutEnv.id,
    history: [],
    flows: [],
  };
}

/** Чистим старые сохранённые URL: убираем {{base_url}} (адрес подставляется сам). */
function stripBaseUrl(u: string): string {
  return (u ?? "").replace(/\{\{\s*base_url\s*\}\}/g, "");
}
function sanitizeReq(r: ApiRequest): ApiRequest {
  return r?.url?.includes("base_url") ? { ...r, url: stripBaseUrl(r.url) } : r;
}
export function sanitizeConsoleState(s: ConsoleState): ConsoleState {
  return {
    ...s,
    collections: (s.collections ?? []).map((c) => ({
      ...c,
      requests: (c.requests ?? []).map(sanitizeReq),
      folders: (c.folders ?? []).map((f) => ({ ...f, requests: (f.requests ?? []).map(sanitizeReq) })),
    })),
    flows: (s.flows ?? []).map((f) => ({
      ...f,
      steps: (f.steps ?? []).map((st) => ({ ...st, request: sanitizeReq(st.request) })),
    })),
  };
}

export function loadState(userId: string): ConsoleState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as ConsoleState;
    if (!parsed.collections?.length) parsed.collections = [seedBulutCollection()];
    if (!parsed.environments?.length) return defaultState();
    if (!parsed.flows) parsed.flows = [];
    return sanitizeConsoleState(parsed);
  } catch {
    return defaultState();
  }
}

export function saveState(userId: string, state: ConsoleState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(state));
  } catch {
    /* переполнение — игнорируем */
  }
}
