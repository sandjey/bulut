"use client";

import { Crown, ShieldCheck } from "lucide-react";
import { ROLE_META, type AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Пилюля роли: цветная точка/иконка + читаемый текст (контраст в обеих темах). */
export function RoleBadge({ role, className }: { role: AppRole; className?: string }) {
  const m = ROLE_META[role];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg",
        className,
      )}
    >
      {role === "owner" ? (
        <Crown className="h-3 w-3" style={{ color: m.color }} />
      ) : role === "admin" ? (
        <ShieldCheck className="h-3 w-3" style={{ color: m.color }} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      )}
      {m.label}
    </span>
  );
}
