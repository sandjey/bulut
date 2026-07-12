"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Check, AlertTriangle, Users } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";

export default function InvitePage() {
  const params = useParams();
  const token = String(params?.token ?? "");
  const { acceptInvite } = useWorkspace();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  const accept = async () => {
    setStatus("busy");
    const error = await acceptInvite(token);
    if (error) {
      setErr(error);
      setStatus("error");
    } else {
      setStatus("done");
      setTimeout(() => router.replace("/"), 900);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/15 text-brand">
          <Users className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Приглашение в команду</h1>

        {status === "done" ? (
          <div className="mt-4 inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Check className="h-5 w-5" /> Готово! Открываем комнату…
          </div>
        ) : status === "error" ? (
          <>
            <div className="mt-4 inline-flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" /> {err}
            </div>
            <button className="btn-outline mt-5" onClick={() => router.replace("/")}>
              На главную
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Вы вошли под своим аккаунтом. Нажмите, чтобы присоединиться к комнате и получить доступ
              к её доскам, задачам и картам.
            </p>
            <button
              className="btn-primary mx-auto mt-5"
              onClick={accept}
              disabled={status === "busy"}
            >
              {status === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Принять приглашение
            </button>
          </>
        )}
      </div>
    </div>
  );
}
