"use client";

import { TaskType, TASK_TYPES } from "@/lib/types";
import { withAlpha } from "@/lib/utils";

export function TypeBadge({ type, size = "sm" }: { type: TaskType; size?: "sm" | "xs" }) {
  const meta = TASK_TYPES[type] ?? TASK_TYPES.task;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-medium ${
        size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"
      }`}
      style={{ backgroundColor: withAlpha(meta.color, 0.14), color: meta.color }}
      title={`Тип: ${meta.label}`}
    >
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  );
}
