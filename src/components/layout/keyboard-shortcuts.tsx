"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useShell } from "@/components/layout/shell-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GOTO_SHORTCUTS, RAIL_ITEMS } from "@/lib/nav";

/** True when a key press belongs to a text field, not to app shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range"].includes(type);
  }
  return false;
}

/** Pending "G" waits this long for the second key. */
const SEQUENCE_MS = 1200;

/**
 * Headless global shortcuts: "G then I/C/P/B/A/D/N/S" jumps to a module,
 * "?" opens the help sheet. Ctrl+K (palette) and Ctrl+B (panel) live
 * with their owners.
 */
export function GlobalShortcuts() {
  const router = useRouter();
  const { setShortcutsOpen } = useShell();
  const pendingG = useRef<number>(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      // Leave keys alone while a dialog/menu owns focus.
      if (document.querySelector("[role=dialog][data-open], [role=menu]")) return;

      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      const key = e.key.toLowerCase();
      if (pendingG.current && Date.now() - pendingG.current < SEQUENCE_MS) {
        pendingG.current = 0;
        const href = GOTO_SHORTCUTS[key];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      if (key === "g" && !e.shiftKey) pendingG.current = Date.now();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, setShortcutsOpen]);

  return null;
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="min-w-6 rounded border border-border-strong bg-card-2 px-1.5 py-0.5 text-center font-sans text-[11px] text-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** The "?" help sheet listing every shortcut. */
export function ShortcutsSheet() {
  const t = useTranslations("Shell.shortcutsSheet");
  const tn = useTranslations("Nav");
  const { shortcutsOpen, setShortcutsOpen } = useShell();

  const groups: { title: string; rows: { label: string; keys: string[] }[] }[] = [
    {
      title: t("general"),
      rows: [
        { label: t("palette"), keys: ["Ctrl", "K"] },
        { label: t("togglePanel"), keys: ["Ctrl", "B"] },
        { label: t("closePanels"), keys: ["Esc"] },
        { label: t("help"), keys: ["?"] },
      ],
    },
    {
      title: t("goTo"),
      rows: [
        ...RAIL_ITEMS.map((i) => ({
          label: i.key === "automate" ? tn("groups.automate") : tn(`items.${i.key}`),
          keys: ["G", i.shortcut.toUpperCase()],
        })),
        { label: tn("items.notifications"), keys: ["G", "N"] },
        { label: tn("items.settings"), keys: ["G", "S"] },
      ],
    },
    {
      title: tn("items.inbox"),
      rows: [
        { label: t("nextChat"), keys: ["↑", "↓"] },
        { label: t("openChat"), keys: ["Enter"] },
        { label: t("quickReplies"), keys: ["/"] },
        { label: t("send"), keys: ["Enter"] },
        { label: t("newLine"), keys: ["Shift", "Enter"] },
      ],
    },
  ];

  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-5 overflow-y-auto sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className={g.rows.length > 5 ? "sm:row-span-2" : undefined}>
              <h3 className="mb-2 text-[11px] font-medium tracking-[0.06em] text-faint uppercase">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.rows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
                    <span className="truncate">{r.label}</span>
                    <Keys keys={r.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
