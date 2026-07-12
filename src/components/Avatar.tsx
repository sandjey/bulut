"use client";

import { avatarColor, initials, contrastText } from "@/lib/utils";
import { useResolveAvatar } from "@/lib/access";

export function Avatar({
  name,
  size = 24,
  src,
}: {
  name: string;
  size?: number;
  src?: string | null;
}) {
  // Если фото не передали явно — ищем по имени в профилях (показываем везде).
  const resolve = useResolveAvatar();
  const photo = src ?? resolve(name);

  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        title={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  if (!name) {
    return (
      <span
        className="grid place-items-center rounded-full bg-surface-2 text-muted"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        title="Без исполнителя"
      >
        ?
      </span>
    );
  }
  const bg = avatarColor(name);
  return (
    <span
      className="grid place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: contrastText(bg),
        fontSize: size * 0.4,
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
