import { describe, expect, it } from "vitest";

import { ALL_NAV_ITEMS, crumbsForPath, isActivePath } from "./nav";

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
