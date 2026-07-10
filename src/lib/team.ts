"use client";

import { useMemo } from "react";
import { useStore } from "./store";
import { useAccess } from "./access";
import { avatarColor } from "./utils";
import type { AppRole } from "./permissions";

/** Единый участник команды: либо зарегистрированный пользователь, либо ручная запись. */
export interface TeamPerson {
  key: string; // стабильный ключ (id профиля или участника)
  name: string;
  role: string; // должность/направление
  email: string;
  color: string;
  isAccount: boolean; // зарегистрированный пользователь (есть аккаунт)
  accountRole?: AppRole; // роль аккаунта (owner/admin/member)
  memberId?: string; // id в таблице members (для ручных записей)
}

/**
 * Объединяет зарегистрированных пользователей (profiles) и ручных участников
 * (members) в единый список команды. Дедуп по имени: аккаунт приоритетнее.
 */
export function useTeam(): TeamPerson[] {
  const { members } = useStore();
  const { profiles } = useAccess();

  return useMemo(() => {
    const byName = new Map<string, TeamPerson>();

    // 1) Зарегистрированные пользователи
    for (const p of profiles) {
      const name = (p.name || "").trim() || p.email;
      const k = name.toLowerCase();
      byName.set(k, {
        key: p.id,
        name,
        role: p.jobRole,
        email: p.email,
        color: avatarColor(p.email || name),
        isAccount: true,
        accountRole: p.role,
      });
    }

    // 2) Ручные участники (если имя не совпало с аккаунтом)
    for (const m of members) {
      const k = m.name.trim().toLowerCase();
      if (!k || byName.has(k)) continue;
      byName.set(k, {
        key: m.id,
        name: m.name,
        role: m.role,
        email: m.email,
        color: m.color || avatarColor(m.name),
        isAccount: false,
        memberId: m.id,
      });
    }

    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [members, profiles]);
}
