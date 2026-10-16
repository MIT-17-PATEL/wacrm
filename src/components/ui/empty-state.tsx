import type { ReactNode } from "react"
import {
  Activity,
  Bell,
  Bot,
  Inbox,
  Megaphone,
  Search,
  SquareKanban,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

export type IllustrationKind =
  | "chat"
  | "contacts"
  | "pipeline"
  | "broadcast"
  | "automation"
  | "flow"
  | "agent"
  | "celebrate"
  | "chart"
  | "search"

// One plain line icon per kind (the prop keeps its historical name).
const ICONS: Record<IllustrationKind, LucideIcon> = {
  chat: Inbox,
  contacts: Users,
  pipeline: SquareKanban,
  broadcast: Megaphone,
  automation: Zap,
  flow: Workflow,
  agent: Bot,
  celebrate: Bell,
  chart: Activity,
  search: Search,
}

/**
 * Quiet empty state: one 24px line icon, one sentence, an optional hint
 * and an optional action.
 */
export function EmptyState({
  illustration = "chart",
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: {
  illustration?: IllustrationKind
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  secondaryAction?: ReactNode
  className?: string
  compact?: boolean
}) {
  const Icon = ICONS[illustration]
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      <Icon className="size-6 text-faint" strokeWidth={1.5} aria-hidden />
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {action || secondaryAction ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}
