"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  UserPlus,
  Mail,
  Link2,
  Copy,
  Check,
  Trash2,
  Loader2,
  Settings,
  KeyRound,
  User as UserIcon,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { getSupabase } from "@/lib/supabase";
import { MEMBER_ROLES } from "@/lib/types";
import { EditableName } from "@/components/EditableName";
import { ROLE_META, type AppRole } from "@/lib/permissions";
import { findProfileByEmail } from "@/lib/db";
import { cn, contrastText } from "@/lib/utils";

/** Панель комнаты: название (редактируемое) + приглашение участников + ожидающие. */
export function RoomInvitePanel() {
  const {
    active,
    myRole,
    members,
    invitations,
    refreshRoom,
    inviteMember,
    revokeInvite,
    updateWorkspace,
  } = useWorkspace();

  const canManage = myRole === "owner" || myRole === "admin";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Создание аккаунта вручную (когда человек ещё не зарегистрирован)
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newJob, setNewJob] = useState(MEMBER_ROLES[0]);
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    refreshRoom();
  }, [refreshRoom]);

  if (!active) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pending = invitations.filter((i) => i.status === "pending");

  const invite = async () => {
    const em = email.trim();
    if (!em) return;
    // Уже в комнате — повторно приглашать нельзя.
    if (members.some((m) => m.email.toLowerCase() === em.toLowerCase())) {
      setLastLink(null);
      setMsg({ ok: false, text: `«${em}» уже участник этой комнаты.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    setLastLink(null);
    setCreateFor(null);
    setCredentials(null);
    // Приглашать можно только зарегистрированных пользователей Bulut.
    const prof = await findProfileByEmail(em);
    if (!prof) {
      setBusy(false);
      setCreateFor(em);
      setNewName("");
      setMsg({
        ok: false,
        text: `«${em}» ещё не зарегистрирован в Bulut. Создайте ему аккаунт — приглашение отправится сразу после этого.`,
      });
      return;
    }
    const res = await inviteMember(em, role);
    setBusy(false);
    if ("error" in res) setMsg({ ok: false, text: res.error });
    else {
      setLastLink(`${origin}/invite/${res.token}`);
      setMsg({ ok: true, text: `Приглашение отправлено пользователю ${prof.name || em}` });
      setEmail("");
    }
  };

  /** Создать аккаунт человеку и сразу пригласить его в комнату. */
  const createAccount = async () => {
    const em = (createFor ?? "").trim();
    if (!em || !newName.trim()) return;
    setCreating(true);
    setMsg(null);
    const sb = getSupabase();
    const sess = sb ? (await sb.auth.getSession()).data.session : null;
    if (!sess) {
      setCreating(false);
      setMsg({ ok: false, text: "Нет активной сессии — войдите заново." });
      return;
    }
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.access_token}` },
        body: JSON.stringify({ email: em, name: newName.trim(), jobRole: newJob }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setCreating(false);
        setMsg({ ok: false, text: data?.error ?? `Не удалось создать аккаунт (${res.status})` });
        return;
      }
      // Аккаунт есть — приглашаем в комнату.
      const inv = await inviteMember(em, role);
      setCreating(false);
      setCreateFor(null);
      setCredentials({ email: data.email, password: data.password });
      if ("error" in inv) {
        setMsg({ ok: false, text: `Аккаунт создан, но приглашение не отправилось: ${inv.error}` });
      } else {
        setLastLink(`${origin}/invite/${inv.token}`);
        setMsg({ ok: true, text: `Аккаунт для ${newName.trim()} создан и приглашён в комнату` });
        setEmail("");
      }
    } catch {
      setCreating(false);
      setMsg({ ok: false, text: "Ошибка сети. Попробуйте ещё раз." });
    }
  };

  const copy = (link: string) => {
    navigator.clipboard?.writeText(link);
    setCopied(link);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      {/* Заголовок комнаты */}
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-bold"
          style={{ backgroundColor: active.color, color: contrastText(active.color) }}
        >
          {active.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Комната</p>
          <EditableName
            value={active.name}
            canEdit={canManage}
            onSave={(v) => updateWorkspace(active.id, { name: v })}
            className="text-lg font-bold"
          />
        </div>
        <Link
          href="/admin/room"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface-2 hover:text-fg"
          title="Настройки комнаты"
        >
          <Settings className="h-3.5 w-3.5" /> Настройки
        </Link>
      </div>

      {!canManage ? (
        <p className="mt-3 text-xs text-muted">
          Приглашать участников может владелец или администратор комнаты.
        </p>
      ) : (
        <>
          {/* Приглашение */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && invite()}
                placeholder="email@example.com — пригласить в комнату"
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
          {createFor && (
            <div className="mt-3 rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-xs font-semibold text-fg">
                Создать аккаунт для <span className="text-brand">{createFor}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Пароль сгенерируется автоматически — передайте его человеку, он сменит пароль в профиле.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createAccount()}
                    placeholder="Имя и фамилия"
                    className="input pl-9"
                  />
                </div>
                <select className="input sm:w-40" value={newJob} onChange={(e) => setNewJob(e.target.value)}>
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button className="btn-primary" onClick={createAccount} disabled={creating || !newName.trim()}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Создать и пригласить
                </button>
                <button className="btn-outline" onClick={() => setCreateFor(null)} disabled={creating}>
                  Отмена
                </button>
              </div>
            </div>
          )}

          {credentials && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Данные для входа — передайте их человеку
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="rounded-md bg-surface px-2 py-1">{credentials.email}</span>
                <span className="rounded-md bg-surface px-2 py-1">{credentials.password}</span>
                <button
                  onClick={() => copy(`${credentials.email} / ${credentials.password}`)}
                  className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 font-sans font-medium transition hover:bg-surface-2"
                >
                  {copied === `${credentials.email} / ${credentials.password}` ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Копировать
                </button>
                <button onClick={() => setCredentials(null)} className="rounded-md px-2 py-1 text-muted hover:text-fg">
                  Скрыть
                </button>
              </div>
            </div>
          )}

          {lastLink && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 p-2">
              <Link2 className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{lastLink}</span>
              <button
                onClick={() => copy(lastLink)}
                className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs font-medium transition hover:bg-surface-2"
              >
                {copied === lastLink ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === lastLink ? "Скопировано" : "Копировать ссылку"}
              </button>
            </div>
          )}

          {pending.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Ожидают ответа</p>
              <div className="space-y-1">
                {pending.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2/50">
                    <Mail className="h-3.5 w-3.5 text-faint" />
                    <span className="flex-1 truncate">{i.email}</span>
                    <span className="text-xs text-muted">{ROLE_META[i.role].label}</span>
                    <button onClick={() => copy(`${origin}/invite/${i.token}`)} className="rounded p-1 text-muted hover:text-fg" title="Скопировать ссылку">
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
        </>
      )}
    </div>
  );
}
