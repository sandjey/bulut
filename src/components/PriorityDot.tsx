"use client";

import { Priority, PRIORITY_META } from "@/lib/types";

export function PriorityDot({ priority, label = false }: { priority: Priority; label?: boolean }) {
  const meta = PRIORITY_META[priority];
  return (
    <span className="inline-flex items-center gap-1.5" title={`Приоритет: ${meta.label}`}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.dot }} />
      {label && <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>}
    </span>
  );
}
