import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isValid,
} from "date-fns";
import { ru } from "date-fns/locale";

export function fmtDate(iso: string | null, pattern = "d MMM yyyy"): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  if (!isValid(d)) return "—";
  return format(d, pattern, { locale: ru });
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  if (!isValid(d)) return "—";
  return format(d, "d MMM yyyy, HH:mm", { locale: ru });
}

export type DeadlineStatus = "none" | "overdue" | "urgent" | "soon" | "ok";

export interface DeadlineInfo {
  status: DeadlineStatus;
  days: number; // calendar days until due (negative = overdue)
  label: string;
  color: string; // tailwind classes
}

export function deadlineInfo(dueDate: string | null, done = false): DeadlineInfo {
  if (!dueDate) {
    return { status: "none", days: 0, label: "Без срока", color: "text-muted" };
  }
  const due = parseISO(dueDate);
  if (!isValid(due)) {
    return { status: "none", days: 0, label: "Без срока", color: "text-muted" };
  }
  const days = differenceInCalendarDays(due, new Date());

  if (done) {
    return {
      status: "ok",
      days,
      label: `Срок ${fmtDate(dueDate, "d MMM")}`,
      color: "text-emerald-600 dark:text-emerald-400",
    };
  }

  if (days < 0) {
    return {
      status: "overdue",
      days,
      label: `Просрочено на ${Math.abs(days)} дн.`,
      color: "text-red-600 dark:text-red-400",
    };
  }
  if (days === 0) {
    return {
      status: "urgent",
      days,
      label: "Сегодня",
      color: "text-red-600 dark:text-red-400",
    };
  }
  if (days <= 2) {
    return {
      status: "urgent",
      days,
      label: `Через ${days} дн.`,
      color: "text-amber-600 dark:text-amber-400",
    };
  }
  if (days <= 6) {
    return {
      status: "soon",
      days,
      label: `Через ${days} дн.`,
      color: "text-amber-600 dark:text-amber-400",
    };
  }
  return {
    status: "ok",
    days,
    label: fmtDate(dueDate, "d MMM"),
    color: "text-emerald-600 dark:text-emerald-400",
  };
}

export type GroupBy = "day" | "week" | "month";

export function groupKey(iso: string, by: GroupBy): string {
  const d = parseISO(iso);
  if (!isValid(d)) return "—";
  if (by === "day") return format(d, "yyyy-MM-dd");
  if (by === "week") {
    const s = startOfWeek(d, { weekStartsOn: 1 });
    return format(s, "yyyy-MM-dd");
  }
  return format(d, "yyyy-MM");
}

export function groupLabel(iso: string, by: GroupBy): string {
  const d = parseISO(iso);
  if (!isValid(d)) return "—";
  if (by === "day") return format(d, "EEEE, d MMMM yyyy", { locale: ru });
  if (by === "week") {
    const s = startOfWeek(d, { weekStartsOn: 1 });
    const e = endOfWeek(d, { weekStartsOn: 1 });
    return `${format(s, "d MMM", { locale: ru })} — ${format(e, "d MMM yyyy", { locale: ru })}`;
  }
  return format(d, "LLLL yyyy", { locale: ru });
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Format a duration given in seconds as a human-readable ru string. */
export function formatDuration(totalSeconds: number): string {
  let s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const mins = Math.floor(s / 60);
  if (days > 0) return `${days} дн${hours ? ` ${hours} ч` : ""}`;
  if (hours > 0) return `${hours} ч${mins ? ` ${mins} мин` : ""}`;
  if (mins > 0) return `${mins} мин`;
  return "< 1 мин";
}

/** Human-readable elapsed time since an ISO timestamp (ru). */
export function durationSince(iso: string | null): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  if (!isValid(d)) return "—";
  return formatDuration((Date.now() - d.getTime()) / 1000);
}

export type Period = "day" | "week" | "month";

/** Returns the [start, end] date keys (yyyy-MM-dd, inclusive) for a period containing `ref`. */
export function periodRange(ref: Date, period: Period): { from: string; to: string; label: string } {
  if (period === "day") {
    const key = format(ref, "yyyy-MM-dd");
    return { from: key, to: key, label: format(ref, "EEEE, d MMMM yyyy", { locale: ru }) };
  }
  if (period === "week") {
    const s = startOfWeek(ref, { weekStartsOn: 1 });
    const e = endOfWeek(ref, { weekStartsOn: 1 });
    return {
      from: format(s, "yyyy-MM-dd"),
      to: format(e, "yyyy-MM-dd"),
      label: `${format(s, "d MMM", { locale: ru })} — ${format(e, "d MMM yyyy", { locale: ru })}`,
    };
  }
  const s = startOfMonth(ref);
  const e = endOfMonth(ref);
  return {
    from: format(s, "yyyy-MM-dd"),
    to: format(e, "yyyy-MM-dd"),
    label: format(ref, "LLLL yyyy", { locale: ru }),
  };
}

/** True if a yyyy-MM-dd (or ISO) date falls within [from, to] inclusive. */
export function inDateRange(dateIso: string | null, from: string, to: string): boolean {
  if (!dateIso) return false;
  const d = parseISO(dateIso);
  if (!isValid(d)) return false;
  const key = format(d, "yyyy-MM-dd");
  return key >= from && key <= to;
}

export { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, parseISO };
