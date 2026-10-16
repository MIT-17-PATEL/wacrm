"use client";

import type { Deal, PipelineStage } from "@/types";
import { Calendar } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";

import { ContactAvatar } from "@/components/ui/contact-avatar";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  isOverlay?: boolean;
  /** 0–1 stage-based win probability (see pipeline-analytics). */
  probability?: number;
}

const DAY = 86_400_000;

export function DealCard({ deal, onEdit, isOverlay, probability }: DealCardProps) {
  const t = useTranslations("Pipelines.card");
  const format = useFormatter();
  const { defaultCurrency } = useAuth();
  // Re-renders hourly so "days in stage" stays honest on a long-open tab.
  const now = useNow({ updateInterval: 60 * 60 * 1000 });
  const contactLabel = deal.contact?.name || deal.contact?.phone || t("noContact");
  const assigneeLabel = deal.assignee?.full_name || null;
  // Moving a deal between stages bumps updated_at, so this is "days in
  // the current stage" at most (other edits can only make it smaller).
  const since = deal.updated_at ?? deal.created_at;
  const days = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / DAY));
  const pct = probability != null ? Math.round(probability * 100) : null;

  return (
    <button
      type="button"
      onClick={(e) => {
        // `onClick` still fires after a non-drag tap because the PointerSensor
        // requires 5px movement before it counts as a drag.
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(deal);
      }}
      className={cn(
        "w-full cursor-pointer rounded-lg border border-border bg-background p-2.5 text-left transition-colors",
        isOverlay ? "border-border-strong shadow-raised" : "hover:border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 text-[13px] leading-snug font-medium break-words text-foreground">
          {deal.title}
        </h4>
        {deal.status === "won" || deal.status === "lost" ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", deal.status === "won" ? "bg-success" : "bg-danger")}
            />
            {deal.status === "won" ? t("won") : t("lost")}
          </span>
        ) : null}
      </div>

      {/* Workspace currency — the setting in Settings → Deals & currency. */}
      <p className="mt-1 text-[13px] text-foreground tabular-nums">
        {formatCurrency(deal.value, defaultCurrency)}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        <ContactAvatar name={contactLabel} src={deal.contact?.avatar_url} size="xs" className="size-5 text-[9px]" />
        <span className="truncate text-xs text-muted-foreground">{contactLabel}</span>
        {assigneeLabel ? (
          <span className="ml-auto" title={assigneeLabel}>
            <ContactAvatar name={assigneeLabel} size="xs" className="size-5 text-[9px]" />
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint tabular-nums">
        <span title={t("daysInStageTitle")}>{t("daysInStage", { days })}</span>
        {deal.expected_close_date && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format.dateTime(new Date(deal.expected_close_date), { day: "numeric", month: "short" })}
          </span>
        )}
        {pct != null && deal.status !== "won" && deal.status !== "lost" ? (
          <span className="ml-auto" title={t("probabilityTitle")}>
            {pct}%
          </span>
        ) : null}
      </div>
    </button>
  );
}
