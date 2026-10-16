import type { ReactNode } from "react"
import { CheckCheck, ChevronLeft, Phone, Video } from "lucide-react"

import { LogoMark } from "@/components/brand/logo"
import { cn } from "@/lib/utils"

/**
 * Stylised phone with a WhatsApp-like chat screen, drawn in the brand
 * palette. Used for live previews (broadcast wizard, AI playground).
 * Purely presentational.
 */
export function PhoneMockup({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  /** Optional composer row pinned to the bottom of the screen. */
  footer?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[300px] rounded-[2.6rem] border border-border-strong bg-card p-2.5 shadow-raised",
        className,
      )}
    >
      {/* Notch */}
      <span
        aria-hidden
        className="absolute top-3.5 left-1/2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-background"
      />
      <div className="relative flex h-[560px] flex-col overflow-hidden rounded-[2.1rem] border border-border">
        {/* Chat header */}
        <div className="flex items-center gap-2 bg-card-2 px-3 pt-9 pb-2.5">
          <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
          <LogoMark className="size-8" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-foreground">{title}</p>
            {subtitle ? (
              <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <Video className="size-4 text-muted-foreground" aria-hidden />
          <Phone className="size-4 text-muted-foreground" aria-hidden />
        </div>
        {/* Messages */}
        <div className="bg-background flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-4">
          {children}
        </div>
        {footer ? <div className="border-t border-border bg-card-2 p-2">{footer}</div> : null}
      </div>
    </div>
  )
}

/** One chat bubble inside a PhoneMockup. */
export function PreviewBubble({
  from = "business",
  children,
  time,
  label,
  className,
}: {
  from?: "business" | "customer"
  children: ReactNode
  time?: string
  /** Small tag above the text, e.g. "Template" or "✨ AI". */
  label?: ReactNode
  className?: string
}) {
  const business = from === "business"
  return (
    <div className={cn("flex", business ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug whitespace-pre-wrap break-words",
          business
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border bg-card text-foreground",
          className,
        )}
      >
        {label ? <div className="mb-1 text-[10px] font-semibold opacity-80">{label}</div> : null}
        {children}
        {time ? (
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
            {time}
            {business ? <CheckCheck className="size-3" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
