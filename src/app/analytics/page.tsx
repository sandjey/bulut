"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { CheckCircle2, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { useTheme } from "@/components/ThemeProvider";
import { RequirePerm } from "@/components/RequirePerm";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { todayISO, format } from "@/lib/date";
import { isTaskOverdue } from "@/lib/deadlines";
import { subDays } from "date-fns";
import { ru } from "date-fns/locale";

export default function AnalyticsPage() {
  return (
    <RequirePerm perm="analytics.view" title="Нет доступа к аналитике">
      <AnalyticsPageInner />
    </RequirePerm>
  );
}

function AnalyticsPageInner() {
  const { boards, tasks, journal } = useStore();
  const { theme } = useTheme();
  const axisColor = theme === "dark" ? "#94a3b8" : "#64748b";
  const gridColor = theme === "dark" ? "#1f2937" : "#e2e8f0";

  const today = todayISO();

  const boardStats = useMemo(
    () =>
      boards.map((b) => {
        const bt = tasks.filter((t) => t.boardId === b.id);
        const done = bt.filter((t) => t.status === "done").length;
        const overdue = bt.filter((t) => isTaskOverdue(t, today)).length;
        const active = bt.filter((t) => t.status !== "done").length;
        return {
          id: b.id,
          name: b.name,
          color: b.color,
          done,
          overdue,
          active: active - overdue,
          total: bt.length,
          pct: bt.length ? Math.round((done / bt.length) * 100) : 0,
        };
      }),
    [boards, tasks, today]
  );

  // weekly completion (last 7 days) from journal
  const weekData = useMemo(() => {
    const days: { label: string; key: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, "yyyy-MM-dd");
      days.push({ key, label: format(d, "EEEEEE", { locale: ru }), count: 0 });
    }
    journal.forEach((e) => {
      const day = days.find((d) => d.key === e.date);
      if (day) day.count++;
    });
    return days;
  }, [journal]);

  // assignee workload
  const workload = useMemo(() => {
    const map = new Map<string, { active: number; done: number }>();
    tasks.forEach((t) => {
      if (!t.assignee) return;
      if (!map.has(t.assignee)) map.set(t.assignee, { active: 0, done: 0 });
      const rec = map.get(t.assignee)!;
      if (t.status === "done") rec.done++;
      else rec.active++;
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, total: v.active + v.done }))
      .sort((a, b) => b.total - a.total);
  }, [tasks]);

  const totals = useMemo(() => {
    const done = tasks.filter((t) => t.status === "done").length;
    const active = tasks.filter((t) => t.status !== "done").length;
    const overdue = tasks.filter((t) => isTaskOverdue(t, today)).length;
    return { done, active, overdue, total: tasks.length };
  }, [tasks, today]);

  const pieData = [
    { name: "Выполнено", value: totals.done, color: "#10b981" },
    { name: "В работе", value: totals.active - totals.overdue, color: "#0ea5e9" },
    { name: "Просрочено", value: totals.overdue, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const maxWeek = Math.max(1, ...weekData.map((d) => d.count));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader title="Аналитика" subtitle="Статистика по доскам, исполнителям и срокам" />

        {/* top stats */}
        <div className="stagger mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={TrendingUp} label="Всего задач" value={totals.total} color="#6366f1" />
          <Stat icon={CheckCircle2} label="Выполнено" value={totals.done} color="#10b981" />
          <Stat icon={Clock} label="В работе" value={totals.active} color="#0ea5e9" />
          <Stat icon={AlertTriangle} label="Просрочено" value={totals.overdue} color="#ef4444" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* weekly chart */}
          <div className="card p-5 lg:col-span-2">
            <h3 className="mb-4 font-semibold">Выполнено за неделю</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: gridColor, opacity: 0.3 }}
                    contentStyle={{
                      background: theme === "dark" ? "#14181f" : "#fff",
                      border: `1px solid ${gridColor}`,
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="count" name="Выполнено" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {weekData.map((d, i) => (
                      <Cell key={i} fill={d.count === maxWeek && maxWeek > 0 ? "#6366f1" : "#818cf8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* status pie */}
          <div className="card p-5">
            <h3 className="mb-4 font-semibold">Распределение задач</h3>
            <div className="h-64">
              {pieData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted">
                  Нет данных
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: theme === "dark" ? "#14181f" : "#fff",
                        border: `1px solid ${gridColor}`,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* workload */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-4 font-semibold">Нагрузка по исполнителям</h3>
            {workload.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Нет исполнителей</p>
            ) : (
              <div className="space-y-3">
                {workload.map((w) => {
                  const max = Math.max(...workload.map((x) => x.total));
                  return (
                    <div key={w.name} className="flex items-center gap-3">
                      <Avatar name={w.name} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="truncate font-medium">{w.name}</span>
                          <span className="text-xs text-muted">
                            {w.active} активных · {w.done} готово
                          </span>
                        </div>
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full bg-sky-500"
                            style={{ width: `${(w.active / max) * 100}%` }}
                          />
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${(w.done / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* per board progress */}
          <div className="card p-5">
            <h3 className="mb-4 font-semibold">Прогресс по доскам</h3>
            {boardStats.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Нет досок</p>
            ) : (
              <div className="space-y-3">
                {boardStats.map((b) => (
                  <div key={b.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </span>
                      <span className="text-xs text-muted">{b.pct}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${b.pct}%`, backgroundColor: b.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* free table by direction */}
        <div className="card mt-4 overflow-hidden">
          <div className="border-b border-border px-5 py-3.5">
            <h3 className="font-semibold">Сводная таблица по направлениям</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-muted">
                  <th className="px-5 py-2.5 font-semibold">Направление</th>
                  <th className="px-5 py-2.5 font-semibold">Всего</th>
                  <th className="px-5 py-2.5 font-semibold">Выполнено</th>
                  <th className="px-5 py-2.5 font-semibold">В процессе</th>
                  <th className="px-5 py-2.5 font-semibold">Просрочено</th>
                  <th className="px-5 py-2.5 font-semibold">Прогресс</th>
                </tr>
              </thead>
              <tbody>
                {boardStats.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </span>
                    </td>
                    <td className="px-5 py-3">{b.total}</td>
                    <td className="px-5 py-3 text-emerald-600 dark:text-emerald-400">{b.done}</td>
                    <td className="px-5 py-3 text-sky-600 dark:text-sky-400">{b.active}</td>
                    <td className="px-5 py-3 text-red-600 dark:text-red-400">{b.overdue}</td>
                    <td className="px-5 py-3">{b.pct}%</td>
                  </tr>
                ))}
                {boardStats.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted">
                      Нет данных
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof TrendingUp;
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
