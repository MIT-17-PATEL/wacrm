'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast } from '@/types';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Megaphone, Plus, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { getBroadcastStatus } from '@/lib/broadcast-status';
import { useFormatter, useTranslations } from 'next-intl';

/**
 * Poll cadence while any broadcast is sending. Kept modest so we don't
 * beat on Supabase — the aggregate trigger in migration 003 keeps
 * counts consistent; we just need to surface the freshest snapshot.
 */
const POLL_INTERVAL_MS = 5_000;

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

/** Labelled progress bar for a delivery funnel step. */
function RateBar({
  label,
  value,
  total,
  tile,
}: {
  label: string;
  value: number;
  total: number;
  /** `tile-<accent>` class for the fill colour. */
  tile: string;
}) {
  const pct = percent(value, total);
  return (
    <div className={tile}>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground tabular-nums">
          {value.toLocaleString()} <span className="text-muted-foreground">· {pct}%</span>
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="bg-tile h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BroadcastsPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.page');
  const tStatus = useTranslations('Broadcasts.status');
  const tGate = useTranslations('GatedButton');
  const format = useFormatter();
  const canCreate = useCan('send-messages');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Used to kick off polling only while something is actively sending.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchBroadcasts() {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setBroadcasts(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts],
  );

  useEffect(() => {
    function startPolling() {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(fetchBroadcasts, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!pollTimer.current) return;
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    // Pause polling while the tab is hidden — keeps Supabase cold when
    // the user is away, and ensures a fresh fetch the moment they
    // refocus so they don't see stale data on return.
    function handleVisibilityChange() {
      if (!anySending) return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        fetchBroadcasts();
        startPolling();
      }
    }

    if (anySending && document.visibilityState === 'visible') {
      startPolling();
    } else {
      stopPolling();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [anySending]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-14 w-72 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top indeterminate progress bar: only visible while a broadcast
          is mid-send. Pure CSS animation so no extra deps. */}
      {anySending && (
        <div
          role="progressbar"
          aria-label={t('broadcastInProgress')}
          className="broadcast-indeterminate fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-muted"
        >
          <div className="broadcast-indeterminate-bar h-0.5 bg-primary" />
          <style jsx>{`
            .broadcast-indeterminate-bar {
              width: 33%;
              transform: translateX(-100%);
              animation: broadcast-slide 1.6s cubic-bezier(0.4, 0, 0.2, 1)
                infinite;
            }
            @keyframes broadcast-slide {
              0% {
                transform: translateX(-100%);
              }
              100% {
                transform: translateX(400%);
              }
            }
          `}</style>
        </div>
      )}

      <PageHeader
        tile=""
        icon={Megaphone}
        title={t('title')}
        description={t('subtitle')}
        actions={
          <GatedButton
            canAct={canCreate}
            gateReason={tGate('reasons.createBroadcasts')}
            onClick={() => router.push('/broadcasts/new')}
          >
            <Plus className="h-4 w-4" />
            {t('newBroadcast')}
          </GatedButton>
        }
      />

      {broadcasts.length === 0 ? (
        <div className="surface ">
          <EmptyState
            illustration="broadcast"
            title={t('noBroadcastsYet')}
            description={t('createFirst')}
            action={
              <GatedButton
                canAct={canCreate}
                gateReason={tGate('reasons.createBroadcasts')}
                onClick={() => router.push('/broadcasts/new')}
              >
                <Plus className="h-4 w-4" />
                {t('newBroadcast')}
              </GatedButton>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {broadcasts.map((broadcast) => {
            const status = getBroadcastStatus(broadcast.status);
            const total = broadcast.total_recipients;
            return (
              <Link
                key={broadcast.id}
                href={`/broadcasts/${broadcast.id}`}
                className="surface surface-hover group flex flex-col gap-4 p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="icon-tile size-10 rounded-xl">
                    <Megaphone className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{broadcast.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {broadcast.template_name}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.classes}`}
                  >
                    {status.pulse && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full hidden rounded-full bg-warning opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
                      </span>
                    )}
                    {tStatus(status.label)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    <span className="font-semibold text-foreground tabular-nums">
                      {total.toLocaleString()}
                    </span>
                    {t('table.recipients')}
                  </span>
                  <span className="ml-auto">
                    {format.dateTime(new Date(broadcast.scheduled_at ?? broadcast.created_at), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div className="space-y-2.5">
                  <RateBar label={t('table.delivery')} value={broadcast.delivered_count} total={total} tile="tile-success" />
                  <RateBar label={t('table.read')} value={broadcast.read_count} total={total} tile="tile-info" />
                  <RateBar label={t('replied')} value={broadcast.replied_count} total={total} tile="" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
