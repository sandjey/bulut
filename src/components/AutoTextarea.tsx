"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  /** Never shrink below this many px (default 90). */
  minHeight?: number;
};

/**
 * A textarea that grows with its content so long text is always shown in full
 * instead of scrolling inside a small fixed frame.
 */
export function AutoTextarea({ value, className, minHeight = 90, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  };

  // resize on mount and whenever the controlled value changes
  useLayoutEffect(resize, [value, minHeight]);
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      onInput={resize}
      className={cn("resize-none overflow-hidden", className)}
      style={{ minHeight }}
      {...rest}
    />
  );
}
