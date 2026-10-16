import { BRAND, LOGO_PATH } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Flat brand mark — a speech bubble in the accent colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-6 shrink-0 text-muted-foreground", className)}
      aria-hidden
      focusable="false"
    >
      <path d={LOGO_PATH} fill="currentColor" />
    </svg>
  );
}

/** Mark + wordmark: "Neno" in foreground, "Connect" muted. */
export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  const [first, ...rest] = BRAND.name.split(" ");
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <LogoMark className="size-5" />
      {showWordmark ? (
        <span className="truncate text-[15px] font-semibold text-foreground">
          {first}
          {rest.length ? <span className="font-normal text-muted-foreground"> {rest.join(" ")}</span> : null}
        </span>
      ) : (
        <span className="sr-only">{BRAND.name}</span>
      )}
    </span>
  );
}
