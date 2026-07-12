"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth";
import { getSupabase } from "./supabase";
import * as db from "./db";
import type { Workspace, WorkspaceMember, Invitation, AppNotification } from "./workspace-types";
import type { AppRole, PermissionKey } from "./permissions";

const ACTIVE_KEY = "bulut.ws";

interface WorkspaceContextValue {
  ready: boolean;
  workspaces: Workspace[];
  active: Workspace | null;
  activeId: string | null;
  myRole: AppRole;
  myPermissions: PermissionKey[];
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string, color?: string) => Promise<string | null>;
  updateWorkspace: (id: string, patch: { name?: string; color?: string }) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<string | null>;
  leaveWorkspace: (id: string) => Promise<string | null>;
  refresh: () => Promise<void>;
  // участники / приглашения активной комнаты
  members: WorkspaceMember[];
  invitations: Invitation[];
  refreshRoom: () => Promise<void>;
  inviteMember: (email: string, role: AppRole) => Promise<{ token: string } | { error: string }>;
  revokeInvite: (id: string) => Promise<void>;
  updateMember: (id: string, patch: { role?: AppRole; permissions?: PermissionKey[] }) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  // приглашения на мою почту + уведомления
  pendingInvites: Invitation[];
  notifications: AppNotification[];
  unread: number;
  acceptInvite: (token: string) => Promise<string | null>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refreshInbox: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const email = user?.email ?? "";

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const creating = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Держим модульную «активную комнату» в db синхронно (до fetch'ей в дочерних провайдерах).
  if (typeof window !== "undefined") db.setActiveWorkspace(activeId);

  // Выбираем активную комнату: текущую (если ещё в списке) → сохранённую → первую.
  const applyActive = useCallback((list: Workspace[]) => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_KEY) : null;
    const cur = activeIdRef.current;
    const valid =
      cur && list.some((w) => w.id === cur)
        ? cur
        : stored && list.some((w) => w.id === stored)
          ? stored
          : list[0]?.id ?? null;
    activeIdRef.current = valid;
    db.setActiveWorkspace(valid);
    setActiveId(valid);
    if (valid && typeof window !== "undefined") window.localStorage.setItem(ACTIVE_KEY, valid);
  }, []);

  const loadWorkspaces = useCallback(async () => {
    if (!userId) return;
    const list = await db.fetchMyWorkspaces(userId);
    // Нет ни одной комнаты — создаём личную по умолчанию (один раз).
    if (list.length === 0 && !creating.current) {
      creating.current = true;
      try {
        await db.createWorkspaceRpc("Моя команда", "#6366f1");
        const fresh = await db.fetchMyWorkspaces(userId);
        setWorkspaces(fresh);
        applyActive(fresh);
      } finally {
        creating.current = false;
      }
      return;
    }
    setWorkspaces(list);
    applyActive(list);
  }, [userId, applyActive]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setWorkspaces([]);
      setActiveId(null);
      db.setActiveWorkspace(null);
      setReady(false);
      return;
    }
    setReady(false);
    loadWorkspaces()
      .catch((e) => console.error("Не удалось загрузить комнаты", e))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loadWorkspaces]);

  // Реалтайм: меня добавили/убрали из комнаты — обновляем список.
  useEffect(() => {
    if (!userId) return;
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel("bulut-ws")
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_members" }, () => {
        loadWorkspaces().catch(console.error);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        refreshInbox();
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loadWorkspaces]);

  const active = useMemo(() => workspaces.find((w) => w.id === activeId) ?? null, [workspaces, activeId]);

  const switchWorkspace = useCallback((id: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_KEY, id);
    activeIdRef.current = id;
    db.setActiveWorkspace(id);
    setActiveId(id);
  }, []);

  const createWorkspace = useCallback(
    async (name: string, color = "#6366f1"): Promise<string | null> => {
      try {
        const id = await db.createWorkspaceRpc(name, color);
        if (userId) setWorkspaces(await db.fetchMyWorkspaces(userId));
        switchWorkspace(id);
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось создать комнату";
      }
    },
    [userId, switchWorkspace],
  );

  const updateWorkspace = useCallback(
    async (id: string, patch: { name?: string; color?: string }) => {
      await db.updateWorkspaceRow(id, patch);
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    },
    [],
  );

  const deleteWorkspace = useCallback(
    async (id: string): Promise<string | null> => {
      const ws = workspaces.find((w) => w.id === id);
      if (ws?.myRole !== "owner") return "Удалить комнату может только владелец";
      if (workspaces.length <= 1) return "Нельзя удалить единственную комнату";
      try {
        await db.deleteWorkspaceRow(id);
        const rest = workspaces.filter((w) => w.id !== id);
        setWorkspaces(rest);
        if (activeId === id) switchWorkspace(rest[0].id);
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось удалить комнату";
      }
    },
    [workspaces, activeId, switchWorkspace],
  );

  const leaveWorkspace = useCallback(
    async (id: string): Promise<string | null> => {
      const ws = workspaces.find((w) => w.id === id);
      if (ws?.myRole === "owner") return "Владелец не может покинуть комнату — передайте владение или удалите её";
      if (workspaces.length <= 1) return "Нельзя покинуть единственную комнату";
      if (!userId) return "Нет сессии";
      try {
        await db.leaveWorkspaceDb(id, userId);
        const rest = workspaces.filter((w) => w.id !== id);
        setWorkspaces(rest);
        if (activeId === id) switchWorkspace(rest[0].id);
        return null;
      } catch (e) {
        console.error(e);
        return "Не удалось покинуть комнату";
      }
    },
    [workspaces, activeId, userId, switchWorkspace],
  );

  // ── Участники / приглашения активной комнаты ──
  const refreshRoom = useCallback(async () => {
    if (!activeId) {
      setMembers([]);
      setInvitations([]);
      return;
    }
    try {
      const [m, inv] = await Promise.all([db.fetchMembers(activeId), db.fetchInvitations(activeId)]);
      setMembers(m);
      setInvitations(inv);
    } catch (e) {
      console.error(e);
    }
  }, [activeId]);

  // Держим список участников активной комнаты загруженным (для «Команды», выбора исполнителя).
  useEffect(() => {
    refreshRoom();
  }, [refreshRoom]);

  const inviteMember = useCallback(
    async (inviteEmail: string, role: AppRole) => {
      if (!activeId) return { error: "Комната не выбрана" };
      try {
        const { token } = await db.inviteToWorkspaceRpc(activeId, inviteEmail, role);
        // отправляем письмо (сервер)
        const name = workspaces.find((w) => w.id === activeId)?.name ?? "комнату";
        fetch("/api/invite/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail, token, workspace: name }),
        }).catch(() => {});
        await refreshRoom();
        return { token };
      } catch (e) {
        console.error(e);
        return { error: (e as Error).message || "Не удалось пригласить" };
      }
    },
    [activeId, workspaces, refreshRoom],
  );

  const revokeInvite = useCallback(
    async (id: string) => {
      await db.revokeInvitation(id);
      setInvitations((prev) => prev.map((i) => (i.id === id ? { ...i, status: "revoked" } : i)));
    },
    [],
  );

  const updateMember = useCallback(
    async (id: string, patch: { role?: AppRole; permissions?: PermissionKey[] }) => {
      await db.updateWsMemberRow(id, patch);
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    },
    [],
  );

  const removeMember = useCallback(async (id: string) => {
    await db.removeMemberRow(id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ── Входящие: приглашения на мою почту + уведомления ──
  const refreshInbox = useCallback(async () => {
    if (!userId) return;
    try {
      const [inv, notifs] = await Promise.all([
        email ? db.fetchMyPendingInvites(email) : Promise.resolve([]),
        db.fetchNotifications(userId),
      ]);
      setPendingInvites(inv);
      setNotifications(notifs);
    } catch (e) {
      console.error(e);
    }
  }, [userId, email]);

  useEffect(() => {
    if (userId) refreshInbox();
  }, [userId, refreshInbox]);

  const acceptInvite = useCallback(
    async (token: string): Promise<string | null> => {
      try {
        const wsIdNew = await db.acceptInvitationRpc(token);
        if (userId) {
          const fresh = await db.fetchMyWorkspaces(userId);
          setWorkspaces(fresh);
        }
        switchWorkspace(wsIdNew);
        await refreshInbox();
        return null;
      } catch (e) {
        console.error(e);
        return (e as Error).message || "Не удалось принять приглашение";
      }
    },
    [userId, switchWorkspace, refreshInbox],
  );

  const markRead = useCallback(async (id: string) => {
    await db.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await db.markAllNotificationsRead(userId);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [userId]);

  const unread = useMemo(
    () => notifications.filter((n) => !n.read).length + pendingInvites.length,
    [notifications, pendingInvites],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ready,
      workspaces,
      active,
      activeId,
      myRole: active?.myRole ?? "member",
      myPermissions: active?.myPermissions ?? [],
      switchWorkspace,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      leaveWorkspace,
      refresh: loadWorkspaces,
      members,
      invitations,
      refreshRoom,
      inviteMember,
      revokeInvite,
      updateMember,
      removeMember,
      pendingInvites,
      notifications,
      unread,
      acceptInvite,
      markRead,
      markAllRead,
      refreshInbox,
    }),
    [
      ready, workspaces, active, activeId, switchWorkspace, createWorkspace, updateWorkspace,
      deleteWorkspace, leaveWorkspace, loadWorkspaces, members, invitations, refreshRoom,
      inviteMember, revokeInvite, updateMember, removeMember, pendingInvites, notifications,
      unread, acceptInvite, markRead, markAllRead, refreshInbox,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
