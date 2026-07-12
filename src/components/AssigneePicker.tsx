"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, UserPlus, User, X, Users } from "lucide-react";
import { Avatar } from "./Avatar";
import { useTeam } from "@/lib/team";
import { cn } from "@/lib/utils";

interface AssigneePickerProps {
  value: string;
  onChange: (name: string) => void;
  compact?: boolean;
  placeholder?: string;
}

export function AssigneePicker({
  value,
  onChange,
  compact = false,
  placeholder = "Выберите исполнителя",
}: AssigneePickerProps) {
  const team = useTeam();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  // не предлагаем удалённые аккаунты для новых назначений (но текущее значение оставляем)
  const filtered = useMemo(
    () =>
      team.filter(
        (m) =>
          (!m.deleted || m.name === value) &&
          (m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)),
      ),
    [team, q, value]
  );
  const exactExists = team.some((m) => m.name.toLowerCase() === q);
  const canCreate = query.trim().length > 0 && !exactExists;

  const valueIsKnown = team.some((m) => m.name === value);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery("");
  };

  // Назначаем введённое имя как есть (без создания записи в отдельной таблице).
  const create = () => pick(query.trim());

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 text-left",
          compact
            ? "rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-border hover:bg-surface"
            : "input",
          // подсветить, если выбрано имя, которого нет в справочнике
          value && !valueIsKnown && "border-amber-500/60"
        )}
        title={value && !valueIsKnown ? "Этого участника нет в команде" : undefined}
      >
        {value ? (
          <>
            <Avatar name={value} size={compact ? 20 : 22} />
            <span className="flex-1 truncate">{value}</span>
            {!valueIsKnown && <span className="text-xs text-amber-500">вне команды</span>}
          </>
        ) : (
          <>
            <span
              className="grid place-items-center rounded-full bg-surface-2 text-muted"
              style={{ width: compact ? 20 : 22, height: compact ? 20 : 22 }}
            >
              <User className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 truncate text-muted">{placeholder}</span>
          </>
        )}
        {value && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="rounded p-0.5 text-muted hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-[240px] overflow-hidden rounded-lg border border-border bg-surface shadow-xl animate-scale-in">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск участника…"
              className="input py-1.5 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered.length === 1) pick(filtered[0].name);
                  else if (canCreate) create();
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => pick(m.name)}
                className="flex w-full items-center gap-2.5 px-2 py-1.5 text-sm transition hover:bg-surface-2"
              >
                <Avatar name={m.name} size={26} />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">{m.name}</span>
                  {m.role && <span className="block truncate text-xs text-muted">{m.role}</span>}
                </span>
                {value === m.name && <Check className="h-4 w-4 text-brand" />}
              </button>
            ))}

            {canCreate && (
              <button
                type="button"
                onClick={create}
                className="flex w-full items-center gap-2 border-t border-border px-2 py-2 text-sm text-brand transition hover:bg-surface-2"
              >
                <UserPlus className="h-4 w-4" />
                Назначить «{query.trim()}»
              </button>
            )}

            {filtered.length === 0 && !canCreate && (
              <div className="px-3 py-4 text-center text-xs text-muted">
                <Users className="mx-auto mb-1 h-5 w-5 opacity-50" />
                {team.length === 0 ? "В команде пока нет участников." : "Не найдено"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
