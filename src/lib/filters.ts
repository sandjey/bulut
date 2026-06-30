import { Task, PRIORITY_META } from "./types";
import { parseISO, isValid } from "date-fns";

export type SortKey = "created" | "due" | "priority" | "title";
export type StatusFilter = "all" | "active" | "done" | "overdue";
export type DueFilter = "all" | "today" | "week" | "overdue" | "none";

export interface FilterState {
  query: string;
  assignee: string; // "" = all
  priority: string; // "" = all
  type: string; // "" = all
  tag: string; // "" = all
  status: StatusFilter;
  due: DueFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = {
  query: "",
  assignee: "",
  priority: "",
  type: "",
  tag: "",
  status: "all",
  due: "all",
  sort: "created",
};

function matchesDue(task: Task, due: DueFilter): boolean {
  if (due === "all") return true;
  if (due === "none") return !task.dueDate;
  if (!task.dueDate) return false;
  const d = parseISO(task.dueDate);
  if (!isValid(d)) return false;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((d.getTime() - startToday.getTime()) / 86400000);
  if (due === "overdue") return diffDays < 0 && task.status !== "done";
  if (due === "today") return diffDays === 0;
  if (due === "week") return diffDays >= 0 && diffDays <= 7;
  return true;
}

export function applyFilters(tasks: Task[], f: FilterState): Task[] {
  const q = f.query.trim().toLowerCase();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const filtered = tasks.filter((t) => {
    if (q) {
      const hay = `${t.title} ${t.desc} ${t.assignee} ${t.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.assignee && t.assignee !== f.assignee) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.tag && !t.tags.includes(f.tag)) return false;

    if (f.status === "active" && t.status !== "active") return false;
    if (f.status === "done" && t.status !== "done") return false;
    if (f.status === "overdue") {
      if (t.status === "done") return false;
      if (!t.dueDate || t.dueDate >= todayKey) return false;
    }

    if (!matchesDue(t, f.due)) return false;
    return true;
  });

  return sortTasks(filtered, f.sort);
}

export function sortTasks(tasks: Task[], sort: SortKey): Task[] {
  const copy = [...tasks];
  switch (sort) {
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    case "priority":
      return copy.sort(
        (a, b) => PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight
      );
    case "due":
      return copy.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    case "created":
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function uniqueAssignees(tasks: Task[]): string[] {
  return Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ru")
  );
}

export function uniqueTags(tasks: Task[]): string[] {
  const set = new Set<string>();
  tasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
}
