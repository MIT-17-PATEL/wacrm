"use client"

import { useCallback, useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { IndianRupee, MessagesSquare, Send, UserPlus, Wallet } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { personalFirstName } from '@/lib/display-name'
import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { StatCard } from '@/components/ui/stat-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { GettingStarted } from '@/components/dashboard/getting-started'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'

type RangeDays = 7 | 30 | 90

export default function DashboardPage() {
  const t = useTranslations('Dashboard.page')
  const { defaultCurrency } = useAuth()
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  const [range, setRange] = useState<RangeDays>(30)
  // Keep a cache per range so switching tabs doesn't re-fetch what we
  // already have. Ranges the user hasn't opened yet stay null and
  // trigger a fetch on first view.
  const [series, setSeries] = useState<Record<RangeDays, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()

    // Kick everything off in parallel. Each block has its own
    // setState + finally so a slow query doesn't hold up faster
    // sections — each widget shows its own skeleton independently.
    void loadMetrics(db)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

    // Fetch up to 50 so the biggest page-size option in the feed
    // (50 rows) is already in memory — switching sizes then becomes
    // a pure client-side slice with no extra round trip.
    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Range switch handler — kept in an event callback (not an effect)
  // so the setState calls stay out of the react-hooks/set-state-in-effect
  // rule's way. The cached bucket check means switching back to a
  // previously-viewed range is instant and doesn't re-fetch.
  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      if (series[r] !== null) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  const money = (n: number) => formatCurrency(n, defaultCurrency)

  return (
    <div className="space-y-6">
      <div>
        <Greeting />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricsLoading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-[104px]" />)
        ) : (
          <>
            <StatCard
              label={t('activeConversations')}
              value={metrics.activeConversations.current}
              icon={MessagesSquare}
              trend={trend(
                metrics.activeConversations.previous,
                t('newTodayVsYesterday'),
                t('noChange', { suffix: t('newTodayVsYesterday') }),
              )}
            />
            <StatCard
              label={t('newContactsToday')}
              value={metrics.newContactsToday.current}
              icon={UserPlus}
              trend={trend(
                metrics.newContactsToday.current - metrics.newContactsToday.previous,
                t('vsYesterday'),
                t('noChange', { suffix: t('vsYesterday') }),
              )}
            />
            <StatCard
              label={t('openDealsValue')}
              value={metrics.openDealsValue}
              format={money}
              icon={defaultCurrency === 'INR' ? IndianRupee : Wallet}
              subtitle={t('openDeals', { count: metrics.openDealsCount })}
            />
            <StatCard
              label={t('messagesSentToday')}
              value={metrics.messagesSentToday.current}
              icon={Send}
              trend={trend(
                metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                t('vsYesterday'),
                t('noChange', { suffix: t('vsYesterday') }),
              )}
            />
          </>
        )}
      </div>

      <div>
        <GettingStarted />
      </div>

      <div>
        <QuickActions />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full min-w-0 lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full min-w-0 lg:col-span-2">
          <PipelineDonut data={pipeline} loading={pipelineLoading} currency={defaultCurrency} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />
        </div>
        <div className="min-w-0">
          <ActivityFeed items={activity} loading={activityLoading} />
        </div>
      </div>
    </div>
  )
}

/**
 * Plain page header: "Good evening, Priya" + a muted date line.
 * Uses the signed-in person's own name — never the workspace name.
 */
function Greeting() {
  const t = useTranslations('Dashboard.greeting')
  const format = useFormatter()
  const { user, profile, account } = useAuth()
  const [now] = useState(() => new Date())

  const hour = now.getHours()
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const firstName = personalFirstName({
    metadataName:
      (user?.user_metadata?.full_name as string | undefined) ??
      (user?.user_metadata?.name as string | undefined),
    profileName: profile?.full_name,
    workspaceName: account?.name,
    email: profile?.email ?? user?.email,
  })

  return (
    <header>
      <h2 className="text-2xl leading-tight font-semibold text-foreground">
        {firstName ? t(part, { name: firstName }) : t(`${part}NoName`)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {format.dateTime(now, { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </header>
  )
}

function trend(delta: number, suffix: string, noChangeLabel: string) {
  if (delta === 0) return { sign: 0, label: noChangeLabel }
  const sign = delta > 0 ? '+' : ''
  return { sign: delta, label: `${sign}${delta.toLocaleString()} ${suffix}` }
}
