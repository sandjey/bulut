"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  BookOpenText,
  BarChart3,
  Plus,
  Search,
  Users,
  CheckSquare,
  FileBarChart,
  ShieldCheck,
  Crown,
  Waypoints,
  Trash2,
} from "lucide-react";
import { LogOut } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAccess } from "@/lib/access";
import { ROLE_META } from "@/lib/permissions";
import { cn, avatarColor, initials, contrastText, withAlpha } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { CreateBoardDialog } from "./CreateBoardDialog";

interface SidebarProps {
  onNavigate?: () => void;
  onOpenSearch: () => void;
}

export function Sidebar({ onNavigate, onOpenSearch }: SidebarProps) {
  const { boards } = useStore();
  const { user, signOut } = useAuth();
  const { can, role, isAdmin } = useAccess();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);

  const email = user?.email ?? "";
  const avatarBg = avatarColor(email || "user");
  const roleMeta = ROLE_META[role];
  const canSeeBoards = can("board.view");
  const canManageBoards = can("board.manage");

  const navItem = (
    href: string,
    label: string,
    Icon: typeof LayoutDashboard,
    color: string
  ) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
          active ? "bg-surface font-semibold text-fg shadow-soft" : "text-muted hover:bg-surface-2 hover:text-fg"
        )}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all"
          style={{
            backgroundColor: active ? withAlpha(color, 0.16) : "transparent",
            color: active ? color : undefined,
          }}
        >
          <Icon
            className={cn("h-[17px] w-[17px] transition-transform", !active && "group-hover:scale-110")}
            style={!active ? { color } : undefined}
          />
        </span>
        {label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col glass">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Logo size={40} />
        <div>
          <div className="text-[17px] font-bold leading-tight brand-text font-display">Bulut</div>
          <div className="text-[11px] text-muted leading-tight">Облачные задачи</div>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={onOpenSearch}
          className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5 text-muted transition hover:border-border-strong hover:bg-surface-2"
        >
          <Search className="h-4 w-4 transition-colors group-hover:text-fg" />
          <span className="text-sm">Поиск...</span>
          <kbd className="ml-auto hidden rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-faint sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="mt-4 space-y-1 px-3">
        {canSeeBoards && navItem("/", "Доски", LayoutDashboard, "#6366f1")}
        {canSeeBoards && navItem("/my", "Мои задачи", CheckSquare, "#8b5cf6")}
        {can("journal.view") && navItem("/journal", "Журнал", BookOpenText, "#0ea5e9")}
        {can("reports.view") && navItem("/reports", "Отчёты", FileBarChart, "#10b981")}
        {can("team.view") && navItem("/team", "Команда", Users, "#f43f5e")}
        {can("analytics.view") && navItem("/analytics", "Аналитика", BarChart3, "#f59e0b")}
        {can("map.view") && navItem("/maps", "Bulut MAP", Waypoints, "#14b8a6")}
        {isAdmin && navItem("/trash", "Корзина и бэкапы", Trash2, "#64748b")}
        {isAdmin && navItem("/admin", "Администрирование", ShieldCheck, "#f59e0b")}
      </nav>

      {/* Boards list */}
      {canSeeBoards && (
      <div className="mt-6 flex items-center justify-between px-5 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
          Доски
        </span>
        {canManageBoards && (
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-brand"
            title="Создать доску"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      )}

      <div className="board-scroll flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {!canSeeBoards && (
          <p className="px-2 py-3 text-xs text-faint">Нет доступа к доскам</p>
        )}
        {canSeeBoards && boards.length === 0 && (
          <p className="px-2 py-3 text-xs text-faint">Пока нет досок</p>
        )}
        {canSeeBoards &&
          boards.map((b) => {
            const active = pathname === `/board/${b.id}`;
            return (
              <Link
                key={b.id}
                href={`/board/${b.id}`}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all",
                  active ? "bg-surface-2 font-semibold text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-transparent transition-all group-hover:ring-[color:var(--dot)]/25"
                  style={{ backgroundColor: b.color, ["--dot" as string]: b.color }}
                />
                <span className="truncate">{b.name}</span>
              </Link>
            );
          })}
      </div>

      {/* Footer */}
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-surface-2">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold"
            style={{ backgroundColor: avatarBg, color: contrastText(avatarBg) }}
          >
            {initials(email || "U")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-muted" title={email}>
              {email || "Пользователь"}
            </span>
            <span
              className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: roleMeta.color }}
            >
              {role === "owner" && <Crown className="h-2.5 w-2.5" />}
              {role === "admin" && <ShieldCheck className="h-2.5 w-2.5" />}
              {roleMeta.label}
            </span>
          </span>
          <button
            onClick={() => signOut()}
            className="rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-red-500"
            title="Выйти"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <ThemeToggle />
      </div>

      <CreateBoardDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
