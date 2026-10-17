"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import {
  INBOX_VIEWS,
  matchesInboxView,
  sortConversations,
  stepCursor,
  type InboxView,
  type StatusFilter,
} from "@/lib/inbox/list-view";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus, Tag } from "@/types";
import { Search, ChevronDown, X, Pin, PinOff } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isTypingTarget } from "@/components/layout/keyboard-shortcuts";
import { useAuth } from "@/hooks/use-auth";
import { usePinnedConversations } from "@/hooks/use-pinned-conversations";

/** Minimal teammate shape for the assignee avatar on each row. */
interface AssigneeProfile {
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
}

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
  /** Chats that just received a message — their row briefly highlights. */
  freshIds?: ReadonlySet<string>;
  /** ↑/↓/Enter navigation; off while the list is hidden (phone chat view). */
  keyboardNav?: boolean;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-success",
  pending: "bg-warning",
  closed: "bg-muted-foreground",
};

const STATUS_OPTIONS: StatusFilter[] = ["any", "open", "pending", "closed"];
const VIEW_LABEL: Record<InboxView, string> = {
  all: "filterAll",
  mine: "filterMine",
  unassigned: "filterUnassigned",
  unread: "filterUnread",
};
const NO_FRESH: ReadonlySet<string> = new Set();

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
  freshIds = NO_FRESH,
  keyboardNav = true,
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [pinned, togglePin] = usePinnedConversations(userId);

  const [search, setSearch] = useState("");
  const [view, setView] = useState<InboxView>("all");
  const [status, setStatus] = useState<StatusFilter>("any");
  const [loading, setLoading] = useState(true);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  // Keyboard cursor (↑/↓); Enter opens it. Falls back to the open chat.
  const [cursorId, setCursorId] = useState<string | null>(null);

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  // Tag definitions for the filter picker — loaded once so labels/colours
  // stay stable regardless of which conversations happen to be loaded.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Teammates, for the assignee avatar on each row (RLS-scoped).
  const [assignees, setAssignees] = useState<Map<string, AssigneeProfile>>(new Map());
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url");
      if (cancelled || !data) return;
      setAssignees(new Map((data as AssigneeProfile[]).map((p) => [p.user_id, p])));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ticks once a minute so the 24h-window chips count down.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Company options are derived from the loaded conversations — there's no
  // separate companies table, and only companies with a live conversation
  // are worth offering as an inbox filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const unreadCount = useMemo(
    () => conversations.filter((c) => c.unread_count > 0).length,
    [conversations],
  );

  const filtered = useMemo(() => {
    let result = conversations.filter((c) => matchesInboxView(c, view, userId));
    if (status !== "any") result = result.filter((c) => c.status === status);

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return sortConversations(result, pinned);
  }, [conversations, view, status, userId, search, selectedTagIds, selectedCompany, pinned]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
    setStatus("any");
    setView("all");
    setSearch("");
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  // ↑/↓ move the cursor through the visible chats, Enter opens it —
  // anywhere on the inbox page except while typing.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!keyboardNav) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector("[role=dialog][data-open], [role=menu]")) return;
      const ids = filtered.map((c) => c.id);
      const current = cursorId && ids.includes(cursorId) ? cursorId : activeConversationId;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = stepCursor(ids, current, e.key === "ArrowDown" ? 1 : -1);
        setCursorId(next);
        if (next) {
          listRef.current
            ?.querySelector(`[data-conv-id="${next}"]`)
            ?.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "Enter" && current) {
        const conv = filtered.find((c) => c.id === current);
        if (conv) {
          e.preventDefault();
          onSelect(conv);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardNav, filtered, cursorId, activeConversationId, onSelect]);

  const handleSelect = useCallback(
    (conv: Conversation) => {
      setCursorId(conv.id);
      onSelect(conv);
    },
    [onSelect]
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Search + Filter */}
      <div className="space-y-2 border-b border-border px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-9 rounded-lg pl-9 text-[13px]"
          />
        </div>

        {/* All / Mine / Unassigned / Unread — one tap each. */}
        <div role="tablist" aria-label={t("filterLabel")} className="grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5">
          {INBOX_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition-colors duration-150",
                view === v
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{t(VIEW_LABEL[v])}</span>
              {v === "unread" && unreadCount > 0 ? (
                <span className="text-[10px] text-muted-foreground tabular-nums">{unreadCount}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs hover:bg-muted",
                status !== "any" ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {status === "any" ? t("status") : t(`status_${status}`)}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 border-border bg-popover">
              {STATUS_OPTIONS.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn("text-sm", status === s ? "text-primary" : "text-popover-foreground")}
                >
                  {s === "any" ? (
                    t("anyStatus")
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", STATUS_COLORS[s])} />
                      {t(`status_${s}`)}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedTagIds.length > 0
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("tags")}
                {selectedTagIds.length > 0 && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {selectedTagIds.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                {tags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={selectedTagIds.includes(t.id)}
                    onCheckedChange={() => toggleTag(t.id)}
                    className="text-sm text-popover-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate">{t.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex max-w-40 items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedCompany
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="truncate">{selectedCompany ?? t("company")}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    "text-sm",
                    selectedCompany === null
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {t("allCompanies")}
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      "text-sm",
                      selectedCompany === co
                        ? "text-primary"
                        : "text-popover-foreground"
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasContactFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag?.color ?? "var(--muted-foreground)" }}
                  />
                  <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                onClick={() => setSelectedCompany(null)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearContactFilters}
              className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("clearAll")}
            </button>
          </div>
        )}
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="space-y-1 p-2" aria-busy>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-3" style={{ opacity: 1 - i * 0.1 }}>
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2 pt-1">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            illustration={conversations.length === 0 ? "chat" : "search"}
            title={conversations.length === 0 ? t("noConversations") : t("noMatches")}
            action={
              conversations.length > 0 ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-[13px] font-medium text-primary hover:underline"
                >
                  {t("clearFilters")}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div ref={listRef} className="flex flex-col gap-0.5 p-2">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                isCursor={conv.id === cursorId && conv.id !== activeConversationId}
                isPinned={pinned.has(conv.id)}
                isFresh={freshIds.has(conv.id)}
                onSelect={handleSelect}
                onTogglePin={togglePin}
                t={t}
                assignee={
                  conv.assigned_agent_id ? (assignees.get(conv.assigned_agent_id) ?? null) : null
                }
                now={now}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  /** Keyboard cursor (↑/↓) sits here. */
  isCursor: boolean;
  isPinned: boolean;
  /** Just received a message — play the row highlight. */
  isFresh: boolean;
  onSelect: (conversation: Conversation) => void;
  onTogglePin: (conversationId: string) => void;
  t: ReturnType<typeof useTranslations>;
  assignee: AssigneeProfile | null;
  /** Current time (ms), ticked by the list so items stay pure. */
  now: number;
}

/**
 * Time left in WhatsApp's 24-hour customer-service window. Only
 * knowable from the list row when the latest message is the
 * customer's (unread > 0) — then the window runs from last_message_at.
 */
function windowLeft(conversation: Conversation, now: number): number | null {
  if (conversation.unread_count <= 0 || !conversation.last_message_at) return null;
  const elapsed = now - new Date(conversation.last_message_at).getTime();
  return 24 * 60 * 60 * 1000 - elapsed;
}

function ConversationItem({
  conversation,
  isActive,
  isCursor,
  isPinned,
  isFresh,
  onSelect,
  onTogglePin,
  t,
  assignee,
  now,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");
  const unread = conversation.unread_count > 0;
  const tags = contact?.tags ?? [];
  const left = windowLeft(conversation, now);

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNowStrict(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : "";

  return (
    <div
      data-conv-id={conversation.id}
      className={cn(
        "group relative rounded-lg transition-colors duration-150",
        isActive ? "bg-accent" : "hover:bg-accent/50",
        isCursor && "ring-1 ring-border-strong",
      )}
    >
      {/* Keyed on the message time so a new message replays the flash. */}
      {isFresh && !isActive ? (
        <span
          key={conversation.last_message_at}
          aria-hidden
          className="animate-row-flash pointer-events-none absolute inset-0 rounded-lg"
        />
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        aria-current={isActive ? "true" : undefined}
        className="relative flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left"
      >
        <span className="relative">
          <ContactAvatar
            name={displayName}
            seed={contact?.id ?? displayName}
            src={contact?.avatar_url}
          />
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card",
              STATUS_COLORS[conversation.status],
            )}
            title={t(`status_${conversation.status}`)}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "flex min-w-0 items-center gap-1 truncate text-sm text-foreground",
                unread ? "font-semibold" : "font-medium",
              )}
            >
              <span className="truncate">{displayName}</span>
              {isPinned ? (
                <Pin aria-label={t("pinned")} className="size-3 shrink-0 rotate-45 text-muted-foreground" />
              ) : null}
            </span>
            <span
              className={cn(
                "shrink-0 text-[11px] tabular-nums transition-opacity duration-150 group-hover:opacity-0",
                unread ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {timeAgo}
            </span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={cn(
                "truncate text-[13px]",
                unread ? "text-foreground/85" : "text-muted-foreground",
              )}
            >
              {conversation.last_message_text || t("noMessagesYet")}
            </span>
            {unread ? (
              <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
                {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
              </span>
            ) : null}
          </span>

          {tags.length > 0 || left !== null || assignee ? (
            <span className="mt-2 flex items-center gap-1.5">
              {left !== null ? <WindowChip ms={left} t={t} /> : null}
              {tags.slice(0, 2).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex max-w-24 items-center gap-1 truncate rounded border border-border px-1 text-[11px] text-muted-foreground"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    // Tag colour is user data, picked per tag in Settings.
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="truncate">{tag.name}</span>
                </span>
              ))}
              {tags.length > 2 ? (
                <span className="text-[10px] font-medium text-muted-foreground">
                  +{tags.length - 2}
                </span>
              ) : null}
              {assignee ? (
                <span className="ml-auto" title={t("assignedTo", { name: assignee.full_name })}>
                  <ContactAvatar
                    name={assignee.full_name || "?"}
                    seed={assignee.user_id}
                    src={assignee.avatar_url}
                    size="xs"
                    className="size-5 text-[9px]"
                  />
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </button>

      {/* Pin / unpin — shows on hover or keyboard focus, over the time. */}
      <button
        type="button"
        onClick={() => onTogglePin(conversation.id)}
        aria-label={isPinned ? t("unpin") : t("pin")}
        title={isPinned ? t("unpin") : t("pin")}
        className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-card hover:text-foreground focus-visible:opacity-100"
      >
        {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
      </button>
    </div>
  );
}

/** "18h left" chip — green, amber under 4h, red once the window has closed. */
function WindowChip({ ms, t }: { ms: number; t: ReturnType<typeof useTranslations> }) {
  const hours = ms / 3_600_000;
  const tone = hours <= 0 ? "tile-danger" : hours < 4 ? "tile-warning" : "tile-success";
  const label =
    hours <= 0
      ? t("windowClosed")
      : hours >= 1
        ? t("windowHours", { hours: Math.floor(hours) })
        : t("windowMinutes", { minutes: Math.max(1, Math.floor(hours * 60)) });
  return (
    <span
      className={cn(
        tone,
        "inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground",
      )}
      title={t("windowTitle")}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-tile" />
      {label}
    </span>
  );
}
