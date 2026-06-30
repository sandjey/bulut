"use client";

import { useMemo } from "react";
import Link from "next/link";
import { UserCircle2, AlarmClock, CalendarClock, CalendarDays, Inbox, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/me";
import { PageHeader } from "@/components/PageHeader";
import { TypeBadge } from "@/components/TypeBadge";
import { PriorityDot } from "@/components/PriorityDot";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { MePicker } from "@/components/MePicker";
import { Avatar } from "@/components/Avatar";
import { todayISO } from "@/lib/date";
import { Task } from "@/lib/types";
import { parseISO, isValid, differenceInCalendarDays } from "date-fns";

export default function MyTasksPage() {
  const { tasks, boards } = useStore();
  const [me, setMe] = useMe();

  // who actually has active tasks (for the diagnostic empty state)
  const activeByAssignee = useMemo(() => {
    const map = new Map<string, number>();
    tasks
      .filter((t) => t.status !== "done")
      .forEach((t) => {
        const key = t.assignee || "Без исполнителя";
        map.set(key, (map.get(key) ?? 0) + 1);
      });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [tasks]);

  const groups = useMemo(() => {
    const today = todayISO();
    const mine = tasks.filter((t) => t.assignee === me && t.status !== "done");
    const bucket = (key: string) => mine.filter((t) => classify(t, today) === key);
    return {
      overdue: bucket("overdue"),
      today: bucket("today"),
      week: bucket("week"),
      later: bucket("later"),
      none: bucket("none"),
    };
  }, [tasks, me]);

  if (!me) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          <UserCircle2 className="h-7 w-7" />
        </div>
        <div>
          <p className="text-lg font-semibold">Укажите, кто вы</p>
          <p className="mt-1 text-sm text-muted">Выберите участника — и здесь появятся ваши задачи.</p>
        </div>
        <MePicker />
      </div>
    );
  }

  const total =
    groups.overdue.length + groups.today.length + groups.week.length + groups.later.length + groups.none.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader title="Мои задачи" subtitle={`Активные задачи: ${me}`}>
          <MePicker />
        </PageHeader>

        {total === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 font-medium">
              На «{me}» активных задач нет
            </p>
            {activeByAssignee.length > 0 ? (
              <>
                <p className="mt-1 text-sm text-muted">
                  Активные задачи назначены на других. Возможно, вы выбрали не того себя ↓
                </p>
                <div className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-2">
                  {activeByAssignee.map(([name, count]) => (
                    <button
                      key={name}
                      onClick={() => name !== "Без исполнителя" && setMe(name)}
                      disabled={name === "Без исполнителя"}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm transition enabled:hover:border-brand enabled:hover:text-brand disabled:opacity-60"
                      title={name === "Без исполнителя" ? "" : `Стать «${name}»`}
                    >
                      {name !== "Без исполнителя" && <Avatar name={name} size={20} />}
                      {name} · {count}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                  Нажмите на имя, чтобы переключиться на него, или назначьте задачу на «{me}» в карточке.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">Активных задач пока нет ни у кого 🎉</p>
            )}
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <Section title="Просроченные" icon={AlarmClock} tone="red" tasks={groups.overdue} boards={boards} />
            <Section title="Сегодня" icon={CalendarClock} tone="amber" tasks={groups.today} boards={boards} />
            <Section title="На этой неделе" icon={CalendarDays} tone="sky" tasks={groups.week} boards={boards} />
            <Section title="Позже" icon={CalendarDays} tone="muted" tasks={groups.later} boards={boards} />
            <Section title="Без срока" icon={Inbox} tone="muted" tasks={groups.none} boards={boards} />
          </div>
        )}
      </div>
    </div>
  );
}

function classify(t: Task, today: string): string {
  if (!t.dueDate) return "none";
  const d = parseISO(t.dueDate);
  if (!isValid(d)) return "none";
  const days = differenceInCalendarDays(d, parseISO(today));
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

const TONE: Record<string, string> = {
  red: "text-red-500",
  amber: "text-amber-500",
  sky: "text-sky-500",
  muted: "text-muted",
};

function Section({
  title,
  icon: Icon,
  tone,
  tasks,
  boards,
}: {
  title: string;
  icon: typeof AlarmClock;
  tone: string;
  tasks: Task[];
  boards: { id: string; name: string; color: string }[];
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${TONE[tone]}`} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks
          .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
          .map((t) => {
            const board = boards.find((b) => b.id === t.boardId);
            return (
              <Link
                key={t.id}
                href={`/board/${t.boardId}?task=${t.id}`}
                className="card flex items-center gap-3 p-3 transition hover:shadow-md"
              >
                <PriorityDot priority={t.priority} />
                <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                <TypeBadge type={t.type} size="xs" />
                <DeadlineBadge dueDate={t.dueDate} />
                {board && (
                  <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: board.color }} />
                    {board.name}
                  </span>
                )}
              </Link>
            );
          })}
      </div>
    </div>
  );
}
