import type { ComponentType, ReactNode } from "react"

import { TrendChip } from "@/components/ui/trend-chip"
import { cn } from "@/lib/utils"

/**
 * Metric card: label, number (tabular numerals) and a small muted
 * change line. Pass `value` + `format`, or a pre-formatted `display`.
 */
export function StatCard({
  label,
  value,
  display,
  format = (n) => n.toLocaleString(),
  icon: Icon,
  trend,
  subtitle,
  className,
}: {
  label: ReactNode
  value?: number
  display?: string
  format?: (n: number) => string
  icon?: ComponentType<{ className?: string }>
  /** Kept for call-site compatibility; cards are neutral now. */
  tile?: string
  trend?: { sign: number; label: string; invert?: boolean }
  subtitle?: ReactNode
  /** Kept for call-site compatibility; no sparklines. */
  series?: number[]
  valueClassName?: string
  className?: string
}) {
  return (
    <div className={cn("surface p-4", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon ? <Icon className="size-3.5 text-faint" /> : null}
        {label}
      </div>
      <p className="mt-2 text-2xl leading-none font-semibold text-foreground tabular-nums">
        {value !== undefined ? format(value) : display}
      </p>
      <div className="mt-2 min-h-4 text-xs text-muted-foreground">
        {trend ? <TrendChip sign={trend.sign} label={trend.label} invert={trend.invert} /> : subtitle}
      </div>
    </div>
  )
}
