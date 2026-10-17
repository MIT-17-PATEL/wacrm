import {
  Bell,
  Bot,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Settings,
  SquareKanban,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for app navigation — consumed by the sidebar,
 * the top bar (title + breadcrumb), the command palette and the mobile
 * tab bar, so a page can't be added to one and forgotten in another
 * (the old header kept its own title map and Flows / AI Agents fell
 * through to "Dashboard").
 *
 * Labels are next-intl keys under the `Nav` namespace.
 */

export type ModuleKey =
  | "dashboard"
  | "inbox"
  | "notifications"
  | "broadcasts"
  | "contacts"
  | "pipelines"
  | "automations"
  | "flows"
  | "agents"
  | "settings";

export type NavGroupKey = "engage" | "grow" | "automate";

export interface NavItem {
  module: ModuleKey;
  href: string;
  icon: LucideIcon;
  /** Static Tailwind class that sets `--tile` to the module accent. */
  tile: string;
  /** Shows a small "Beta" chip. Informational only. */
  beta?: boolean;
}

export interface NavGroup {
  /** `null` = ungrouped (Dashboard sits above the labelled groups). */
  key: NavGroupKey | null;
  items: NavItem[];
}

const ITEMS = {
  dashboard: { module: "dashboard", href: "/dashboard", icon: LayoutDashboard, tile: "" },
  inbox: { module: "inbox", href: "/inbox", icon: MessagesSquare, tile: "" },
  notifications: { module: "notifications", href: "/notifications", icon: Bell, tile: "" },
  broadcasts: { module: "broadcasts", href: "/broadcasts", icon: Megaphone, tile: "" },
  contacts: { module: "contacts", href: "/contacts", icon: Users, tile: "" },
  pipelines: { module: "pipelines", href: "/pipelines", icon: SquareKanban, tile: "" },
  automations: { module: "automations", href: "/automations", icon: Zap, tile: "" },
  flows: { module: "flows", href: "/flows", icon: Workflow, tile: "", beta: true },
  agents: { module: "agents", href: "/agents", icon: Bot, tile: "" },
  settings: { module: "settings", href: "/settings", icon: Settings, tile: "" },
} satisfies Record<ModuleKey, NavItem>;

export const NAV_ITEMS: Record<ModuleKey, NavItem> = ITEMS;

export const NAV_GROUPS: NavGroup[] = [
  { key: null, items: [ITEMS.dashboard] },
  { key: "engage", items: [ITEMS.inbox, ITEMS.notifications, ITEMS.broadcasts] },
  { key: "grow", items: [ITEMS.contacts, ITEMS.pipelines] },
  { key: "automate", items: [ITEMS.automations, ITEMS.flows, ITEMS.agents] },
];

export const SETTINGS_NAV_ITEM: NavItem = ITEMS.settings;

/** Every navigable top-level page, in sidebar order. */
export const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  SETTINGS_NAV_ITEM,
];

/* ------------------------------------------------------------------ */
/* Icon rail (WhatsApp-Web style): one icon per module.                 */
/* ------------------------------------------------------------------ */

export type RailModuleKey =
  | "dashboard"
  | "inbox"
  | "contacts"
  | "pipelines"
  | "broadcasts"
  | "automate";

export interface RailItem {
  key: RailModuleKey;
  href: string;
  icon: LucideIcon;
  /** Second key of the "G then <key>" jump shortcut. */
  shortcut: string;
  /** Route prefixes this rail icon owns. */
  owns: string[];
}

export const RAIL_ITEMS: RailItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, shortcut: "d", owns: ["/dashboard"] },
  { key: "inbox", href: "/inbox", icon: MessagesSquare, shortcut: "i", owns: ["/inbox"] },
  { key: "contacts", href: "/contacts", icon: Users, shortcut: "c", owns: ["/contacts"] },
  { key: "pipelines", href: "/pipelines", icon: SquareKanban, shortcut: "p", owns: ["/pipelines"] },
  { key: "broadcasts", href: "/broadcasts", icon: Megaphone, shortcut: "b", owns: ["/broadcasts"] },
  {
    key: "automate",
    href: "/automations",
    icon: Zap,
    shortcut: "a",
    owns: ["/automations", "/flows", "/agents"],
  },
];

/** "G then <key>" jump targets, including the rail's bottom icons. */
export const GOTO_SHORTCUTS: Record<string, string> = {
  ...Object.fromEntries(RAIL_ITEMS.map((i) => [i.shortcut, i.href])),
  n: "/notifications",
  s: "/settings",
};

/** Which context panel a route shows. `null` = no panel (full width). */
export type PanelModuleKey = Exclude<RailModuleKey, "dashboard"> | "settings";

export function railItemForPath(pathname: string): RailItem | null {
  return RAIL_ITEMS.find((i) => i.owns.some((p) => isActivePath(pathname, p))) ?? null;
}

export function panelModuleForPath(pathname: string): PanelModuleKey | null {
  if (isActivePath(pathname, "/settings")) return "settings";
  // The flow editor canvas needs every pixel; it keeps its own chrome.
  if (/^\/flows\/[^/]+$/.test(pathname)) return null;
  const item = railItemForPath(pathname);
  if (!item || item.key === "dashboard") return null;
  return item.key;
}

/** Which group a module belongs to (for the breadcrumb). */
export function groupOf(module: ModuleKey): NavGroupKey | null {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.module === module))?.key ?? null;
}

/** True when `pathname` is `href` or one of its sub-routes. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The top-level nav item that owns `pathname`, if any. */
export function navItemForPath(pathname: string): NavItem | null {
  return ALL_NAV_ITEMS.find((i) => isActivePath(pathname, i.href)) ?? null;
}

/**
 * Sub-page crumbs. Matched in order against the path *below* the
 * module root; the value is a key under `Nav.sub`.
 */
const SUB_PAGES: Array<{ module: ModuleKey; pattern: RegExp; key: string }> = [
  { module: "broadcasts", pattern: /^\/new$/, key: "newBroadcast" },
  { module: "broadcasts", pattern: /^\/[^/]+$/, key: "broadcastReport" },
  { module: "automations", pattern: /^\/new$/, key: "newAutomation" },
  { module: "automations", pattern: /^\/[^/]+\/edit$/, key: "editAutomation" },
  { module: "automations", pattern: /^\/[^/]+\/logs$/, key: "automationLogs" },
  { module: "flows", pattern: /^\/[^/]+\/runs$/, key: "flowRuns" },
  { module: "flows", pattern: /^\/[^/]+$/, key: "flowEditor" },
];

export interface PageCrumbs {
  item: NavItem | null;
  group: NavGroupKey | null;
  /** Key under `Nav.sub`, when on a sub-page. */
  subKey: string | null;
}

export function crumbsForPath(pathname: string): PageCrumbs {
  const item = navItemForPath(pathname);
  if (!item) return { item: null, group: null, subKey: null };
  const rest = pathname.slice(item.href.length);
  const sub = rest
    ? SUB_PAGES.find((s) => s.module === item.module && s.pattern.test(rest))
    : undefined;
  return { item, group: groupOf(item.module), subKey: sub?.key ?? null };
}
