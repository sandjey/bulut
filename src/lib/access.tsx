"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { getSupabase } from "./supabase";
import { setMe } from "./me";
import { useWorkspace } from "./workspace";
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

export interface OrphanAccount {
  id: string;
  email: string;
  createdAt: string;
}

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
  /** Убрать доступ (обратимо, профиль остаётся). */
  removeUser: (id: string) => Promise<string | null>;
  /** Полностью удалить аккаунт из Auth (нужен service_role). Работает и для осиротевших. */
  deleteAccount: (id: string) => Promise<string | null>;
  /** Список аккаунтов Auth без профиля (осиротевшие). */
  fetchOrphans: () => Promise<{ configured: boolean; orphans: OrphanAccount[] }>;
  // ── свой профиль ──
  /** Обновить СВОЙ профиль (имя/должность/фото). */
  updateMyProfile: (patch: { name?: string; jobRole?: string; avatar?: string | null }) => Promise<string | null>;
  /** Мягко удалить свой профиль (контент остаётся, аккаунт деактивируется). */
  deleteMyProfile: () => Promise<string | null>;
  /** Имена профилей, помеченных удалёнными — для метки «удалённый аккаунт». */
  deletedNames: Set<string>;
  /** Фото профиля по имени/почте (lowercase) — чтобы показывать аватар везде. */
  avatarByName: Map<string, string>;
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

  // Свой профиль. Удалённый (deleted_at) не считается активным.
  const me = useMemo(
    () => profiles.find((p) => p.id === userId && !p.deletedAt) ?? null,
    [profiles, userId],
  );

  // Личность = аккаунт: подставляем «я» из профиля автоматически (без ручного выбора).
  const emailAddr = user?.email ?? "";
  useEffect(() => {
    if (me) setMe(me.name?.trim() || emailAddr);
  }, [me, emailAddr]);

  // Имена удалённых аккаунтов — для метки «удалённый аккаунт» рядом с именем.
  const deletedNames = useMemo(
    () => new Set(profiles.filter((p) => p.deletedAt && p.name).map((p) => p.name)),
    [profiles],
  );

  // Фото по имени/почте — чтобы аватар с фото показывался везде (карточки, журнал, отчёты…).
  const avatarByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) {
      if (!p.avatar) continue;
      const nm = (p.name || "").trim().toLowerCase();
      if (nm) m.set(nm, p.avatar);
      const em = (p.email || "").trim().toLowerCase();
      if (em) m.set(em, p.avatar);
    }
    return m;
  }, [profiles]);

  // Роль и права — из членства в АКТИВНОЙ комнате (мультиарендность).
  const ws = useWorkspace();
  const role: AppRole = ws.myRole ?? "member";
  const isOwner = role === "owner";
  const isAdmin = role === "owner" || role === "admin";
  const wsPerms = ws.myPermissions;

  const can = useCallback(
    (perm: PermissionKey): boolean => {
      // Миграция ещё не применена — не ломаем приложение (но админку не открываем).
      if (degraded) return perm !== "admin.access";
      if (role === "owner" || role === "admin") return true;
      // Приглашённый участник без явных прав получает базовый набор (не заперт).
      const perms = wsPerms.length ? wsPerms : DEFAULT_MEMBER_PERMISSIONS;
      return perms.includes(perm);
    },
    [degraded, role, wsPerms],
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

  // «Убрать доступ»: забираем все права (и снимаем админа), но профиль оставляем —
  // так действие обратимо и не создаёт «призрачный» аккаунт без профиля.
  // Полное удаление логина делается в Supabase → Authentication (каскадом удалит профиль).
  const removeUser = useCallback(
    async (id: string): Promise<string | null> => {
      const target = profiles.find((p) => p.id === id);
      if (!me || !target) return "Профиль не найден";
      if (target.role === "owner") return "Нельзя убрать доступ у владельца";
      if (!canManageProfile(me.role, target.role)) return "Недостаточно прав";
      try {
        await db.updateProfileRole(id, "member", []);
        setProfiles((prev) =>
          prev.map((p) => (p.id === id ? { ...p, role: "member", permissions: [] } : p)),
        );
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось убрать доступ";
      }
    },
    [me, profiles],
  );

  const deleteAccount = useCallback(
    async (id: string): Promise<string | null> => {
      const target = profiles.find((p) => p.id === id);
      if (target?.role === "owner") return "Нельзя удалить владельца";
      const sb = getSupabase();
      const sess = sb ? (await sb.auth.getSession()).data.session : null;
      if (!sess) return "Нет активной сессии";
      try {
        const res = await fetch("/api/admin/delete-user", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.access_token}` },
          body: JSON.stringify({ userId: id }),
        });
        if (res.status === 501) {
          // service_role не настроен — мягко забираем доступ (если это профиль)
          if (target) await removeUser(id);
          return "Полное удаление недоступно: не задан SUPABASE_SERVICE_ROLE_KEY на сервере.";
        }
        const data = await res.json().catch(() => null);
        if (!res.ok) return data?.error ?? "Не удалось удалить аккаунт";
        setProfiles((prev) => prev.filter((p) => p.id !== id));
        return null;
      } catch {
        return "Ошибка сети. Попробуйте ещё раз.";
      }
    },
    [profiles, removeUser],
  );

  // Обновить свой профиль (имя/должность/фото). RLS разрешает self-update.
  const updateMyProfile = useCallback(
    async (patch: { name?: string; jobRole?: string; avatar?: string | null }): Promise<string | null> => {
      if (!userId) return "Нет активной сессии";
      try {
        await db.updateProfileFields(userId, patch);
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === userId
              ? {
                  ...p,
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                  ...(patch.jobRole !== undefined ? { jobRole: patch.jobRole } : {}),
                  ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
                }
              : p,
          ),
        );
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось сохранить профиль";
      }
    },
    [userId],
  );

  // Мягкое удаление своего профиля. Контент (доски/задачи/журнал/карты) не трогаем.
  const deleteMyProfile = useCallback(async (): Promise<string | null> => {
    if (!userId || !me) return "Нет активной сессии";
    if (me.role === "owner") return "Владельца проекта удалить нельзя";
    try {
      await db.softDeleteProfile(userId);
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, deletedAt: new Date().toISOString() } : p)),
      );
      return null;
    } catch (e) {
      console.error(e);
      return "Не удалось удалить профиль";
    }
  }, [userId, me]);

  const fetchOrphans = useCallback(async (): Promise<{
    configured: boolean;
    orphans: OrphanAccount[];
  }> => {
    const sb = getSupabase();
    const sess = sb ? (await sb.auth.getSession()).data.session : null;
    if (!sess) return { configured: false, orphans: [] };
    try {
      const res = await fetch("/api/admin/orphans", {
        headers: { Authorization: `Bearer ${sess.access_token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return { configured: false, orphans: [] };
      return { configured: !!data.configured, orphans: data.orphans ?? [] };
    } catch {
      return { configured: false, orphans: [] };
    }
  }, []);

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
      deleteAccount,
      fetchOrphans,
      updateMyProfile,
      deleteMyProfile,
      deletedNames,
      avatarByName,
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
      deleteAccount,
      fetchOrphans,
      updateMyProfile,
      deleteMyProfile,
      deletedNames,
      avatarByName,
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

/**
 * Безопасный поиск фото профиля по имени/почте. Не падает вне AccessProvider
 * (вернёт null), поэтому Avatar можно использовать где угодно.
 */
export function useResolveAvatar(): (name?: string | null) => string | null {
  const ctx = useContext(AccessContext);
  return useCallback(
    (name?: string | null) => {
      if (!ctx || !name) return null;
      return ctx.avatarByName.get(name.trim().toLowerCase()) ?? null;
    },
    [ctx],
  );
}
