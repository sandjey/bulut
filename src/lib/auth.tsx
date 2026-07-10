"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { setMe } from "./me";

interface AuthResult {
  error: string | null;
  needsConfirmation?: boolean;
}

interface OtpResult {
  error: string | null;
  ticket?: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  /** Шаг 1 регистрации: отправить код подтверждения на почту. */
  sendSignupOtp: (email: string, name: string, role: string) => Promise<OtpResult>;
  /** Шаг 2 регистрации: проверить код и создать аккаунт. */
  completeSignup: (
    email: string,
    password: string,
    name: string,
    role: string,
    code: string,
    ticket: string,
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase не настроен" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? translateError(error.message) : null };
  }, []);

  const sendSignupOtp = useCallback(
    async (email: string, name: string, role: string): Promise<OtpResult> => {
      try {
        const res = await fetch("/api/auth/otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), name: name.trim(), role }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          return {
            error:
              data?.error ??
              `Сервер вернул ошибку (${res.status}). Проверьте настройки регистрации на сервере.`,
          };
        }
        return { error: null, ticket: data?.ticket };
      } catch {
        return { error: "Не удалось связаться с сервером. Проверьте соединение и попробуйте снова." };
      }
    },
    [],
  );

  const completeSignup = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      role: string,
      code: string,
      ticket: string,
    ): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { error: "Supabase не настроен" };

      // 1) Проверяем OTP-код на сервере (почта подтверждена).
      try {
        const res = await fetch("/api/auth/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), code: code.trim(), ticket }),
        });
        const verified = await safeJson(res);
        if (!res.ok) return { error: verified?.error ?? `Ошибка проверки кода (${res.status})` };
      } catch {
        return { error: "Не удалось связаться с сервером. Проверьте соединение и попробуйте снова." };
      }

      // 2) Создаём аккаунт в Supabase (проект в режиме autoconfirm → сразу сессия).
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), name: name.trim(), role } },
      });
      if (error) return { error: translateError(error.message) };

      // Запоминаем, кто вошёл, чтобы приложение сразу знало имя пользователя.
      setMe(name.trim());
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        configured: isSupabaseConfigured,
        signIn,
        sendSignupOtp,
        completeSignup,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Безопасно парсит JSON-ответ: если сервер вернул не-JSON (напр. 500 HTML), не падаем. */
async function safeJson(res: Response): Promise<{ error?: string; ticket?: string; [k: string]: unknown } | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Неверный email или пароль";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Этот email уже зарегистрирован";
  if (m.includes("password should be at least"))
    return "Пароль должен быть не менее 6 символов";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Некорректный email";
  if (m.includes("email not confirmed")) return "Email не подтверждён — проверьте почту";
  return msg;
}
