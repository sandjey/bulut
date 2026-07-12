export type Priority = "low" | "medium" | "high";

export type TaskStatus = "active" | "done";

export type TaskType =
  | "task"
  | "bug"
  | "feature"
  | "newfeature"
  | "improvement"
  | "refactor"
  | "docs"
  | "test"
  | "design"
  | "research";

export const TASK_TYPES: Record<TaskType, { label: string; color: string; icon: string }> = {
  task: { label: "Задача", color: "#64748b", icon: "📋" },
  bug: { label: "Баг", color: "#ef4444", icon: "🐞" },
  feature: { label: "Фича", color: "#8b5cf6", icon: "✨" },
  newfeature: { label: "Новый функционал", color: "#10b981", icon: "🚀" },
  improvement: { label: "Улучшение", color: "#0ea5e9", icon: "⬆️" },
  refactor: { label: "Рефакторинг", color: "#f59e0b", icon: "🔧" },
  docs: { label: "Документация", color: "#14b8a6", icon: "📄" },
  test: { label: "Тестирование", color: "#6366f1", icon: "🧪" },
  design: { label: "Дизайн", color: "#ec4899", icon: "🎨" },
  research: { label: "Исследование", color: "#94a3b8", icon: "🔬" },
};

export const TASK_TYPE_KEYS = Object.keys(TASK_TYPES) as TaskType[];

export interface Column {
  id: string;
  name: string;
  wip?: number; // лимит задач в колонке (0/undefined — без лимита)
}

export interface Board {
  id: string;
  name: string;
  color: string; // hex color for the colored label
  columns: Column[];
  createdAt: string; // ISO
  deletedAt?: string | null; // ISO — в Корзине, если задано
}

export interface Task {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  desc: string;
  assignee: string;
  priority: Priority;
  type: TaskType;
  dueDate: string | null; // дедлайн «Готов к тестированию» (разработчик) — yyyy-MM-dd
  doneDueDate: string | null; // дедлайн «Готово» (тестировщик/финал) — yyyy-MM-dd
  tags: string[];
  status: TaskStatus;
  createdAt: string; // ISO
  createdBy: string; // кто создал карточку (имя из «Я» или email)
  readyAt: string | null; // ISO — когда разработчик отправил на проверку
  testedAt: string | null; // ISO — когда QA проверил и принял
  completedAt: string | null; // ISO — финальное завершение
  stageEnteredAt: string | null; // ISO — когда карточка вошла в текущий этап
  returnCount: number; // сколько раз возвращали на доработку
  returns: ReturnEvent[]; // история возвратов: откуда/куда, когда, сколько времени
  stageTimes: Record<string, number>; // имя колонки → накопленные секунды
  checklist: ChecklistItem[]; // подзадачи / чек-лист
  attachments: Attachment[]; // ссылки/файлы
  photos: TaskPhoto[]; // фото (base64) — удаляются при переходе в «Готово»
  order: number; // ordering within a column
  mapId: string | null; // Bulut MAP: к какой карте привязана задача
  mapNodeId: string | null; // Bulut MAP: id узла-экрана в графе карты
  parentId: string | null; // подзадача: id родительской задачи
  blockedBy: string[]; // id задач, которые блокируют эту
  deletedAt?: string | null; // ISO — в Корзине, если задано
}

/** Одно событие возврата карточки на доработку. */
export interface ReturnEvent {
  at: string; // ISO — когда вернули
  from: string; // с какого этапа вернули (имя колонки, напр. «На проверке»)
  to: string; // на какой этап вернули (имя колонки, напр. «В процессе»)
  seconds: number; // сколько карточка провела на этапе `from` до возврата
  reason?: string; // причина (если возврат через кнопку QA)
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  createdAt: string; // ISO
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
}

/** Photo attached to a task. `dataUrl` is a compressed base64 JPEG/PNG. */
export interface TaskPhoto {
  id: string;
  name: string;
  dataUrl: string;
}

/** Max photos allowed per task. */
export const MAX_TASK_PHOTOS = 10;

export type CommentKind = "comment" | "return";

export interface TaskComment {
  id: string;
  taskId: string;
  author: string;
  text: string;
  kind: CommentKind; // 'return' = QA вернул задачу на доработку
  createdAt: string; // ISO
}

export interface JournalEntry {
  id: string;
  taskId: string | null; // null = manual entry
  date: string; // ISO date (yyyy-MM-dd)
  boardName: string;
  taskTitle: string;
  assignee: string;
  notes: string;
  stage: string; // действие/этап: "Готово", "На проверке", "Возврат" и т.п.
  type: TaskType; // тип задачи (баг/фича/…)
  createdAt: string; // ISO
  deletedAt?: string | null; // ISO — в Корзине, если задано
}

export interface AppData {
  boards: Board[];
  tasks: Task[];
  journal: JournalEntry[];
  comments: TaskComment[];
  members: Member[];
}

/** Удалённые (в Корзине) элементы — хранятся отдельно от рабочих данных. */
export interface TrashData {
  boards: Board[];
  tasks: Task[];
  journal: JournalEntry[];
}

/** Метаданные бэкапа (без тяжёлого поля data). */
export interface BackupMeta {
  id: string;
  createdAt: string;
  createdBy: string | null;
  authorName: string;
  label: string;
  kind: "manual" | "auto";
  counts: Record<string, number>;
}

export const MEMBER_ROLES = ["Frontend", "Backend", "QA", "Mobile", "DevOps", "Дизайн", "PM"];

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; dot: string; weight: number }
> = {
  high: { label: "Высокий", color: "text-red-600 dark:text-red-400", dot: "#ef4444", weight: 3 },
  medium: { label: "Средний", color: "text-amber-600 dark:text-amber-400", dot: "#f59e0b", weight: 2 },
  low: { label: "Низкий", color: "text-emerald-600 dark:text-emerald-400", dot: "#10b981", weight: 1 },
};

export const BOARD_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
  "#64748b", // slate
];

export const DEFAULT_COLUMN_NAMES = [
  "К выполнению",
  "В процессе",
  "Готов к тестированию",
  "На проверке",
  "Готово",
];

/** Название колонки-этапа, попадающего в журнал (разработчик сдал в тест). */
export const READY_COLUMN_NAME = "Готов к тестированию";
/** Название колонки проверки QA. */
export const REVIEW_COLUMN_NAME = "На проверке";
