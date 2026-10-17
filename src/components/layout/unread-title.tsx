"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useShell } from "@/components/layout/shell-context";
import { playMessageSound, useSoundPref } from "@/hooks/use-sound-pref";

const PREFIX = /^\(\d+\+?\)\s*/;

/** "(3) Inbox — Neno Connect" — the count prefix on the page title. */
export function withUnreadPrefix(title: string, unread: number): string {
  const base = title.replace(PREFIX, "");
  if (unread <= 0) return base;
  return `(${unread > 99 ? "99+" : unread}) ${base}`;
}

/**
 * Headless: keeps the unread-chat count in the browser tab title and
 * plays the optional soft sound when a chat newly turns unread.
 */
export function UnreadTitle() {
  const { totalUnread } = useShell();
  const pathname = usePathname();
  const [soundOn] = useSoundPref();
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const apply = () => {
      const next = withUnreadPrefix(document.title, totalUnread);
      if (document.title !== next) document.title = next;
    };
    apply();
    // Next rewrites <title> on navigation; re-apply the prefix after it.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [totalUnread, pathname]);

  useEffect(() => {
    // Skip the first value (initial load) — only *new* unread chats ping.
    if (previous.current !== null && totalUnread > previous.current && soundOn) {
      playMessageSound();
    }
    previous.current = totalUnread;
  }, [totalUnread, soundOn]);

  return null;
}
