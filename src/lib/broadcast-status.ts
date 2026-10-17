/**
 * Shared status badge config for broadcasts + recipients.
 *
 * Previously `statusConfig` was defined inline in both
 * /broadcasts/page.tsx and /broadcasts/[id]/page.tsx with slight
 * drift risk. One source of truth now.
 *
 * Badge shape: bg-<token>/10 + text-<token> + border-<token>/20, using
 * the semantic design tokens (success / warning / danger / info / ai),
 * which are tuned per mode so labels stay AA-legible in light and dark.
 */

import type { BroadcastStatus, RecipientStatus } from "@/types";

export interface StatusDisplay {
  label: string;
  classes: string;
  /**
   * Set true for statuses that should pulse in the UI to convey
   * "live / in-flight" — currently only `sending`.
   */
  pulse?: boolean;
}

export const broadcastStatusConfig: Record<BroadcastStatus, StatusDisplay> = {
  draft: {
    label: "draft",
    classes: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
  },
  scheduled: {
    label: "scheduled",
    classes: "bg-info/10 text-info border-info/20",
  },
  sending: {
    label: "sending",
    classes: "bg-warning/10 text-warning border-warning/20",
    pulse: true,
  },
  sent: {
    label: "sent",
    classes: "bg-success/10 text-success border-success/20",
  },
  failed: {
    label: "failed",
    classes: "bg-danger/10 text-danger border-danger/20",
  },
};

export const recipientStatusConfig: Record<RecipientStatus, StatusDisplay> = {
  pending: {
    label: "pending",
    classes: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
  },
  sent: {
    label: "sent",
    classes: "bg-info/10 text-info border-info/20",
  },
  delivered: {
    label: "delivered",
    classes: "bg-success/10 text-success border-success/20",
  },
  read: {
    label: "read",
    classes: "bg-success/10 text-success border-success/20",
  },
  replied: {
    label: "replied",
    classes: "bg-muted text-muted-foreground border-border",
  },
  failed: {
    label: "failed",
    classes: "bg-danger/10 text-danger border-danger/20",
  },
};

/**
 * Tolerant lookup — callers often have a generic string status
 * coming from Supabase. Falls back to the "draft" / "pending"
 * entry so the UI never crashes on an unknown value.
 */
export function getBroadcastStatus(status: string): StatusDisplay {
  return (
    broadcastStatusConfig[status as BroadcastStatus] ??
    broadcastStatusConfig.draft
  );
}

export function getRecipientStatus(status: string): StatusDisplay {
  return (
    recipientStatusConfig[status as RecipientStatus] ??
    recipientStatusConfig.pending
  );
}

/** The three groups the Broadcasts context panel lists. */
export type BroadcastBucket = "drafts" | "scheduled" | "sent";
export const BROADCAST_BUCKETS: BroadcastBucket[] = ["drafts", "scheduled", "sent"];

/** Sending and failed runs live under "Sent" — they have left the drafts. */
export function broadcastBucket(status: BroadcastStatus | string): BroadcastBucket {
  if (status === "draft") return "drafts";
  if (status === "scheduled") return "scheduled";
  return "sent";
}

export function isBroadcastBucket(value: string | null): value is BroadcastBucket {
  return value === "drafts" || value === "scheduled" || value === "sent";
}
