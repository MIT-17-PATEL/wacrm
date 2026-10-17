"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Live `matchMedia` result. Server render and hydration read `false`,
 * so layout-critical differences belong in CSS breakpoints; use this
 * for behaviour (focus, inert, which handler runs).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
