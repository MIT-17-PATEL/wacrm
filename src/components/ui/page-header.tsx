import type { ComponentType, ReactNode } from "react"

import { cn } from "@/lib/utils"

/** In-page heading: 24px/600 title, muted one-line description, actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  /** Kept for call-site compatibility; headers carry no icon. */
  icon?: ComponentType<{ className?: string }>
  tile?: string
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end gap-4", className)}>
      <div className="min-w-0 flex-1">
        {/* The page's one h1 (the shell has no title bar). */}
        <h1 className="text-2xl leading-tight font-semibold text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
