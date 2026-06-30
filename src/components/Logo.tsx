"use client";

import { Cloud } from "lucide-react";

export function Logo({ size = 36, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-2xl shadow-sm"
      style={{
        width: size,
        height: size,
        backgroundImage: "linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand-2)))",
        boxShadow: glow ? "0 8px 24px -6px rgb(var(--brand) / 0.6)" : undefined,
      }}
    >
      <Cloud
        className="text-white drop-shadow"
        style={{ width: size * 0.56, height: size * 0.56 }}
        strokeWidth={2.4}
        fill="rgba(255,255,255,0.28)"
      />
    </div>
  );
}
