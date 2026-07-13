"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ExternalLink } from "lucide-react";
import { Modal } from "@/components/Modal";
import { useStore } from "@/lib/store";
import { computeNodeStats, STATUS_META, type NodeStatus } from "@/lib/map-stats";
import type { MapNode } from "@/lib/map-types";
import { cn } from "@/lib/utils";

const SEV: Record<NodeStatus, number> = { bug: 3, fixed: 2, wip: 1, ok: 0 };

/** Здоровье продукта: все экраны карты со статусом + массовое создание задач. */
export function ProductHealthDialog({
  open,
  onClose,
  mapId,
  nodes,
}: {
  open: boolean;
  onClose: () => void;
  mapId: string;
  nodes: MapNode[];
}) {
  const { tasks, boards, createTask } = useStore();
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [board, setBoard] = useState(boards[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    return nodes
      .filter((n) => n.data?.kind === "screen")
      .map((n) => ({
        node: n,
        label: (n.data?.label as string) || "Экран",
        stats: computeNodeStats(tasks, boards, mapId, n.id, n.data?.statusOverride),
      }))
      .sort((a, b) => SEV[b.stats.status] - SEV[a.stats.status] || a.label.localeCompare(b.label, "ru"));
  }, [nodes, tasks, boards, mapId]);

  const summary = useMemo(() => {
    const c = { ok: 0, wip: 0, fixed: 0, bug: 0 } as Record<NodeStatus, number>;
    rows.forEach((r) => (c[r.stats.status] += 1));
    return c;
  }, [rows]);

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const createForSelected = async () => {
    const b = boards.find((x) => x.id === board);
    if (!b || sel.size === 0) return;
    setBusy(true);
    sel.forEach((id) => {
      const n = rows.find((r) => r.node.id === id)?.node;
      if (n) createTask({ boardId: b.id, columnId: b.columns[0]?.id ?? "", title: (n.data?.label as string) || "Экран", type: "task", mapId, mapNodeId: id });
    });
    setBusy(false);
    setSel(new Set());
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Здоровье продукта">
      {/* Сводка */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {(["bug", "fixed", "wip", "ok"] as NodeStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_META[s].color }} />
            {STATUS_META[s].label}: <b>{summary[s]}</b>
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">На карте нет экранов</p>
      ) : (
        <div className="max-h-[52vh] space-y-1 overflow-y-auto">
          {rows.map(({ node, label, stats }) => (
            <div key={node.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
              {stats.total === 0 && (
                <input type="checkbox" checked={sel.has(node.id)} onChange={() => toggle(node.id)} className="h-4 w-4 accent-[color:rgb(var(--brand))]" title="Выбрать для создания задачи" />
              )}
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_META[stats.status].color }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
              <span className="shrink-0 text-xs text-muted">
                {stats.total > 0 ? `${stats.done}/${stats.total}` : "нет задач"}
                {stats.bugsOpen > 0 && <span className="ml-2 text-red-500">🐞{stats.bugsOpen}</span>}
              </span>
              {stats.total > 0 && (
                <button
                  onClick={() => {
                    onClose();
                    const t = stats.tasks[0];
                    if (t) router.push(`/board/${t.boardId}?task=${t.id}`);
                  }}
                  className="shrink-0 rounded p-1 text-muted hover:text-fg"
                  title="Открыть задачи"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Массовое создание задач по пустым экранам */}
      {sel.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-sm">Создать {sel.size} задач в доске:</span>
          <select className="input h-9 w-auto py-1 text-sm" value={board} onChange={(e) => setBoard(e.target.value)}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button className={cn("btn-primary ml-auto")} onClick={createForSelected} disabled={busy || !board}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Создать задачи
          </button>
        </div>
      )}
    </Modal>
  );
}
