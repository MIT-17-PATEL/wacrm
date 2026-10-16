/* eslint-disable @next/next/no-img-element -- contact avatars are arbitrary remote URLs */
import { cn } from "@/lib/utils"

/**
 * Initials: first letter of the first word + first letter of the last
 * word. "Mit Dharmeshbhai Patel" → "MP", "Mit D Patel" → "MP",
 * "Priya" → "P", "+91 98765…" → "9". Case of the source doesn't matter.
 */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return "?"
  const first = words[0][0]!
  const last = words.length > 1 ? words[words.length - 1][0]! : ""
  return (first + last).toUpperCase()
}

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-9 text-[13px]",
  lg: "size-12 text-base",
  xl: "size-14 text-lg",
} as const

/**
 * Round avatar: photo when we have one, otherwise initials on a neutral
 * grey disc.
 */
export function ContactAvatar({
  name,
  src,
  size = "md",
  className,
  ring = false,
}: {
  name: string
  /** Kept for call-site compatibility; avatars are neutral now. */
  seed?: string
  src?: string | null
  size?: keyof typeof SIZES
  className?: string
  /** Separating ring — for stacked / overlapping avatars. */
  ring?: boolean
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card-2 font-medium text-muted-foreground",
        SIZES[size],
        ring && "ring-2 ring-card",
        className,
      )}
      aria-hidden
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initialsOf(name)}
    </span>
  )
}
