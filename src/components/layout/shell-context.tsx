"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { usePanelPrefs, type PanelPrefs } from "@/hooks/use-panel-prefs";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";

/** Matches Tailwind's `lg` — the panel docks at/above it, drawers below. */
export const DOCK_QUERY = "(min-width: 1024px)";

interface ShellContextValue {
  panel: PanelPrefs;
  setPanel: (patch: Partial<PanelPrefs>) => void;
  /** Below `lg` the context panel is a drawer; this is its open state. */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** Ctrl+B / rail button: collapse when docked, open/close the drawer below. */
  togglePanel: () => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  totalUnread: number;
  unreadNotifications: number;
  /** Phone inbox: a chat is open full-screen, so the tab bar hides. */
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>");
  return ctx;
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [panel, setPanel] = usePanelPrefs(user?.id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // One realtime subscription each, shared by the rail, the tab bar and
  // the tab title (each hook call opens its own channel).
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();

  // A navigation closes the drawer, like picking a chat in WhatsApp.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  const togglePanel = useCallback(() => {
    if (window.matchMedia(DOCK_QUERY).matches) {
      setPanel({ collapsed: !panel.collapsed });
    } else {
      setDrawerOpen((v) => !v);
    }
  }, [panel.collapsed, setPanel]);

  // Ctrl/⌘+B toggles the panel from anywhere, even inside inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePanel]);

  const value = useMemo(
    () => ({
      panel,
      setPanel,
      drawerOpen,
      setDrawerOpen,
      togglePanel,
      shortcutsOpen,
      setShortcutsOpen,
      totalUnread,
      unreadNotifications,
      chatOpen,
      setChatOpen,
    }),
    [panel, setPanel, drawerOpen, togglePanel, shortcutsOpen, totalUnread, unreadNotifications, chatOpen],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
