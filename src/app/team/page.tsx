"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Users, Mail, CheckCircle2, Clock, Crown, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { useCan, useAccess } from "@/lib/access";
import { useTeam } from "@/lib/team";
import { ROLE_META } from "@/lib/permissions";
import { PageHeader } from "@/components/PageHeader";
import { RequirePerm } from "@/components/RequirePerm";
import { Avatar } from "@/components/Avatar";
import { MEMBER_ROLES } from "@/lib/types";

export default function TeamPage() {
  return (
    <RequirePerm perm="team.view" title="Нет доступа к команде">
      <TeamPageInner />
    </RequirePerm>
  );
}

function TeamPageInner() {
  const { members, tasks, addMember, updateMember, deleteMember } = useStore();
  const canManage = useCan()("team.manage");
  const access = useAccess();
  const team = useTeam();

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accountCount = team.filter((t) => t.isAccount).length;

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

  const submit = () => {
    const clean = name.trim();
    if (!clean) {
      setError("Введите имя участника");
      return;
    }
    if (members.some((m) => m.name.toLowerCase() === clean.toLowerCase())) {
      setError("Участник с таким именем уже есть");
      return;
    }
    addMember(clean, { role, email });
    setName("");
    setRole("");
    setEmail("");
    setError(null);
  };

  const removeMember = (id: string, mName: string) => {
    const c = counts.get(mName);
    const total = (c?.active ?? 0) + (c?.done ?? 0);
    const msg =
      total > 0
        ? `У «${mName}» назначено задач: ${total}. Удалить участника? (Задачи останутся, но исполнитель станет «вне команды».)`
        : `Удалить участника «${mName}»?`;
    if (confirm(msg)) deleteMember(id);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader
          title="Команда"
          subtitle="Зарегистрированные пользователи и участники, из которых выбираются исполнители задач"
        >
          <span className="rounded-full bg-surface-2 px-3 py-1.5 text-sm text-muted">
            {team.length} участников · {accountCount} с аккаунтом
          </span>
        </PageHeader>

        {/* add bar */}
        {canManage && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Plus className="h-3.5 w-3.5" /> Добавить участника без аккаунта
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_1fr_auto]">
            <input
              className="input"
              placeholder="Имя*"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <input
              className="input"
              list="role-list"
              placeholder="Роль / направление"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <datalist id="role-list">
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <input
              className="input"
              type="email"
              placeholder="Email (необязательно)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <button className="btn-primary px-4" onClick={submit}>
              <Plus className="h-4 w-4" /> Добавить
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </div>
        )}

        {/* list */}
        {team.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-border py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">
              <Users className="h-6 w-6" />
            </div>
            <p className="mt-3 font-medium">В команде пока никого нет</p>
            <p className="mt-1 text-sm text-muted">
              Зарегистрированные пользователи появляются здесь автоматически.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((m) => {
              const c = counts.get(m.name);
              const profile = m.isAccount ? access.profiles.find((p) => p.id === m.key) : null;
              const canEditAccount = profile ? access.canEditProfile(profile) : false;
              const editableName = m.isAccount ? canEditAccount : canManage;
              const roleMeta = m.accountRole ? ROLE_META[m.accountRole] : null;
              return (
                <div key={m.key} className="card group p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={m.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <input
                        defaultValue={m.name}
                        key={`n-${m.key}-${m.name}`}
                        readOnly={!editableName}
                        onBlur={(e) => {
                          if (!editableName) return;
                          const v = e.target.value.trim();
                          if (v && v !== m.name) {
                            if (m.isAccount) access.updateProfile(m.key, { name: v });
                            else updateMember(m.key, { name: v });
                          } else e.target.value = m.name;
                        }}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold outline-none transition hover:border-border focus:border-brand focus:bg-surface read-only:hover:border-transparent"
                      />
                      <input
                        defaultValue={m.role}
                        key={`r-${m.key}-${m.role}`}
                        list="role-list"
                        placeholder="Роль…"
                        readOnly={!editableName}
                        onBlur={(e) => {
                          if (!editableName) return;
                          const v = e.target.value;
                          if (v !== m.role) {
                            if (m.isAccount) access.updateProfile(m.key, { jobRole: v });
                            else updateMember(m.key, { role: v });
                          }
                        }}
                        className="mt-0.5 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-muted outline-none transition hover:border-border focus:border-brand focus:bg-surface read-only:hover:border-transparent"
                      />
                    </div>
                    {!m.isAccount && canManage && (
                      <button
                        onClick={() => removeMember(m.memberId!, m.name)}
                        className="rounded p-1.5 text-muted opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                        title="Удалить участника"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* бейдж аккаунта / роли */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {m.isAccount ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: `${roleMeta?.color ?? "#6366f1"}22`,
                          color: roleMeta?.color ?? "#6366f1",
                        }}
                      >
                        {m.accountRole === "owner" && <Crown className="h-3 w-3" />}
                        {m.accountRole === "admin" && <ShieldCheck className="h-3 w-3" />}
                        {roleMeta?.label ?? "Аккаунт"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                        Без аккаунта
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center gap-1.5 text-sm text-muted">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {m.isAccount ? (
                      <span className="truncate">{m.email || "—"}</span>
                    ) : (
                      <input
                        defaultValue={m.email}
                        type="email"
                        placeholder="email@example.com"
                        readOnly={!canManage}
                        onBlur={(e) => {
                          if (!canManage) return;
                          if (e.target.value !== m.email) updateMember(m.key, { email: e.target.value });
                        }}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none transition hover:border-border focus:border-brand focus:bg-surface read-only:hover:border-transparent"
                      />
                    )}
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
