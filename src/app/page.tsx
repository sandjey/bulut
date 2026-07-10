"use client";

import { useMemo, useState } from "react";
import { Plus, LayoutDashboard, CheckCircle2, Clock, AlertTriangle, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/access";
import { BoardCard } from "@/components/BoardCard";
import { CreateBoardDialog } from "@/components/CreateBoardDialog";
import { RequirePerm } from "@/components/RequirePerm";
import { StatWidget } from "@/components/StatWidget";
import { todayISO, fmtDate } from "@/lib/date";
import { isTaskOverdue } from "@/lib/deadlines";

export default function HomePage() {
  return (
    <RequirePerm perm="board.view" title="Нет доступа к доскам">
      <HomePageInner />
    </RequirePerm>
  );
}

function HomePageInner() {
  const { boards, tasks } = useStore();
  const { user } = useAuth();
  const canManage = useCan()("board.manage");
  const [createOpen, setCreateOpen] = useState(false);

  const stats = useMemo(() => {
    const today = todayISO();
    const done = tasks.filter((t) => t.status === "done").length;
    const active = tasks.filter((t) => t.status !== "done").length;
    const overdue = tasks.filter((t) => isTaskOverdue(t, today)).length;
    return { done, active, overdue, total: tasks.length };
  }, [tasks]);

  const name = (user?.email ?? "").split("@")[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* HERO */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-7 shadow-float sm:p-9 animate-fade-up">
          <div className="aurora" />
          <div className="aurora-3" />
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium capitalize text-muted backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                {fmtDate(todayISO(), "EEEE, d MMMM")}
              </div>
              <h1 className="mt-3.5 text-3xl font-extrabold tracking-tight sm:text-[2.6rem] sm:leading-[1.05]">
                С возвращением{name ? ", " : ""}
                <span className="brand-text-anim">{name || "в Bulut"}</span> 👋
              </h1>
              <p className="mt-2.5 max-w-md text-[15px] text-muted">
                {stats.active > 0
                  ? `В работе ${stats.active} задач. Держим темп!`
                  : "Все задачи закрыты — отличная работа!"}
              </p>
            </div>
            {canManage && (
              <button className="btn-primary shrink-0 px-5 py-2.5 text-base" onClick={() => setCreateOpen(true)}>
                <Plus className="h-5 w-5" /> Новая доска
              </button>
            )}
          </div>
        </div>

        {/* STATS */}
        <div className="stagger mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatWidget icon={LayoutDashboard} label="Всего задач" value={stats.total} color="#6366f1" />
          <StatWidget icon={CheckCircle2} label="Выполнено" value={stats.done} color="#10b981" />
          <StatWidget icon={Clock} label="В работе" value={stats.active} color="#8b5cf6" />
          <StatWidget icon={AlertTriangle} label="Просрочено" value={stats.overdue} color="#f43f5e" />
        </div>

        {/* BOARDS */}
        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Доски</h2>
          <span className="text-sm text-muted">{boards.length}</span>
        </div>

        {boards.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center animate-fade-up">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-muted">
              <LayoutDashboard className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Пока нет досок</h3>
            <p className="mt-1 max-w-sm text-sm text-muted">
              {canManage ? "Создайте первую доску, чтобы начать." : "Доски ещё не созданы."}
            </p>
            {canManage && (
              <button className="btn-primary mt-5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Создать доску
              </button>
            )}
          </div>
        ) : (
          <div className="stagger mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((b) => (
              <BoardCard key={b.id} board={b} tasks={tasks} />
            ))}
            {canManage && (
              <button
                onClick={() => setCreateOpen(true)}
                className="hover-lift flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted hover:border-brand hover:text-brand"
              >
                <Plus className="h-7 w-7" />
                <span className="text-sm font-medium">Новая доска</span>
              </button>
            )}
          </div>
        )}
      </div>

      <CreateBoardDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
