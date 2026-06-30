"use client";

import { useEffect, useState } from "react";

const KEY = "bulut.me";
const EVENT = "bulut-me-changed";

export function getMe(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KEY) ?? "";
}

export function setMe(name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, name);
  window.dispatchEvent(new Event(EVENT));
}

/** React hook: the member the current user identifies as ("I am …"). */
export function useMe(): [string, (name: string) => void] {
  const [me, setMeState] = useState("");

  useEffect(() => {
    setMeState(getMe());
    const handler = () => setMeState(getMe());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (name: string) => {
    setMe(name);
    setMeState(name);
  };

  return [me, update];
}
