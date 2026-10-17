import { describe, expect, it } from "vitest";

import {
  ALL_NAV_ITEMS,
  GOTO_SHORTCUTS,
  RAIL_ITEMS,
  crumbsForPath,
  isActivePath,
  panelModuleForPath,
  railItemForPath,
} from "./nav";

describe("crumbsForPath", () => {
  it("titles every top-level page after itself, not Dashboard", () => {
    for (const item of ALL_NAV_ITEMS) {
      expect(crumbsForPath(item.href).item?.module).toBe(item.module);
    }
  });

  it("resolves Flows and AI Agents (previously fell back to Dashboard)", () => {
    expect(crumbsForPath("/flows")).toMatchObject({
      item: { module: "flows" },
      group: "automate",
      subKey: null,
    });
    expect(crumbsForPath("/agents").item?.module).toBe("agents");
  });

  it("names sub-pages", () => {
    expect(crumbsForPath("/broadcasts/new").subKey).toBe("newBroadcast");
    expect(crumbsForPath("/broadcasts/abc").subKey).toBe("broadcastReport");
    expect(crumbsForPath("/automations/abc/edit").subKey).toBe("editAutomation");
    expect(crumbsForPath("/automations/abc/logs").subKey).toBe("automationLogs");
    expect(crumbsForPath("/flows/abc").subKey).toBe("flowEditor");
    expect(crumbsForPath("/flows/abc/runs").subKey).toBe("flowRuns");
  });

  it("returns no item for unknown paths", () => {
    expect(crumbsForPath("/nope").item).toBeNull();
  });
});

describe("isActivePath", () => {
  it("matches the route and its children but not lookalike prefixes", () => {
    expect(isActivePath("/flows", "/flows")).toBe(true);
    expect(isActivePath("/flows/abc", "/flows")).toBe(true);
    expect(isActivePath("/flowsx", "/flows")).toBe(false);
  });
});

describe("railItemForPath", () => {
  it("maps automations, flows and agents onto the Automate icon", () => {
    expect(railItemForPath("/automations/new")?.key).toBe("automate");
    expect(railItemForPath("/flows/abc/runs")?.key).toBe("automate");
    expect(railItemForPath("/agents")?.key).toBe("automate");
  });

  it("returns null for routes owned by the rail's bottom icons", () => {
    expect(railItemForPath("/settings")).toBeNull();
    expect(railItemForPath("/notifications")).toBeNull();
  });
});

describe("panelModuleForPath", () => {
  it("gives Dashboard and the flow editor the full width", () => {
    expect(panelModuleForPath("/dashboard")).toBeNull();
    expect(panelModuleForPath("/flows/abc")).toBeNull();
    expect(panelModuleForPath("/notifications")).toBeNull();
  });

  it("picks the module panel for every other page", () => {
    expect(panelModuleForPath("/inbox")).toBe("inbox");
    expect(panelModuleForPath("/flows")).toBe("automate");
    expect(panelModuleForPath("/flows/abc/runs")).toBe("automate");
    expect(panelModuleForPath("/broadcasts/new")).toBe("broadcasts");
    expect(panelModuleForPath("/settings")).toBe("settings");
  });
});

describe("GOTO_SHORTCUTS", () => {
  it("reaches every top-level page from the old sidebar", () => {
    const targets = new Set(Object.values(GOTO_SHORTCUTS));
    for (const item of ALL_NAV_ITEMS) {
      const reachable =
        targets.has(item.href) ||
        RAIL_ITEMS.some((r) => r.owns.includes(item.href));
      expect(reachable, item.href).toBe(true);
    }
  });
});
