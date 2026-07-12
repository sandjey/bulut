"use client";

import { avatarColor, initials, contrastText } from "@/lib/utils";

export function Avatar({
  name,
  size = 24,
  src,
}: {
  name: string;
  size?: number;
  src?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
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
