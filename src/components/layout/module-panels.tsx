"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  Bookmark,
  Bot,
  CalendarClock,
  ChevronRight,
  FileText,
  GitBranch,
  Plus,
  Search,
  Send,
  Sparkles,
  Tag as TagIcon,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";

import { ContextPanel, PanelLink, PanelSection } from "@/components/layout/context-panel";
import { SettingsRail } from "@/components/settings/settings-rail";
import { resolveSection } from "@/components/settings/settings-sections";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { BROADCAST_BUCKETS, broadcastBucket, type BroadcastBucket } from "@/lib/broadcast-status";
import { SAVE_VIEW_EVENT, useSavedViews, viewHref, writeViews } from "@/lib/contacts/saved-views";
import { formatCurrencyShort } from "@/lib/currency";
import { type PanelModuleKey } from "@/lib/nav";
import { PIPELINES_CHANGED_EVENT, PIPELINE_CREATE_EVENT } from "@/lib/pipelines/events";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Tag } from "@/types";

/** The shell-rendered context panel for every module except Inbox. */
export function ModulePanel({ module }: { module: Exclude<PanelModuleKey, "inbox"> }) {
  // Every panel reads search params; one boundary covers them all.
  return (
    <Suspense fallback={<PanelFallback />}>
      {module === "contacts" ? <ContactsPanel /> : null}
      {module === "pipelines" ? <PipelinesPanel /> : null}
      {module === "broadcasts" ? <BroadcastsPanel /> : null}
      {module === "automate" ? <AutomatePanel /> : null}
      {module === "settings" ? <SettingsPanel /> : null}
    </Suspense>
  );
}

function PanelFallback() {
  return (
    <ContextPanel title="">
      <PanelSkeleton />
    </ContextPanel>
  );
}

function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1.5 px-2.5 py-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-7" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

function NewButton({ label, onClick, href }: { label: string; onClick?: () => void; href?: string }) {
  const className =
    "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground";
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={className}>
        <Plus className="size-4" />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={className}>
      <Plus className="size-4" />
    </button>
  );
}

