"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Trash2, Loader2, LogOut, AlertTriangle } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { RoleBadge } from "@/components/RoleBadge";
import { ROLE_META, type AppRole } from "@/lib/permissions";
import { BOARD_COLORS } from "@/lib/types";
import { contrastText } from "@/lib/utils";

/** Управление комнатой: название, цвет, участники и роли, опасная зона. */
export function RoomSettings() {
  const ws = useWorkspace();
  const { user } = useAuth();
  const router = useRouter();
  const {
    active,
    myRole,
    members,
    refreshRoom,
    updateMember,
    removeMember,
    updateWorkspace,
    deleteWorkspace,
    leaveWorkspace,
  } = ws;

  const canManage = myRole === "owner" || myRole === "admin";
  const [name, setName] = useState(active?.name ?? "");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

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

  const del = async () => {
    setBusy(true);
    const e = await deleteWorkspace(active.id);
    setBusy(false);
    if (e) alert(e);
    else router.replace("/");
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Заголовок + цвет */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold"
            style={{ backgroundColor: active.color, color: contrastText(active.color) }}
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
            <p className="px-1 text-sm text-muted">
              {members.length} участников · вы — {ROLE_META[myRole].label.toLowerCase()}
            </p>
          </div>
        </div>
        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-xs text-muted">Цвет:</span>
            {BOARD_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => updateWorkspace(active.id, { color: c })}
                className="h-5 w-5 rounded-full transition hover:scale-110"
                style={{ backgroundColor: c, outline: active.color === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
              />
            ))}
          </div>
        )}
      </section>

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
                  <RoleBadge role={m.role} />
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
      <section className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" /> Опасная зона
        </h2>

        {myRole !== "owner" ? (
          <div className="mt-3">
            <p className="text-xs text-muted">Вы можете покинуть комнату. Данные комнаты останутся у остальных.</p>
            <button
              className="btn-outline mt-2"
              onClick={async () => {
                if (confirm(`Покинуть комнату «${active.name}»?`)) {
                  const e = await leaveWorkspace(active.id);
                  if (e) alert(e);
                }
              }}
            >
              <LogOut className="h-4 w-4" /> Покинуть комнату
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-xs text-muted">
              Удаление комнаты <b>безвозвратно</b> уносит все её доски, задачи, карты и журнал.
              Чтобы подтвердить, введите <b className="text-red-600 dark:text-red-400">delete room</b>.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="delete room"
                className="input flex-1"
              />
              <button
                className="btn bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                disabled={busy || confirmText.trim().toLowerCase() !== "delete room"}
                onClick={del}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Удалить комнату
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
