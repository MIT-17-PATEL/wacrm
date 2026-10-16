'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { THEMES } from '@/lib/themes';
import { CURRENCIES } from '@/lib/currency';
import { ContactAvatar } from '@/components/ui/contact-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { SECTION_META, SECTION_TILE, type SettingsSection } from './settings-sections';
import { SettingsChip, StatusDot } from './settings-chip';
import { ROLE_META } from './role-meta';

/** A tile's async status line: undefined = loading, null = unavailable. */
type Loadable<T> = T | null | undefined;

interface WhatsAppStatus {
  configured: boolean;
  connected: boolean;
  /** Display number from Meta, when the (slower) live check returns. */
  phone?: string | null;
}

/** Resolve to `null` instead of hanging when a request is slow. */
function withTimeout<T>(p: PromiseLike<T>, ms = 8000): Promise<T | null> {
  return Promise.race([
    Promise.resolve(p).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/**
 * Settings landing: identity card + one tile per section with a real
 * status line.
 *
 * Loading bug fix: every tile now loads on its own, each request has a
 * timeout, and a tile whose data can't be fetched falls back to a
 * plain description. Previously the tiles shared one loading flag
 * gated on a live Meta ping and on auth resolving, and a cancelled or
 * slow run left them on "Loading…" for good.
 */
export function SettingsOverview({
  onSelect,
}: {
  onSelect: (section: SettingsSection) => void;
}) {
  const { user, profile, accountId, accountRole, accountStatus, defaultCurrency, canManageMembers } =
    useAuth();
  const { mode, theme } = useTheme();
  const t = useTranslations('Settings.overview');
  const tRoles = useTranslations('Settings.roles');
  const tSections = useTranslations('Settings.sections');

  const [whatsapp, setWhatsapp] = useState<Loadable<WhatsAppStatus>>(undefined);
  const [members, setMembers] = useState<Loadable<{ members: number; invites: number | null }>>(undefined);
  const [templates, setTemplates] = useState<Loadable<{ approved: number; total: number; pending: number }>>(undefined);
  const [fields, setFields] = useState<Loadable<{ tags: number; fields: number }>>(undefined);

  // No account to read from (unlinked / failed) → stop loading.
  const noAccount = !accountId && accountStatus !== 'loading';

  useEffect(() => {
    if (!user || !accountId) return;
    let cancelled = false;
    const supabase = createClient();
    const acctId = accountId;
    const set = <T,>(fn: (v: T) => void) => (v: T) => {
      if (!cancelled) fn(v);
    };

    // WhatsApp: the stored status first (fast), then the display number
    // from the live Meta check if it answers in time.
    void (async () => {
      const row = await withTimeout(
        supabase
          .from('whatsapp_config')
          .select('phone_number_id, status')
          .eq('account_id', acctId)
          .maybeSingle(),
      );
      const data = row?.data as { phone_number_id?: string; status?: string } | null | undefined;
      const base: WhatsAppStatus = {
        configured: !!data?.phone_number_id,
        connected: data?.status === 'connected',
      };
      set(setWhatsapp)(row ? base : null);
      if (!base.configured) return;
      const live = await withTimeout(getJson('/api/whatsapp/config'), 10_000);
      if (!live) return;
      const info = live.phone_info as { display_phone_number?: string } | undefined;
      set(setWhatsapp)({
        ...base,
        connected: !!live.connected,
        phone: info?.display_phone_number ?? null,
      });
    })();

    void (async () => {
      const [m, inv] = await Promise.all([
        withTimeout(getJson('/api/account/members')),
        canManageMembers ? withTimeout(getJson('/api/account/invitations')) : Promise.resolve(null),
      ]);
      const list = m?.members;
      set(setMembers)(
        Array.isArray(list)
          ? {
              members: list.length,
              invites: Array.isArray(inv?.invitations) ? (inv.invitations as unknown[]).length : null,
            }
          : null,
      );
    })();

    void (async () => {
      const count = (status?: string) => {
        let q = supabase.from('message_templates').select('id', { count: 'exact', head: true });
        if (status) q = q.eq('status', status);
        return withTimeout(q);
      };
      const [total, approved, pending] = await Promise.all([
        count(),
        count('APPROVED'),
        count('PENDING'),
      ]);
      set(setTemplates)(
        total && total.count != null
          ? { total: total.count, approved: approved?.count ?? 0, pending: pending?.count ?? 0 }
          : null,
      );
    })();

    void (async () => {
      const [tags, cf] = await Promise.all([
        withTimeout(supabase.from('tags').select('id', { count: 'exact', head: true })),
        withTimeout(supabase.from('custom_fields').select('id', { count: 'exact', head: true })),
      ]);
      set(setFields)(
        tags?.count != null || cf?.count != null
          ? { tags: tags?.count ?? 0, fields: cf?.count ?? 0 }
          : null,
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [user, accountId, canManageMembers]);

  const displayName = profile?.full_name || profile?.email || t('yourAccount');
  const roleMeta = accountRole ? ROLE_META[accountRole] : null;
  const RoleIcon = roleMeta?.icon;

  const currencyLabel =
    CURRENCIES.find((c) => c.code === defaultCurrency)?.label ?? defaultCurrency;
  const themeName = THEMES.find((th) => th.id === theme)?.name ?? theme;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const loading = (v: unknown) => v === undefined && !noAccount;

  const tiles: { section: SettingsSection; loading: boolean; subtitle: ReactNode }[] = [
    {
      section: 'whatsapp',
      loading: loading(whatsapp),
      subtitle: !whatsapp?.configured ? (
        t('notSetup')
      ) : whatsapp.connected ? (
        <>
          <StatusDot tone="ok" />
          {whatsapp.phone ? t('connectedNumber', { phone: whatsapp.phone }) : t('connected')}
        </>
      ) : (
        <>
          <StatusDot tone="bad" /> {t('needsReconnecting')}
        </>
      ),
    },
    {
      section: 'members',
      loading: loading(members),
      subtitle: !members
        ? t('viewTeamMembers')
        : `${t('membersCount', { count: members.members })}${
            members.invites ? ` · ${t('pendingInvites', { count: members.invites })}` : ''
          }`,
    },
    {
      section: 'templates',
      loading: loading(templates),
      subtitle: !templates
        ? t('manageTemplates')
        : templates.total === 0
          ? t('noTemplates')
          : `${t('approvedTemplates', { count: templates.approved })}${
              templates.pending ? ` · ${t('pendingReview', { count: templates.pending })}` : ''
            }`,
    },
    {
      section: 'fields',
      loading: loading(fields),
      subtitle: !fields
        ? t('tagsAndFields')
        : `${t('tagsCount', { count: fields.tags })} · ${t('fieldsCount', { count: fields.fields })}`,
    },
    {
      section: 'deals',
      loading: false,
      subtitle: `${defaultCurrency} — ${currencyLabel}`,
    },
    {
      section: 'appearance',
      loading: false,
      subtitle: t('appearance', { mode: cap(mode), theme: themeName }),
    },
  ];

  return (
    <section className="animate-in fade-in-50 duration-200">
      {/* Identity */}
      <div className="surface relative flex items-center gap-4 overflow-hidden px-5 py-5">
        <span aria-hidden className="bg-primary pointer-events-none absolute inset-x-0 top-0 h-1" />
        <ContactAvatar
          name={displayName}
          seed={user?.id ?? displayName}
          src={profile?.avatar_url}
          size="lg"
          className="size-14"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold text-foreground">{displayName}</div>
          {profile?.email ? (
            <div className="truncate text-sm text-muted-foreground">{profile.email}</div>
          ) : null}
        </div>
        {roleMeta && RoleIcon ? (
          <SettingsChip variant={roleMeta.variant}>
            <RoleIcon />
            {tRoles(accountRole!)}
          </SettingsChip>
        ) : null}
      </div>

      {/* Status tiles */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(({ section, loading: isLoading, subtitle }) => {
          const meta = SECTION_META[section];
          const Icon = meta.icon;
          return (
            <button
              key={section}
              type="button"
              onClick={() => onSelect(section)}
              className={cn(SECTION_TILE[section], 'surface surface-hover group flex items-start gap-3.5 p-4 text-left')}
            >
              <span className="icon-tile size-10 rounded-xl">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{tSections(section)}</span>
                <span className="mt-1 flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground">
                  {isLoading ? (
                    <>
                      <span className="sr-only">{t('loading')}</span>
                      <Skeleton className="h-3 w-32" />
                    </>
                  ) : (
                    subtitle
                  )}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform " />
            </button>
          );
        })}
      </div>
    </section>
  );
}
