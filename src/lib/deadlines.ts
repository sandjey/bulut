import { Task } from "./types";

/**
 * Дедлайн «Готов к тестированию» просрочен: разработчик не сдал в тест вовремя
 * (карточка ещё не была готова и срок прошёл).
 */
export function isDevOverdue(t: Task, today: string): boolean {
  return t.status !== "done" && !t.readyAt && !!t.dueDate && t.dueDate < today;
}

/** Дедлайн «Готово» просрочен: задача не завершена вовремя. */
export function isDoneOverdue(t: Task, today: string): boolean {
  return t.status !== "done" && !!t.doneDueDate && t.doneDueDate < today;
}

/** Задача просрочена по любому из дедлайнов. */
export function isTaskOverdue(t: Task, today: string): boolean {
  return isDevOverdue(t, today) || isDoneOverdue(t, today);
}

/**
 * Ближайший актуальный дедлайн для сортировки/группировки:
 * пока не сдана в тест — дедлайн разработчика, иначе — финальный.
 */
export function effectiveDueDate(t: Task): string | null {
  if (t.status !== "done" && !t.readyAt && t.dueDate) return t.dueDate;
  return t.doneDueDate ?? t.dueDate;
}
