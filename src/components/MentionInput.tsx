"use client";

import { useState } from "react";
import { useTeam } from "@/lib/team";
import { Avatar } from "./Avatar";

/** Поле ввода с автокомплитом @упоминаний участников комнаты. Просто печатаешь «@». */
export function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const team = useTeam();
  const [show, setShow] = useState(false);

  const match = value.match(/@([^\s@]*)$/);
  const query = match ? match[1].toLowerCase() : null;
  const list = query !== null ? team.filter((m) => !m.deleted && m.name.toLowerCase().includes(query)).slice(0, 6) : [];

  const pick = (name: string) => {
    onChange(value.replace(/@[^\s@]*$/, `@${name} `));
    setShow(false);
  };

  return (
    <div className="relative flex-1">
      <input
        className={className ?? "input w-full"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShow(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (show && list.length) {
              e.preventDefault();
              pick(list[0].name);
            } else onSubmit?.();
          }
          if (e.key === "Escape") setShow(false);
        }}
        placeholder={placeholder}
      />
      {show && list.length > 0 && (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl">
          {list.map((m) => (
            <button
              key={m.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m.name);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm transition hover:bg-surface-2"
            >
              <Avatar name={m.name} src={m.avatar} size={22} />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
