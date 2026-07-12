"use client";

import { useEffect, useState } from "react";
import {
  Users,
  UserPlus,
  Mail,
  Link2,
  Copy,
  Check,
  Trash2,
  Crown,
  ShieldCheck,
  Loader2,
  LogOut,
  AlertTriangle,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { ROLE_META, type AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export default function RoomPage() {
  const ws = useWorkspace();
  const { user } = useAuth();
  const {
    active,
    myRole,
    members,
    invitations,
    refreshRoom,
    inviteMember,
    revokeInvite,
    updateMember,
    removeMember,
    updateWorkspace,
    deleteWorkspace,
    leaveWorkspace,
  } = ws;

  const canManage = myRole === "owner" || myRole === "admin";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState(active?.name ?? "");

  useEffect(() => {
    refreshRoom();
  }, [refreshRoom]);
  useEffect(() => {
    setName(active?.name ?? "");
  }, [active?.name]);

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pendingInvites = invitations.filter((i) => i.status === "pending");

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await inviteMember(email.trim(), role);
    setBusy(false);
    if ("error" in res) {
      setMsg({ ok: false, text: res.error });
    } else {
      setLastLink(`${origin}/invite/${res.token}`);
      setMsg({ ok: true, text: `Приглашение отправлено на ${email.trim()}` });
      setEmail("");
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
        {/* Заголовок комнаты */}
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: active.color }}
          >
            {active.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            {canManage ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name !== active.name && updateWorkspace(active.id, { name: name.trim() })}
                className="w-full rounded-lg border border-transparent bg-transparent px-1 text-xl font-bold outline-none transition hover:border-border focus:border-brand focus:bg-surface"
              />
            ) : (
              <h1 className="text-xl font-bold">{active.name}</h1>
            )}
            <p className="px-1 text-sm text-muted">{members.length} участников · вы — {ROLE_META[myRole].label.toLowerCase()}</p>
          </div>
        </div>

        {/* Приглашение */}
        {canManage && (
          <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UserPlus className="h-4 w-4 text-brand" /> Пригласить в комнату
            </h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && invite()}
                  placeholder="email@example.com"
                  className="input pl-9"
                />
              </div>
              <select className="input sm:w-40" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
                <option value="member">Участник</option>
                <option value="admin">Администратор</option>
              </select>
              <button className="btn-primary" onClick={invite} disabled={busy || !email.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Пригласить
              </button>
            </div>
            {msg && (
              <p className={cn("mt-2 text-xs font-medium", msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                {msg.text}
              </p>
            )}
            {lastLink && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 p-2">
                <Link2 className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{lastLink}</span>
                <button
                  onClick={() => copyLink(lastLink)}
                  className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs font-medium transition hover:bg-surface-2"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Скопировано" : "Копировать ссылку"}
                </button>
              </div>
            )}

            {pendingInvites.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Ожидают ответа</p>
                <div className="space-y-1">
                  {pendingInvites.map((i) => (
                    <div key={i.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2/50">
                      <Mail className="h-3.5 w-3.5 text-faint" />
                      <span className="flex-1 truncate">{i.email}</span>
                      <span className="text-xs text-muted">{ROLE_META[i.role].label}</span>
                      <button onClick={() => copyLink(`${origin}/invite/${i.token}`)} className="rounded p-1 text-muted hover:text-fg" title="Скопировать ссылку">
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => revokeInvite(i.id)} className="rounded p-1 text-muted hover:text-red-500" title="Отозвать">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Участники */}
        <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-brand" /> Участники
          </h2>
          <div className="mt-3 space-y-1">
            {members.map((m) => {
              const isSelf = m.userId === user?.id;
              const canEditThis = canManage && m.role !== "owner" && !isSelf;
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2/50">
                  <Avatar name={m.name} size={36} src={m.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{m.name}</span>
                      {isSelf && <span className="text-[10px] text-faint">(вы)</span>}
                    </div>
                    <div className="truncate text-xs text-muted">{m.email}</div>
                  </div>
                  {canEditThis ? (
                    <select
                      value={m.role}
                      onChange={(e) => updateMember(m.id, { role: e.target.value as AppRole })}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                    >
                      <option value="member">Участник</option>
                      <option value="admin">Администратор</option>
                    </select>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: `${ROLE_META[m.role].color}22`, color: ROLE_META[m.role].color }}
                    >
                      {m.role === "owner" && <Crown className="h-3 w-3" />}
                      {m.role === "admin" && <ShieldCheck className="h-3 w-3" />}
                      {ROLE_META[m.role].label}
                    </span>
                  )}
                  {canEditThis && (
                    <button
                      onClick={() => confirm(`Убрать ${m.name} из комнаты?`) && removeMember(m.id)}
                      className="rounded p-1 text-muted hover:text-red-500"
                      title="Убрать из комнаты"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Опасная зона */}
        <section className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" /> Комната
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {myRole !== "owner" && (
              <button
                className="btn-outline"
                onClick={async () => {
                  if (confirm(`Покинуть комнату «${active.name}»?`)) {
                    const e = await leaveWorkspace(active.id);
                    if (e) alert(e);
                  }
                }}
              >
                <LogOut className="h-4 w-4" /> Покинуть комнату
              </button>
            )}
            {myRole === "owner" && (
              <button
                className="btn bg-red-500 text-white hover:bg-red-600"
                onClick={async () => {
                  if (confirm(`Удалить комнату «${active.name}» со всеми досками, задачами и картами? Это необратимо.`)) {
                    const e = await deleteWorkspace(active.id);
                    if (e) alert(e);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> Удалить комнату
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
