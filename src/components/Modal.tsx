"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, size = "md", footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxW = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:items-center sm:p-4">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={`card relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full ${maxW} flex-col animate-scale-in shadow-2xl sm:max-h-[90vh]`}
        role="dialog"
        aria-modal="true"
      >
        {title ? (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          // floating close button when there's no header (e.g. search)
          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
