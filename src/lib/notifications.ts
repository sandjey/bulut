import type { Task } from "./types";
import type { FeedComment } from "./db";
import { todayISO } from "./date";
import { parseISO, isValid, differenceInCalendarDays } from "date-fns";

export type NotifType = "overdue" | "due" | "return" | "mention";

export interface Notif {
  id: string;
  type: NotifType;
  title: string;
  detail: string;
  taskId: string;
  boardId: string;
  at: string; // ISO — for ordering / unread comparison
}

/**
 * Уведомления для `me`: сроки — из моих активных задач (набор «mine»),
 * возвраты и упоминания — из ленты, которую отобрала база (fetchNotificationFeed).
 */
export function buildNotifications(input: { tasks: Task[]; feed: FeedComment[] }, me: string): Notif[] {
  if (!me) return [];
  const today = todayISO();
  const out: Notif[] = [];

  const myTasks = input.tasks.filter((t) => t.assignee === me && t.status !== "done");

  // overdue / due soon
  myTasks.forEach((t) => {
    if (!t.dueDate) return;
    const d = parseISO(t.dueDate);
    if (!isValid(d)) return;
    const days = differenceInCalendarDays(d, parseISO(today));
    if (days < 0) {
      out.push({
        id: `ov-${t.id}`,
        type: "overdue",
        title: t.title,
        detail: `Просрочено на ${Math.abs(days)} дн.`,
        taskId: t.id,
        boardId: t.boardId,
        at: t.dueDate,
      });
    } else if (days <= 1) {
      out.push({
        id: `due-${t.id}`,
        type: "due",
        title: t.title,
        detail: days === 0 ? "Срок сегодня" : "Срок завтра",
        taskId: t.id,
        boardId: t.boardId,
        at: t.dueDate,
      });
    }
  });

  // returns on my tasks + mentions of me, from comments
  const meLower = me.toLowerCase();
  input.feed.forEach((c) => {
    const task = c.task;
    if (c.kind === "return" && task.assignee === me) {
      out.push({
        id: `ret-${c.id}`,
        type: "return",
        title: task.title,
        detail: `Возврат от ${c.author || "QA"}: ${c.text}`.slice(0, 120),
        taskId: task.id,
        boardId: task.boardId,
        at: c.createdAt,
      });
    } else if (c.text.toLowerCase().includes(`@${meLower}`)) {
      out.push({
        id: `men-${c.id}`,
        type: "mention",
        title: task.title,
        detail: `${c.author || "Кто-то"}: ${c.text}`.slice(0, 120),
        taskId: task.id,
        boardId: task.boardId,
        at: c.createdAt,
      });
    }
  });

  return out.sort((a, b) => b.at.localeCompare(a.at));
}
