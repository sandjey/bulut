"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { useStore } from "@/lib/store";
import { BOARD_COLORS } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CreateBoardDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { createBoard } = useStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(BOARD_COLORS[0]);

  const submit = () => {
    if (!name.trim()) return;
    const board = createBoard(name, color);
    setName("");
    setColor(BOARD_COLORS[0]);
    onClose();
    router.push(`/board/${board.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новая доска"
      size="sm"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary" onClick={submit} disabled={!name.trim()}>
            Создать
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Название</label>
          <input
            autoFocus
            className="input"
            placeholder="Например, Frontend"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div>
          <label className="label">Цвет</label>
          <div className="flex flex-wrap gap-2">
            {BOARD_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "h-8 w-8 rounded-full transition-transform",
                  color === c ? "ring-2 ring-offset-2 ring-offset-surface scale-110" : "hover:scale-110"
                )}
                style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px ${c}` : undefined }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
