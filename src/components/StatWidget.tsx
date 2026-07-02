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
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl"
        style={{ background: withAlpha(color, 0.3) }}
      />
      <div className="relative flex items-center gap-3.5">
        <span
          className="grid h-12 w-12 place-items-center rounded-2xl text-white"
          style={{
            background: `linear-gradient(135deg, ${withAlpha(color, 1)}, ${withAlpha(color, 0.6)})`,
            boxShadow: `0 8px 20px -8px ${withAlpha(color, 0.7)}`,
          }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <div className="font-display text-[2rem] font-extrabold leading-none tracking-tight">
            <CountUp value={value} />
          </div>
          <div className="mt-1.5 text-xs font-medium text-muted">{label}</div>
        </div>
      </div>
      {hint && <div className="relative mt-2 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
