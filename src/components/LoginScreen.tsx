"use client";

import { useState } from "react";
import {
  Mail,
  Lock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  User as UserIcon,
  Briefcase,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { MEMBER_ROLES } from "@/lib/types";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

type Mode = "signin" | "signup";
type Step = "form" | "otp";

export function LoginScreen() {
  const { signIn, sendSignupOtp, completeSignup, configured } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<Step>("form");

  // общие поля
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // поля регистрации
  const [name, setName] = useState("");
  const [role, setRole] = useState(MEMBER_ROLES[0]);
  // otp
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reset = (m: Mode) => {
    setMode(m);
    setStep("form");
    setError(null);
    setInfo(null);
    setCode("");
    setTicket("");
  };

  // ── Вход ────────────────────────────────────────────────────────────────
  const doSignIn = async () => {
    if (!email.trim() || !password) return setError("Введите email и пароль");
    setLoading(true);
    const res = await signIn(email.trim(), password);
    setLoading(false);
    if (res.error) setError(res.error);
  };

  // ── Регистрация, шаг 1: отправка кода ────────────────────────────────────
  const doSendOtp = async () => {
    if (!name.trim()) return setError("Введите имя");
    if (!email.trim()) return setError("Введите email");
    if (password.length < 6) return setError("Пароль должен быть не менее 6 символов");
    setLoading(true);
    const res = await sendSignupOtp(email.trim(), name.trim(), role);
    setLoading(false);
    if (res.error) return setError(res.error);
    setTicket(res.ticket ?? "");
    setStep("otp");
    setInfo(`Код отправлен на ${email.trim()}`);
  };

  // ── Регистрация, шаг 2: проверка кода и создание аккаунта ─────────────────
  const doVerify = async () => {
    if (code.trim().length < 6) return setError("Введите 6-значный код");
    setLoading(true);
    const res = await completeSignup(email.trim(), password, name.trim(), role, code.trim(), ticket);
    setLoading(false);
    if (res.error) setError(res.error);
    // при успехе AuthProvider поймает сессию и покажет приложение
  };

  const doResend = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    const res = await sendSignupOtp(email.trim(), name.trim(), role);
    setLoading(false);
    if (res.error) return setError(res.error);
    setTicket(res.ticket ?? "");
    setCode("");
    setInfo("Новый код отправлен");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === "signin") return doSignIn();
    if (step === "form") return doSendOtp();
    return doVerify();
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
                type="button"
                onClick={() => reset(m)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  mode === m ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg"
                }`}
              >
                {m === "signin" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {/* ── Шаг ввода кода ─────────────────────────────────────────── */}
            {mode === "signup" && step === "otp" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setStep("form");
                    setError(null);
                    setInfo(null);
                  }}
                  className="flex items-center gap-1.5 text-sm text-muted transition hover:text-fg"
                >
                  <ArrowLeft className="h-4 w-4" /> Назад
                </button>

                <div className="flex flex-col items-center gap-2 py-1 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-muted">
                    Введите код из письма, отправленного на
                    <br />
                    <span className="font-semibold text-fg">{email.trim()}</span>
                  </p>
                </div>

                <div>
                  <label className="label">Код подтверждения</label>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="input text-center text-2xl font-bold tracking-[0.5em]"
                    placeholder="______"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoFocus
                  />
                </div>

                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Подтвердить и создать аккаунт
                </button>

                <button
                  type="button"
                  onClick={doResend}
                  disabled={loading}
                  className="w-full text-center text-sm text-muted transition hover:text-brand"
                >
                  Отправить код повторно
                </button>
              </>
            ) : (
              <>
                {/* ── Имя и роль (только регистрация) ───────────────────── */}
                {mode === "signup" && (
                  <>
                    <div>
                      <label className="label">Имя</label>
                      <div className="relative">
                        <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <input
                          type="text"
                          autoComplete="name"
                          className="input pl-9"
                          placeholder="Иван Иванов"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          disabled={!configured}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">Роль</label>
                      <div className="relative">
                        <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <select
                          className="input pl-9"
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          disabled={!configured}
                        >
                          {MEMBER_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

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

                <button type="submit" className="btn-primary w-full" disabled={loading || !configured}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "signin" ? "Войти" : "Продолжить"}
                </button>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 p-2.5 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {info && !error && (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {info}
              </div>
            )}
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          Данные хранятся в вашей базе Postgres через Supabase
        </p>
      </div>
    </div>
  );
}
