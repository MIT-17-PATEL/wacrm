'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Mirrors PublicMetaApp (lib/whatsapp/meta-app.ts) — no secret, ever. */
interface MetaAppView {
  configured: boolean;
  appId: string | null;
  secretLast4: string | null;
  secretUpdatedAt: string | null;
  previousSecretExpiresAt: string | null;
  webhookUrl: string;
  verifyToken: string;
  lastWebhookAt: string | null;
  tokenCheck: { status: 'ok' | 'mismatch' | 'error' | null; checkedAt: string | null };
  status: 'not_configured' | 'connected' | 'secret_invalid' | 'token_app_mismatch' | 'webhook_silent';
}

const STATUS_TONE: Record<MetaAppView['status'], string> = {
  not_configured: 'tile-neutral',
  connected: 'tile-success',
  secret_invalid: 'tile-danger',
  token_app_mismatch: 'tile-danger',
  webhook_silent: 'tile-warning',
};

/**
 * Settings › WhatsApp › Meta App. Owner/Admin only — the parent hides
 * it for other roles and the API refuses them (403) regardless.
 *
 * The App Secret is write-only: after saving, only "••••••••" + its last
 * 4 characters come back. "Replace secret" swaps in a new one (the old
 * one keeps verifying webhooks for 24h).
 */
export function MetaAppCard({ refreshKey }: { refreshKey?: string | null }) {
  const t = useTranslations('Settings.metaApp');
  const format = useFormatter();
  const [view, setView] = useState<MetaAppView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/meta-app', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { metaApp: MetaAppView };
      setView(data.metaApp);
      setAppId((prev) => prev || data.metaApp.appId || '');
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  // Reload after the WhatsApp connection is saved (token check reruns).
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const save = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/whatsapp/meta-app', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: appId.trim(), appSecret: secret.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { metaApp?: MetaAppView; error?: string };
      if (!res.ok || !data.metaApp) {
        setFormError(data.error ?? t('saveFailed'));
        return;
      }
      setView(data.metaApp);
      setSecret('');
      setShowSecret(false);
      setEditing(false);
      toast.success(t('saved'));
    } catch {
      setFormError(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/whatsapp/meta-app/test', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { metaApp?: MetaAppView; error?: string };
      if (!res.ok || !data.metaApp) {
        toast.error(data.error ?? t('testFailed'));
        return;
      }
      setView(data.metaApp);
    } catch {
      toast.error(t('testFailed'));
    } finally {
      setTesting(false);
    }
  };

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">{t('title')}</CardTitle>
          <CardDescription className="text-muted-foreground">{t('loadFailed')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!view) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </CardContent>
      </Card>
    );
  }

  const showForm = !view.configured || editing;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <KeyRound className="size-4 text-muted-foreground" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-muted-foreground">{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Credentials */}
        {showForm ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="meta-app-id" className="text-muted-foreground">
                {t('appId')}
              </Label>
              <Input
                id="meta-app-id"
                inputMode="numeric"
                autoComplete="off"
                placeholder="123456789012345"
                value={appId}
                onChange={(e) => setAppId(e.target.value.replace(/\D/g, ''))}
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-app-secret" className="text-muted-foreground">
                {t('appSecret')}
              </Label>
              <div className="relative">
                <Input
                  id="meta-app-secret"
                  type={showSecret ? 'text' : 'password'}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={t('appSecretPlaceholder')}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="border-border bg-muted pr-10 font-mono text-foreground placeholder:font-sans placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  aria-label={showSecret ? t('hideSecret') : t('showSecret')}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t('appSecretHint')}</p>
            </div>
            {formError ? (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || !appId.trim() || !secret.trim()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? t('validating') : t('save')}
              </Button>
              {view.configured ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setSecret('');
                    setFormError(null);
                  }}
                >
                  {t('cancel')}
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('appId')}</p>
              <p className="font-mono text-sm text-foreground">{view.appId}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('appSecret')}</p>
              <p className="font-mono text-sm text-foreground" aria-label={t('secretMaskedLabel', { last4: view.secretLast4 ?? '' })}>
                ••••••••{view.secretLast4}
              </p>
              {view.secretUpdatedAt ? (
                <p className="text-xs text-muted-foreground">{t('updatedAt', { date: date(view.secretUpdatedAt) })}</p>
              ) : null}
              {view.previousSecretExpiresAt && Date.parse(view.previousSecretExpiresAt) > Date.now() ? (
                <p className="text-xs text-muted-foreground">
                  {t('previousValidUntil', { date: date(view.previousSecretExpiresAt) })}
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                {t('replaceSecret')}
              </Button>
            </div>
          </div>
        )}

        {/* Webhook for this workspace's App */}
        <div className="space-y-3 border-t border-border pt-5">
          <CopyField label={t('webhookUrl')} value={view.webhookUrl} />
          <CopyField label={t('verifyToken')} value={view.verifyToken} />
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('step1')}</li>
            <li>{t('step2')}</li>
            <li>{t('step3')}</li>
          </ol>
        </div>

        {/* Status + Test connection */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <span
            role="status"
            className={cn(
              STATUS_TONE[view.status],
              'inline-flex items-center gap-2 rounded-full border border-border-strong bg-muted px-2.5 py-1 text-xs font-semibold text-foreground',
            )}
          >
            <span aria-hidden className="bg-tile size-2 rounded-full" />
            {view.status === 'connected' ? <Check className="size-3.5" aria-hidden /> : null}
            {t(`status.${view.status}`)}
          </span>
          <span className="text-xs text-muted-foreground">
            {view.lastWebhookAt ? t('lastWebhook', { date: date(view.lastWebhookAt) }) : t('noWebhookYet')}
          </span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={test} disabled={testing || !view.configured}>
            {testing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t('test')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations('Settings.metaApp');
  const [copied, setCopied] = useState(false);
  const id = `copy-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="border-border bg-muted font-mono text-sm text-muted-foreground" />
        <Button
          variant="outline"
          size="icon"
          aria-label={t('copy', { label })}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success(t('copied'));
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
