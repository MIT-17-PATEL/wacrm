"use client";

import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";

import { useTheme } from "@/hooks/use-theme";
import { DEFAULT_MODE } from "@/lib/themes";

// Returns false during SSR and the first hydration render, true after —
// the sanctioned (warning-free, no setState-in-effect) way to diverge
// server vs client. Lets us match the server-rendered default on first
// paint, then adopt the real mode.
const noopSubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Toaster wrapper that tracks the active light/dark mode. Bottom-right
 * (lifted above the mobile tab bar), tinted per toast type from the
 * semantic tokens.
 *
 * Lives inside <ThemeProvider> (see layout.tsx) so it can read the
 * current mode and hand it to sonner. Colors are driven off the same
 * CSS tokens as the rest of the app, so a toast looks at home in
 * either mode without a second palette to maintain.
 *
 * The theme is gated behind `useIsClient`: the server renders
 * DEFAULT_MODE, so first client paint must too, otherwise a light-mode
 * user hydrates with a different sonner `theme` attribute than the
 * server emitted and React logs a hydration mismatch.
 */
export function ThemedToaster() {
  const { mode } = useTheme();
  const isClient = useIsClient();
  return (
    <Toaster
      theme={isClient ? mode : DEFAULT_MODE}
      position="bottom-right"
      richColors
      closeButton
      offset={{ bottom: 88, right: 16 }}
      mobileOffset={{ bottom: 88 }}
      // sonner's own CSS variables, pointed at our design tokens.
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-border": "var(--border-strong)",
          "--normal-text": "var(--popover-foreground)",
          "--success-bg": "color-mix(in oklab, var(--success) 12%, var(--popover))",
          "--success-border": "color-mix(in oklab, var(--success) 35%, transparent)",
          "--success-text": "var(--foreground)",
          "--error-bg": "color-mix(in oklab, var(--danger) 12%, var(--popover))",
          "--error-border": "color-mix(in oklab, var(--danger) 35%, transparent)",
          "--error-text": "var(--foreground)",
          "--warning-bg": "color-mix(in oklab, var(--warning) 12%, var(--popover))",
          "--warning-border": "color-mix(in oklab, var(--warning) 35%, transparent)",
          "--warning-text": "var(--foreground)",
          "--info-bg": "color-mix(in oklab, var(--info) 12%, var(--popover))",
          "--info-border": "color-mix(in oklab, var(--info) 35%, transparent)",
          "--info-text": "var(--foreground)",
          "--border-radius": "var(--radius-xl)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!shadow-raised !font-sans !gap-3",
          title: "!font-semibold",
          description: "!text-muted-foreground",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
          warning: "[&_[data-icon]]:!text-warning",
          info: "[&_[data-icon]]:!text-info",
        },
      }}
    />
  );
}
