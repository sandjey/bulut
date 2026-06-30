"use client";

import { X } from "lucide-react";
import { useState } from "react";

export function TagInput({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  const [input, setInput] = useState("");

  const add = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
  };

  const remove = (t: string) => onChange(tags.filter((x) => x !== t));

  const available = suggestions.filter(
    (s) => !tags.includes(s) && s.includes(input.trim().toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand/40">
        {tags.map((t) => (
          <span key={t} className="chip bg-brand/10 text-brand">
            #{t}
            <button onClick={() => remove(t)} className="hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted"
          placeholder={tags.length ? "" : "Добавить тег..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(input);
            } else if (e.key === "Backspace" && !input && tags.length) {
              remove(tags[tags.length - 1]);
            }
          }}
        />
      </div>
      {input && available.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {available.slice(0, 6).map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="chip bg-surface-2 text-muted hover:text-fg"
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
