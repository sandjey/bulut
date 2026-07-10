"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Loader2, ArrowLeft } from "lucide-react";
import { useMaps } from "@/lib/maps";

// React Flow работает только на клиенте — грузим редактор без SSR.
const MapEditor = dynamic(() => import("@/components/map/MapEditor").then((m) => m.MapEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand" />
    </div>
  ),
});

export default function MapCanvasPage() {
  const params = useParams();
  const id = params.id as string;
  const { getMap, ready } = useMaps();
  const map = getMap(id);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!map) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-semibold">Карта не найдена</p>
        <Link href="/maps" className="btn-primary">
          <ArrowLeft className="h-4 w-4" /> К картам
        </Link>
      </div>
    );
  }

  return <MapEditor map={map} />;
}
