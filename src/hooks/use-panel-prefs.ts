"use client";

import { useCallback, useSyncExternalStore } from "react";

export const PANEL_MIN_WIDTH = 260;
export const PANEL_MAX_WIDTH = 380;
export const PANEL_DEFAULT_WIDTH = 300;

export interface PanelPrefs {
  collapsed: boolean;
  width: number;
}

const DEFAULTS: PanelPrefs = { collapsed: false, width: PANEL_DEFAULT_WIDTH };
const EVENT = "wacrm:panel-prefs";

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return PANEL_DEFAULT_WIDTH;
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(width)));
}

export function parsePanelPrefs(raw: string | null): PanelPrefs {
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
    return {
      collapsed: parsed.collapsed === true,
      width: clampPanelWidth(Number(parsed.width ?? PANEL_DEFAULT_WIDTH)),
    };
  } catch {
    return DEFAULTS;
  }
}

// In-tab values (keyed by storage key) so the panel still works when
// localStorage throws, and so snapshots are referentially stable.
const memory = new Map<string, { raw: string | null; prefs: PanelPrefs }>();

function storageKey(userId: string | null | undefined) {
  return `wacrm.contextPanel.${userId ?? "anon"}`;
}

function read(key: string): PanelPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    raw = memory.get(key)?.raw ?? null;
  }
  const cached = memory.get(key);
  if (cached && cached.raw === raw) return cached.prefs;
  const prefs = parsePanelPrefs(raw);
  memory.set(key, { raw, prefs });
  return prefs;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The context panel's collapsed state and width, remembered per user
 * on this device. Server render + first hydration pass read the
 * defaults so markup matches; the stored value applies right after.
 */
export function usePanelPrefs(
  userId: string | null | undefined,
): [PanelPrefs, (patch: Partial<PanelPrefs>) => void] {
  const key = storageKey(userId);
  const prefs = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => DEFAULTS,
  );
  const update = useCallback(
    (patch: Partial<PanelPrefs>) => {
      const current = read(key);
      const next: PanelPrefs = {
        collapsed: patch.collapsed ?? current.collapsed,
        width: clampPanelWidth(patch.width ?? current.width),
      };
      const raw = JSON.stringify(next);
      memory.set(key, { raw, prefs: next });
      try {
        localStorage.setItem(key, raw);
      } catch {
        // Private mode — the choice just won't persist.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [prefs, update];
}
