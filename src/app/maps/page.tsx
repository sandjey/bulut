"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Waypoints,
  Loader2,
  Trash2,
  MoreHorizontal,
  Boxes,
  Spline,
  Clock,
} from "lucide-react";
import { useMaps } from "@/lib/maps";
import { useCan } from "@/lib/access";
import { PageHeader } from "@/components/PageHeader";
import { fmtDateTime } from "@/lib/date";
import { withAlpha, cn } from "@/lib/utils";
import type { MapGraph } from "@/lib/map-types";

/** Мини-превью графа карты: узлы блоками, связи линиями. Пустая карта — аккуратный плейсхолдер. */
function MapThumbnail({ graph, color }: { graph?: MapGraph; color: string }) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  if (nodes.length === 0) {
    return (
      <div className="relative flex h-full items-center justify-center">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `radial-gradient(${withAlpha(color, 0.5)} 1px, transparent 1px)`,
            backgroundSize: "15px 15px",
          }}
        />
        <span
          className="relative inline-flex items-center gap-1.5 rounded-full border border-dashed bg-surface/70 px-2.5 py-1 text-[11px] font-medium text-muted backdrop-blur-sm"
          style={{ borderColor: withAlpha(color, 0.45) }}
        >
          <Waypoints className="h-3.5 w-3.5" style={{ color }} /> Пустая карта
        </span>
      </div>
    );
  }

  const rects = nodes.map((n) => {
    const w = typeof n.style?.width === "number" ? n.style.width : 170;
    const h = typeof n.style?.height === "number" ? n.style.height : 62;
    const x = n.position?.x ?? 0;
    const y = n.position?.y ?? 0;
    return {
      id: n.id,
      x,
      y,
      w,
      h,
      cx: x + w / 2,
      cy: y + h / 2,
      color: (n.data?.color as string) || color,
    };
  });
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const pad = 60;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  const byId = new Map(rects.map((r) => [r.id, r]));

  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
      {edges.map((e, i) => {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) return null;
        return (
          <line
            key={i}
            x1={s.cx}
            y1={s.cy}
            x2={t.cx}
            y2={t.cy}
            stroke={withAlpha(color, 0.4)}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
      {rects.map((r) => (
        <rect
          key={r.id}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={16}
          fill={withAlpha(r.color, 0.9)}
          stroke={r.color}
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}

export default function MapsPage() {
  const { maps, ready, createMap, deleteMap } = useMaps();
  const can = useCan();
  const canCreate = can("map.create");
  const canDelete = can("map.delete");
  const router = useRouter();
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const create = () => {
    const m = createMap();
    router.push(`/maps/${m.id}`);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader
          title="Bulut MAP"
          subtitle="Визуальные карты проекта: узлы, связи и флоу на холсте"
        >
          {canCreate && (
            <button className="btn-primary" onClick={create}>
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Новая карта</span>
            </button>
          )}
        </PageHeader>

        {!ready ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
          </div>
        ) : maps.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center animate-fade-up">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-teal-500/10 text-teal-500">
              <Waypoints className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Пока нет карт</h3>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Создайте первую карту проекта — и стройте флоу из узлов и связей на холсте.
            </p>
            {canCreate && (
              <button className="btn-primary mt-5" onClick={create}>
                <Plus className="h-4 w-4" /> Создать карту
              </button>
            )}
          </div>
        ) : (
          <div className="stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {maps.map((m) => {
              const nodeCount = m.graph?.nodes?.length ?? 0;
              const edgeCount = m.graph?.edges?.length ?? 0;
              return (
                <div key={m.id} className="group relative">
                  <Link
                    href={`/maps/${m.id}`}
                    className="hover-lift block overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition"
                  >
                    {/* превью графа карты */}
                    <div
                      className="relative h-28 overflow-hidden border-b border-border"
                      style={{
                        background: `linear-gradient(135deg, ${withAlpha(m.color, 0.14)}, ${withAlpha(
                          m.color,
                          0.03,
                        )})`,
                      }}
                    >
                      <MapThumbnail graph={m.graph} color={m.color} />
                    </div>
                    <div className="p-4">
                      <h3 className="truncate font-semibold">{m.name}</h3>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Boxes className="h-3.5 w-3.5" /> {nodeCount} узлов
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Spline className="h-3.5 w-3.5" /> {edgeCount} связей
                        </span>
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-faint">
                        <Clock className="h-3 w-3" /> {fmtDateTime(m.updatedAt)}
                      </div>
                    </div>
                  </Link>

                  {canDelete && (
                    <div className="absolute right-2 top-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setMenuFor(menuFor === m.id ? null : m.id);
                        }}
                        className="rounded-lg bg-surface/80 p-1.5 text-muted opacity-0 shadow-soft backdrop-blur transition hover:text-fg group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuFor === m.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg animate-scale-in">
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `Удалить карту «${m.name}»? Попадёт в Корзину — можно восстановить.`,
                                  )
                                )
                                  deleteMap(m.id);
                                setMenuFor(null);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10",
                              )}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Удалить
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
