"use client";

import { useSyncExternalStore } from "react";

/** A saved contact filter ("segment"): search text + tag selection, per device. */
export interface SavedView {
  id: string;
  name: string;
  search: string;
  tagIds: string[];
}

const VIEWS_KEY = "wacrm.contacts.views";
const EVENT = "wacrm:contacts-views";
/** Fired by the context panel's "+ New segment"; the Contacts page saves its filter. */
export const SAVE_VIEW_EVENT = "wacrm:contacts:save-view";

const EMPTY: SavedView[] = [];
let cache: { raw: string | null; views: SavedView[] } = { raw: null, views: EMPTY };

export function parseViews(raw: string | null): SavedView[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed)
      ? parsed.filter((v) => v && typeof v.id === "string" && Array.isArray(v.tagIds))
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readViews(): SavedView[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(VIEWS_KEY);
  } catch {
    return cache.views;
  }
  if (raw !== cache.raw) cache = { raw, views: parseViews(raw) };
  return cache.views;
}

export function writeViews(views: SavedView[]) {
  const raw = JSON.stringify(views);
  cache = { raw, views };
  try {
    localStorage.setItem(VIEWS_KEY, raw);
  } catch {
    // Private mode — views just won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Saved views, live across the page and the context panel. */
export function useSavedViews(): SavedView[] {
  return useSyncExternalStore(subscribe, readViews, () => EMPTY);
}

/** URL for a view; the Contacts page reads these params on mount. */
export function viewHref(view: Pick<SavedView, "search" | "tagIds">): string {
  const params = new URLSearchParams();
  if (view.search) params.set("q", view.search);
  if (view.tagIds.length) params.set("tags", view.tagIds.join(","));
  const qs = params.toString();
  return qs ? `/contacts?${qs}` : "/contacts";
}
