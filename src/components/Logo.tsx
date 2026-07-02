"use client";

import { Cloud } from "lucide-react";

export function Logo({ size = 36, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-2xl"
      style={{
        width: size,
        height: size,
        backgroundImage: "linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand-2)))",
        boxShadow: glow
          ? "var(--shadow-brand)"
          : "var(--shadow-xs), inset 0 1px 0 rgb(255 255 255 / 0.25)",
      }}
    >
      {/* top sheen */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
        style={{ background: "linear-gradient(180deg, rgb(255 255 255 / 0.22), transparent)" }}
      />
      <Cloud
        className="relative text-white drop-shadow-sm"
        style={{ width: size * 0.56, height: size * 0.56 }}
        strokeWidth={2.4}
        fill="rgba(255,255,255,0.3)"
      />
    </div>
  );
}
