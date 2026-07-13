"use client";

import { useState } from "react";
import { Plus, Trash2, Wand2, ListPlus } from "lucide-react";
import { Modal } from "./Modal";
import { useStore } from "@/lib/store";
import { loadRules, saveRules, type BoardRule } from "@/lib/board-rules";
import type { Board } from "@/lib/types";

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

/** Настройки доски: кастомные поля карточек + правила автоматизации. Просто. */
export function BoardSettingsDialog({ board, open, onClose }: { board: Board; open: boolean; onClose: () => void }) {
  const { updateBoard } = useStore();
  const fields = board.customFields ?? [];
  const [newField, setNewField] = useState("");
  const [rules, setRules] = useState<BoardRule[]>(() => loadRules(board.id));

  const addField = () => {
    if (!newField.trim()) return;
    updateBoard(board.id, { customFields: [...fields, { id: uid(), name: newField.trim() }] });
    setNewField("");
  };
  const removeField = (id: string) => updateBoard(board.id, { customFields: fields.filter((f) => f.id !== id) });

  const persist = (next: BoardRule[]) => {
    setRules(next);
    saveRules(board.id, next);
  };
  const addRule = () =>
    persist([...rules, { id: uid(), whenCol: board.columns[0]?.id ?? "", action: "assign", value: "" }]);

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Настройки доски">
      <div className="space-y-6">
        {/* Кастомные поля */}
        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ListPlus className="h-4 w-4 text-brand" /> Свои поля карточек
          </div>
          <div className="space-y-1.5">
            {fields.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                <span className="flex-1 text-sm">{f.name}</span>
                <button onClick={() => removeField(f.id)} className="rounded p-1 text-muted hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            <input
              className="input"
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addField()}
              placeholder="Название поля (напр. Окружение)"
            />
            <button className="btn-outline px-3" onClick={addField} disabled={!newField.trim()}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-faint">Появятся в карточке в разделе «Планирование».</p>
        </section>

        {/* Автоматизация */}
        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Wand2 className="h-4 w-4 text-brand" /> Автоматизация «если → то»
          </div>
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border p-2 text-sm">
                <span className="text-muted">Когда перемещена в</span>
                <select
                  className="input h-8 w-auto py-1"
                  value={r.whenCol}
                  onChange={(e) => persist(rules.map((x) => (x.id === r.id ? { ...x, whenCol: e.target.value } : x)))}
                >
                  {board.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="text-muted">→</span>
                <select
                  className="input h-8 w-auto py-1"
                  value={r.action}
                  onChange={(e) => persist(rules.map((x) => (x.id === r.id ? { ...x, action: e.target.value as BoardRule["action"], value: "" } : x)))}
                >
                  <option value="assign">назначить</option>
                  <option value="priority">приоритет</option>
                  <option value="done">пометить готово</option>
                </select>
                {r.action === "assign" && (
                  <input
                    className="input h-8 w-32 py-1"
                    value={r.value}
                    onChange={(e) => persist(rules.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)))}
                    placeholder="имя"
                  />
                )}
                {r.action === "priority" && (
                  <select
                    className="input h-8 w-auto py-1"
                    value={r.value}
                    onChange={(e) => persist(rules.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)))}
                  >
                    <option value="">—</option>
                    <option value="high">высокий</option>
                    <option value="medium">средний</option>
                    <option value="low">низкий</option>
                  </select>
                )}
                <button onClick={() => persist(rules.filter((x) => x.id !== r.id))} className="ml-auto rounded p-1 text-muted hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button className="btn-outline mt-2" onClick={addRule}>
            <Plus className="h-4 w-4" /> Добавить правило
          </button>
          <p className="mt-1 text-xs text-faint">Срабатывает при перетаскивании карточки в колонку.</p>
        </section>
      </div>
    </Modal>
  );
}
