'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { ArrowRight, Lightbulb, Loader2, RotateCcw, Send, Sparkles, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PhoneMockup } from '@/components/ui/phone-mockup';
import { BRAND } from '@/lib/brand';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** assistant-only: the agent signalled a human handoff on this turn. */
  handoff?: boolean;
}

// Starter prompts shown as chips — tuned for the typical customer
// (real-estate agencies, local businesses). Keys under Agents.playground.starters.
const STARTERS = ['properties', 'price', 'visit', 'offers'] as const;

export function AiPlayground({ onGoToSetup }: { onGoToSetup?: () => void }) {
  const t = useTranslations('Agents.playground');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The scroll container is the phone's message list.
    const el = scrollRef.current?.parentElement;
    el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns, sending]);

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;

    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/ai/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send only role+content — the server ignores anything else.
        body: JSON.stringify({
          messages: next.map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'ai_not_configured') {
          toast.error(t('notConfigured'));
        } else {
          toast.error(data.error ?? t('noReply'));
        }
        // Roll the unsent user turn back so the transcript stays clean.
        setTurns(turns);
        setInput(text);
        return;
      }
      setTurns([
        ...next,
        {
          role: 'assistant',
          content:
            typeof data.reply === 'string' && data.reply.trim()
              ? data.reply
              : '',
          handoff: Boolean(data.handoff),
        },
      ]);
    } catch {
      toast.error(t('unreachable'));
      setTurns(turns);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* The customer's view: a phone chatting with your agent. */}
      <PhoneMockup
        title={BRAND.name}
        subtitle={t('subtitle')}
        className="lg:sticky lg:top-4"
        footer={
          <div className="flex items-end gap-1.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('placeholder')}
              aria-label={t('placeholder')}
              rows={1}
              className="max-h-24 min-h-9 flex-1 resize-none rounded-2xl border border-input bg-card px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
            <Button
              size="icon"
              onClick={() => void send()}
              disabled={!input.trim() || sending}
              aria-label={t('send')}
              className="size-9 shrink-0 rounded-full"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        }
      >
        <div ref={scrollRef} className="flex flex-1 flex-col gap-2">
          {turns.length === 0 && (
            <div className="m-auto max-w-[220px] text-center text-xs text-muted-foreground">
              <Sparkles className="text-muted-foreground mx-auto mb-2 size-6" />
              <p className="font-semibold text-foreground">{t('emptyTitle')}</p>
              <p className="mt-1">{t('emptyDesc')}</p>
            </div>
          )}

          {turns.map((turn, i) => (
            <div
              key={i}
              className={cn('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug',
                  turn.role === 'user'
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md border border-border bg-card text-foreground',
                )}
              >
                {turn.role === 'assistant' ? (
                  <span className="mb-1 inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-white ">
                    <Sparkles className="size-2.5" /> AI
                  </span>
                ) : null}
                {turn.content && <p className="whitespace-pre-wrap">{turn.content}</p>}
                {turn.role === 'assistant' && turn.handoff && (
                  <p
                    className={cn(
                      'tile-warning flex items-center gap-1 text-[11px] font-semibold text-tile',
                      turn.content && 'mt-1.5 border-t border-border pt-1.5',
                    )}
                  >
                    <UserRound className="h-3.5 w-3.5" />
                    {t('handoff')}
                  </p>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2.5" aria-label={t('thinking')}>
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="size-1.5 animate-pulse rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${d * 120}ms` }}
                  />
                ))}
              </span>
            </div>
          )}
        </div>
      </PhoneMockup>

      {/* Right: starter prompts + controls */}
      <div className="space-y-4">
        <div className="surface p-5">
          <div className="flex items-center gap-3">
            <span className="icon-tile size-9 rounded-xl">
              <Lightbulb className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground">{t('startersTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('startersHint')}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTurns([])}
              disabled={turns.length === 0 || sending}
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t('reset')}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {STARTERS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => void send(t(`starters.${key}`))}
                disabled={sending}
                className="rounded-full border border-border-strong bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-card-2 disabled:opacity-50"
              >
                {t(`starters.${key}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="surface p-5 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{t('howTitle')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t('howKnowledge')}</li>
            <li>{t('howHandoff')}</li>
            <li>{t('howSafe')}</li>
          </ul>
          {onGoToSetup && (
            <Button variant="link" size="sm" onClick={onGoToSetup} className="mt-2 h-auto p-0">
              {t('goToSetup')} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
