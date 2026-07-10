"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { getSupabase } from "./supabase";
import * as db from "./db";
import {
  AppRole,
  PermissionKey,
  Profile,
  canAssignAdmin,
  canManageProfile,
  DEFAULT_MEMBER_PERMISSIONS,
  ALL_PERMISSIONS,
} from "./permissions";

interface AccessContextValue {
  loading: boolean;
  /** Профиль текущего пользователя (может быть null, пока грузится). */
  me: Profile | null;
  role: AppRole;
  isOwner: boolean;
  isAdmin: boolean; // owner или admin
  /** Проверка права. owner/admin — всё разрешено. */
  can: (perm: PermissionKey) => boolean;
  /** Все профили (для команды/администрирования). */
  profiles: Profile[];
  refetch: () => Promise<void>;
  // ── админ-действия (гарды дублируются в RLS) ──
  canManage: (target: Profile) => boolean;
  /** Можно ли редактировать имя/должность профиля (owner — любого; admin — только member). */
  canEditProfile: (target: Profile) => boolean;
  updateProfile: (id: string, patch: { name?: string; jobRole?: string }) => Promise<string | null>;
  setPermissions: (id: string, perms: PermissionKey[]) => Promise<string | null>;
  promoteToAdmin: (id: string) => Promise<string | null>;
  demoteToMember: (id: string) => Promise<string | null>;
  removeUser: (id: string) => Promise<string | null>;
}

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  // «Деградация»: таблица profiles ещё не создана (миграция не применена).
  // В этом режиме не блокируем работу — доступ как раньше, кроме администрирования.
  const [degraded, setDegraded] = useState(false);

  const refetch = useCallback(async () => {
    if (!userId) {
      setProfiles([]);
      return;
    }
    try {
      const list = await db.fetchProfiles();
      setProfiles(list);
      setDegraded(false);
    } catch (e) {
      console.error("Не удалось загрузить профили", e);
      setDegraded(true);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setProfiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    db.fetchProfiles()
      .then((list) => {
        if (!cancelled) {
          setProfiles(list);
          setDegraded(false);
        }
      })
      .catch((e) => {
        console.error("Не удалось загрузить профили", e);
        if (!cancelled) setDegraded(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Реалтайм: изменения прав применяются мгновенно у всех.
  useEffect(() => {
    if (!userId) return;
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel("bulut-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        db.fetchProfiles().then(setProfiles).catch(console.error);
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [userId]);

  const me = useMemo(() => profiles.find((p) => p.id === userId) ?? null, [profiles, userId]);
  const role: AppRole = me?.role ?? "member";
  const isOwner = role === "owner";
  const isAdmin = role === "owner" || role === "admin";

  const can = useCallback(
    (perm: PermissionKey): boolean => {
      // Миграция ещё не применена — не ломаем приложение (но админку не открываем).
      if (degraded) return perm !== "admin.access";
      if (role === "owner" || role === "admin") return true;
      // Профиль ещё не создан триггером — даём базовый просмотр, а не пустоту.
      const perms = me?.permissions ?? DEFAULT_MEMBER_PERMISSIONS;
      return perms.includes(perm);
    },
    [degraded, role, me],
  );

  const canManage = useCallback(
    (target: Profile) => (me ? canManageProfile(me.role, target.role) : false),
    [me],
  );

  // Редактирование имени/должности: владелец — любого (включая себя и админов),
  // администратор — только обычных пользователей. Совпадает с RLS.
  const canEditProfile = useCallback(
    (target: Profile) => {
      if (!me) return false;
      if (me.role === "owner") return true;
      if (me.role === "admin") return target.role === "member";
      return false;
    },
    [me],
  );

  const updateProfile = useCallback(
    async (id: string, patch: { name?: string; jobRole?: string }): Promise<string | null> => {
      const target = profiles.find((p) => p.id === id);
      if (!me || !target) return "Профиль не найден";
      if (!(me.role === "owner" || (me.role === "admin" && target.role === "member"))) {
        return "Недостаточно прав";
      }
      try {
        await db.updateProfileFields(id, patch);
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.jobRole !== undefined ? { jobRole: patch.jobRole } : {}) }
              : p,
          ),
        );
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось сохранить профиль";
      }
    },
    [me, profiles],
  );

  const setPermissions = useCallback(
    async (id: string, perms: PermissionKey[]): Promise<string | null> => {
      const target = profiles.find((p) => p.id === id);
      if (!me || !target) return "Профиль не найден";
      if (!canManageProfile(me.role, target.role)) return "Недостаточно прав";
      try {
        await db.updateProfilePermissions(id, perms);
        setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, permissions: perms } : p)));
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось сохранить права";
      }
    },
    [me, profiles],
  );

  const promoteToAdmin = useCallback(
    async (id: string): Promise<string | null> => {
      const target = profiles.find((p) => p.id === id);
      if (!me || !target) return "Профиль не найден";
      if (!canAssignAdmin(me.role)) return "Только владелец может назначать администраторов";
      if (target.role === "owner") return "Нельзя менять владельца";
      try {
        await db.updateProfileRole(id, "admin", ALL_PERMISSIONS);
        setProfiles((prev) =>
          prev.map((p) => (p.id === id ? { ...p, role: "admin", permissions: ALL_PERMISSIONS } : p)),
        );
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось назначить администратора";
      }
    },
    [me, profiles],
  );

  const demoteToMember = useCallback(
    async (id: string): Promise<string | null> => {
      const target = profiles.find((p) => p.id === id);
      if (!me || !target) return "Профиль не найден";
      if (!canAssignAdmin(me.role)) return "Только владелец может снимать администраторов";
      if (target.role === "owner") return "Нельзя понизить владельца";
      try {
        await db.updateProfileRole(id, "member", DEFAULT_MEMBER_PERMISSIONS);
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, role: "member", permissions: DEFAULT_MEMBER_PERMISSIONS } : p,
          ),
        );
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось понизить пользователя";
      }
    },
    [me, profiles],
  );

  const removeUser = useCallback(
    async (id: string): Promise<string | null> => {
      const target = profiles.find((p) => p.id === id);
      if (!me || !target) return "Профиль не найден";
      if (target.role === "owner") return "Нельзя удалить владельца";
      if (!canManageProfile(me.role, target.role)) return "Недостаточно прав";
      try {
        await db.deleteProfile(id);
        setProfiles((prev) => prev.filter((p) => p.id !== id));
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось удалить пользователя";
      }
    },
    [me, profiles],
  );

  const value = useMemo<AccessContextValue>(
    () => ({
      loading,
      me,
      role,
      isOwner,
      isAdmin,
      can,
      profiles,
      refetch,
      canManage,
      canEditProfile,
      updateProfile,
      setPermissions,
      promoteToAdmin,
      demoteToMember,
      removeUser,
    }),
    [
      loading,
      me,
      role,
      isOwner,
      isAdmin,
      can,
      profiles,
      refetch,
      canManage,
      canEditProfile,
      updateProfile,
      setPermissions,
      promoteToAdmin,
      demoteToMember,
      removeUser,
    ],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessContextValue {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}

/** Короткий хук: функция проверки прав. */
export function useCan(): (perm: PermissionKey) => boolean {
  return useAccess().can;
}
