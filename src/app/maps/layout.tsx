"use client";

import { RequirePerm } from "@/components/RequirePerm";

// MapsProvider поднят в корневой layout (карты нужны и в TaskModal, и на досках).
export default function MapsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequirePerm perm="map.view" title="Нет доступа к Bulut MAP">
      {children}
    </RequirePerm>
  );
}
