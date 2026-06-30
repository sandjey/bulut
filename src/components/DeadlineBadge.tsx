"use client";

import { CalendarClock, AlarmClock, CheckCircle2 } from "lucide-react";
import { deadlineInfo } from "@/lib/date";
import { cn } from "@/lib/utils";

const BG: Record<string, string> = {
  overdue: "bg-red-500/10",
  urgent: "bg-amber-500/10",
  soon: "bg-amber-500/10",
  ok: "bg-emerald-500/10",
  none: "bg-surface-2",
};

export function DeadlineBadge({
  dueDate,
  done = false,
}: {
  dueDate: string | null;
  done?: boolean;
}) {
  const info = deadlineInfo(dueDate, done);
  if (info.status === "none") return null;

  const Icon = done
    ? CheckCircle2
    : info.status === "overdue" || info.status === "urgent"
    ? AlarmClock
    : CalendarClock;

  return (
    <span
      className={cn(
        "chip",
        BG[info.status],
        info.color,
        (info.status === "overdue" || info.status === "urgent") && !done && "animate-pulse"
      )}
    >
      <Icon className="h-3 w-3" />
      {info.label}
    </span>
  );
}
