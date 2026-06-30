"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./supabase";

interface AuthResult {
  error: string | null;
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
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

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase не настроен" };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: translateError(error.message) };
    // If email confirmation is required, there's a user but no session yet.
    const needsConfirmation = !data.session && !!data.user;
    return { error: null, needsConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, configured: isSupabaseConfigured, signIn, signUp, signOut }}
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
