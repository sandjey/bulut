"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronsUpDown, Check, Plus, Settings, Loader2, Crown } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { BOARD_COLORS } from "@/lib/types";
import { cn, withAlpha, contrastText } from "@/lib/utils";

export function WorkspaceSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaces, active, switchWorkspace, createWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const color = BOARD_COLORS[Math.floor(workspaces.length) % BOARD_COLORS.length];
    await createWorkspace(name.trim(), color);
    setBusy(false);
    setName("");
    setCreating(false);
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div className="relative px-3 pt-1" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-2.5 py-2 text-left transition hover:bg-surface-2"
      >
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold"
          style={{ backgroundColor: active?.color ?? "#6366f1", color: contrastText(active?.color ?? "#6366f1") }}
        >
          {(active?.name ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-fg">
            {active?.name ?? "Комната"}
          </span>
          <span className="block text-[10px] text-faint">
            {active?.myRole === "owner" ? "Владелец" : active?.myRole === "admin" ? "Админ" : "Участник"}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute left-3 right-3 z-40 mt-1 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl animate-scale-in">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
            Комнаты
          </p>
          <div className="max-h-56 overflow-y-auto">
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  switchWorkspace(w.id);
                  setOpen(false);
                  onNavigate?.();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm transition hover:bg-surface-2"
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold"
                  style={{ backgroundColor: w.color, color: contrastText(w.color) }}
                >
                  {w.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 truncate text-left">{w.name}</span>
                {w.myRole === "owner" && <Crown className="h-3 w-3 text-amber-500" />}
                {w.id === active?.id && <Check className="h-4 w-4 text-brand" />}
              </button>
            ))}
          </div>

          <div className="mt-1 border-t border-border pt-1">
            {creating ? (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  placeholder="Название комнаты"
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface-2/50 px-2 py-1 text-sm outline-none focus:border-brand"
                />
                <button
                  onClick={create}
                  disabled={busy || !name.trim()}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-brand transition hover:bg-surface-2"
              >
                <Plus className="h-4 w-4" /> Создать комнату
              </button>
            )}
            <Link
              href="/admin/room"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2"
              style={{ ["--x" as string]: withAlpha(active?.color ?? "#6366f1", 0.1) }}
            >
              <Settings className="h-4 w-4" /> Настройки комнаты
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
