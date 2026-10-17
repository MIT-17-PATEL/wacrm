"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { PanelLeft, Search } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { CommandPaletteProvider, useCommandPalette } from "@/components/layout/command-palette";
import { IconRail } from "@/components/layout/icon-rail";
import { GlobalShortcuts, ShortcutsSheet } from "@/components/layout/keyboard-shortcuts";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { ModulePanel } from "@/components/layout/module-panels";
import { ShellProvider, useShell } from "@/components/layout/shell-context";
import { UnreadTitle } from "@/components/layout/unread-title";
import { WonCelebration } from "@/components/layout/won-celebration";
import { BrowserNotificationsListener } from "@/components/notifications/browser-notifications-listener";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { crumbsForPath, panelModuleForPath } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

/**
 * Routes that own the whole content area edge to edge (their own
 * scroll regions, full height) instead of sitting in the padded,
 * max-width page container.
 */
function isFullBleed(pathname: string) {
  return pathname === "/inbox" || /^\/flows\/[^/]+$/.test(pathname);
}

/**
 * WhatsApp-Web layout: icon rail │ context panel │ main area.
 * Phones swap the rail for a bottom tab bar and a slim top bar.
 */
function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("DashboardShell");

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) return <ShellSkeleton />;
  if (!user) return null;

  const fullBleed = isFullBleed(pathname);
  const panelModule = panelModuleForPath(pathname);

  return (
    <CommandPaletteProvider>
      <ShellProvider>
        {/* `fixed inset-0` + overflow-clip: the frame can never be scrolled
            sideways (not by wheel, focus or scrollIntoView), so the rail
            and panel always render whole whatever a page's content does. */}
        <div className="fixed inset-0 flex overflow-clip bg-background">
          {/* Keyboard users can jump past the navigation. */}
          <a
            href="#main-content"
            className="sr-only z-[60] rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            {t("skipToContent")}
          </a>
          {/* Headless: presence, desktop alerts, tab title, shortcuts. */}
          <PresenceHeartbeat />
          <BrowserNotificationsListener />
          <UnreadTitle />
          <GlobalShortcuts />
          <ShortcutsSheet />
          <WonCelebration />

          <IconRail />
          {/* Inbox renders its own panel (the chat list owns inbox state). */}
          {panelModule && panelModule !== "inbox" ? <ModulePanel module={panelModule} /> : null}

          {/* min-w-0 lets wide content (tables, boards) scroll inside the
              column instead of pushing the page past the viewport. */}
          <div className="flex min-w-0 flex-1 flex-col overflow-clip">
            {pathname === "/inbox" ? null : <MobileTopBar hasPanel={panelModule !== null} />}
            <main
              id="main-content"
              tabIndex={-1}
              className={cn(
                "relative min-h-0 min-w-0 flex-1 overflow-x-hidden outline-none",
                fullBleed ? "overflow-y-hidden pb-16 md:pb-0" : "overflow-y-auto",
              )}
            >
              {fullBleed ? (
                <div className="flex h-full min-h-0 flex-col">
                  <AccountAccessAlert />
                  <PageTransition key={pathname} className="min-h-0 flex-1">
                    {children}
                  </PageTransition>
                </div>
              ) : (
                <div className="page-container px-4 pt-5 pb-24 sm:px-6 md:pb-10 lg:px-8 lg:pt-7">
                  <AccountAccessAlert />
                  <PageTransition key={pathname}>{children}</PageTransition>
                </div>
              )}
            </main>
          </div>
          <MobileTabBar />
        </div>
      </ShellProvider>
    </CommandPaletteProvider>
  );
}

/** Phones only: logo, page title, panel button and search. */
function MobileTopBar({ hasPanel }: { hasPanel: boolean }) {
  const tn = useTranslations("Nav");
  const ts = useTranslations("Shell");
  const tp = useTranslations("CommandPalette");
  const pathname = usePathname();
  const palette = useCommandPalette();
  const { setDrawerOpen } = useShell();
  const { item, subKey } = crumbsForPath(pathname);
  const title = subKey ? tn(`sub.${subKey}`) : item ? tn(`items.${item.module}`) : tn("items.dashboard");

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 md:hidden">
      {hasPanel ? (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={ts("togglePanel")}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelLeft className="size-5" />
        </button>
      ) : (
        <Link href="/dashboard" aria-label={tn("items.dashboard")} className="flex size-9 items-center justify-center">
          <LogoMark className="size-5" />
        </Link>
      )}
      <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{title}</p>
      <button
        type="button"
        onClick={palette.open}
        aria-label={tp("trigger")}
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Search className="size-5" />
      </button>
    </header>
  );
}

/** 120ms opacity fade on route change. */
function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className={cn("min-w-0", className)}
    >
      {children}
    </motion.div>
  );
}

/** Skeleton of the app frame (rail + panel + page) while the session resolves. */
function ShellSkeleton() {
  const t = useTranslations("DashboardShell");
  return (
    <div className="fixed inset-0 flex overflow-clip bg-background" aria-busy>
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      <div className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-border bg-card py-3 md:flex">
        <LogoMark className="size-6" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton size-10 rounded-lg" style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      </div>
      <div className="hidden w-[300px] shrink-0 flex-col gap-2 border-r border-border bg-card p-4 lg:flex">
        <div className="skeleton h-5 w-28" />
        <div className="skeleton mt-2 h-9 rounded-md" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="skeleton h-8 rounded-md" style={{ opacity: 1 - i * 0.1 }} />
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="page-container space-y-4 px-4 py-7 sm:px-6 lg:px-8">
          <div className="skeleton h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-32 rounded-[10px]" />
            ))}
          </div>
          <div className="skeleton h-72 rounded-[10px]" />
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
