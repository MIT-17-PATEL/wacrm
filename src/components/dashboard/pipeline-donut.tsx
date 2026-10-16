"use client"

import { useTranslations } from 'next-intl'

import type { PipelineDonutData } from '@/lib/dashboard/types'
import { formatCurrencyShort } from '@/lib/currency'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from './skeleton'

interface PipelineDonutProps {
  data: PipelineDonutData | null
  loading: boolean
  /** Account default currency for the totals. */
  currency: string
}

/**
 * "Pipeline value by stage" — a stage dot (the stage's own colour) and a
 * thin neutral bar per stage, widths relative to the biggest stage.
 * (Kept under its historical name so the page wiring is unchanged.)
 */
export function PipelineDonut({ data, loading, currency }: PipelineDonutProps) {
  const t = useTranslations('Dashboard.pipelineDonut')
  const max = Math.max(1, ...(data?.stages.map((s) => s.totalValue) ?? [0]))

  return (
    <section className="surface surface-hover flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">{t('title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('description')}</p>
          </div>
        </div>
        {data && data.stages.length > 0 ? (
          <div className="text-right">
            <p className="text-[11px] font-medium text-muted-foreground">{t('total')}</p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {formatCurrencyShort(data.totalValue, currency)}
            </p>
          </div>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col p-5">
        {loading || !data ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : data.stages.length === 0 ? (
          <EmptyState
            compact
            illustration="pipeline"
            title={t('noOpenDeals')}
            description={t('noOpenDealsHint')}
          />
        ) : (
          <ul className="space-y-4" aria-label={t('ariaLabel')}>
            {data.stages.map((s) => {
              const pct = Math.max(3, (s.totalValue / max) * 100)
              return (
                <li key={s.id}>
                  <div className="mb-1.5 flex items-center gap-2 text-[13px]">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      // Stage colour is user data (chosen per stage in Pipelines).
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="flex-1 truncate text-foreground">{s.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t('dealCount', { count: s.dealCount })}
                    </span>
                    <span className="w-20 text-right font-medium text-foreground tabular-nums">
                      {formatCurrencyShort(s.totalValue, currency)}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-2" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
