"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Явное редактирование названия: по умолчанию только чтение, правка — по клику
 * на карандаш, сохранение — ✓/Enter, отмена — ✕/Esc. Без случайных изменений.
 */
export function EditableName({
  value,
  onSave,
  canEdit = true,
  className,
  inputClassName,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  canEdit?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };
  const save = () => {
    const v = draft.trim();
    if (v && v !== value) onSave(v);
    setEditing(false);
  };

  if (editing && canEdit) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={placeholder}
          className={cn("min-w-0 rounded-md border border-brand bg-surface px-1.5 py-0.5 outline-none", className, inputClassName)}
        />
        <button onClick={save} className="rounded p-1 text-emerald-500 transition hover:bg-surface-2" title="Сохранить">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={() => setEditing(false)} className="rounded p-1 text-muted transition hover:bg-surface-2" title="Отмена">
          <X className="h-4 w-4" />
        </button>
      </span>
    );
  }

  return (
    <span className="group/edit inline-flex min-w-0 items-center gap-1.5">
      <span className={cn("truncate", className)}>{value || placeholder}</span>
      {canEdit && (
        <button
          onClick={start}
          className="shrink-0 rounded p-0.5 text-muted opacity-0 transition hover:text-fg group-hover/edit:opacity-100"
          title="Переименовать"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
