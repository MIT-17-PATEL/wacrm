"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "wacrm:pinned-conversations";
const EMPTY: ReadonlySet<string> = new Set();
const cache = new Map<string, { raw: string | null; ids: ReadonlySet<string> }>();

/** Pinned chats are kept per user on this device (no schema change). */
function storageKey(userId: string | null | undefined) {
  return `wacrm.inbox.pinned.${userId ?? "anon"}`;
}

export function parsePinned(raw: string | null): ReadonlySet<string> {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === "string")) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function read(key: string): ReadonlySet<string> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return cache.get(key)?.ids ?? EMPTY;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.ids;
  const ids = parsePinned(raw);
  cache.set(key, { raw, ids });
  return ids;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePinnedConversations(
  userId: string | null | undefined,
): [ReadonlySet<string>, (conversationId: string) => void] {
  const key = storageKey(userId);
  const pinned = useSyncExternalStore(subscribe, () => read(key), () => EMPTY);
  const toggle = useCallback(
    (conversationId: string) => {
      const next = new Set(read(key));
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      const raw = JSON.stringify([...next]);
      cache.set(key, { raw, ids: next });
      try {
        localStorage.setItem(key, raw);
      } catch {
        // Private mode — pins last for this tab only.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [pinned, toggle];
}
