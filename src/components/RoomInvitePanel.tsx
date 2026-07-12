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
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { ROLE_META, type AppRole } from "@/lib/permissions";
import { findProfileByEmail } from "@/lib/db";
import { cn } from "@/lib/utils";

/** Панель комнаты: название (редактируемое) + приглашение участников + ожидающие. */
export function RoomInvitePanel() {
  const {
    active,
    myRole,
    invitations,
    refreshRoom,
    inviteMember,
    revokeInvite,
    updateWorkspace,
  } = useWorkspace();

  const canManage = myRole === "owner" || myRole === "admin";
  const [name, setName] = useState(active?.name ?? "");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    refreshRoom();
  }, [refreshRoom]);
  useEffect(() => {
    setName(active?.name ?? "");
  }, [active?.name]);

  if (!active) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pending = invitations.filter((i) => i.status === "pending");

  const invite = async () => {
    const em = email.trim();
    if (!em) return;
    setBusy(true);
    setMsg(null);
    setLastLink(null);
    // Приглашать можно только зарегистрированных пользователей Bulut.
    const prof = await findProfileByEmail(em);
    if (!prof) {
      setBusy(false);
      setMsg({
        ok: false,
        text: `«${em}» не является пользователем Bulut. Пусть сначала зарегистрируется, после этого пригласите его по почте.`,
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
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-bold text-white"
          style={{ backgroundColor: active.color }}
        >
          {active.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Комната</p>
          {canManage ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== active.name && updateWorkspace(active.id, { name: name.trim() })}
              className="w-full rounded-lg border border-transparent bg-transparent px-1 text-lg font-bold outline-none transition hover:border-border focus:border-brand focus:bg-surface"
            />
          ) : (
            <h2 className="px-1 text-lg font-bold">{active.name}</h2>
          )}
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
