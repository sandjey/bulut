"use client";

import { Plus, X, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { kv, fileStore, type ApiRequest, type KV, type BodyMode, type AuthType } from "@/lib/console";

export const METHOD_COLOR: Record<string, string> = {
  GET: "#10b981",
  POST: "#f59e0b",
  PUT: "#3b82f6",
  PATCH: "#8b5cf6",
  DELETE: "#ef4444",
  HEAD: "#64748b",
  OPTIONS: "#64748b",
};

// ─── редактор ключ-значение ───────────────────────────────────────────────────
export function KVEditor({
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
export function AuthEditor({ req, onChange }: { req: ApiRequest; onChange: (patch: Partial<ApiRequest>) => void }) {
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
          <option value="apikey">API-ключ (в заголовок/query)</option>
        </select>
      </div>
      {type === "bulut" && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
          Заголовок <b>Authorization: Bearer …</b> и <b>X-Workspace-Id</b> подставятся сами из текущей сессии.
        </p>
      )}
      {type === "bearer" && (
        <div>
          <label className="label">Токен</label>
          <input className="input font-mono text-xs" value={req.auth.token ?? ""} onChange={(e) => onChange({ auth: { ...req.auth, token: e.target.value } })} placeholder="eyJhbGciOi… или {{token}}" />
        </div>
      )}
      {type === "apikey" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Имя (ключ)</label>
              <input className="input font-mono text-xs" value={req.auth.key ?? ""} onChange={(e) => onChange({ auth: { ...req.auth, key: e.target.value } })} placeholder="X-API-Key" />
            </div>
            <div>
              <label className="label">Значение</label>
              <input className="input font-mono text-xs" value={req.auth.value ?? ""} onChange={(e) => onChange({ auth: { ...req.auth, value: e.target.value } })} placeholder="ключ или {{api_key}}" />
            </div>
          </div>
          <div>
            <label className="label">Куда</label>
            <select className="input" value={req.auth.addTo ?? "header"} onChange={(e) => onChange({ auth: { ...req.auth, addTo: e.target.value as "header" | "query" } })}>
              <option value="header">В заголовок</option>
              <option value="query">В query-параметр</option>
            </select>
          </div>
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
export function BodyEditor({ req, onChange }: { req: ApiRequest; onChange: (patch: Partial<ApiRequest>) => void }) {
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
          className="input min-h-[140px] w-full resize-y font-mono text-xs"
          placeholder={req.bodyMode === "json" ? '{\n  "title": "Задача"\n}' : "текст тела запроса"}
          spellCheck={false}
        />
      )}
      {req.bodyMode === "urlencoded" && (
        <KVEditor rows={req.form} onChange={(form) => onChange({ form })} kPlaceholder="поле" vPlaceholder="значение" />
      )}
      {req.bodyMode === "form" && <FormDataEditor rows={req.form} onChange={(form) => onChange({ form })} />}
      {req.bodyMode === "none" && <p className="text-xs text-muted">Тело не отправляется.</p>}
    </div>
  );
}

// ─── form-data (текст + файлы) ────────────────────────────────────────────────────
function FormDataEditor({ rows, onChange }: { rows: KV[]; onChange: (rows: KV[]) => void }) {
  const set = (id: string, patch: Partial<KV>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, kv()]);
  const remove = (id: string) => {
    fileStore.delete(id);
    onChange(rows.filter((r) => r.id !== id));
  };
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted">Файлы поддерживаются для своего API (Bulut). Отметьте «файл» у строки.</p>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-1.5">
          <input type="checkbox" checked={r.enabled} onChange={(e) => set(r.id, { enabled: e.target.checked })} className="h-4 w-4 accent-[color:rgb(var(--brand))]" />
          <input value={r.key} onChange={(e) => set(r.id, { key: e.target.value })} placeholder="поле" className="input w-28 py-1.5 font-mono text-xs" spellCheck={false} />
          {r.isFile ? (
            <label className="flex flex-1 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted hover:border-brand">
              <FileUp className="h-3.5 w-3.5" />
              <span className="truncate">{fileStore.get(r.id)?.name ?? "выбрать файл…"}</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    fileStore.set(r.id, f);
                    set(r.id, { value: f.name });
                  }
                }}
              />
            </label>
          ) : (
            <input value={r.value} onChange={(e) => set(r.id, { value: e.target.value })} placeholder="значение" className="input flex-1 py-1.5 font-mono text-xs" spellCheck={false} />
          )}
          <button
            onClick={() => {
              const next = !r.isFile;
              if (!next) fileStore.delete(r.id);
              set(r.id, { isFile: next, value: "" });
            }}
            className={cn("rounded px-1.5 py-1 text-[10px] font-semibold", r.isFile ? "bg-brand/10 text-brand" : "text-faint hover:text-fg")}
            title="Тип: текст / файл"
          >
            файл
          </button>
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