function AddRow({ label, onClick, href }: { label: string; onClick?: () => void; href?: string }) {
  const className =
    "mt-1 flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent/60 hover:text-foreground";
  const body = (
    <>
      <Plus className="size-4" />
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Contacts: search + saved segments                                    */
/* ------------------------------------------------------------------ */

function ContactsPanel() {
  const t = useTranslations("Shell.contacts");
  const tn = useTranslations("Nav");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const views = useSavedViews();
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [tagsOpen, setTagsOpen] = useState(() => !!params.get("tags"));
  const [query, setQuery] = useState(params.get("q") ?? "");

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("tags")
      .select("*")
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setTags((data as Tag[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onContacts = pathname === "/contacts";
  const current = onContacts ? params.toString() : null;
  const isCurrent = (href: string) => {
    if (current === null) return false;
    const qs = href.split("?")[1] ?? "";
    return new URLSearchParams(qs).toString() === current;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/contacts?q=${encodeURIComponent(q)}` : "/contacts");
  };

  const newSegment = () => {
    if (onContacts) window.dispatchEvent(new Event(SAVE_VIEW_EVENT));
    else router.push("/contacts");
  };

  return (
    <ContextPanel title={tn("items.contacts")} actions={<NewButton label={t("newSegment")} onClick={newSegment} />}>
      <form onSubmit={submit} className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-9 pl-8 text-[13px]"
          />
        </div>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <PanelSection title={t("segments")}>
          <PanelLink href="/contacts" active={isCurrent("/contacts")}>
            <Users className="size-4 shrink-0" />
            <span className="truncate">{t("all")}</span>
          </PanelLink>
          <PanelLink href="/contacts?since=7d" active={isCurrent("/contacts?since=7d")}>
            <CalendarClock className="size-4 shrink-0" />
            <span className="truncate">{t("newThisWeek")}</span>
          </PanelLink>
          <button
            type="button"
            onClick={() => setTagsOpen((v) => !v)}
            aria-expanded={tagsOpen}
            className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent/60 hover:text-foreground"
          >
            <TagIcon className="size-4 shrink-0" />
            <span className="flex-1 truncate text-left">{t("byTag")}</span>
            <ChevronRight className={cn("size-3.5 transition-transform duration-150", tagsOpen && "rotate-90")} />
          </button>
          {tagsOpen ? (
            <div className="ml-4 flex flex-col gap-px border-l border-border pl-2">
              {tags === null ? (
                <PanelSkeleton rows={3} />
              ) : tags.length === 0 ? (
                <p className="px-2.5 py-1.5 text-xs text-muted-foreground">{t("noTags")}</p>
              ) : (
                tags.map((tag) => {
                  const href = viewHref({ search: "", tagIds: [tag.id] });
                  return (
                    <PanelLink key={tag.id} href={href} active={isCurrent(href)} className="h-8">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        // Tag colour is user data, picked per tag in Settings.
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </PanelLink>
                  );
                })
              )}
            </div>
          ) : null}
        </PanelSection>

        <PanelSection title={t("saved")}>
          {views.length === 0 ? (
            <p className="px-2.5 py-1 text-xs text-muted-foreground">{t("savedHint")}</p>
          ) : (
            views.map((v) => {
              const href = viewHref(v);
              return (
                <div key={v.id} className="group relative">
                  <PanelLink href={href} active={isCurrent(href)} className="pr-8">
                    <Bookmark className="size-4 shrink-0" />
                    <span className="truncate">{v.name}</span>
                  </PanelLink>
                  <button
                    type="button"
                    onClick={() => writeViews(views.filter((x) => x.id !== v.id))}
                    aria-label={t("removeSegment", { name: v.name })}
                    className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
          <AddRow label={t("newSegment")} onClick={newSegment} />
        </PanelSection>
      </div>
    </ContextPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Pipelines: each pipeline with deal count and open value             */
/* ------------------------------------------------------------------ */

interface PipelineSummary {
  id: string;
  name: string;
  deals: number;
  total: number;
}

function PipelinesPanel() {
  const t = useTranslations("Shell.pipelines");
  const tn = useTranslations("Nav");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { defaultCurrency } = useAuth();
  const canEditSettings = useCan("edit-settings");
  const [rows, setRows] = useState<PipelineSummary[] | null>(null);
  const [tick, setTick] = useState(0);

  // Refetch when the board reports a change (debounced: drags fire many).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), 400);
    };
    window.addEventListener(PIPELINES_CHANGED_EVENT, onChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(PIPELINES_CHANGED_EVENT, onChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [pipesRes, dealsRes] = await Promise.all([
        supabase.from("pipelines").select("id, name").order("created_at"),
        supabase.from("deals").select("pipeline_id, value, status"),
      ]);
      if (cancelled) return;
      const deals = (dealsRes.data ?? []) as { pipeline_id: string; value: number | null; status: string }[];
      setRows(
        ((pipesRes.data ?? []) as { id: string; name: string }[]).map((p) => {
          const mine = deals.filter((d) => d.pipeline_id === p.id);
          return {
            id: p.id,
            name: p.name,
            deals: mine.length,
            // Pipeline value = what is still in play, not lost deals.
            total: mine.filter((d) => d.status !== "lost").reduce((sum, d) => sum + (Number(d.value) || 0), 0),
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const selected = pathname === "/pipelines" ? (params.get("pipeline") ?? rows?.[0]?.id ?? null) : null;

  const addPipeline = () => {
    if (pathname === "/pipelines") window.dispatchEvent(new Event(PIPELINE_CREATE_EVENT));
    else router.push("/pipelines");
  };

  return (
    <ContextPanel
      title={tn("items.pipelines")}
      actions={canEditSettings ? <NewButton label={t("add")} onClick={addPipeline} /> : null}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {rows === null ? (
          <PanelSkeleton rows={3} />
        ) : (
          <div className="flex flex-col gap-px">
            {rows.length === 0 ? <p className="px-2.5 py-1 text-xs text-muted-foreground">{t("empty")}</p> : null}
            {rows.map((p) => (
              <Link
                key={p.id}
                href={`/pipelines?pipeline=${p.id}`}
                aria-current={selected === p.id ? "page" : undefined}
                className={cn(
                  "flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors duration-150",
                  selected === p.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <GitBranch className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{p.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                    {t("deals", { count: p.deals })} · {formatCurrencyShort(p.total, defaultCurrency)}
                  </span>
                </span>
              </Link>
            ))}
            {canEditSettings ? <AddRow label={t("add")} onClick={addPipeline} /> : null}
          </div>
        )}
      </div>
    </ContextPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Broadcasts: Drafts / Scheduled / Sent with counts                   */
/* ------------------------------------------------------------------ */

const BUCKET_ICON: Record<BroadcastBucket, typeof FileText> = {
  drafts: FileText,
  scheduled: CalendarClock,
  sent: Send,
};

function BroadcastsPanel() {
  const t = useTranslations("Shell.broadcasts");
  const tn = useTranslations("Nav");
  const pathname = usePathname();
  const params = useSearchParams();
  const canCreate = useCan("send-messages");
  const [counts, setCounts] = useState<Record<BroadcastBucket, number> | null>(null);

  // Refetch on every visit to the list so new sends are counted.
  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("broadcasts")
      .select("status")
      .then(({ data }) => {
        if (cancelled) return;
        const next: Record<BroadcastBucket, number> = { drafts: 0, scheduled: 0, sent: 0 };
        for (const row of (data ?? []) as { status: string }[]) next[broadcastBucket(row.status)] += 1;
        setCounts(next);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const onList = pathname === "/broadcasts";
  const status = params.get("status");
  const total = counts ? counts.drafts + counts.scheduled + counts.sent : null;

  return (
    <ContextPanel
      title={tn("items.broadcasts")}
      actions={canCreate ? <NewButton label={t("new")} href="/broadcasts/new" /> : null}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex flex-col gap-px">
          <PanelLink href="/broadcasts" active={onList && !status} trailing={total}>
            <Send className="size-4 shrink-0" />
            <span className="truncate">{t("all")}</span>
          </PanelLink>
          {BROADCAST_BUCKETS.map((b) => {
            const Icon = BUCKET_ICON[b];
            return (
              <PanelLink
                key={b}
                href={`/broadcasts?status=${b}`}
                active={onList && status === b}
                trailing={counts ? counts[b] : null}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{t(b)}</span>
              </PanelLink>
            );
          })}
          {canCreate ? <AddRow label={t("new")} href="/broadcasts/new" /> : null}
        </div>
      </div>
    </ContextPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Automate: automations, flows and the AI agent with status dots       */
/* ------------------------------------------------------------------ */

interface AutomateItem {
  id: string;
  name: string;
  href: string;
  on: boolean;
}

function StatusDot({ on }: { on: boolean }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", on ? "bg-success" : "bg-faint")} />;
}

function AutomatePanel() {
  const t = useTranslations("Shell.automate");
  const tn = useTranslations("Nav");
  const pathname = usePathname();
  const [automations, setAutomations] = useState<AutomateItem[] | null>(null);
  const [flows, setFlows] = useState<AutomateItem[] | null>(null);
  const [agent, setAgent] = useState<{ configured: boolean; on: boolean } | null>(null);

  // Refetch on navigation inside the module so a toggle or rename shows.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [autoRes, flowsRes, agentRes] = await Promise.all([
        supabase.from("automations").select("id, name, is_active").order("created_at", { ascending: false }),
        fetch("/api/flows").catch(() => null),
        fetch("/api/ai/config").catch(() => null),
      ]);
      if (cancelled) return;
      setAutomations(
        ((autoRes.data ?? []) as { id: string; name: string; is_active: boolean }[]).map((a) => ({
          id: a.id,
          name: a.name,
          href: `/automations/${a.id}/edit`,
          on: a.is_active,
        })),
      );
      const flowsJson = flowsRes?.ok
        ? ((await flowsRes.json().catch(() => ({}))) as { flows?: { id: string; name: string; status: string }[] })
        : {};
      const agentJson = agentRes?.ok
        ? ((await agentRes.json().catch(() => ({}))) as { configured?: boolean; is_active?: boolean })
        : {};
      if (cancelled) return;
      setFlows(
        (flowsJson.flows ?? [])
          .filter((f) => f.status !== "archived")
          .map((f) => ({ id: f.id, name: f.name, href: `/flows/${f.id}`, on: f.status === "active" })),
      );
      setAgent({ configured: !!agentJson.configured, on: !!agentJson.configured && !!agentJson.is_active });
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const section = (
    title: string,
    href: string,
    Icon: typeof Zap,
    items: AutomateItem[] | null,
    newHref: string,
    newLabel: string,
    beta?: boolean,
  ) => (
    <PanelSection
      title={
        <span className="inline-flex items-center gap-1.5">
          {title}
          {beta ? (
            <span className="rounded border border-border-strong px-1 text-[9px] leading-3.5 tracking-normal normal-case">
              {tn("beta")}
            </span>
          ) : null}
        </span>
      }
      action={<NewButton label={newLabel} href={newHref} />}
    >
      <PanelLink href={href} active={pathname === href}>
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{t("overview", { name: title })}</span>
      </PanelLink>
      {items === null ? (
        <PanelSkeleton rows={2} />
      ) : (
        items.slice(0, 12).map((item) => (
          <PanelLink
            key={item.id}
            href={item.href}
            active={pathname.startsWith(item.href.replace(/\/edit$/, ""))}
            className="h-8"
          >
            <StatusDot on={item.on} />
            <span className="truncate">{item.name}</span>
            <span className="sr-only">{item.on ? t("on") : t("off")}</span>
          </PanelLink>
        ))
      )}
      {items && items.length > 12 ? (
        <Link href={href} className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
          {t("more", { count: items.length - 12 })}
        </Link>
      ) : null}
    </PanelSection>
  );

  return (
    <ContextPanel title={tn("groups.automate")}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {section(tn("items.automations"), "/automations", Zap, automations, "/automations/new", t("newAutomation"))}
        {section(tn("items.flows"), "/flows", Workflow, flows, "/flows", t("newFlow"), true)}
        <PanelSection title={tn("items.agents")}>
          <PanelLink href="/agents" active={pathname === "/agents"}>
            <Bot className="size-4 shrink-0" />
            <span className="truncate">{t("agent")}</span>
            {agent ? (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <StatusDot on={agent.on} />
                {agent.on ? t("on") : agent.configured ? t("off") : t("notSetUp")}
              </span>
            ) : null}
          </PanelLink>
          {agent && !agent.configured ? (
            <AddRow label={t("setUpAgent")} href="/agents" />
          ) : (
            <PanelLink href="/agents" active={false} className="h-8">
              <Sparkles className="size-4 shrink-0" />
              <span className="truncate">{t("playground")}</span>
            </PanelLink>
          )}
        </PanelSection>
      </div>
    </ContextPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Settings: the existing settings menu (Account / Workspace)          */
/* ------------------------------------------------------------------ */

function SettingsPanel() {
  const tn = useTranslations("Nav");
  const router = useRouter();
  const params = useSearchParams();
  const section = useMemo(() => resolveSection(params.get("tab")), [params]);
  return (
    <ContextPanel title={tn("items.settings")}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <SettingsRail
          variant="panel"
          active={section}
          onSelect={(next) => {
            const qs = new URLSearchParams(params.toString());
            qs.set("tab", next);
            router.replace(`/settings?${qs.toString()}`, { scroll: false });
          }}
        />
      </div>
    </ContextPanel>
  );
}
