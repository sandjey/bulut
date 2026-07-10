"use client";

import { useMemo } from "react";
import { useAccess } from "./access";
import { avatarColor } from "./utils";
import type { AppRole } from "./permissions";

/** Участник команды = зарегистрированный пользователь (профиль). Единый источник правды. */
export interface TeamPerson {
  key: string; // id профиля
  name: string;
  role: string; // должность/направление (jobRole)
  email: string;
  color: string;
  isAccount: boolean; // всегда true — оставлено для совместимости
  accountRole: AppRole; // роль аккаунта (owner/admin/member)
}

/** Список команды строго из profiles. Удалил профиль → человек исчез везде. */
export function useTeam(): TeamPerson[] {
  const { profiles } = useAccess();

  return useMemo(() => {
    return profiles
      .map((p) => {
        const name = (p.name || "").trim() || p.email;
        return {
          key: p.id,
          name,
          role: p.jobRole,
          email: p.email,
          color: avatarColor(p.email || name),
          isAccount: true,
          accountRole: p.role,
        } as TeamPerson;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [profiles]);
}
