"use client"

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { DOW_SHORT_MON_FIRST } from '@/lib/dashboard/date-utils'
import type { ResponseTimeSummary } from '@/lib/dashboard/types'
import { EmptyState } from '@/components/ui/empty-state'
import { TrendChip } from '@/components/ui/trend-chip'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

interface ResponseTimeChartProps {
  data: ResponseTimeSummary | null
  loading: boolean
  /** Minutes. Drawn as a dashed target line across the bars. */
  thresholdMinutes?: number
}

const VB_W = 700
const VB_H = 220
const PAD = { top: 14, right: 12, bottom: 26, left: 40 }

/**
 * Average first-response time per weekday: neutral bars (warning colour
 * only when over target), a dashed target line and a hover tooltip. Hand-rolled SVG — 7 bars don't need a chart library.
 */
export function ResponseTimeChart({
  data,
  loading,
  thresholdMinutes = 5,
}: ResponseTimeChartProps) {
  const t = useTranslations('Dashboard.responseTimeChart')
  const format = useFormatter()
  const [hover, setHover] = useState<number | null>(null)
  const hasData = data?.buckets.some((b) => b.avgMinutes != null) ?? false

  const days =
    data?.buckets.map(
      (_, i) =>
        // 2024-01-01 was a Monday — format Monday-first weekdays in the UI locale.
        format.dateTime(new Date(Date.UTC(2024, 0, 1 + i)), {
          weekday: 'short',
          timeZone: 'UTC',
        }) || DOW_SHORT_MON_FIRST[i],
    ) ?? []

  const delta =
    data?.thisWeekAvg != null && data.lastWeekAvg != null
      ? data.thisWeekAvg - data.lastWeekAvg
      : null

  return (
    <section className="surface surface-hover flex h-full flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">{t('title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('description')}</p>
          </div>
        </div>
        {data && (data.thisWeekAvg != null || data.lastWeekAvg != null) ? (
          <div className="text-right text-xs">
            <p className="text-muted-foreground">
              {t('thisWeek')}{' '}
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {fmt(data.thisWeekAvg)}
              </span>
            </p>
            <div className="mt-1 flex items-center justify-end gap-2 text-muted-foreground">
              <span>
                {t('lastWeek')} <span className="tabular-nums">{fmt(data.lastWeekAvg)}</span>
              </span>
              {delta != null ? (
                <TrendChip sign={Math.sign(delta)} label={fmt(Math.abs(delta))} invert />
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      <div className="flex-1 p-5">
        {loading || !data ? (
          <Skeleton className="h-[220px] w-full" />
        ) : !hasData ? (
          <EmptyState
            compact
            illustration="chat"
            title={t('noReplies')}
            description={t('noRepliesHint')}
          />
        ) : (
          <Bars
            data={data}
            days={days}
            threshold={thresholdMinutes}
            hover={hover}
            onHover={setHover}
            targetLabel={t('target', { minutes: thresholdMinutes })}
            ariaLabel={t('title')}
          />
        )}
      </div>
    </section>
  )
}

function Bars({
  data,
  days,
  threshold,
  hover,
  onHover,
  targetLabel,
  ariaLabel,
}: {
  data: ResponseTimeSummary
  days: string[]
  threshold: number
  hover: number | null
  onHover: (i: number | null) => void
  targetLabel: string
  ariaLabel: string
}) {
  const values = data.buckets.map((b) => b.avgMinutes)
  const max = Math.max(threshold * 1.4, ...values.map((v) => v ?? 0))
  const ceil = Math.ceil(max / 5) * 5 || 5
  const chartW = VB_W - PAD.left - PAD.right
  const chartH = VB_H - PAD.top - PAD.bottom
  const slot = chartW / values.length
  const barW = Math.min(44, slot * 0.56)
  const yFor = (v: number) => PAD.top + chartH - (v / ceil) * chartH
  const ticks = [0, ceil / 2, ceil]
  const targetY = yFor(threshold)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        // h-auto keeps the viewBox aspect so the tooltip % lines up.
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => onHover(null)}
      >

        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="var(--border-strong)"
              strokeDasharray="2 4"
            />
            <text
              x={PAD.left - 8}
              y={yFor(v)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {v}m
            </text>
          </g>
        ))}

        {values.map((v, i) => {
          const cx = PAD.left + slot * i + slot / 2
          const h = v == null ? 0 : Math.max(4, PAD.top + chartH - yFor(v))
          const over = v != null && v > threshold
          return (
            <g key={i} onMouseEnter={() => onHover(i)}>
              {/* Full-height hit area */}
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={chartH} fill="transparent" />
              <rect
                x={cx - barW / 2}
                y={PAD.top}
                width={barW}
                height={chartH}
                rx={4}
                fill="var(--muted)"
                opacity={hover === i ? 0.9 : 0.45}
              />
              {v != null ? (
                <rect
                  x={cx - barW / 2}
                  y={PAD.top + chartH - h}
                  width={barW}
                  height={h}
                  rx={4}
                  fill={over ? 'var(--warning)' : 'var(--chart-3)'}
                  className="transition-opacity"
                  opacity={hover == null || hover === i ? 1 : 0.55}
                />
              ) : null}
              <text
                x={cx}
                y={VB_H - 6}
                textAnchor="middle"
                className={cn('text-[11px]', hover === i ? 'fill-foreground' : 'fill-muted-foreground')}
              >
                {days[i]}
              </text>
            </g>
          )
        })}

        {/* Target line */}
        <line
          x1={PAD.left}
          x2={VB_W - PAD.right}
          y1={targetY}
          y2={targetY}
          stroke="var(--faint)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={VB_W - PAD.right}
          y={targetY - 6}
          textAnchor="end"
          className="fill-muted-foreground text-[11px]"
        >
          {targetLabel}
        </text>
      </svg>

      {hover != null ? (
        <div
          className="bg-popover pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-border-strong px-3 py-2 text-xs shadow-raised"
          style={{ left: `${((PAD.left + slot * hover + slot / 2) / VB_W) * 100}%` }}
        >
          <p className="font-semibold text-foreground">{days[hover]}</p>
          <p className="text-muted-foreground tabular-nums">
            {fmt(values[hover])} · {data.buckets[hover].samples}×
          </p>
        </div>
      ) : null}
    </div>
  )
}

function fmt(mins: number | null): string {
  if (mins == null) return '—'
  if (mins < 1) return `${Math.max(1, Math.round(mins * 60))}s`
  if (mins < 60) return `${mins.toFixed(1)}m`
  return `${(mins / 60).toFixed(1)}h`
}
