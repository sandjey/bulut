"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { GlobalSearch } from "./GlobalSearch";
import { Logo } from "./Logo";
import { NotificationsBell } from "./NotificationsBell";
import { useStore } from "@/lib/store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
        <Sidebar onOpenSearch={() => setSearchOpen(true)} />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-border shadow-xl animate-slide-up">
            <Sidebar
              onNavigate={() => setMobileOpen(false)}
              onOpenSearch={() => {
                setMobileOpen(false);
                setSearchOpen(true);
              }}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border glass px-4 py-2.5">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg lg:hidden"
            aria-label="Меню"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={30} />
            <span className="font-bold brand-text font-display">Bulut</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          {ready ? (
            children
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
            </div>
          )}
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
