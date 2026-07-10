"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Users,
  Activity,
  PieChart,
  CheckCircle2,
  Clock,
  CornerUpLeft,
  PlusCircle,
  ChevronDown,
} from "lucide-react";
import { addDays, addWeeks, addMonths } from "date-fns";
import { useStore } from "@/lib/store";
import { useCan } from "@/lib/access";
import { PageHeader } from "@/components/PageHeader";
import { RequirePerm } from "@/components/RequirePerm";
import { Avatar } from "@/components/Avatar";
import { TypeBadge } from "@/components/TypeBadge";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import {
  Period,
  periodRange,
  inDateRange,
  fmtDate,
  durationSince,
  formatDuration,
} from "@/lib/date";
import { stageTimeList } from "@/lib/stages";
import { exportToExcel } from "@/lib/export";
import { cn } from "@/lib/utils";

type Tab = "people" | "load" | "summary";

export default function ReportsPage() {
  return (
    <RequirePerm perm="reports.view" title="Нет доступа к отчётам">
      <ReportsPageInner />
    </RequirePerm>
  );
}

function ReportsPageInner() {
  const { boards, tasks, journal, members } = useStore();
  const canExport = useCan()("reports.export");
  const [period, setPeriod] = useState<Period>("week");
  const [ref, setRef] = useState<Date>(() => new Date());
  const [tab, setTab] = useState<Tab>("people");
  const [expanded, setExpanded] = useState<string | null>(null);

  const range = useMemo(() => periodRange(ref, period), [ref, period]);

  const shift = (dir: number) => {
    setRef((d) => (period === "day" ? addDays(d, dir) : period === "week" ? addWeeks(d, dir) : addMonths(d, dir)));
  };

  // all people = team members ∪ assignees seen on tasks/journal
  const people = useMemo(() => {
    const set = new Set<string>(members.map((m) => m.name));
    tasks.forEach((t) => t.assignee && set.add(t.assignee));
    journal.forEach((j) => j.assignee && set.add(j.assignee));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [members, tasks, journal]);

  const statFor = (name: string) => {
    const created = tasks.filter((t) => t.assignee === name && inDateRange(t.createdAt, range.from, range.to)).length;
    const done = tasks.filter(
      (t) => t.assignee === name && t.completedAt && inDateRange(t.completedAt, range.from, range.to)
    ).length;
    const returns = journal.filter(
      (j) => j.assignee === name && j.stage === "Возврат" && inDateRange(j.date, range.from, range.to)
    ).length;
    const actions = journal.filter((j) => j.assignee === name && inDateRange(j.date, range.from, range.to));
    const activeNow = tasks.filter((t) => t.assignee === name && t.status !== "done").length;
    return { created, done, returns, actions, activeNow };
  };

  const doExport = () => {
    exportToExcel(
      { boards, tasks, journal },
      {
        filter: { from: range.from, to: range.to, boardId: "all", status: "all", assignee: "all" },
        includeTasks: true,
        includeJournal: true,
        includeSummary: true,
      }
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader title="Отчёты" subtitle="Кто что делает — по дням, неделям и месяцам">
          {canExport && (
            <button className="btn-primary" onClick={doExport}>
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">Скачать Excel</span>
            </button>
          )}
        </PageHeader>

        {/* Period controls */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-surface p-0.5">
            {(["day", "week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  period === p ? "btn-primary !px-3 !py-1.5" : "text-muted hover:text-fg"
                )}
              >
                {p === "day" ? "День" : p === "week" ? "Неделя" : "Месяц"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} className="btn-ghost p-2" aria-label="Назад">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[180px] text-center text-sm font-medium capitalize">{range.label}</span>
            <button onClick={() => shift(1)} className="btn-ghost p-2" aria-label="Вперёд">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => setRef(new Date())} className="btn-outline text-sm">
            Сегодня
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-border">
          {([
            ["people", "Сотрудники", Users],
            ["load", "Занятость сейчас", Activity],
            ["summary", "Сводка", PieChart],
          ] as [Tab, string, typeof Users][]).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition",
                tab === key ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg"
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* ---------- PEOPLE ---------- */}
        {tab === "people" && (
          <div className="mt-5 overflow-hidden rounded-xl border border-border shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-semibold">Сотрудник</th>
                    <th className="px-4 py-2.5 font-semibold">Действий</th>
                    <th className="px-4 py-2.5 font-semibold">Создано</th>
                    <th className="px-4 py-2.5 font-semibold">Завершено</th>
                    <th className="px-4 py-2.5 font-semibold">Возвратов</th>
                    <th className="px-4 py-2.5 font-semibold">В работе</th>
                    <th className="w-8 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {people.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted">
                        Нет сотрудников. Добавьте их в разделе «Команда».
                      </td>
                    </tr>
                  )}
                  {people.map((name) => {
                    const s = statFor(name);
                    const open = expanded === name;
                    return (
                      <Fragment key={name}>
                        <tr
                          className="cursor-pointer border-t border-border transition hover:bg-surface-2/40"
                          onClick={() => setExpanded(open ? null : name)}
                        >
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2 font-medium">
                              <Avatar name={name} size={26} /> {name}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">{s.actions.length}</td>
                          <td className="px-4 py-2.5 text-sky-600 dark:text-sky-400">{s.created}</td>
                          <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400">{s.done}</td>
                          <td className="px-4 py-2.5 text-red-600 dark:text-red-400">{s.returns}</td>
                          <td className="px-4 py-2.5">{s.activeNow}</td>
                          <td className="px-2 py-2.5 text-muted">
                            <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-t border-border bg-surface-2/30">
                            <td colSpan={7} className="px-4 py-3">
                              {s.actions.length === 0 ? (
                                <p className="text-sm text-muted">Нет действий за период</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {s.actions.map((a) => (
                                    <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                                      <span className="w-20 shrink-0 text-muted">{fmtDate(a.date, "d MMM")}</span>
                                      <span className="chip bg-surface text-muted">{a.boardName}</span>
                                      {a.stage && <span className="chip bg-brand/10 text-brand">{a.stage}</span>}
                                      <TypeBadge type={a.type} size="xs" />
                                      <span className="font-medium">{a.taskTitle}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------- LOAD NOW ---------- */}
        {tab === "load" && <LoadView />}

        {/* ---------- SUMMARY ---------- */}
        {tab === "summary" && <SummaryView from={range.from} to={range.to} />}
      </div>
    </div>
  );
}

/* ---------------- Load (who's busy now) ---------------- */
function LoadView() {
  const { boards, tasks } = useStore();
  const people = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    tasks
      .filter((t) => t.status !== "done")
      .forEach((t) => {
        const key = t.assignee || "Без исполнителя";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [tasks]);

  if (people.length === 0)
    return <p className="mt-8 text-center text-muted">Нет активных задач — все свободны 🎉</p>;

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
      {people.map(([name, list]) => (
        <div key={name} className="card p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-border pb-2.5">
            <Avatar name={name} size={30} />
            <span className="font-semibold">{name}</span>
            <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
              {list.length} задач
            </span>
          </div>
          <div className="space-y-2">
            {list
              .sort((a, b) => a.order - b.order)
              .map((t) => {
                const board = boards.find((b) => b.id === t.boardId);
                const colName = board?.columns.find((c) => c.id === t.columnId)?.name ?? "";
                return (
                  <Link
                    key={t.id}
                    href={`/board/${t.boardId}?task=${t.id}`}
                    className="block rounded-lg border border-border p-2.5 transition hover:bg-surface-2/50"
                  >
                    <div className="flex items-center gap-2">
                      <TypeBadge type={t.type} size="xs" />
                      <span className="flex-1 truncate text-sm font-medium">{t.title}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="chip bg-surface-2 text-muted">{colName}</span>
                      <span className="chip bg-surface-2 text-muted">
                        <Clock className="h-3 w-3" /> {durationSince(t.stageEnteredAt)}
                      </span>
                      <DeadlineBadge dueDate={t.dueDate} done={!!t.readyAt} label="Тест" />
                      <DeadlineBadge dueDate={t.doneDueDate} label="Готово" />
                    </div>
                  </Link>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Summary + bottlenecks ---------------- */
function SummaryView({ from, to }: { from: string; to: string }) {
  const { boards, tasks, journal } = useStore();

  const totals = useMemo(() => {
    const created = tasks.filter((t) => inDateRange(t.createdAt, from, to)).length;
    const done = tasks.filter((t) => t.completedAt && inDateRange(t.completedAt, from, to)).length;
    const returns = journal.filter((j) => j.stage === "Возврат" && inDateRange(j.date, from, to)).length;
    const activeNow = tasks.filter((t) => t.status !== "done").length;
    return { created, done, returns, activeNow };
  }, [tasks, journal, from, to]);

  const byBoard = useMemo(
    () =>
      boards.map((b) => {
        const bt = tasks.filter((t) => t.boardId === b.id);
        return {
          name: b.name,
          color: b.color,
          created: bt.filter((t) => inDateRange(t.createdAt, from, to)).length,
          done: bt.filter((t) => t.completedAt && inDateRange(t.completedAt, from, to)).length,
          active: bt.filter((t) => t.status !== "done").length,
        };
      }),
    [boards, tasks, from, to]
  );

  // bottlenecks: average accumulated time per stage name across all tasks
  const bottlenecks = useMemo(() => {
    const agg = new Map<string, { total: number; count: number }>();
    tasks.forEach((t) => {
      const board = boards.find((b) => b.id === t.boardId);
      if (!board) return;
      stageTimeList(t, board).forEach((s) => {
        if (s.seconds <= 0) return;
        if (!agg.has(s.name)) agg.set(s.name, { total: 0, count: 0 });
        const rec = agg.get(s.name)!;
        rec.total += s.seconds;
        rec.count += 1;
      });
    });
    const arr = Array.from(agg.entries()).map(([name, v]) => ({ name, avg: v.total / v.count }));
    return arr.sort((a, b) => b.avg - a.avg);
  }, [tasks, boards]);

  const maxAvg = Math.max(1, ...bottlenecks.map((b) => b.avg));

  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card icon={PlusCircle} label="Создано за период" value={totals.created} color="#0ea5e9" />
        <Card icon={CheckCircle2} label="Завершено за период" value={totals.done} color="#10b981" />
        <Card icon={CornerUpLeft} label="Возвратов за период" value={totals.returns} color="#ef4444" />
        <Card icon={Activity} label="В работе сейчас" value={totals.activeNow} color="#6366f1" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-border px-4 py-3 font-semibold">По направлениям</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-[11px] uppercase text-muted">
                <th className="px-4 py-2 font-semibold">Доска</th>
                <th className="px-4 py-2 font-semibold">Создано</th>
                <th className="px-4 py-2 font-semibold">Завершено</th>
                <th className="px-4 py-2 font-semibold">В работе</th>
              </tr>
            </thead>
            <tbody>
              {byBoard.map((b) => (
                <tr key={b.name} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                      {b.name}
                    </span>
                  </td>
                  <td className="px-4 py-2">{b.created}</td>
                  <td className="px-4 py-2 text-emerald-600 dark:text-emerald-400">{b.done}</td>
                  <td className="px-4 py-2">{b.active}</td>
                </tr>
              ))}
              {byBoard.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">Нет досок</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card p-4">
          <div className="mb-1 font-semibold">Узкие места — среднее время в этапе</div>
          <p className="mb-3 text-xs text-muted">Где задачи «застревают» дольше всего</p>
          {bottlenecks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Пока нет данных по времени</p>
          ) : (
            <div className="space-y-2.5">
              {bottlenecks.map((b) => (
                <div key={b.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted">{formatDuration(b.avg)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${(b.avg / maxAvg) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: `${color}22`, color }}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}
