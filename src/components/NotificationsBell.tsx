"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlarmClock, CalendarClock, CornerUpLeft, AtSign, UserPlus, Check, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/me";
import { useWorkspace } from "@/lib/workspace";
import { buildNotifications, Notif, NotifType } from "@/lib/notifications";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";

const META: Record<NotifType, { icon: typeof Bell; color: string; label: string }> = {
  overdue: { icon: AlarmClock, color: "text-red-500", label: "Просрочено" },
  due: { icon: CalendarClock, color: "text-amber-500", label: "Скоро срок" },
  return: { icon: CornerUpLeft, color: "text-red-500", label: "Возврат" },
  mention: { icon: AtSign, color: "text-brand", label: "Упоминание" },
};

const READ_KEY = "bulut.notifReadAt";

export function NotificationsBell() {
  const store = useStore();
  const [me] = useMe();
  const { pendingInvites, notifications, unread: wsUnread, acceptInvite, markAllRead } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [readAt, setReadAt] = useState("");
  const [accepting, setAccepting] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReadAt(localStorage.getItem(READ_KEY) ?? "");
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const notifs = useMemo(
    () => buildNotifications({ boards: store.boards, tasks: store.tasks, journal: store.journal, comments: store.comments, members: store.members }, me),
    [store.boards, store.tasks, store.journal, store.comments, store.members, me]
  );

  const derivedUnread = notifs.filter((n) => n.at > readAt).length;
  const unread = derivedUnread + wsUnread;

  const openMenu = () => {
    setOpen((o) => !o);
    if (!open) {
      const now = new Date().toISOString();
      localStorage.setItem(READ_KEY, now);
      setReadAt(now);
      markAllRead();
    }
  };

  const go = (n: Notif) => {
    setOpen(false);
    router.push(`/board/${n.boardId}?task=${n.taskId}`);
  };

  const accept = async (token: string) => {
    setAccepting(token);
    await acceptInvite(token);
    setAccepting(null);
    setOpen(false);
  };

  const dbNotifs = notifications.filter((n) => n.type !== "invite"); // invite-уведомления показываем как приглашения
  const empty = pendingInvites.length === 0 && dbNotifs.length === 0 && notifs.length === 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={openMenu}
        className="relative rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
        title="Уведомления"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-xl animate-scale-in">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="font-semibold">Уведомления</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {/* Приглашения в комнаты */}
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-start gap-2.5 border-b border-border bg-brand/[0.05] px-4 py-2.5">
                <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Приглашение в «{inv.workspaceName ?? "комнату"}»</div>
                  <button
                    onClick={() => accept(inv.token)}
                    disabled={accepting === inv.token}
                    className="mt-1 inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {accepting === inv.token ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Принять
                  </button>
                </div>
              </div>
            ))}

            {/* Прочие уведомления из БД */}
            {dbNotifs.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (n.link) router.push(n.link);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2.5 border-b border-border px-4 py-2.5 text-left transition last:border-0 hover:bg-surface-2/50"
              >
                <Bell className={cn("mt-0.5 h-4 w-4 shrink-0 text-brand", n.read && "opacity-40")} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.title}</div>
                  <p className="truncate text-xs text-muted">{n.body}</p>
                </div>
              </button>
            ))}

            {/* Мои задачи (сроки/возвраты) */}
            {notifs.map((n) => {
              const m = META[n.type];
              return (
                <button
                  key={n.id}
                  onClick={() => go(n)}
                  className="flex w-full items-start gap-2.5 border-b border-border px-4 py-2.5 text-left transition last:border-0 hover:bg-surface-2/50"
                >
                  <m.icon className={cn("mt-0.5 h-4 w-4 shrink-0", m.color)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{n.title}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted">{fmtDate(n.at, "d MMM")}</span>
                    </div>
                    <p className="truncate text-xs text-muted">{n.detail}</p>
                  </div>
                </button>
              );
            })}

            {empty && <p className="px-4 py-8 text-center text-sm text-muted">Нет уведомлений 🎉</p>}
          </div>
        </div>
      )}
    </div>
  );
}
