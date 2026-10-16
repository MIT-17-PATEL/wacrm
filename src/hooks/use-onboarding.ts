"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useWhatsAppStatus } from "@/hooks/use-whatsapp-status";
import { createClient } from "@/lib/supabase/client";

export type OnboardingStep =
  | "whatsapp"
  | "contacts"
  | "template"
  | "automation"
  | "agent";

export interface OnboardingState {
  loading: boolean;
  done: Record<OnboardingStep, boolean>;
}

/**
 * Progress for the dashboard's "Getting started" checklist. Each step
 * is a cheap existence check (head-only count, RLS-scoped to the
 * caller's account) — nothing is written.
 */
export function useOnboarding(): OnboardingState {
  const { accountId } = useAuth();
  const wa = useWhatsAppStatus();
  const [counts, setCounts] = useState<{
    accountId: string;
    contacts: boolean;
    template: boolean;
    automation: boolean;
    agent: boolean;
  } | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const db = createClient();
    let cancelled = false;
    // Each step is a real existence check scoped to this workspace —
    // a step is only "done" when the thing actually exists.
    const exists = async (table: string, filters: Record<string, unknown> = {}) => {
      let q = db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId);
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      const { count, error } = await q;
      return !error && (count ?? 0) > 0;
    };
    void Promise.all([
      exists("contacts"),
      exists("message_templates"),
      exists("automations"),
      // The AI agent counts once it's switched on, not merely saved.
      exists("ai_configs", { is_active: true }),
    ]).then(([contacts, template, automation, agent]) => {
      if (!cancelled) setCounts({ accountId, contacts, template, automation, agent });
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const fresh = counts && counts.accountId === accountId ? counts : null;
  return {
    loading: !fresh || wa === "loading",
    done: {
      whatsapp: wa === "connected",
      contacts: fresh?.contacts ?? false,
      template: fresh?.template ?? false,
      automation: fresh?.automation ?? false,
      agent: fresh?.agent ?? false,
    },
  };
}
