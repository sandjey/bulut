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
}

export interface Board {
  id: string;
  name: string;
  color: string; // hex color for the colored label
  columns: Column[];
  createdAt: string; // ISO
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
  dueDate: string | null; // ISO date (yyyy-MM-dd) or null
  tags: string[];
  status: TaskStatus;
  createdAt: string; // ISO
  readyAt: string | null; // ISO — когда разработчик отправил на проверку
  testedAt: string | null; // ISO — когда QA проверил и принял
  completedAt: string | null; // ISO — финальное завершение
  stageEnteredAt: string | null; // ISO — когда карточка вошла в текущий этап
  returnCount: number; // сколько раз возвращали на доработку
  stageTimes: Record<string, number>; // имя колонки → накопленные секунды
  checklist: ChecklistItem[]; // подзадачи / чек-лист
  attachments: Attachment[]; // ссылки/файлы
  order: number; // ordering within a column
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
}

export interface AppData {
  boards: Board[];
  tasks: Task[];
  journal: JournalEntry[];
  comments: TaskComment[];
  members: Member[];
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
  "На проверке",
  "Готово",
];
