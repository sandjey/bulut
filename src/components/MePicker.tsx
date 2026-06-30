"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, UserCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/me";
import { Avatar } from "./Avatar";

export function MePicker() {
  const { members } = useStore();
  const [me, setMe] = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm transition hover:bg-surface-2"
        title="Кто вы — для «Моих задач» и уведомлений"
      >
        {me ? (
          <Avatar name={me} size={22} />
        ) : (
          <UserCircle2 className="h-5 w-5 text-muted" />
        )}
        <span className="hidden max-w-[120px] truncate sm:inline">{me || "Я — это…"}</span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl animate-scale-in">
          <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Я — это</p>
          <div className="max-h-64 overflow-y-auto">
            {members.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted">Сначала добавьте участников в «Команду»</p>
            )}
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMe(m.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition hover:bg-surface-2"
              >
                <Avatar name={m.name} size={24} />
                <span className="flex-1 text-left">{m.name}</span>
                {me === m.name && <Check className="h-4 w-4 text-brand" />}
              </button>
            ))}
          </div>
          {me && (
            <button
              onClick={() => {
                setMe("");
                setOpen(false);
              }}
              className="mt-1 w-full border-t border-border px-3 py-2 text-left text-sm text-muted hover:bg-surface-2"
            >
              Сбросить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
