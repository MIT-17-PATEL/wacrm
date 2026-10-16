"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Workflow,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  MessageSquare,
  PlayCircle,
  PauseCircle,
  Archive,
  HelpCircle,
  UserPlus,
  FileText,
} from "lucide-react";

import { useTranslations } from "next-intl";
import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

/**
 * Flows list page.
 *
 * Open to every authenticated user. Flows is in soft-GA — the "Beta"
 * chip in the header is the only remaining signal that the surface
 * is new. The previous per-account beta gate was removed in PR #134.
 */

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config:
    | { keywords?: string[]; match_type?: "exact" | "contains" }
    | Record<string, unknown>;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS = (t: ReturnType<typeof useTranslations>): Record<FlowRow["status"], string> => ({
  draft: t("statusDraft"),
  active: t("statusActive"),
  archived: t("statusArchived"),
});

const STATUS_COLORS: Record<FlowRow["status"], string> = {
  draft: "border-warning/30 bg-warning/10 text-warning",
  active: "border-success/30 bg-success/10 text-success",
  archived: "border-border bg-muted/50 text-muted-foreground",
};

interface TemplateSummary {
  slug: string;
  name: string;
  description: string;
  icon: "MessageSquare" | "HelpCircle" | "UserPlus";
  trigger_type: string;
  node_count: number;
}

const TEMPLATE_ICONS = {
  MessageSquare,
  HelpCircle,
  UserPlus,
} as const;

