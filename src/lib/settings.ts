"use client";

import { useEffect, useState } from "react";

export type JournalTrigger = "done" | "review" | "returned" | "moved";

export const JOURNAL_TRIGGER_LABELS: Record<JournalTrigger, string> = {
  done: "При завершении (Готово)",
  review: "При отправке на проверку",
  returned: "При возврате на доработку",
  moved: "При любом перемещении между колонками",
};

const KEY = "bulut.journalTriggers";
const EVENT = "bulut-settings-changed";
const DEFAULT: JournalTrigger[] = ["done"];

export function getJournalTriggers(): JournalTrigger[] {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const arr = JSON.parse(raw) as JournalTrigger[];
    return Array.isArray(arr) ? arr : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setJournalTriggers(triggers: JournalTrigger[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(triggers));
  window.dispatchEvent(new Event(EVENT));
}

/** React hook: live-updating journal triggers. */
export function useJournalTriggers(): [JournalTrigger[], (t: JournalTrigger[]) => void] {
  const [triggers, setTriggers] = useState<JournalTrigger[]>(DEFAULT);

  useEffect(() => {
    setTriggers(getJournalTriggers());
    const handler = () => setTriggers(getJournalTriggers());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (t: JournalTrigger[]) => {
    setJournalTriggers(t);
    setTriggers(t);
  };

  return [triggers, update];
}
