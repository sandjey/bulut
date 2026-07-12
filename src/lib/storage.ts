"use client";

import { getSupabase } from "./supabase";
import { getActiveWorkspace } from "./db";

const BUCKET = "task-files";

function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}

/** Файл-вложение хранит путь в Storage (не http). Ссылки хранят http(s). */
export function isFileAttachment(url: string): boolean {
  return !/^https?:\/\//i.test(url);
}

/** Загрузить файл в приватный бакет. Возвращает путь + имя. */
export async function uploadTaskFile(taskId: string, file: File): Promise<{ path: string; name: string } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const ws = getActiveWorkspace() ?? "ws";
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  const path = `${ws}/${taskId}/${uid()}-${safe}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) {
    console.error("upload", error);
    return null;
  }
  return { path, name: file.name };
}

/** Временная ссылка на скачивание (1 час). */
export async function signedUrl(path: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteTaskFile(path: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.storage.from(BUCKET).remove([path]).catch(() => {});
}
