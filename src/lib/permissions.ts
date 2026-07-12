/**
 * Каталог прав доступа («конструктор» возможностей).
 *
 * Роли:
 *  • owner  — владелец. Все права. Неудаляем/непонижаем. Управляет админами.
 *  • admin  — все возможности + управление правами обычных пользователей.
 *             Не может трогать владельца и назначать других админов.
 *  • member — права выдаёт админ поштучно.
 */

export type AppRole = "owner" | "admin" | "member";

/** Аккаунт-профиль пользователя с ролью и правами. */
export interface Profile {
  id: string;
  email: string;
  name: string;
  jobRole: string;
  role: AppRole;
  permissions: PermissionKey[];
  createdAt: string;
  avatar?: string | null; // фото профиля (data URL) или null
  deletedAt?: string | null; // ISO — профиль удалён (аккаунт деактивирован)
}

export type PermissionKey =
  // Доски и карточки
  | "board.view"
  | "card.create"
  | "card.edit"
  | "card.move"
  | "card.delete"
  | "card.status"
  | "card.comment"
  | "board.manage"
  // Журнал
  | "journal.view"
  | "journal.edit"
  | "journal.delete"
  | "journal.export"
  // Отчёты и аналитика
  | "reports.view"
  | "reports.export"
  | "analytics.view"
  // Команда
  | "team.view"
  | "team.manage"
  // Bulut MAP (карты проекта)
  | "map.view"
  | "map.create"
  | "map.edit"
  | "map.delete"
  | "map.export"
  // Администрирование
  | "admin.access";

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  hint: string;
}

export interface PermissionGroup {
  title: string;
  icon: string; // имя lucide-иконки (см. admin UI)
  color: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: "Доски и карточки",
    icon: "LayoutDashboard",
    color: "#6366f1",
    permissions: [
      { key: "board.view", label: "Просмотр досок и задач", hint: "Видеть доски, колонки и карточки" },
      { key: "card.create", label: "Создание карточек", hint: "Добавлять новые задачи" },
      { key: "card.edit", label: "Редактирование карточек", hint: "Менять текст, сроки, теги, чек-лист" },
      { key: "card.move", label: "Перемещение карточек", hint: "Перетаскивать карточки между колонками" },
      { key: "card.delete", label: "Удаление карточек", hint: "Удалять задачи навсегда" },
      { key: "card.status", label: "Смена этапа", hint: "Кнопки «В тест», «Принять», «Вернуть»" },
      { key: "card.comment", label: "Комментарии", hint: "Оставлять комментарии к задачам" },
      { key: "board.manage", label: "Управление досками", hint: "Создавать, переименовывать, удалять доски и колонки" },
    ],
  },
  {
    title: "Журнал",
    icon: "BookOpenText",
    color: "#0ea5e9",
    permissions: [
      { key: "journal.view", label: "Просмотр журнала", hint: "Открывать раздел «Журнал»" },
      { key: "journal.edit", label: "Редактирование записей", hint: "Менять записи журнала" },
      { key: "journal.delete", label: "Удаление записей", hint: "Удалять записи журнала" },
      { key: "journal.export", label: "Экспорт журнала в Excel", hint: "Выгружать журнал в файл" },
    ],
  },
  {
    title: "Отчёты и аналитика",
    icon: "FileBarChart",
    color: "#10b981",
    permissions: [
      { key: "reports.view", label: "Просмотр отчётов", hint: "Открывать раздел «Отчёты»" },
      { key: "reports.export", label: "Экспорт отчётов в Excel", hint: "Выгружать отчёты в файл" },
      { key: "analytics.view", label: "Просмотр аналитики", hint: "Открывать раздел «Аналитика»" },
    ],
  },
  {
    title: "Команда",
    icon: "Users",
    color: "#f43f5e",
    permissions: [
      { key: "team.view", label: "Просмотр команды", hint: "Открывать раздел «Команда»" },
      { key: "team.manage", label: "Управление участниками", hint: "Добавлять, менять и удалять участников" },
    ],
  },
  {
    title: "Bulut MAP",
    icon: "Waypoints",
    color: "#14b8a6",
    permissions: [
      { key: "map.view", label: "Просмотр карт", hint: "Открывать раздел «Bulut MAP» и карты проекта" },
      { key: "map.create", label: "Создание карт", hint: "Создавать новые карты проекта" },
      { key: "map.edit", label: "Редактирование карт", hint: "Добавлять узлы и связи, менять свойства" },
      { key: "map.delete", label: "Удаление карт", hint: "Удалять карты целиком" },
      { key: "map.export", label: "Экспорт карт", hint: "Выгружать карту (PNG/JSON)" },
    ],
  },
  {
    title: "Администрирование",
    icon: "ShieldCheck",
    color: "#f59e0b",
    permissions: [
      {
        key: "admin.access",
        label: "Доступ к администрированию",
        hint: "Раздел управления правами. Обычно только у админов.",
      },
    ],
  },
];

/** Плоский список всех ключей прав. */
export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

/** Права по умолчанию для нового пользователя. */
export const DEFAULT_MEMBER_PERMISSIONS: PermissionKey[] = ["board.view"];

const LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label] as const)),
);

export function permissionLabel(key: string): string {
  return LABELS[key] ?? key;
}

export const ROLE_META: Record<AppRole, { label: string; color: string }> = {
  owner: { label: "Владелец", color: "#f59e0b" },
  admin: { label: "Администратор", color: "#8b5cf6" },
  member: { label: "Пользователь", color: "#64748b" },
};

/**
 * Может ли `actor` (роль владельца/админа) управлять профилем `target`.
 * Правила «конструктора»: владелец правит всех, кроме себя-как-владельца
 * запрещать нельзя не будем; админ правит только обычных пользователей.
 */
export function canManageProfile(actorRole: AppRole, targetRole: AppRole): boolean {
  if (actorRole === "owner") return targetRole !== "owner";
  if (actorRole === "admin") return targetRole === "member";
  return false;
}

/** Может ли актёр назначать/снимать роль администратора. Только владелец. */
export function canAssignAdmin(actorRole: AppRole): boolean {
  return actorRole === "owner";
}
