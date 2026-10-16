"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "wacrm.sidebar.collapsed";
const EVENT = "wacrm:sidebar-collapsed";

// In-tab value, so the toggle still works when localStorage throws.
let memory: boolean | null = null;

function read(): boolean {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = e.newValue === "1";
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Desktop sidebar collapsed (icons-only) preference, persisted per
 * device. Server render + first hydration pass read `false`, so the
 * markup matches; the stored value applies right after.
 */
export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const setCollapsed = useCallback((next: boolean) => {
    memory = next;
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Private mode — the toggle just won't persist.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [collapsed, setCollapsed];
}
