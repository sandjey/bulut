"use client";

import type { Task } from "./types";

/** Правило автоматизации: когда карточку переместили в колонку → действие. */
export interface BoardRule {
  id: string;
  whenCol: string; // id колонки-триггера
  action: "assign" | "priority" | "done";
  value: string; // имя исполнителя / low|medium|high (для done не нужно)
}

const key = (boardId: string) => `bulut.rules.${boardId}`;

export function loadRules(boardId: string): BoardRule[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key(boardId)) || "[]");
  } catch {
    return [];
  }
}

export function saveRules(boardId: string, rules: BoardRule[]) {
  if (typeof window !== "undefined") localStorage.setItem(key(boardId), JSON.stringify(rules));
}

/** Что применить к задаче по правилам для колонки-назначения. Возвращает patch или null. */
export function rulesPatchFor(boardId: string, destCol: string): Partial<Task> | null {
  const rules = loadRules(boardId).filter((r) => r.whenCol === destCol);
  if (!rules.length) return null;
  const patch: Partial<Task> = {};
  for (const r of rules) {
    if (r.action === "assign" && r.value) patch.assignee = r.value;
    else if (r.action === "priority" && ["low", "medium", "high"].includes(r.value))
      patch.priority = r.value as Task["priority"];
    else if (r.action === "done") {
      patch.status = "done";
      patch.completedAt = new Date().toISOString();
    }
  }
  return Object.keys(patch).length ? patch : null;
}
