import { cn } from "@/lib/utils"

/**
 * Small muted change line ("+3 vs yesterday"). Only the arrow carries
 * colour: success when it's good, danger when it's bad. Set `invert`
 * for metrics where lower is better (e.g. response time).
 */
export function TrendChip({
  sign,
  label,
  invert = false,
  className,
}: {
  sign: number
  label: string
  invert?: boolean
  className?: string
}) {
  const good = invert ? sign < 0 : sign > 0
  const bad = invert ? sign > 0 : sign < 0
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums", className)}>
      <span aria-hidden className={cn(good && "text-success", bad && "text-danger")}>
        {sign > 0 ? "↑" : sign < 0 ? "↓" : "–"}
      </span>
      {label}
    </span>
  )
}
