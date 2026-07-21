"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Search, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { METHOD_COLOR } from "./shared";
import { joinUrl, type Collection, type ApiRequest } from "@/lib/console";

/** Swagger-стиль: коллекция → группы (папки) → эндпойнты с документацией. */
export function DocsView({ collections, onOpen }: { collections: Collection[]; onOpen: (id: string) => void }) {
  const [colId, setColId] = useState<string>(collections[0]?.id ?? "");
  const [q, setQ] = useState("");
  const col = collections.find((c) => c.id === colId) ?? collections[0] ?? null;

  const groups = useMemo(() => {
    if (!col) return [];
    const match = (r: ApiRequest) =>
      !q.trim() ||
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      r.url.toLowerCase().includes(q.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(q.toLowerCase());
    const list: { id: string; name: string; requests: ApiRequest[] }[] = [];
    if (col.requests.length) list.push({ id: "root", name: "Общее", requests: col.requests.filter(match) });
    col.folders.forEach((f) => list.push({ id: f.id, name: f.name, requests: f.requests.filter(match) }));
    return list.filter((g) => g.requests.length > 0);
  }, [col, q]);

  if (!col) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center text-muted">
        <BookOpen className="h-10 w-10 opacity-40" />
        <p className="text-sm">Нет коллекций для документации. Импортируйте Postman или создайте запросы.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* панель выбора */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <BookOpen className="h-4 w-4 text-brand" />
        <select value={colId} onChange={(e) => setColId(e.target.value)} className="input h-9 w-auto py-1 text-sm font-semibold">
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border px-2">
          <Search className="h-3.5 w-3.5 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="поиск эндпойнта" className="w-40 bg-transparent py-1.5 text-sm outline-none" />
        </div>
      </div>

      {/* документация */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-5">
          {groups.length === 0 && <p className="py-10 text-center text-sm text-muted">Ничего не найдено.</p>}
          {groups.map((g) => (
            <section key={g.id}>
              <div className="mb-2 flex items-center gap-2 border-b border-border pb-1.5">
                <h2 className="text-base font-bold">{g.name}</h2>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{g.requests.length}</span>
              </div>
              <div className="space-y-1.5">
                {g.requests.map((r) => (
                  <Endpoint key={r.id} req={r} onOpen={() => onOpen(r.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Endpoint({ req, onOpen }: { req: ApiRequest; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const color = METHOD_COLOR[req.method];
  const enabledParams = req.params.filter((p) => p.key);
  const enabledHeaders = req.headers.filter((h) => h.key);
  return (
    <div className={cn("overflow-hidden rounded-lg border transition", open ? "border-brand/50" : "border-border")}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2">
        <span className="w-16 shrink-0 rounded px-1.5 py-1 text-center font-mono text-[11px] font-bold text-white" style={{ background: color }}>
          {req.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{joinUrl(req.url, req.params)}</span>
        <span className="hidden shrink-0 truncate text-xs text-muted sm:block">{req.name}</span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border bg-surface-2/30 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{req.name}</span>
            <button onClick={onOpen} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-brand hover:bg-brand/10">
              <ExternalLink className="h-3.5 w-3.5" /> Открыть в запросах
            </button>
          </div>

          {req.description && <p className="whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 text-xs text-muted">{req.description}</p>}

          {req.auth.type !== "none" && (
            <div className="text-xs">
              <span className="font-semibold text-muted">Авторизация:</span>{" "}
              {req.auth.type === "bulut" ? "Bulut (сессия)" : req.auth.type === "apikey" ? "API-ключ" : req.auth.type}
            </div>
          )}

          {enabledParams.length > 0 && (
            <DocTable title="Параметры запроса" rows={enabledParams.map((p) => [p.key, p.value || "—"])} />
          )}
          {enabledHeaders.length > 0 && (
            <DocTable title="Заголовки" rows={enabledHeaders.map((h) => [h.key, h.value || "—"])} />
          )}

          {(req.bodyMode === "json" || req.bodyMode === "raw") && req.body && (
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Тело запроса ({req.bodyMode === "json" ? "JSON" : "текст"})</div>
              <pre className="overflow-auto rounded-lg bg-surface p-2 font-mono text-xs text-fg">{req.body}</pre>
            </div>
          )}
          {(req.bodyMode === "form" || req.bodyMode === "urlencoded") && req.form.some((f) => f.key) && (
            <DocTable title={`Тело (${req.bodyMode})`} rows={req.form.filter((f) => f.key).map((f) => [f.key, f.isFile ? "файл" : f.value || "—"])} />
          )}
        </div>
      )}
    </div>
  );
}

function DocTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted">{title}</div>
      <div className="overflow-hidden rounded-lg border border-border">
        {rows.map(([k, v], i) => (
          <div key={k} className={cn("flex gap-3 px-2.5 py-1.5 font-mono text-xs", i > 0 && "border-t border-border")}>
            <span className="w-40 shrink-0 font-semibold text-brand">{k}</span>
            <span className="min-w-0 flex-1 break-all text-muted">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
