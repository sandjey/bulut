"use client";

import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { LoginScreen } from "./LoginScreen";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useAuth();

  if (loading && configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}
