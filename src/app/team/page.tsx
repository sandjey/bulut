"use client";

import { useMemo } from "react";
import { Users, Mail, CheckCircle2, Clock } from "lucide-react";
import { useStore } from "@/lib/store";
import { useTeam } from "@/lib/team";
import { RoleBadge } from "@/components/RoleBadge";
import { PageHeader } from "@/components/PageHeader";
import { RequirePerm } from "@/components/RequirePerm";
import { Avatar } from "@/components/Avatar";
import { RoomInvitePanel } from "@/components/RoomInvitePanel";
import { cn } from "@/lib/utils";

export default function TeamPage() {
  return (
    <RequirePerm perm="team.view" title="Нет доступа к команде">
      <TeamPageInner />
    </RequirePerm>
  );
}

function TeamPageInner() {
  const { tasks } = useStore();
  const team = useTeam();

  const counts = useMemo(() => {
    const map = new Map<string, { active: number; done: number }>();
    tasks.forEach((t) => {
      if (!t.assignee) return;
      if (!map.has(t.assignee)) map.set(t.assignee, { active: 0, done: 0 });
      const rec = map.get(t.assignee)!;
      if (t.status === "done") rec.done++;
      else rec.active++;
    });
    return map;
  }, [tasks]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader
          title="Команда"
          subtitle="Зарегистрированные пользователи проекта — из них выбираются исполнители задач"
        >
          <span className="rounded-full bg-surface-2 px-3 py-1.5 text-sm text-muted">
            {team.length} участников
          </span>
        </PageHeader>

        {/* Комната: название + приглашение участников */}
        <div className="mt-4">
          <RoomInvitePanel />
        </div>

        {team.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-border py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">
              <Users className="h-6 w-6" />
            </div>
            <p className="mt-3 font-medium">В команде пока никого нет</p>
            <p className="mt-1 text-sm text-muted">
              Люди появляются здесь автоматически после регистрации. Права выдаются в разделе
              «Администрирование».
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((m) => {
              const c = counts.get(m.name);
              return (
                <div key={m.key} className={cn("card group p-4", m.deleted && "opacity-60")}>
                  <div className="flex items-start gap-3">
                    <Avatar name={m.name} size={44} src={m.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{m.name}</div>
                      <div className="truncate text-sm text-muted">{m.role || "—"}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <RoleBadge role={m.accountRole} />
                    {m.deleted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-faint">
                        удалённый аккаунт
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center gap-1.5 text-sm text-muted">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{m.email || "—"}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-3 border-t border-border pt-3 text-xs">
                    <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                      <Clock className="h-3.5 w-3.5" /> {c?.active ?? 0} активных
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {c?.done ?? 0} готово
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
