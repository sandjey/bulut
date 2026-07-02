export type JournalTrigger = "done" | "review" | "returned" | "moved";

export const JOURNAL_TRIGGER_LABELS: Record<JournalTrigger, string> = {
  done: "При завершении (Готово)",
  review: "При отправке на проверку",
  returned: "При возврате на доработку",
  moved: "При любом перемещении между колонками",
};
