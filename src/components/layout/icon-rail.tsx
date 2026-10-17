"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import {
  Bell,
  Keyboard,
  LogOut,
  Moon,
  PanelLeft,
  PlugZap,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { useShell } from "@/components/layout/shell-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/contact-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useWhatsAppStatus } from "@/hooks/use-whatsapp-status";
import type { AccountRole } from "@/lib/auth/roles";
import { RAIL_ITEMS, isActivePath, panelModuleForPath, railItemForPath } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<AccountRole, string> = {
  owner: "roleOwner",
  admin: "roleAdmin",
  agent: "roleAgent",
  viewer: "roleViewer",
};

/** Formats a "G then X" shortcut for display. */
export function gotoKeys(key: string) {
  return `G ${key.toUpperCase()}`;
}

/**
 * WhatsApp-Web style icon rail: 64px, full height, one icon per module.
 * Tablet and desktop only — phones get the bottom tab bar instead.
 */
export function IconRail() {
  const t = useTranslations("Shell");
  const tn = useTranslations("Nav");
  const pathname = usePathname();
  const { togglePanel, totalUnread, unreadNotifications } = useShell();
  const activeRail = railItemForPath(pathname);
  const hasPanel = panelModuleForPath(pathname) !== null;
  const waStatus = useWhatsAppStatus();
  const waDown = waStatus === "disconnected" || waStatus === "not_configured";

  return (
    <nav
      aria-label={t("primaryNav")}
      className="hidden h-full w-16 shrink-0 flex-col items-center border-r border-border bg-card py-3 md:flex"
    >
      <RailTip label={tn("items.dashboard")}>
        <Link
          href="/dashboard"
          aria-label={tn("items.dashboard")}
          className="flex size-10 items-center justify-center rounded-lg"
        >
          <LogoMark className="size-6" />
        </Link>
      </RailTip>

      {/* Opens the context panel as a drawer below lg; collapses it above. */}
      <RailTip label={t("togglePanel")} keys="Ctrl B">
        <button
          type="button"
          onClick={togglePanel}
          disabled={!hasPanel}
          aria-label={t("togglePanel")}
          className="mt-2 flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-0"
        >
          <PanelLeft className="size-5" />
        </button>
      </RailTip>

      <div aria-hidden className="my-2 h-px w-8 bg-border" />

      <ul className="flex flex-col items-center gap-1">
        {RAIL_ITEMS.map((item) => {
          const label = item.key === "automate" ? tn("groups.automate") : tn(`items.${item.key}`);
          const active = activeRail?.key === item.key;
          const badge = item.key === "inbox" && totalUnread > 0 ? totalUnread : null;
          return (
            <li key={item.key}>
              <RailTip
                label={badge ? `${label} · ${t("unreadCount", { count: badge })}` : label}
                keys={gotoKeys(item.shortcut)}
              >
                <RailLink href={item.href} active={active} label={label}>
                  <item.icon className="size-6" strokeWidth={1.75} />
                  {badge ? <CountBadge count={badge} /> : null}
                </RailLink>
              </RailTip>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-1">
        {waDown ? (
          <RailTip label={t("whatsappDown")}>
            <RailLink href="/settings?tab=whatsapp" active={false} label={t("whatsappDown")}>
              <PlugZap className="size-5" />
              <span aria-hidden className="absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-card" />
            </RailLink>
          </RailTip>
        ) : null}
        <RailTip label={tn("items.notifications")} keys={gotoKeys("n")}>
          <RailLink
            href="/notifications"
            active={isActivePath(pathname, "/notifications")}
            label={
              unreadNotifications > 0
                ? `${tn("items.notifications")} · ${t("unreadCount", { count: unreadNotifications })}`
                : tn("items.notifications")
            }
          >
            <Bell className="size-5" />
            {unreadNotifications > 0 ? (
              <span aria-hidden className="absolute top-2 right-2.5 size-2 rounded-full bg-primary ring-2 ring-card" />
            ) : null}
          </RailLink>
        </RailTip>
        <RailTip label={tn("items.settings")} keys={gotoKeys("s")}>
          <RailLink href="/settings" active={isActivePath(pathname, "/settings")} label={tn("items.settings")}>
            <Settings className="size-5" />
          </RailLink>
        </RailTip>
        <RailThemeToggle />
        <AccountMenu />
      </div>
    </nav>
  );
}

function RailTip({ label, keys, children }: { label: string; keys?: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger delay={300} render={children} />
      <TooltipContent side="right" sideOffset={10}>
        <span>{label}</span>
        {keys ? (
          <kbd className="ml-2 rounded border border-background/25 px-1 font-sans text-[10px] opacity-75">{keys}</kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function RailLink({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-lg transition-colors duration-150",
        active
          ? "bg-accent text-foreground shadow-card"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {/* 3px accent bar on the rail's left edge. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-2 bottom-2 -left-2.5 w-[3px] rounded-r-full bg-primary transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      {children}
    </Link>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums ring-2 ring-card",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function RailThemeToggle() {
  const t = useTranslations("ModeToggle");
  const { mode, toggleMode } = useTheme();
  const label = t("switchMode", { mode: mode === "dark" ? "light" : "dark" });
  return (
    <RailTip label={label}>
      <button
        type="button"
        onClick={toggleMode}
        aria-label={label}
        className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent/60 hover:text-foreground"
      >
        {mode === "dark" ? <Moon className="size-5" /> : <Sun className="size-5" />}
      </button>
    </RailTip>
  );
}

/** Avatar menu: profile, the workspace (with role badge), shortcuts, log out. */
export function AccountMenu({ side = "right" }: { side?: "right" | "top" }) {
  const t = useTranslations("Shell");
  const ts = useTranslations("Sidebar");
  const tn = useTranslations("Nav");
  const { profile, account, accountRole, signOut } = useAuth();
  const { setShortcutsOpen } = useShell();
  const name = profile?.full_name || profile?.email || ts("defaultUser");
  const workspace = account?.name || name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("accountMenu")}
        className="mt-1 flex size-11 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-accent/60"
      >
        <Avatar className="size-8">
          {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
          <AvatarFallback className="border border-border bg-card-2 text-xs font-medium text-muted-foreground">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" sideOffset={8} className="min-w-64">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          {profile?.email ? <p className="truncate text-xs text-muted-foreground">{profile.email}</p> : null}
        </div>
        <DropdownMenuItem render={<Link href="/settings?tab=profile" />}>
          <User className="size-4" />
          {ts("menuProfile")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">{tn("workspace")}</div>
        <DropdownMenuItem render={<Link href="/settings?tab=members" />}>
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border-strong bg-card-2 text-[11px] font-semibold text-foreground"
          >
            {initialsOf(workspace)}
          </span>
          <span className="min-w-0 flex-1 truncate">{workspace}</span>
          {accountRole ? (
            <span className="shrink-0 rounded border border-border px-1 text-[10px] leading-4 font-medium text-muted-foreground">
              {ts(ROLE_LABEL[accountRole])}
            </span>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings?tab=members" />}>
          <Users className="size-4" />
          {ts("menuTeam")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
          <Keyboard className="size-4" />
          {t("shortcuts")}
          <kbd className="ml-auto text-[10px] text-faint">?</kbd>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} variant="destructive">
          <LogOut className="size-4" />
          {ts("menuSignOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
