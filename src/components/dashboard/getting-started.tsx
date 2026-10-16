"use client"

import Link from 'next/link'
import { Check, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useOnboarding, type OnboardingStep } from '@/hooks/use-onboarding'
import { cn } from '@/lib/utils'

const STEPS: Array<{ key: OnboardingStep; href: string }> = [
  { key: 'whatsapp', href: '/settings?tab=whatsapp' },
  { key: 'contacts', href: '/contacts' },
  { key: 'template', href: '/settings?tab=templates' },
  { key: 'automation', href: '/automations/new' },
  { key: 'agent', href: '/agents' },
]

/**
 * "Getting started" checklist for new accounts. Renders nothing while
 * loading (no layout jump) and disappears once every step is done.
 */
export function GettingStarted() {
  const t = useTranslations('Dashboard.gettingStarted')
  const { loading, done } = useOnboarding()
  if (loading) return null

  const completed = STEPS.filter((s) => done[s.key]).length
  if (completed === STEPS.length) return null
  const pct = Math.round((completed / STEPS.length) * 100)

  return (
    <section className="surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t('title')}</h2>
          <p className="text-[13px] text-muted-foreground">{t('subtitle')}</p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('progress', { done: completed, total: STEPS.length })}
        </span>
      </div>

      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('progress', { done: completed, total: STEPS.length })}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-3 divide-y divide-border">
        {STEPS.map((s) => {
          const isDone = done[s.key]
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                className="group flex items-center gap-3 py-2.5 text-sm transition-colors"
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border',
                    isDone ? 'border-transparent text-primary' : 'border-border-strong',
                  )}
                >
                  {isDone ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                </span>
                <span className={cn('flex-1', isDone ? 'text-muted-foreground' : 'text-foreground')}>
                  {t(`steps.${s.key}`)}
                </span>
                {!isDone ? (
                  <ChevronRight className="size-4 text-faint transition-colors group-hover:text-muted-foreground" />
                ) : null}
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
