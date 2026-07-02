"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Trash2, Loader2, X, ImageIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { TaskPhoto, MAX_TASK_PHOTOS } from "@/lib/types";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function PhotoUploader({ taskId }: { taskId: string }) {
  const { tasks, updateTask } = useStore();
  const task = tasks.find((t) => t.id === taskId);

  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<TaskPhoto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const photos = task?.photos ?? [];
  const remaining = MAX_TASK_PHOTOS - photos.length;

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!task) return;
      const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!images.length) return;
      const slots = MAX_TASK_PHOTOS - (task.photos?.length ?? 0);
      if (slots <= 0) {
        alert(`Максимум ${MAX_TASK_PHOTOS} фото на задачу`);
        return;
      }
      const take = images.slice(0, slots);
      setBusy(true);
      try {
        const added: TaskPhoto[] = [];
        for (const file of take) {
          try {
            const dataUrl = await compressImage(file);
            added.push({ id: uid(), name: file.name || "фото", dataUrl });
          } catch {
            /* skip files that fail to decode */
          }
        }
        if (added.length) {
          updateTask(taskId, { photos: [...(task.photos ?? []), ...added] });
        }
        if (images.length > slots) {
          alert(`Добавлено ${added.length}. Лимит — ${MAX_TASK_PHOTOS} фото на задачу.`);
        }
      } finally {
        setBusy(false);
      }
    },
    [task, taskId, updateTask]
  );

  if (!task) return null;

  const removePhoto = (id: string) =>
    updateTask(taskId, { photos: photos.filter((p) => p.id !== id) });

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="label mb-0 flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" /> Фото
        </span>
        <span className="text-xs text-muted">
          {photos.length}/{MAX_TASK_PHOTOS}
        </span>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}
      </div>

      {photos.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-2"
            >
              <button type="button" onClick={() => setPreview(p)} className="block h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.dataUrl}
                  alt={p.name}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              </button>
              <button
                type="button"
                onClick={() => removePhoto(p.id)}
                className="absolute right-1 top-1 rounded-md bg-slate-900/60 p-1 text-white opacity-0 backdrop-blur-sm transition hover:bg-red-500 group-hover:opacity-100"
                title="Удалить фото"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          onClick={() => inputRef.current?.click()}
          tabIndex={0}
          role="button"
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center text-sm transition outline-none",
            dragOver
              ? "border-brand bg-brand/5 text-brand"
              : "border-border text-muted hover:border-brand/50 hover:bg-surface-2/50 focus:border-brand/50"
          )}
        >
          <ImagePlus className="h-5 w-5" />
          <span>
            Перетащите, вставьте (Ctrl+V) или{" "}
            <span className="font-medium text-brand">выберите фото</span>
          </span>
          <span className="text-xs text-muted/70">
            до {MAX_TASK_PHOTOS} шт · осталось {remaining}
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <p className="mt-1.5 text-xs text-muted/70">
        Фото автоматически удаляются, когда задача переходит в «Готово».
      </p>

      {/* Lightbox */}
      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreview(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={() => setPreview(null)}
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.dataUrl}
            alt={preview.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
