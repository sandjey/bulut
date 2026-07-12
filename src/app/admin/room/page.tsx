"use client";

import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { RoomSettings } from "@/components/RoomSettings";

export default function AdminRoomPage() {
  const { myRole } = useWorkspace();
  const canManage = myRole === "owner" || myRole === "admin";

  if (!canManage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">Только для владельца и админов комнаты</h1>
        <p className="max-w-sm text-sm text-muted">Управлять комнатой может владелец или администратор.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pt-5 sm:px-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-fg">
          <ChevronLeft className="h-4 w-4" /> Администрирование
        </Link>
      </div>
      <RoomSettings />
    </div>
  );
}