export default function FlowsPage() {
  const router = useRouter();
  const canCreate = useCan("send-messages");
  const t = useTranslations("Flows.list");
  const confirmDialog = useConfirm();
  const tGate = useTranslations("GatedButton");
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [flowsRes, tmplRes] = await Promise.all([
          fetch("/api/flows"),
          fetch("/api/flows/templates"),
        ]);
        if (!flowsRes.ok) {
          throw new Error(`Failed to load flows: ${flowsRes.status}`);
        }
        const flowsJson = (await flowsRes.json()) as { flows: FlowRow[] };
        if (!cancelled) setFlows(flowsJson.flows ?? []);
        // Templates endpoint is forward-looking — if it 404s on an
        // older deployment, gracefully fall through.
        if (tmplRes.ok) {
          const tmplJson = (await tmplRes.json()) as {
            templates: TemplateSummary[];
          };
          if (!cancelled) setTemplates(tmplJson.templates ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error(t("loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          trigger_type: "keyword",
          trigger_config: { keywords: [] },
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      setNewName("");
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      console.error(err);
      toast.error(t("createError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleUseTemplate(slug: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_slug: slug }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? t("cloneFailedStatus", { status: res.status }));
      }
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("cloneError");
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(flow: FlowRow) {
    const yes = await confirmDialog({ title: t("deleteConfirm", { name: flow.name }) });
    if (!yes) return;
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast.success(t("deleteSuccess"));
    } catch (err) {
      console.error(err);
      toast.error(t("deleteError"));
    }
  }

  async function handleToggle(flow: FlowRow, active: boolean) {
    const next = active ? "active" : "draft";
    setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, status: next } : f)));
    const res = await fetch(`/api/flows/${flow.id}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, status: flow.status } : f)));
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? t("toggleError"));
      return;
    }
    toast.success(active ? t("activated") : t("paused"));
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-14 w-72 rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        tile=""
        icon={Workflow}
        title={
          <span className="inline-flex items-center gap-2">
            {t("title")}
            <span className="rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-semibold text-foreground ring-1 ring-border ring-inset">
              {t("beta")}
            </span>
          </span>
        }
        description={t("description")}
        actions={
          <GatedButton
            canAct={canCreate}
            gateReason={tGate("reasons.createFlows")}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {t("newFlow")}
          </GatedButton>
        }
      />

      {flows.length === 0 ? (
        <FlowsEmptyState
          onCreate={() => setCreateOpen(true)}
          canCreate={canCreate}
          t={t}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onEdit={() => router.push(`/flows/${flow.id}`)}
              onDelete={() => handleDelete(flow)}
              onToggle={(active) => handleToggle(flow, active)}
              canEdit={canCreate}
              t={t}
            />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {/* `sm:max-w-4xl` not `max-w-4xl` — shadcn's DialogContent has
            `sm:max-w-sm` baked into its default classes. Without the
            sm: prefix our override applies at base only and the
            sm-scoped 384px wins at every real desktop breakpoint. */}
        <DialogContent className="sm:max-w-4xl bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("createDesc")}
            </DialogDescription>
          </DialogHeader>

          {templates.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("startTemplate")}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                  const Icon = TEMPLATE_ICONS[template.icon] ?? FileText;
                  return (
                    <button
                      key={template.slug}
                      type="button"
                      onClick={() => handleUseTemplate(template.slug)}
                      disabled={creating}
                      className="surface surface-hover flex flex-col gap-2.5 p-4 text-left disabled:opacity-50"
                    >
                      <span className="icon-tile size-9 rounded-xl">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-semibold text-popover-foreground">
                        {template.name}
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {template.description}
                      </span>
                      <span className="mt-auto border-t border-border pt-2 text-[11px] text-muted-foreground">
                        {t("nodeCount", { count: template.node_count })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {t("startBlank")}
            </p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("placeholderName")}
              className="bg-muted"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("createBlank")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlowsEmptyState({
  onCreate,
  canCreate,
  t,
}: {
  onCreate: () => void;
  canCreate: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const tGate = useTranslations("GatedButton");
  return (
    <div className="surface ">
      <EmptyState
        illustration="flow"
        title={t("emptyTitle")}
        description={t("emptyDesc")}
        action={
          <GatedButton
            canAct={canCreate}
            gateReason={tGate("reasons.createFlows")}
            onClick={onCreate}
          >
            <Plus className="h-4 w-4" />
            {t("createFirst")}
          </GatedButton>
        }
      />
    </div>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
  onToggle,
  canEdit,
  t,
}: {
  flow: FlowRow;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (active: boolean) => void;
  canEdit: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const triggerSummary = describeTrigger(flow, t);
  const keywords =
    flow.trigger_type === "keyword" && Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : [];
  const StatusIcon =
    flow.status === "active"
      ? PlayCircle
      : flow.status === "archived"
        ? Archive
        : PauseCircle;
  return (
    <div className="surface surface-hover group flex flex-col overflow-hidden">
      {/* Mini flow preview (decorative): trigger → message → branches. */}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${t("edit")} ${flow.name}`}
        className="bg-muted relative block h-28 w-full overflow-hidden"
      >
        <MiniFlowGraph active={flow.status === "active"} />
      </button>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-semibold text-foreground">{flow.name}</h3>
          <Badge
            variant="outline"
            className={cn("shrink-0 gap-1 text-[10px]", STATUS_COLORS[flow.status])}
          >
            <StatusIcon className="h-3 w-3" />
            {STATUS_LABELS(t)[flow.status]}
          </Badge>
        </div>

        {keywords.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {keywords.slice(0, 4).map((k) => (
              <span
                key={k}
                className="rounded-full border border-border-strong bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-tile"
              >
                {k}
              </span>
            ))}
            {keywords.length > 4 ? (
              <span className="text-[11px] text-muted-foreground">+{keywords.length - 4}</span>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {flow.description || triggerSummary}
          </p>
        )}

        <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="tabular-nums">{t("runCount", { count: flow.execution_count })}</span>
          </span>
          {flow.status !== "archived" ? (
            <label className="ml-auto inline-flex items-center gap-2 font-medium">
              {flow.status === "active" ? t("statusActive") : t("pausedLabel")}
              <Switch
                checked={flow.status === "active"}
                onCheckedChange={(v) => onToggle(!!v)}
                disabled={!canEdit}
                aria-label={flow.status === "active" ? t("pause") : t("activate")}
              />
            </label>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t("edit")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Tiny decorative node graph in the Flows accent. */
function MiniFlowGraph({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 240 112" className="text-tile absolute inset-0 h-full w-full" aria-hidden>
      <path
        d="M120 34 V48 M120 62 V70 H64 V78 M120 70 H176 V78"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="2"
        fill="none"
        strokeDasharray={active ? undefined : "4 4"}
      />
      <rect x="90" y="14" width="60" height="20" rx="7" fill="currentColor" />
      <rect x="84" y="48" width="72" height="16" rx="6" fill="var(--card)" stroke="currentColor" strokeOpacity="0.45" />
      <rect x="34" y="78" width="60" height="18" rx="6" fill="var(--card)" stroke="currentColor" strokeOpacity="0.45" />
      <rect x="146" y="78" width="60" height="18" rx="6" fill="var(--card)" stroke="currentColor" strokeOpacity="0.45" />
      <rect x="100" y="21" width="40" height="6" rx="3" fill="var(--card)" opacity="0.8" />
      <rect x="96" y="53" width="40" height="5" rx="2.5" fill="currentColor" opacity="0.4" />
      <rect x="44" y="84" width="30" height="5" rx="2.5" fill="currentColor" opacity="0.35" />
      <rect x="156" y="84" width="30" height="5" rx="2.5" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function describeTrigger(flow: FlowRow, t: ReturnType<typeof useTranslations>): string {
  if (flow.trigger_type === "keyword") {
    const keywords = Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : [];
    if (keywords.length === 0) return t("triggerKeywordNone");
    return t(
      flow.trigger_config.match_type === "exact"
        ? "triggerKeywordExact"
        : "triggerKeyword",
      { keywords: keywords.join(", ") },
    );
  }
  if (flow.trigger_type === "first_inbound_message") {
    return t("triggerFirstInbound");
  }
  return t("triggerManual");
}
