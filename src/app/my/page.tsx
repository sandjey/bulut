"use client";

import { useMemo } from "react";
import Link from "next/link";
import { UserCircle2, AlarmClock, CalendarClock, CalendarDays, Inbox, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/me";
import { RequirePerm } from "@/components/RequirePerm";
import { PageHeader } from "@/components/PageHeader";
import { TypeBadge } from "@/components/TypeBadge";
import { PriorityDot } from "@/components/PriorityDot";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { todayISO } from "@/lib/date";
import { effectiveDueDate } from "@/lib/deadlines";
import { Task } from "@/lib/types";
import { parseISO, isValid, differenceInCalendarDays } from "date-fns";

export default function MyTasksPage() {
  return (
    <RequirePerm perm="board.view" title="Нет доступа к задачам">
      <MyTasksPageInner />
    </RequirePerm>
  );
}

function MyTasksPageInner() {
  const { tasks, boards } = useStore();
  const [me] = useMe(); // личность из аккаунта (задаётся автоматически)

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
          <p className="text-lg font-semibold">Заполните имя в профиле</p>
          <p className="mt-1 text-sm text-muted">
            Здесь появятся задачи, назначенные на вас. Укажите имя в{" "}
            <Link href="/profile" className="text-brand underline">
              профиле
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const total =
    groups.overdue.length + groups.today.length + groups.week.length + groups.later.length + groups.none.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader title="Мои задачи" subtitle={`Активные задачи: ${me}`} />

        {total === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 font-medium">На «{me}» активных задач нет 🎉</p>
            <p className="mt-1 text-sm text-muted">
              Задачи появятся здесь, когда их назначат на вас.
            </p>
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
  const eff = effectiveDueDate(t);
  if (!eff) return "none";
  const d = parseISO(eff);
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
          .sort((a, b) =>
            (effectiveDueDate(a) ?? "9999").localeCompare(effectiveDueDate(b) ?? "9999")
          )
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
                <DeadlineBadge dueDate={t.dueDate} done={!!t.readyAt} label="Тест" />
                <DeadlineBadge dueDate={t.doneDueDate} label="Готово" />
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
