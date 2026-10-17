import type { Conversation, ConversationStatus } from "@/types";

/** The inbox filter tabs. */
export type InboxView = "all" | "mine" | "unassigned" | "unread";
export const INBOX_VIEWS: InboxView[] = ["all", "mine", "unassigned", "unread"];

/** Secondary status filter (dropdown). */
export type StatusFilter = "any" | ConversationStatus;

export function matchesInboxView(c: Conversation, view: InboxView, userId: string | null): boolean {
  switch (view) {
    case "mine":
      return !!userId && c.assigned_agent_id === userId;
    case "unassigned":
      return !c.assigned_agent_id;
    case "unread":
      return c.unread_count > 0;
    default:
      return true;
  }
}

function time(c: Conversation): number {
  return c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
}

/** Pinned chats first, then newest message first — like WhatsApp. */
export function sortConversations(list: Conversation[], pinned: ReadonlySet<string>): Conversation[] {
  return [...list].sort((a, b) => {
    const pa = pinned.has(a.id) ? 1 : 0;
    const pb = pinned.has(b.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return time(b) - time(a);
  });
}

/** Moves a keyboard cursor through `ids`, clamped at the ends. */
export function stepCursor(ids: string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const at = current ? ids.indexOf(current) : -1;
  if (at === -1) return delta === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
}
