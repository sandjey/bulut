"use client";

import { useCallback } from "react";
import { useWorkspace } from "./workspace";
import { useTeam } from "./team";
import * as db from "./db";

export interface NotifyOpts {
  type: string;
  title: string;
  body: string;
  link?: string;
  email?: boolean;
}

/**
 * Уведомить участника по ИМЕНИ (как в исполнителе/авторе). В приложении — всегда,
 * письмо — если opts.email. Ошибки не мешают основному действию.
 */
export function useNotifier() {
  const { activeId } = useWorkspace();
  const team = useTeam();

  return useCallback(
    (targetName: string, opts: NotifyOpts) => {
      const name = targetName?.trim();
      if (!name || !activeId) return;
      const m = team.find((t) => t.name === name || t.email === name);
      if (!m) return;

      db.notifyMember(m.key, activeId, opts.type, opts.title, opts.body, opts.link ?? null).catch(() => {});

      if (opts.email && m.email) {
        fetch("/api/notify/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: m.email, title: opts.title, body: opts.body, link: opts.link }),
        }).catch(() => {});
      }
    },
    [activeId, team],
  );
}

/** Найти всех участников, упомянутых в тексте через @Имя. */
export function useMentionExtractor() {
  const team = useTeam();
  return useCallback(
    (text: string): string[] =>
      team.filter((m) => m.name && new RegExp(`@${escapeRe(m.name)}(?!\\w)`, "i").test(text)).map((m) => m.name),
    [team],
  );
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
