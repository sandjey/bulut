"use client";

import { RequirePerm } from "@/components/RequirePerm";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequirePerm perm="console.view" title="Нет доступа к Bulut API">
      {children}
    </RequirePerm>
  );
}
