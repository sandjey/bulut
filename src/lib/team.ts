"use client";

import { useMemo } from "react";
import { useAccess } from "./access";
import { useWorkspace } from "./workspace";
import { avatarColor } from "./utils";
import type { AppRole } from "./permissions";

/** Участник команды = участник АКТИВНОЙ комнаты. Единый источник правды. */
export interface TeamPerson {
  key: string; // id пользователя
  name: string;
  role: string; // должность/направление (jobRole из профиля)
  email: string;
  color: string;
  isAccount: boolean; // всегда true — оставлено для совместимости
  accountRole: AppRole; // роль в комнате (owner/admin/member)
  avatar: string | null; // фото профиля
  deleted: boolean; // профиль удалён (аккаунт деактивирован)
}

/** Список команды = участники активной комнаты (join на профиль для должности/удаления). */
export function useTeam(): TeamPerson[] {
  const { members } = useWorkspace();
  const { profiles } = useAccess();

  const byId = useMemo(() => {
    const m = new Map<string, { jobRole: string; deleted: boolean }>();
    for (const p of profiles) m.set(p.id, { jobRole: p.jobRole, deleted: !!p.deletedAt });
    return m;
  }, [profiles]);

  return useMemo(() => {
    return members
      .map((m) => {
        const prof = byId.get(m.userId);
        const name = (m.name || "").trim() || m.email;
        return {
          key: m.userId,
          name,
          role: prof?.jobRole ?? "",
          email: m.email,
          color: avatarColor(m.email || name),
          isAccount: true,
          accountRole: m.role,
          avatar: m.avatar,
          deleted: prof?.deleted ?? false,
        } as TeamPerson;
      })
      .sort((a, b) =>
        a.deleted !== b.deleted ? (a.deleted ? 1 : -1) : a.name.localeCompare(b.name, "ru"),
      );
  }, [members, byId]);
}
