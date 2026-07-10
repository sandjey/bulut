"use client";

import { Lock, Loader2 } from "lucide-react";
import { useAccess } from "@/lib/access";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Обёртка страницы: показывает содержимое только при наличии права `perm`.
 * Иначе — экран «нет доступа». Пока грузятся профили — спиннер.
 */
export function RequirePerm({
  perm,
  children,
  title = "Нет доступа к разделу",
}: {
  perm: PermissionKey;
  children: React.ReactNode;
  title?: string;
}) {
  const { can, loading } = useAccess();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!can(perm)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="max-w-sm text-sm text-muted">
          У вас нет прав на этот раздел. Обратитесь к администратору проекта, чтобы он выдал доступ.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
