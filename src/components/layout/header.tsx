"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, LogOut, Search, Settings as SettingsIcon, User } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { initialsOf } from "@/components/ui/contact-avatar";
import { useCommandPalette } from "@/components/layout/command-palette";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { WhatsAppStatusChip } from "@/components/layout/whatsapp-status-chip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { crumbsForPath } from "@/lib/nav";

/**
 * Glass top bar: page title + breadcrumb (derived from the shared nav
 * config, so every route — Flows and AI Agents included — gets its own
 * title), the Ctrl/⌘+K search trigger, the WhatsApp connection chip,
 * the theme toggle and the account menu.
 */
export function Header() {
  const t = useTranslations("Header");
  const tn = useTranslations("Nav");
  const tp = useTranslations("CommandPalette");
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const palette = useCommandPalette();

  const { item, group, subKey } = crumbsForPath(pathname);
  const pageLabel = item ? tn(`items.${item.module}`) : tn("items.dashboard");
  const title = subKey ? tn(`sub.${subKey}`) : pageLabel;

  const crumbs: Array<{ label: string; href?: string }> = [];
  if (group) crumbs.push({ label: tn(`groups.${group}`) });
  if (subKey && item) crumbs.push({ label: pageLabel, href: item.href });

  const initial = initialsOf(profile?.full_name || profile?.email || "U");

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 lg:px-6">
      <Link href="/dashboard" className="lg:hidden" aria-label={tn("items.dashboard")}>
        <LogoMark className="size-5" />
      </Link>

      {/* Breadcrumb doubles as the page heading for assistive tech. */}
      <nav aria-label={tn("breadcrumb")} className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((c) => (
            <li key={c.label} className="hidden items-center gap-1.5 text-muted-foreground sm:flex">
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
              <ChevronRight className="size-3.5 text-faint" aria-hidden />
            </li>
          ))}
          <li className="min-w-0" aria-current="page">
            <h1 className="truncate text-sm font-medium text-foreground">{title}</h1>
          </li>
        </ol>
      </nav>

      <button
        type="button"
        onClick={palette.open}
        className="hidden h-8 w-60 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-border-strong md:flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 truncate text-left">{tp("trigger")}</span>
        <kbd className="rounded border border-border px-1 font-sans text-[10px] text-faint">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={palette.open}
        aria-label={tp("trigger")}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
      >
        <Search className="size-4" />
      </button>

      <WhatsAppStatusChip />
      <ModeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center rounded-full"
          aria-label={t("openAccountMenu")}
        >
          <Avatar className="size-7">
            {profile?.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? t("defaultAvatar")} />
            ) : null}
            <AvatarFallback className="border border-border bg-card-2 text-xs font-medium text-muted-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="min-w-60">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {profile?.full_name ?? t("defaultUser")}
            </p>
            <p className="truncate text-xs text-muted-foreground">{profile?.email ?? ""}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings?tab=profile" />}>
            <User className="size-4" />
            {t("menuProfile")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" />}>
            <SettingsIcon className="size-4" />
            {t("menuSettings")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} variant="destructive">
            <LogOut className="size-4" />
            {t("menuSignOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
