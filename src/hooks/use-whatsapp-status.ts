"use client";

import { useEffect, useId, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

export type WhatsAppStatus =
  | "loading"
  | "connected"
  | "disconnected"
  | "not_configured";

/**
 * Account-level WhatsApp connection state for the top-bar chip.
 *
 * Reads the stored `whatsapp_config.status` (the same column the inbox
 * banner uses) — a cheap row read, not a live Meta API round trip —
 * and keeps it fresh over realtime so saving/disconnecting in Settings
 * flips the chip without a reload.
 */
export function useWhatsAppStatus(): WhatsAppStatus {
  const { accountId } = useAuth();
  // Unique per hook instance — two callers mustn't share a channel topic.
  const instance = useId();
  const [state, setState] = useState<{
    accountId: string | null;
    status: WhatsAppStatus;
  }>({ accountId: null, status: "loading" });

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("whatsapp_config")
        .select("status")
        .eq("account_id", accountId)
        .maybeSingle();
      if (cancelled) return;
      const status: WhatsAppStatus = error
        ? "disconnected"
        : !data
          ? "not_configured"
          : data.status === "connected"
            ? "connected"
            : "disconnected";
      setState({ accountId, status });
    };
    void load();

    const channel = supabase
      .channel(`wa-status-${accountId}-${instance}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_config",
          filter: `account_id=eq.${accountId}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [accountId, instance]);

  // A stale value from a previous account reads as still loading.
  return state.accountId === accountId ? state.status : "loading";
}
