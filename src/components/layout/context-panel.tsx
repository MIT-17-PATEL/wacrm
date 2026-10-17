"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PanelLeftClose, X } from "lucide-react";

import { DOCK_QUERY, useShell } from "@/components/layout/shell-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  PANEL_DEFAULT_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  clampPanelWidth,
} from "@/hooks/use-panel-prefs";
import { cn } from "@/lib/utils";

interface ContextPanelProps {
  title: ReactNode;
  /** Header buttons, e.g. "+ New". */
  actions?: ReactNode;
  children: ReactNode;
  /**
   * Below `lg`: `drawer` slides in over the page (opened from the rail);
   * `inline` fills the main area instead — WhatsApp mobile's chat list.
   */
  compact?: "drawer" | "inline";
  /** `inline` only: hide below `lg` (e.g. while a chat is open). */
  hiddenCompact?: boolean;
  /** Replaces the default header row entirely. */
  header?: ReactNode;
}

/**
 * The second column of the WhatsApp-Web layout: the current module's
 * menu. Docked at `lg`+ (resizable 260–380px, collapsible with its
 * button or Ctrl+B, both remembered per user); a drawer below that.
 */
export function ContextPanel({
  title,
  actions,
  children,
  compact = "drawer",
  hiddenCompact = false,
  header,
}: ContextPanelProps) {
  const t = useTranslations("Shell");
  const { panel, setPanel, drawerOpen, setDrawerOpen } = useShell();
  const docked = useMediaQuery(DOCK_QUERY);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const width = dragWidth ?? panel.width;
  const isDrawer = compact === "drawer";
  const drawerClosed = isDrawer && !docked && !drawerOpen;

  // Escape closes the drawer.
  useEffect(() => {
    if (!isDrawer || !drawerOpen || docked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawer, drawerOpen, docked, setDrawerOpen]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: panel.width };
    setDragWidth(panel.width);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setDragWidth(clampPanelWidth(drag.current.w + e.clientX - drag.current.x));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dragWidth !== null) setPanel({ width: dragWidth });
    setDragWidth(null);
  };
  const onResizeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === "ArrowLeft") setPanel({ width: panel.width - step });
    else if (e.key === "ArrowRight") setPanel({ width: panel.width + step });
    else if (e.key === "Home") setPanel({ width: PANEL_MIN_WIDTH });
    else if (e.key === "End") setPanel({ width: PANEL_MAX_WIDTH });
    else return;
    e.preventDefault();
  };

  return (
    <>
      {isDrawer ? (
        <button
          type="button"
          aria-label={t("closePanel")}
          tabIndex={-1}
          onClick={() => setDrawerOpen(false)}
          className={cn(
            "fixed inset-0 z-40 bg-(--overlay) transition-opacity duration-150 lg:hidden",
            drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
      ) : null}
      <aside
        aria-label={typeof title === "string" ? title : undefined}
        inert={drawerClosed || undefined}
        style={{ "--panel-w": `${width}px` } as CSSProperties}
        className={cn(
          "min-h-0 shrink-0 flex-col border-r border-border bg-card lg:w-(--panel-w)",
          isDrawer
            ? cn(
                "fixed inset-y-0 left-0 z-50 flex w-[min(320px,85vw)] transition-transform duration-150 ease-out md:left-16",
                "lg:relative lg:left-auto lg:z-auto lg:translate-x-0 lg:transition-none",
                drawerOpen ? "translate-x-0 shadow-raised lg:shadow-none" : "-translate-x-[calc(100%+4rem)]",
              )
            : cn("relative w-full", hiddenCompact ? "hidden lg:flex" : "flex"),
          panel.collapsed && "lg:hidden",
        )}
      >
        {header ?? (
          <div className="flex h-14 shrink-0 items-center gap-1 pr-2 pl-4">
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{title}</h2>
            {actions}
            <button
              type="button"
              onClick={() => setPanel({ collapsed: true })}
              aria-label={t("collapsePanel")}
              title={`${t("collapsePanel")} (Ctrl B)`}
              className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground lg:flex"
            >
              <PanelLeftClose className="size-4" />
            </button>
            {isDrawer ? (
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("closePanel")}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>

        {/* Resize handle (docked only). Double-click resets the width. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("resizePanel")}
          aria-valuenow={width}
          aria-valuemin={PANEL_MIN_WIDTH}
          aria-valuemax={PANEL_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onResizeKey}
          onDoubleClick={() => setPanel({ width: PANEL_DEFAULT_WIDTH })}
          className="group absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize touch-none outline-none lg:block"
        >
          <span
            className={cn(
              "mx-auto block h-full w-px transition-colors duration-150 group-hover:bg-border-strong group-focus-visible:bg-primary",
              dragWidth !== null && "bg-primary",
            )}
          />
        </div>
      </aside>
    </>
  );
}

/** One row in a context panel list: icon/dot, label, trailing count. */
export function PanelLink({
  active,
  children,
  trailing,
  className,
  ...props
}: React.ComponentProps<typeof Link> & { active?: boolean; trailing?: ReactNode }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {trailing != null ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{trailing}</span>
      ) : null}
    </Link>
  );
}

/** Small uppercase section label inside a context panel. */
export function PanelSection({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-1">
      <div className="mb-1 flex items-center justify-between px-2.5">
        <h3 className="text-[11px] font-medium tracking-[0.06em] text-faint uppercase">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-px">{children}</div>
    </section>
  );
}
