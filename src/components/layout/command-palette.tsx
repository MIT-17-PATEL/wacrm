"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  CornerDownLeft,
  Megaphone,
  MessagesSquare,
  Moon,
  Search,
  Sun,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Open/close state, shared by the top-bar trigger and Ctrl/⌘+K.        */
/* ------------------------------------------------------------------ */

const PaletteContext = createContext<{ open: () => void }>({ open: () => {} });

export function useCommandPalette() {
  return useContext(PaletteContext);
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open: () => setOpen(true) }), []);

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-(--overlay) data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
          <DialogPrimitive.Popup className="bg-popover fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border-strong shadow-raised outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            {open ? <PaletteBody onClose={() => setOpen(false)} /> : null}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </PaletteContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Palette body                                                         */
/* ------------------------------------------------------------------ */

type GroupKey = "pages" | "actions" | "conversations" | "contacts";

interface Entry {
  id: string;
  group: GroupKey;
  label: string;
  hint?: string;
  icon: LucideIcon;
  tile: string;
  run: () => void;
}

interface RemoteResults {
  query: string;
  conversations: Array<{ id: string; name: string; preview: string }>;
  contacts: Array<{ id: string; name: string; phone: string }>;
}

/** Strip characters that are syntax inside a PostgREST `or=(…)` filter. */
function sanitize(q: string) {
  return q.replace(/[%*,()\\]/g, " ").trim();
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const t = useTranslations("CommandPalette");
  const tn = useTranslations("Nav");
  const router = useRouter();
  const { mode, toggleMode } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<RemoteResults | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  // Debounced contact + conversation search (RLS scopes it to the
  // caller's account).
  const term = sanitize(query);
  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const like = `%${term}%`;
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, phone")
        .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .limit(6);
      const rows = (contacts ?? []) as Array<{ id: string; name: string | null; phone: string | null }>;
      let convs: Array<{ id: string; contact_id: string; last_message_text: string | null }> = [];
      if (rows.length) {
        const { data } = await supabase
          .from("conversations")
          .select("id, contact_id, last_message_text")
          .in(
            "contact_id",
            rows.map((r) => r.id),
          )
          .order("last_message_at", { ascending: false })
          .limit(6);
        convs = (data ?? []) as typeof convs;
      }
      if (cancelled) return;
      const nameOf = (id: string) => {
        const c = rows.find((r) => r.id === id);
        return c?.name || c?.phone || "";
      };
      setRemote({
        query: term,
        conversations: convs.map((c) => ({
          id: c.id,
          name: nameOf(c.contact_id),
          preview: c.last_message_text ?? "",
        })),
        contacts: rows.map((r) => ({
          id: r.id,
          name: r.name || r.phone || "",
          phone: r.phone ?? "",
        })),
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term]);

  const results = term.length >= 2 && remote?.query === term ? remote : null;
  const searching = term.length >= 2 && remote?.query !== term;

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (s: string) => !q || s.toLowerCase().includes(q);

    const pages: Entry[] = ALL_NAV_ITEMS.map((item) => ({
      id: `page-${item.module}`,
      group: "pages" as const,
      label: tn(`items.${item.module}`),
      hint: tn(`descriptions.${item.module}`),
      icon: item.icon,
      tile: item.tile,
      run: () => go(item.href),
    })).filter((e) => matches(`${e.label} ${e.hint}`));

    const nextMode = mode === "dark" ? "light" : "dark";
    const actions: Entry[] = [
      {
        id: "action-broadcast",
        group: "actions" as const,
        label: t("newBroadcast"),
        icon: Megaphone,
        tile: "",
        run: () => go("/broadcasts/new"),
      },
      {
        id: "action-automation",
        group: "actions" as const,
        label: t("newAutomation"),
        icon: Zap,
        tile: "",
        run: () => go("/automations/new"),
      },
      {
        id: "action-mode",
        group: "actions" as const,
        label: t("toggleMode", { mode: nextMode }),
        icon: nextMode === "dark" ? Moon : Sun,
        tile: "",
        run: () => {
          toggleMode();
          onClose();
        },
      },
    ].filter((e) => matches(e.label));

    const conversations: Entry[] = (results?.conversations ?? []).map((c) => ({
      id: `conv-${c.id}`,
      group: "conversations" as const,
      label: c.name,
      hint: c.preview,
      icon: MessagesSquare,
      tile: "",
      run: () => go(`/inbox?c=${c.id}`),
    }));

    const contacts: Entry[] = (results?.contacts ?? []).map((c) => ({
      id: `contact-${c.id}`,
      group: "contacts" as const,
      label: c.name,
      hint: c.phone || t("noPhone"),
      icon: User,
      tile: "",
      run: () => go(`/contacts?q=${encodeURIComponent(c.name)}`),
    }));

    return [...pages, ...conversations, ...contacts, ...actions];
  }, [query, results, mode, tn, t, go, toggleMode, onClose]);

  const activeIndex = Math.min(active, Math.max(entries.length - 1, 0));
  const activeEntry = entries[activeIndex];

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!activeEntry) return;
    listRef.current
      ?.querySelector(`[data-entry="${activeEntry.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeEntry]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(entries.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + entries.length) % Math.max(entries.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activeEntry?.run();
    }
  };

  const groups: GroupKey[] = ["pages", "conversations", "contacts", "actions"];

  return (
    <div onKeyDown={onKeyDown}>
      <DialogPrimitive.Title className="sr-only">{t("title")}</DialogPrimitive.Title>
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder={t("placeholder")}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={activeEntry ? `${listId}-${activeEntry.id}` : undefined}
          aria-autocomplete="list"
          className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:block">
          Esc
        </kbd>
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={t("title")}
        className="max-h-[min(60vh,420px)] overflow-y-auto p-2"
      >
        {groups.map((g) => {
          const items = entries.filter((e) => e.group === g);
          if (!items.length) return null;
          return (
            <div key={g} role="group" aria-label={t(g)} className="mb-1">
              <p className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground ">
                {t(g)}
              </p>
              {items.map((entry) => {
                const Icon = entry.icon;
                const isActive = entry.id === activeEntry?.id;
                return (
                  <div
                    key={entry.id}
                    id={`${listId}-${entry.id}`}
                    data-entry={entry.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseMove={() => setActive(entries.indexOf(entry))}
                    onClick={entry.run}
                    className={cn(
                      entry.tile,
                      "flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2",
                      isActive ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="icon-tile size-8">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {entry.label}
                      </span>
                      {entry.hint ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {entry.hint}
                        </span>
                      ) : null}
                    </span>
                    {isActive ? (
                      <CornerDownLeft className="size-4 shrink-0 text-muted-foreground" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}

        {searching ? (
          <div className="space-y-2 p-2" aria-live="polite">
            <span className="sr-only">{t("searching")}</span>
            <div className="skeleton h-10" />
            <div className="skeleton h-10 opacity-70" />
          </div>
        ) : null}

        {!entries.length && !searching ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            {t("noResults", { query: query.trim() })}
          </p>
        ) : null}
      </div>

      <div className="hidden items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground sm:flex">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-border px-1">↑</kbd>
          <kbd className="rounded border border-border px-1">↓</kbd>
          {t("hintNavigate")}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-border px-1">↵</kbd>
          {t("hintOpen")}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-border px-1">Esc</kbd>
          {t("hintClose")}
        </span>
      </div>
    </div>
  );
}
