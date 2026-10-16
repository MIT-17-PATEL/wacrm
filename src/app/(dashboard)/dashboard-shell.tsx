"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { LogoMark } from "@/components/brand/logo";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { CommandPaletteProvider } from "@/components/layout/command-palette";
import { Header } from "@/components/layout/header";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { BrowserNotificationsListener } from "@/components/notifications/browser-notifications-listener";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
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

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("DashboardShell");

  // Mobile drawer (opened from the tab bar's "More"). Ignored on lg+.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) return <ShellSkeleton />;
  if (!user) return null;

  const fullBleed = isFullBleed(pathname);

  return (
    <CommandPaletteProvider>
      {/* `fixed inset-0` + overflow-clip: the frame can never be scrolled
          sideways (not by wheel, focus or scrollIntoView), so the sidebar
          always renders whole whatever a page's content does. */}
      <div className="fixed inset-0 flex overflow-clip bg-background">
        {/* Keyboard users can jump past the navigation. */}
        <a
          href="#main-content"
          className="sr-only z-[60] rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {t("skipToContent")}
        </a>
        {/* Headless: presence heartbeat + opt-in desktop alerts. */}
        <PresenceHeartbeat />
        <BrowserNotificationsListener />
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
        {/* min-w-0 lets wide content (tables, boards) scroll inside the
            column instead of pushing the page past the viewport. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-clip">
          <Header />
          <main
            id="main-content"
            tabIndex={-1}
            className={cn(
              "relative min-h-0 min-w-0 flex-1 overflow-x-hidden outline-none",
              fullBleed ? "overflow-y-hidden pb-16 lg:pb-0" : "overflow-y-auto",
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
              <div className="page-container px-4 pt-5 pb-24 sm:px-6 lg:px-8 lg:pt-7 lg:pb-10">
                <AccountAccessAlert />
                <PageTransition key={pathname}>{children}</PageTransition>
              </div>
            )}
          </main>
        </div>
        <MobileTabBar onOpenMore={() => setSidebarOpen(true)} />
      </div>
    </CommandPaletteProvider>
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

/** Branded skeleton of the app frame while the session resolves. */
function ShellSkeleton() {
  const t = useTranslations("DashboardShell");
  return (
    <div className="fixed inset-0 flex overflow-clip bg-background" aria-busy>
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      <div className="hidden w-60 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 lg:flex">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-5" />
          <div className="skeleton h-4 w-28" />
        </div>
        <div className="skeleton mt-2 h-10 rounded-md" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-8 rounded-md" style={{ opacity: 1 - i * 0.08 }} />
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-border px-6">
          <div className="skeleton h-6 w-40" />
          <div className="ml-auto skeleton h-8 w-60 rounded-lg" />
        </div>
        <div className="page-container space-y-4 px-4 py-7 sm:px-6 lg:px-8">
          <div className="skeleton h-24 rounded-[10px]" />
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
