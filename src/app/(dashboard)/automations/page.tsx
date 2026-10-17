"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowRight,
  Zap,
  Plus,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
  FileText,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useCan } from "@/hooks/use-can"
import { useTranslations } from "next-intl"
import type { Automation, AutomationStepType } from "@/types"
import { Button } from "@/components/ui/button"
import { GatedButton } from "@/components/ui/gated-button"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { EmptyIllustration, EmptyState, type IllustrationKind } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { AUTOMATION_TEMPLATES, type TemplateSlug } from "@/lib/automations/templates"
import { triggerMeta, formatRelative, isKnownTrigger } from "@/lib/automations/trigger-meta"
import { cn } from "@/lib/utils"

const TEMPLATE_ORDER: TemplateSlug[] = [
  "welcome_message",
  "out_of_office",
  "lead_qualifier",
  "follow_up_reminder",
]

// Each quick-start template gets its own accent + spot illustration.
const TEMPLATE_STYLE: Record<TemplateSlug, { tile: string; art: IllustrationKind }> = {
  welcome_message: { tile: "", art: "chat" },
  out_of_office: { tile: "", art: "automation" },
  lead_qualifier: { tile: "", art: "contacts" },
  follow_up_reminder: { tile: "", art: "broadcast" },
}

export default function AutomationsPage() {
  const router = useRouter()
  const canCreate = useCan("send-messages")
  const t = useTranslations("Automations.list")
  const tGate = useTranslations("GatedButton")
  const confirm = useConfirm()
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  // First few step types per automation, for the trigger → action chips.
  const [stepTypes, setStepTypes] = useState<Record<string, AutomationStepType[]>>({})
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const supabase = createClient()
      const { data, error: fetchErr } = await supabase
        .from("automations")
        .select("*")
        .order("created_at", { ascending: false })
      if (fetchErr) throw fetchErr
      const rows = (data ?? []) as Automation[]
      setAutomations(rows)
      if (rows.length) {
        // Read-only, display-only: which actions each automation runs.
        const { data: steps } = await supabase
          .from("automation_steps")
          .select("automation_id, step_type, position")
          .in(
            "automation_id",
            rows.map((r) => r.id),
          )
          .order("position")
        const byId: Record<string, AutomationStepType[]> = {}
        for (const s of (steps ?? []) as { automation_id: string; step_type: AutomationStepType }[]) {
          ;(byId[s.automation_id] ??= []).push(s.step_type)
        }
        setStepTypes(byId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadFailed"))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleActive(a: Automation, next: boolean) {
    // Optimistic flip so the switch feels instant.
    setAutomations((prev) =>
      prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ?? prev,
    )
    const res = await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    })
    if (!res.ok) {
      // Roll back on error.
      setAutomations((prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x)) ?? prev,
      )
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? t("toasts.updateError"))
      return
    }
    toast.success(next ? t("toasts.activated") : t("toasts.paused"))
  }

  async function duplicate(a: Automation) {
    const res = await fetch(`/api/automations/${a.id}/duplicate`, { method: "POST" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? t("toasts.duplicateError"))
      return
    }
    toast.success(t("toasts.duplicated"))
    load()
  }

  async function handleDelete(a: Automation) {
    const ok = await confirm({
      title: t("deleteTitle"),
      description: t("deleteDesc", { name: a.name }),
      confirmLabel: t("delete"),
    })
    if (!ok) return
    const res = await fetch(`/api/automations/${a.id}`, { method: "DELETE" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? t("toasts.deleteError"))
      return
    }
    toast.success(t("toasts.deleted"))
    load()
  }

  function startFromTemplate(slug: TemplateSlug) {
    router.push(`/automations/new?template=${slug}`)
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      </div>
    )
  }

  if (automations === null) {
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-14 w-72 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    )
  }

  const showTemplates = automations.length < 3

  return (
    <div className="space-y-8">
      <PageHeader
        tile=""
        icon={Zap}
        title={t("title")}
        description={t("subtitle")}
        actions={
          <GatedButton
            canAct={canCreate}
            gateReason={tGate("reasons.createAutomations")}
            onClick={() => router.push("/automations/new")}
          >
            <Plus className="h-4 w-4" />
            {t("create")}
          </GatedButton>
        }
      />

      {showTemplates && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-foreground">{t("templatesTitle")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {TEMPLATE_ORDER.map((slug) => {
              const tpl = AUTOMATION_TEMPLATES[slug]
              const style = TEMPLATE_STYLE[slug]
              return (
                <div
                  key={slug}
                  className={cn(style.tile, "surface surface-hover group flex flex-col overflow-hidden")}
                >
                  <div className="bg-muted relative flex h-32 items-center justify-center">
                    <EmptyIllustration kind={style.art} />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-semibold text-foreground">{tpl.name}</p>
                    <p className="mt-1 flex-1 text-xs text-muted-foreground">{tpl.description}</p>
                    <GatedButton
                      variant="soft"
                      size="sm"
                      className="mt-4 self-start"
                      canAct={canCreate}
                      gateReason={tGate("reasons.createAutomations")}
                      onClick={() => startFromTemplate(slug)}
                    >
                      {t("useTemplate")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </GatedButton>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {automations.length === 0 ? (
        <div className="surface ">
          <EmptyState
            illustration="automation"
            title={t("emptyTitle")}
            description={t("emptyDesc")}
            action={
              <GatedButton
                canAct={canCreate}
                gateReason={tGate("reasons.createAutomations")}
                onClick={() => router.push("/automations/new")}
              >
                <Plus className="h-4 w-4" />
                {t("create")}
              </GatedButton>
            }
          />
        </div>
      ) : (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-foreground">{t("yourAutomations")}</h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {automations.map((a) => (
              <AutomationCard
                key={a.id}
                automation={a}
                steps={stepTypes[a.id] ?? []}
                onToggle={(next) => toggleActive(a, next)}
                onEdit={() => router.push(`/automations/${a.id}/edit`)}
                onDuplicate={() => duplicate(a)}
                onLogs={() => router.push(`/automations/${a.id}/logs`)}
                onDelete={() => handleDelete(a)}
                t={t}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function AutomationCard({
  automation,
  steps,
  onToggle,
  onEdit,
  onDuplicate,
  onLogs,
  onDelete,
  t,
}: {
  automation: Automation
  steps: AutomationStepType[]
  onToggle: (next: boolean) => void
  onEdit: () => void
  onDuplicate: () => void
  onLogs: () => void
  onDelete: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const tTriggers = useTranslations("Automations.builder.triggers")
  const tSteps = useTranslations("Automations.builder.steps")
  const tRelative = useTranslations("Automations.relative")
  const meta = triggerMeta(automation.trigger_type)
  const triggerLabel = isKnownTrigger(automation.trigger_type)
    ? tTriggers(`${automation.trigger_type}.label`)
    : automation.trigger_type
  const actions = steps.filter((s) => s !== "condition" && s !== "wait")
  const shown = Array.from(new Set(actions)).slice(0, 2)

  return (
    <li
      className={cn(
        " surface surface-hover flex flex-col gap-4 p-5",
        !automation.is_active && "opacity-80",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="icon-tile size-10 rounded-xl" aria-hidden>
          <Zap className="h-5 w-5" />
        </span>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold text-foreground">{automation.name}</span>
            {automation.is_active && (
              <span className="relative flex h-2 w-2" aria-label={t("activeIndicator")}>
                <span className="absolute inline-flex h-full w-full hidden rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
            )}
          </span>
          {automation.description && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {automation.description}
            </span>
          )}
        </button>
        <Switch
          checked={automation.is_active}
          onCheckedChange={(v) => onToggle(!!v)}
          aria-label={automation.is_active ? t("deactivate") : t("activate")}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("openMenu")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted"
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4" />
              {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLogs}>
              <FileText className="h-4 w-4" />
              {t("viewLogs")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Trigger → actions summary */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            meta.tile,
            "inline-flex items-center rounded-full border border-border-strong bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-tile",
          )}
        >
          {triggerLabel}
        </span>
        {shown.length > 0 ? (
          <>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {shown.map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full border border-border bg-card-2 px-2.5 py-0.5 text-[11px] font-medium text-foreground/85"
              >
                {tSteps(s)}
              </span>
            ))}
            {actions.length > shown.length ? (
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("moreSteps", { count: actions.length - shown.length })}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="text-base font-semibold text-foreground tabular-nums">
          {automation.execution_count.toLocaleString()}
        </span>
        <span>{t("runsLabel", { count: automation.execution_count })}</span>
        <span aria-hidden>·</span>
        <span>{t("lastRun", { time: formatRelative(automation.last_executed_at, tRelative) })}</span>
      </div>
    </li>
  )
}
