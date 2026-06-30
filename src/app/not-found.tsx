import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-bold text-brand">404</p>
      <p className="text-lg font-semibold">Страница не найдена</p>
      <Link href="/" className="btn-primary">
        <Home className="h-4 w-4" /> На главную
      </Link>
    </div>
  );
}
