"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlarmClock, CalendarClock, CornerUpLeft, AtSign } from "lucide-react";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/me";
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [readAt, setReadAt] = useState("");
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

  const unread = notifs.filter((n) => n.at > readAt).length;

  const openMenu = () => {
    setOpen((o) => !o);
    if (!open) {
      const now = new Date().toISOString();
      localStorage.setItem(READ_KEY, now);
      setReadAt(now);
    }
  };

  const go = (n: Notif) => {
    setOpen(false);
    router.push(`/board/${n.boardId}?task=${n.taskId}`);
  };

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
            {!me && <span className="text-xs text-muted">выберите «Я — это…»</span>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!me ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                Укажите, кто вы (кнопка слева от колокольчика), чтобы видеть свои задачи.
              </p>
            ) : notifs.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Нет уведомлений 🎉</p>
            ) : (
              notifs.map((n) => {
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
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
