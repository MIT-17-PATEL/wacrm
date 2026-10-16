"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  X,
} from "lucide-react";

import { Logo, LogoMark } from "@/components/brand/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initialsOf } from "@/components/ui/contact-avatar";
import { useAuth } from "@/hooks/use-auth";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import type { AccountRole } from "@/lib/auth/roles";
import { NAV_GROUPS, SETTINGS_NAV_ITEM, isActivePath, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<AccountRole, string> = {
  owner: "roleOwner",
  admin: "roleAdmin",
  agent: "roleAgent",
  viewer: "roleViewer",
};

interface SidebarProps {
  /** Mobile drawer state, driven by the bottom tab bar's "More". Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations("Sidebar");
  const tn = useTranslations("Nav");
  const pathname = usePathname();
  const [collapsedPref, setCollapsed] = useSidebarCollapsed();
  // The mobile drawer is always full width; collapse is desktop-only.
  const collapsed = collapsedPref && !open;
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();

  // Close the drawer once the user picks a destination.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const badgeFor = (item: NavItem): NavBadge | null => {
    if (item.module === "inbox" && totalUnread > 0) {
      return { count: totalUnread, label: t("unreadConversations", { count: totalUnread }) };
    }
    if (item.module === "notifications" && unreadNotifications > 0) {
      return {
        count: unreadNotifications,
        label: t("unreadNotifications", { count: unreadNotifications }),
      };
    }
    return null;
  };

  return (
    <>
      {/* Mobile backdrop. */}
      <button
        type="button"
        aria-label={t("closeMenu")}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-(--overlay) transition-opacity lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        aria-label={t("primaryNav")}
        data-collapsed={collapsed || undefined}
        className={cn(
          // shrink-0: the column never gives up width to the page content.
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar",
          "transition-[translate] duration-150 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:translate-x-0",
          collapsed ? "lg:w-[60px]" : "lg:w-60",
        )}
      >
        {/* Brand row */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center justify-between gap-2 px-4",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <Link href="/dashboard" className="flex min-w-0 items-center rounded-md">
            {collapsed ? <LogoMark className="size-5" /> : <Logo />}
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <WorkspacePill collapsed={collapsed} onNavigate={onClose} />

        {/* Main navigation */}
        <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.key ?? "root"} className="mt-4 first:mt-2">
              {group.key ? (
                collapsed ? (
                  <div aria-hidden className="mx-auto mb-2 h-px w-5 bg-border" />
                ) : (
                  <p className="mb-1 px-2 text-[11px] font-medium tracking-[0.06em] text-faint uppercase">
                    {tn(`groups.${group.key}`)}
                  </p>
                )
              ) : null}
              <ul className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      label={tn(`items.${item.module}`)}
                      active={isActivePath(pathname, item.href)}
                      collapsed={collapsed}
                      badge={badgeFor(item)}
                      betaLabel={item.beta ? tn("beta") : null}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Settings + collapse toggle. Bottom padding keeps it clear of
            anything pinned to the viewport corner (e.g. dev overlays). */}
        <div className="shrink-0 space-y-px border-t border-sidebar-border px-2 pt-2 pb-4">
          <NavLink
            item={SETTINGS_NAV_ITEM}
            label={tn("items.settings")}
            active={isActivePath(pathname, SETTINGS_NAV_ITEM.href)}
            collapsed={collapsed}
            badge={null}
            betaLabel={null}
          />
          <button
            type="button"
            onClick={() => setCollapsed(!collapsedPref)}
            aria-label={collapsed ? tn("expandSidebar") : tn("collapseSidebar")}
            title={collapsed ? tn("expandSidebar") : tn("collapseSidebar")}
            className={cn(
              "hidden h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                <span>{tn("collapseSidebar")}</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

interface NavBadge {
  count: number;
  label: string;
}

function NavLink({
  item,
  label,
  active,
  collapsed,
  badge,
  betaLabel,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  collapsed: boolean;
  badge: NavBadge | null;
  betaLabel: string | null;
}) {
  const Icon = item.icon;
  const badgeText = badge ? (badge.count > 99 ? "99+" : String(badge.count)) : null;

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? (badge ? `${label} — ${badge.label}` : label) : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        collapsed && "lg:justify-center lg:px-0",
      )}
    >
      {/* Active indicator — the accent's only job in the nav. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
      {collapsed ? null : <span className="flex-1 truncate">{label}</span>}
      {!collapsed && betaLabel ? (
        <span className="rounded border border-border-strong px-1 text-[10px] leading-4 font-medium text-muted-foreground">
          {betaLabel}
        </span>
      ) : null}
      {badge && badgeText ? (
        <span
          aria-label={collapsed ? undefined : badge.label}
          className={cn(
            "min-w-5 rounded px-1 text-center text-[11px] leading-5 font-medium text-muted-foreground tabular-nums",
            collapsed && "absolute top-0 right-1 min-w-0 px-0 text-[10px] leading-3",
          )}
        >
          {badgeText}
        </span>
      ) : null}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right" sideOffset={10}>
        {label}
        {badgeText ? ` · ${badgeText}` : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The signed-in workspace (account) under the logo: initials, name and
 * the caller's role as a plain neutral badge.
 */
function WorkspacePill({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("Sidebar");
  const tn = useTranslations("Nav");
  const { account, accountRole, profile, profileLoading } = useAuth();
  const name = account?.name || profile?.full_name || profile?.email || "";

  if (profileLoading && !account) {
    return (
      <div className="px-2 pb-1">
        <div className={cn("skeleton h-10 rounded-md", collapsed && "lg:mx-auto lg:size-9")} />
      </div>
    );
  }

  return (
    <div className="px-2 pb-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${tn("workspace")}: ${name}`}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-accent data-popup-open:bg-accent",
            collapsed && "lg:justify-center",
          )}
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border-strong bg-card-2 text-[11px] font-semibold text-foreground"
          >
            {initialsOf(name)}
          </span>
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground" title={name}>
                {name}
              </span>
              {accountRole ? (
                <span className="shrink-0 rounded border border-border px-1 text-[10px] leading-4 font-medium text-muted-foreground">
                  {t(ROLE_LABEL[accountRole])}
                </span>
              ) : null}
              <ChevronsUpDown className="size-3.5 shrink-0 text-faint" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="min-w-56">
          <div className="px-2 py-1.5">
            <p className="text-xs text-muted-foreground">{tn("workspace")}</p>
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings?tab=members" onClick={onNavigate} />}>
            <Users className="size-4" />
            {t("menuTeam")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" onClick={onNavigate} />}>
            <Settings className="size-4" />
            {t("menuSettings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
