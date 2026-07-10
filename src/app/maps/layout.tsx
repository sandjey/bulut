"use client";

import { MapsProvider } from "@/lib/maps";
import { RequirePerm } from "@/components/RequirePerm";

export default function MapsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequirePerm perm="map.view" title="Нет доступа к Bulut MAP">
      <MapsProvider>{children}</MapsProvider>
    </RequirePerm>
  );
}
