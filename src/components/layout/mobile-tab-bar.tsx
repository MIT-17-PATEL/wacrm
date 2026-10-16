"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ellipsis, Sparkles } from "lucide-react";

import { useTotalUnread } from "@/hooks/use-total-unread";
import { NAV_ITEMS, isActivePath, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Bottom tab bar for phones (< lg): Inbox, Contacts, Pipelines,
 * Automate (automations / flows / AI agents) and More, which opens the
 * full sidebar as a drawer.
 */
export function MobileTabBar({ onOpenMore }: { onOpenMore: () => void }) {
  const tn = useTranslations("Nav");
  const pathname = usePathname();
  const totalUnread = useTotalUnread();

  const automateActive = [NAV_ITEMS.automations, NAV_ITEMS.flows, NAV_ITEMS.agents].some(
    (i) => isActivePath(pathname, i.href),
  );

  const tabs: Array<{
    item: NavItem;
    label: string;
    active: boolean;
    badge?: number;
    icon?: typeof Sparkles;
  }> = [
    {
      item: NAV_ITEMS.inbox,
      label: tn("items.inbox"),
      active: isActivePath(pathname, "/inbox"),
      badge: totalUnread,
    },
    {
      item: NAV_ITEMS.contacts,
      label: tn("items.contacts"),
      active: isActivePath(pathname, "/contacts"),
    },
    {
      item: NAV_ITEMS.pipelines,
      label: tn("items.pipelines"),
      active: isActivePath(pathname, "/pipelines"),
    },
    {
      item: NAV_ITEMS.automations,
      label: tn("groups.automate"),
      active: automateActive,
      icon: Sparkles,
    },
  ];

  return (
    <nav
      aria-label={tn("mobileNav")}
      className="bg-popover fixed inset-x-0 bottom-0 z-30 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {tabs.map(({ item, label, active, badge, icon }) => {
          const Icon = icon ?? item.icon;
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  item.tile,
                  "relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-muted text-tile",
                  )}
                >
                  <Icon className="size-5" />
                  {badge ? (
                    <span className="absolute -top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums ring-2 ring-background">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-1">{label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex">
          <button
            type="button"
            onClick={onOpenMore}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Ellipsis className="size-5" />
            </span>
            {tn("more")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
