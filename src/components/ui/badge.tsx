import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Badges are small and neutral. Semantic variants add a 6px coloured
// dot — colour only where it carries meaning, never as a fill.
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border px-1.5 text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-muted-foreground",
        soft: "border-border bg-muted text-muted-foreground",
        success: "border-border bg-card text-foreground before:size-1.5 before:shrink-0 before:rounded-full before:bg-success before:content-['']",
        warning: "border-border bg-card text-foreground before:size-1.5 before:shrink-0 before:rounded-full before:bg-warning before:content-['']",
        danger: "border-border bg-card text-foreground before:size-1.5 before:shrink-0 before:rounded-full before:bg-danger before:content-['']",
        info: "border-border bg-card text-foreground before:size-1.5 before:shrink-0 before:rounded-full before:bg-info before:content-['']",
        ai: "border-border bg-muted text-muted-foreground",
        saffron: "border-border bg-muted text-muted-foreground",
        tile: "border-border bg-card text-foreground before:size-1.5 before:shrink-0 before:rounded-full before:bg-tile before:content-['']",
        secondary: "border-border bg-muted text-muted-foreground",
        destructive: "border-border bg-card text-foreground before:size-1.5 before:shrink-0 before:rounded-full before:bg-danger before:content-['']",
        outline: "border-border-strong bg-transparent text-muted-foreground",
        ghost: "border-transparent text-muted-foreground hover:bg-muted",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
