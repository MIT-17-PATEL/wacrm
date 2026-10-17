import { cn } from "@/lib/utils"

/**
 * Shimmer placeholder block. Size it with classes (`h-4 w-32`, …).
 * Prefer this over spinners + "Loading…" text: it previews the shape
 * of what's coming and avoids layout shift when it arrives.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton", className)}
      {...props}
    />
  )
}

/** A few lines of text-shaped skeleton. */
function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: `${i === lines - 1 ? 55 : 100 - i * 8}%` }}
        />
      ))}
    </div>
  )
}

/** Table-row placeholders: avatar circle + a few cells. */
function SkeletonRows({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-border" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5" style={{ opacity: 1 - r * 0.1 }}>
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-40" />
          {Array.from({ length: columns - 1 }).map((_, c) => (
            <Skeleton key={c} className="hidden h-3.5 flex-1 md:block" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Whole-page placeholder: title, a row of cards and a large block. */
function PageSkeleton({ variant = "page" }: { variant?: "page" | "editor" }) {
  if (variant === "editor") {
    return (
      <div className="flex h-full flex-col gap-3 p-6" aria-busy>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="ml-auto h-8 w-24 rounded-lg" />
        </div>
        <Skeleton className="min-h-64 flex-1 rounded-xl" />
      </div>
    )
  }
  return (
    <div className="space-y-5" aria-busy>
      <Skeleton className="h-8 w-60" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[10px]" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-[10px]" />
    </div>
  )
}

export { Skeleton, SkeletonText, SkeletonRows, PageSkeleton }
