'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BarChart3,
  Bot,
  BookOpen,
  Check,
  Cpu,
  Hand,
  KeyRound,
  Rocket,
  Settings2,
  Sparkles,
  Smile,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';

type Tab = 'playground' | 'setup' | 'usage';

/** Subset of GET /api/ai/config the page reads for status + setup steps. */
interface AiConfigSummary {
  configured: boolean;
  has_key?: boolean;
  model?: string | null;
  system_prompt?: string | null;
  is_active?: boolean;
  auto_reply_enabled?: boolean;
  handoff_agent_id?: string | null;
}

type AgentStatus = 'not_set_up' | 'live' | 'paused';

export default function AgentsPage() {
  const t = useTranslations('Agents');
  const { accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  const [tab, setTab] = useState<Tab>('playground');
  const [decided, setDecided] = useState(false);
  const [config, setConfig] = useState<AiConfigSummary | null>(null);
  const [docCount, setDocCount] = useState<number | null>(null);

  // Land first-time users on Setup, returning users on the Playground.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, kb] = await Promise.all([
          fetch('/api/ai/config'),
          fetch('/api/ai/knowledge').catch(() => null),
        ]);
        const data = (await res.json().catch(() => ({}))) as AiConfigSummary;
        const kbData = kb && kb.ok ? await kb.json().catch(() => ({})) : {};
        if (cancelled) return;
        setConfig(data);
        setDocCount(Array.isArray(kbData?.documents) ? kbData.documents.length : null);
        setTab(data?.configured ? 'playground' : 'setup');
      } catch {
        if (!cancelled) setTab('setup');
      } finally {
        if (!cancelled) setDecided(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const status: AgentStatus = !config?.configured
    ? 'not_set_up'
    : config.is_active
      ? 'live'
      : 'paused';

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground">
            <Bot className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[28px] leading-tight font-semibold sm:text-[32px]">
                {t('title')}
              </h2>
              {decided ? <StatusChip status={status} /> : null}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
          </div>
        </div>
      </section>

      {!decided ? (
        <div className="space-y-4" aria-busy>
          <Skeleton className="h-10 w-80 rounded-xl" />
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="playground">
              <Sparkles className="mr-1.5 h-4 w-4" /> {t('tabPlayground')}
            </TabsTrigger>
            <TabsTrigger value="setup">
              <Settings2 className="mr-1.5 h-4 w-4" /> {t('tabSetup')}
            </TabsTrigger>
            {canViewUsage && (
              <TabsTrigger value="usage">
                <BarChart3 className="mr-1.5 h-4 w-4" /> {t('tabUsage')}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="playground" className="mt-5">
            <AiPlayground onGoToSetup={() => setTab('setup')} />
          </TabsContent>

          <TabsContent value="setup" className="mt-5 space-y-5">
            <SetupSteps config={config} docCount={docCount} />
            <AiConfig />
          </TabsContent>

          {canViewUsage && (
            <TabsContent value="usage" className="mt-5">
              <AiUsageCard />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: AgentStatus }) {
  const t = useTranslations('Agents.status');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold',
        status === 'live' && 'text-success',
        status === 'paused' && 'text-warning',
        status === 'not_set_up' && 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          status === 'live' ? 'animate-pulse bg-success' : status === 'paused' ? 'bg-warning' : 'bg-faint',
        )}
      />
      {t(status)}
    </span>
  );
}

/**
 * Setup as six step cards, ticked from the saved config. The form
 * itself (below) is unchanged — these cards show where you are.
 */
function SetupSteps({
  config,
  docCount,
}: {
  config: AiConfigSummary | null;
  docCount: number | null;
}) {
  const t = useTranslations('Agents.steps');
  const steps = [
    { key: 'apiKey', icon: KeyRound, done: !!config?.has_key },
    { key: 'model', icon: Cpu, done: !!config?.model },
    { key: 'persona', icon: Smile, done: !!config?.system_prompt?.trim() },
    { key: 'knowledge', icon: BookOpen, done: (docCount ?? 0) > 0 },
    { key: 'handoff', icon: Hand, done: !!config?.handoff_agent_id },
    { key: 'goLive', icon: Rocket, done: !!config?.is_active },
  ] as const;
  const next = steps.find((s) => !s.done)?.key;

  return (
    <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <li
            key={s.key}
            className={cn(
              ' surface flex items-center gap-3 p-3',
              s.key === next && 'border-border-strong bg-muted',
            )}
          >
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                s.done ? 'bg-success text-white' : 'icon-tile rounded-full',
              )}
            >
              {s.done ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold text-muted-foreground ">
                {t('step', { n: i + 1 })}
              </span>
              <span className="block truncate text-sm font-semibold text-foreground">{t(s.key)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
