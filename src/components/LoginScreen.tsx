"use client";

import { useState } from "react";
import { Mail, Lock, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

export function LoginScreen() {
  const { signIn, signUp, configured } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError("Введите email и пароль");
      return;
    }
    setLoading(true);
    const res =
      mode === "signin"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else if (res.needsConfirmation) {
      setInfo("Аккаунт создан! Подтвердите email по ссылке из письма, затем войдите.");
      setMode("signin");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4">
      {/* decorative gradient */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-brand/25 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-48 right-[8%] h-[420px] w-[420px] rounded-full bg-brand-2/20 blur-[130px]" />
      <div className="absolute right-4 top-4">
        <ThemeToggle compact />
      </div>

      <div className="relative z-10 w-full max-w-sm animate-scale-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={64} glow />
          <h1 className="mt-4 text-4xl font-extrabold brand-text font-display">Bulut</h1>
          <p className="mt-1.5 text-sm text-muted">Менеджер задач с облачным хранением</p>
        </div>

        {!configured && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Supabase не настроен. Заполните <code className="font-mono">.env.local</code> (см. README)
              и перезапустите приложение.
            </span>
          </div>
        )}

        <div className="card p-6 shadow-pop">
          {/* tabs */}
          <div className="mb-5 flex rounded-xl bg-surface-2 p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setInfo(null);
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  mode === m ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg"
                }`}
              >
                {m === "signin" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="email"
                  autoComplete="email"
                  className="input pl-9"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!configured}
                />
              </div>
            </div>

            <div>
              <label className="label">Пароль</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="input pl-9"
                  placeholder="Минимум 6 символов"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!configured}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 p-2.5 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {info}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading || !configured}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Войти" : "Создать аккаунт"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          Данные хранятся в вашей базе Postgres через Supabase
        </p>
      </div>
    </div>
  );
}
