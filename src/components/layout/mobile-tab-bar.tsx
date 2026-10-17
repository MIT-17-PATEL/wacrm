"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Ellipsis, LogOut, Moon, Sun, type LucideIcon } from "lucide-react";

import { useShell } from "@/components/layout/shell-context";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { NAV_ITEMS, RAIL_ITEMS, isActivePath, railItemForPath } from "@/lib/nav";
import { cn } from "@/lib/utils";

const TAB_KEYS = ["inbox", "contacts", "pipelines", "automate"] as const;

/**
 * Phone navigation (< md), WhatsApp-mobile style: Inbox, Contacts,
 * Pipelines, Automate and More — a sheet with every other page.
 */
export function MobileTabBar() {
  const tn = useTranslations("Nav");
  const pathname = usePathname();
  const { totalUnread, unreadNotifications, chatOpen } = useShell();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeRail = railItemForPath(pathname);
  const tabs = RAIL_ITEMS.filter((i) => (TAB_KEYS as readonly string[]).includes(i.key));
  const moreActive = !tabs.some((i) => i.key === activeRail?.key);


  return (
    <>
      <nav
        aria-label={tn("mobileNav")}
        className={cn(
          "bg-popover fixed inset-x-0 bottom-0 z-30 border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden",
          // Hidden while a chat is open full-screen, like WhatsApp.
          chatOpen && pathname === "/inbox" && "hidden",
        )}
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {tabs.map((item) => {
            const active = activeRail?.key === item.key;
            const label = item.key === "automate" ? tn("groups.automate") : tn(`items.${item.key}`);
            const badge = item.key === "inbox" ? totalUnread : 0;
            return (
              <li key={item.key} className="flex">
                <TabLink href={item.href} icon={item.icon} label={label} active={active} badge={badge} />
              </li>
            );
          })}
          <li className="flex">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                moreActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150",
                  moreActive && "bg-accent",
                )}
              >
                <Ellipsis className="size-5" />
                {unreadNotifications > 0 ? (
                  <span aria-hidden className="absolute top-0 right-2.5 size-2 rounded-full bg-primary ring-2 ring-popover" />
                ) : null}
              </span>
              {tn("more")}
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}

function TabLink({
  href,
  icon: Icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150",
          active && "bg-accent",
        )}
      >
        <Icon className="size-5" />
        {badge > 0 ? (
          <span className="absolute -top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums ring-2 ring-popover">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="max-w-full truncate px-1">{label}</span>
    </Link>
  );
}

/** Everything not on the tab bar: Dashboard, Broadcasts, Notifications, Settings, theme, sign out. */
function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const tn = useTranslations("Nav");
  const ts = useTranslations("Sidebar");
  const tm = useTranslations("ModeToggle");
  const pathname = usePathname();
  const { mode, toggleMode } = useTheme();
  const { signOut } = useAuth();
  const { unreadNotifications } = useShell();
  const items = [NAV_ITEMS.dashboard, NAV_ITEMS.broadcasts, NAV_ITEMS.notifications, NAV_ITEMS.settings];
  const rowClass =
    "flex h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <SheetHeader>
          <SheetTitle>{tn("moreTitle")}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col px-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onOpenChange(false)}
              aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
              className={cn(rowClass, isActivePath(pathname, item.href) && "bg-accent")}
            >
              <item.icon className="size-5 text-muted-foreground" />
              <span className="flex-1">{tn(`items.${item.module}`)}</span>
              {item.module === "notifications" && unreadNotifications > 0 ? (
                <span className="text-xs text-muted-foreground tabular-nums">{unreadNotifications}</span>
              ) : null}
            </Link>
          ))}
          <div aria-hidden className="my-1 h-px bg-border" />
          <button type="button" onClick={toggleMode} className={rowClass}>
            {mode === "dark" ? (
              <Sun className="size-5 text-muted-foreground" />
            ) : (
              <Moon className="size-5 text-muted-foreground" />
            )}
            {tm("switchMode", { mode: mode === "dark" ? "light" : "dark" })}
          </button>
          <button type="button" onClick={signOut} className={cn(rowClass, "text-danger")}>
            <LogOut className="size-5" />
            {ts("menuSignOut")}
          </button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
