'use client';

import { Suspense, useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast } from '@/types';
import { Button, buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import { Megaphone, Plus, Users, Trash2, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { broadcastBucket, getBroadcastStatus, isBroadcastBucket } from '@/lib/broadcast-status';
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

// `useSearchParams` (`?status=`, set by the context panel) needs a
// Suspense boundary for static prerendering.
export default function BroadcastsPage() {
  return (
    <Suspense fallback={null}>
      <BroadcastsPageInner />
    </Suspense>
  );
}

function BroadcastsPageInner() {
  const router = useRouter();
  const statusParam = useSearchParams().get('status');
  const bucket = isBroadcastBucket(statusParam) ? statusParam : null;
  const t = useTranslations('Broadcasts.page');
  const tStatus = useTranslations('Broadcasts.status');
  const tGate = useTranslations('GatedButton');
  const format = useFormatter();
  const canCreate = useCan('send-messages');
  const confirm = useConfirm();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);

  // Used to kick off polling only while something is actively sending.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleDeleteSingle(broadcast: Broadcast, e?: React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (broadcast.status === 'sending') return;

    const isScheduled = broadcast.status === 'scheduled';
    const ok = await confirm({
      title: `Delete "${broadcast.name}"?`,
      description:
        "This removes the broadcast and its stats from Neno Connect. Messages already delivered stay on customers' phones and in the Inbox.",
      confirmLabel: isScheduled ? 'Cancel & delete' : 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    // Optimistic UI: card fades out and is removed immediately
    const previousBroadcasts = [...broadcasts];
    setBroadcasts((prev) => prev.filter((b) => b.id !== broadcast.id));
    setDeletingIds((prev) => new Set(prev).add(broadcast.id));
    toast.success('Broadcast deleted');

    try {
      const res = await fetch(`/api/whatsapp/broadcast/${broadcast.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to delete broadcast');
      }
    } catch (err) {
      // Revert if failed
      setBroadcasts(previousBroadcasts);
      toast.error(err instanceof Error ? err.message : 'Failed to delete broadcast');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(broadcast.id);
        return next;
      });
    }
  }

  async function handleBulkDelete() {
    const idsToDelete = Array.from(selectedIds).filter((id) => {
      const b = broadcasts.find((item) => item.id === id);
      return b && b.status !== 'sending';
    });
    if (idsToDelete.length === 0) return;

    const ok = await confirm({
      title: `Delete ${idsToDelete.length} broadcast${idsToDelete.length > 1 ? 's' : ''}?`,
      description:
        "This removes the selected broadcasts and their stats from Neno Connect. Messages already delivered stay on customers' phones and in the Inbox.",
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    const previousBroadcasts = [...broadcasts];
    setBroadcasts((prev) => prev.filter((b) => !idsToDelete.includes(b.id)));
    setSelectedIds(new Set());
    setIsSelecting(false);
    toast.success(`${idsToDelete.length} broadcast${idsToDelete.length > 1 ? 's' : ''} deleted`);

    try {
      const results = await Promise.all(
        idsToDelete.map((id) =>
          fetch(`/api/whatsapp/broadcast/${id}`, { method: 'DELETE' }).then((r) => r.ok)
        )
      );
      if (results.some((r) => !r)) {
        throw new Error('Some broadcasts could not be deleted');
      }
    } catch (err) {
      setBroadcasts(previousBroadcasts);
      toast.error(err instanceof Error ? err.message : 'Failed to delete some broadcasts');
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  const visible = useMemo(
    () => (bucket ? broadcasts.filter((b) => broadcastBucket(b.status) === bucket) : broadcasts),
    [broadcasts, bucket],
  );

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
        title={bucket ? t(`bucket_${bucket}`) : t('title')}
        description={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            {broadcasts.length > 0 && (
              <Button
                variant={isSelecting ? 'soft' : 'outline'}
                size="sm"
                onClick={() => {
                  setIsSelecting((prev) => !prev);
                  if (isSelecting) setSelectedIds(new Set());
                }}
                className="border-border text-muted-foreground hover:bg-muted text-xs h-9 cursor-pointer"
              >
                {isSelecting ? 'Done' : 'Select'}
              </Button>
            )}
            <GatedButton
              canAct={canCreate}
              gateReason={tGate('reasons.createBroadcasts')}
              onClick={() => router.push('/broadcasts/new')}
            >
              <Plus className="h-4 w-4" />
              {t('newBroadcast')}
            </GatedButton>
          </div>
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
      ) : visible.length === 0 ? (
        <div className="surface">
          <EmptyState
            compact
            illustration="broadcast"
            title={t('bucketEmpty')}
            action={
              <Link href="/broadcasts" className={buttonVariants({ variant: 'outline' })}>
                {t('showAll')}
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((broadcast) => {
            const status = getBroadcastStatus(broadcast.status);
            const total = broadcast.total_recipients;
            return (
              <Link
                key={broadcast.id}
                href={`/broadcasts/${broadcast.id}`}
                className={cn(
                  'surface surface-hover group relative flex flex-col gap-4 p-5 transition-all duration-300',
                  deletingIds.has(broadcast.id) && 'opacity-0 scale-95 pointer-events-none'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Bulk selection checkbox */}
                  {isSelecting && (
                    <button
                      type="button"
                      aria-label={selectedIds.has(broadcast.id) ? 'Deselect broadcast' : 'Select broadcast'}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleSelect(broadcast.id);
                      }}
                      className="mt-0.5 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                    >
                      {selectedIds.has(broadcast.id) ? (
                        <CheckSquare className="size-4 text-primary" />
                      ) : (
                        <Square className="size-4" />
                      )}
                    </button>
                  )}

                  <span className="icon-tile size-10 rounded-xl shrink-0">
                    <Megaphone className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{broadcast.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {broadcast.template_name}
                    </p>
                  </div>

                  {/* Top-Right: Status Badge + Delete Button */}
                  <div className="flex items-center gap-1.5 shrink-0">
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

                    <button
                      type="button"
                      aria-label="Delete broadcast"
                      disabled={broadcast.status === 'sending'}
                      title={
                        broadcast.status === 'sending'
                          ? "Can't delete while sending"
                          : 'Delete broadcast'
                      }
                      onClick={(e) => handleDeleteSingle(broadcast, e)}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-lg border border-transparent transition-all cursor-pointer',
                        'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100',
                        broadcast.status === 'sending'
                          ? 'cursor-not-allowed opacity-30 sm:opacity-30'
                          : 'text-muted-foreground hover:border-danger/30 hover:bg-danger/10 hover:text-danger'
                      )}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
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

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-border bg-popover/95 px-4 py-2.5 shadow-2xl backdrop-blur-md animate-in fade-in-0 slide-in-from-bottom-3 duration-200">
          <span className="text-xs font-medium text-foreground">
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Deselect
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleBulkDelete}
            className="h-7 text-xs gap-1.5 cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            Delete selected
          </Button>
        </div>
      )}
    </div>
  );
}
