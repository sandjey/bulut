"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Управление комнатой переехало в Администрирование → /admin/room. */
export default function RoomRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/room");
  }, [router]);
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand" />
    </div>
  );
}
