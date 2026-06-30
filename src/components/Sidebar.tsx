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
} from "lucide-react";
import { LogOut } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, avatarColor, initials, contrastText } from "@/lib/utils";
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
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);

  const email = user?.email ?? "";
  const avatarBg = avatarColor(email || "user");

  const navItem = (
    href: string,
    label: string,
    Icon: typeof LayoutDashboard
  ) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
          active
            ? "bg-brand/10 font-semibold text-brand ring-1 ring-brand/20"
            : "text-muted hover:translate-x-0.5 hover:bg-surface-2 hover:text-fg"
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
        {label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <Logo size={38} />
        <div>
          <div className="text-base font-bold leading-tight brand-text">Bulut</div>
          <div className="text-[11px] text-muted leading-tight">Облачные задачи</div>
        </div>
      </div>

      <div className="px-3">
        <button onClick={onOpenSearch} className="input flex items-center gap-2 text-muted">
          <Search className="h-4 w-4" />
          <span className="text-sm">Поиск...</span>
          <kbd className="ml-auto hidden rounded border border-border px-1.5 text-[10px] sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="mt-4 space-y-1 px-3">
        {navItem("/", "Доски", LayoutDashboard)}
        {navItem("/my", "Мои задачи", CheckSquare)}
        {navItem("/journal", "Журнал", BookOpenText)}
        {navItem("/reports", "Отчёты", FileBarChart)}
        {navItem("/team", "Команда", Users)}
        {navItem("/analytics", "Аналитика", BarChart3)}
      </nav>

      {/* Boards list */}
      <div className="mt-6 flex items-center justify-between px-5 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Доски
        </span>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-fg"
          title="Создать доску"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="board-scroll flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {boards.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted">Пока нет досок</p>
        )}
        {boards.map((b) => {
          const active = pathname === `/board/${b.id}`;
          return (
            <Link
              key={b.id}
              href={`/board/${b.id}`}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: b.color }}
              />
              <span className="truncate">{b.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold"
            style={{ backgroundColor: avatarBg, color: contrastText(avatarBg) }}
          >
            {initials(email || "U")}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted" title={email}>
            {email || "Пользователь"}
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
