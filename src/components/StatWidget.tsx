"use client";

import { LucideIcon } from "lucide-react";
import { CountUp } from "./CountUp";
import { withAlpha } from "@/lib/utils";

export function StatWidget({
  icon: Icon,
  label,
  value,
  color,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
  hint?: string;
}) {
  return (
    <div className="hover-lift card relative overflow-hidden p-4">
      {/* glow corner */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl"
        style={{ background: withAlpha(color, 0.35) }}
      />
      <div className="relative flex items-center gap-3">
        <span
          className="grid h-11 w-11 place-items-center rounded-xl shadow-sm"
          style={{ background: `linear-gradient(135deg, ${withAlpha(color, 0.9)}, ${withAlpha(color, 0.55)})`, color: "#fff" }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <div className="text-3xl font-extrabold leading-none tracking-tight">
            <CountUp value={value} />
          </div>
          <div className="mt-1 text-xs font-medium text-muted">{label}</div>
        </div>
      </div>
      {hint && <div className="relative mt-2 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
