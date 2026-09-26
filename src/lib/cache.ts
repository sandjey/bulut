"use client";

import { AppData } from "./types";

/**
 * Offline cache: keep the last known AppData in localStorage per user so the
 * app renders instantly on reload / navigation and survives being offline —
 * data is never "lost" while the network re-syncs (or stays down).
 */
const PREFIX = "bulut.cache.";

const keyFor = (userId: string) => `${PREFIX}${userId}`;

export function loadCache(userId: string): AppData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const data = JSON.parse(raw) as AppData;
    if (!data || !Array.isArray(data.boards) || !Array.isArray(data.tasks)) return null;
    return {
      boards: data.boards ?? [],
      tasks: data.tasks ?? [],
      journal: data.journal ?? [],
      comments: data.comments ?? [],
      members: data.members ?? [],
    };
  } catch {
    return null;
  }
}

export function saveCache(userId: string, data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    // Фото (base64) в кэш не кладём: они занимают почти всю квоту localStorage,
    // а грузятся по требованию при открытии карточки. undefined = «не загружены»
    // (JSON.stringify такие поля просто выбрасывает), поэтому после чтения кэша
    // карточка честно сходит за фото на сервер, а не решит, что их нет.
    // Описание, кастомные поля и комментарии тоже не кладём: это «детали
    // карточки», они грузятся при её открытии. В кэше — только сводки.
    const slim: AppData = {
      ...data,
      tasks: data.tasks.map((t) => ({
        ...t,
        photos: undefined,
        desc: "",
        custom: {},
        detailsLoaded: false,
      })),
      comments: [],
    };
    window.localStorage.setItem(keyFor(userId), JSON.stringify(slim));
  } catch (e) {
    console.warn("Не удалось сохранить офлайн-кэш", e);
  }
}

export function clearCache(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}
