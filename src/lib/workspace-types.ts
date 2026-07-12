import type { AppRole, PermissionKey } from "./permissions";

/** Комната (workspace) — арендатор. */
export interface Workspace {
  id: string;
  name: string;
  color: string;
  ownerId: string | null;
  createdAt: string;
  /** Роль текущего пользователя в этой комнате. */
  myRole: AppRole;
  /** Права текущего пользователя в этой комнате. */
  myPermissions: PermissionKey[];
}

/** Участник комнаты. */
export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: AppRole;
  permissions: PermissionKey[];
  createdAt: string;
  // из профиля (join на клиенте)
  name: string;
  email: string;
  avatar: string | null;
}

/** Приглашение в комнату. */
export interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  role: AppRole;
  token: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  expiresAt: string;
  workspaceName?: string;
}

/** Уведомление в приложении. */
export interface AppNotification {
  id: string;
  userId: string;
  workspaceId: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}
