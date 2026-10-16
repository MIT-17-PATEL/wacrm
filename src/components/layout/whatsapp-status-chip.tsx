"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { useWhatsAppStatus } from "@/hooks/use-whatsapp-status";
import { cn } from "@/lib/utils";

/**
 * Top-bar pill: green dot "Connected" / red "Disconnected". Links to
 * Settings → WhatsApp so a broken connection is one click from fixed.
 */
export function WhatsAppStatusChip({ className }: { className?: string }) {
  const t = useTranslations("WhatsAppStatus");
  const status = useWhatsAppStatus();

  const meta = {
    loading: { label: t("checking"), tip: t("checking"), tone: "tile-neutral" },
    connected: { label: t("connected"), tip: t("tooltipConnected"), tone: "tile-success" },
    disconnected: { label: t("disconnected"), tip: t("tooltipDisconnected"), tone: "tile-danger" },
    not_configured: {
      label: t("notConfigured"),
      tip: t("tooltipNotConfigured"),
      tone: "tile-danger",
    },
  }[status];

  return (
    <Link
      href="/settings?tab=whatsapp"
      title={meta.tip}
      aria-label={`WhatsApp: ${meta.label}. ${meta.tip}`}
      className={cn(
        meta.tone,
        "inline-flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-tile", status === "loading" && "animate-pulse")} />
      <span className="hidden sm:inline">{meta.label}</span>
    </Link>
  );
}
