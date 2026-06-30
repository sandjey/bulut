"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="btn-ghost relative overflow-hidden"
      aria-label="Переключить тему"
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    >
      <span className="relative h-5 w-5">
        <Sun
          className={`absolute inset-0 h-5 w-5 transition-all duration-300 ${
            theme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          }`}
        />
        <Moon
          className={`absolute inset-0 h-5 w-5 transition-all duration-300 ${
            theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          }`}
        />
      </span>
      {!compact && <span>{theme === "dark" ? "Светлая" : "Тёмная"}</span>}
    </button>
  );
}
