import { AppData } from "./types";
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

/** Derive notifications for the member `me` from current app data. */
export function buildNotifications(data: AppData, me: string): Notif[] {
  if (!me) return [];
  const today = todayISO();
  const out: Notif[] = [];

  const myTasks = data.tasks.filter((t) => t.assignee === me && t.status !== "done");

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
  const taskById = new Map(data.tasks.map((t) => [t.id, t]));
  data.comments.forEach((c) => {
    const task = taskById.get(c.taskId);
    if (!task) return;
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
