import { describe, expect, it } from "vitest";

import {
  PANEL_DEFAULT_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  clampPanelWidth,
  parsePanelPrefs,
} from "./use-panel-prefs";

describe("clampPanelWidth", () => {
  it("keeps the panel between 260 and 380px", () => {
    expect(clampPanelWidth(100)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(999)).toBe(PANEL_MAX_WIDTH);
    expect(clampPanelWidth(321.6)).toBe(322);
    expect(clampPanelWidth(Number.NaN)).toBe(PANEL_DEFAULT_WIDTH);
  });
});

describe("parsePanelPrefs", () => {
  it("falls back to defaults for missing or broken values", () => {
    expect(parsePanelPrefs(null)).toEqual({ collapsed: false, width: PANEL_DEFAULT_WIDTH });
    expect(parsePanelPrefs("{nope")).toEqual({ collapsed: false, width: PANEL_DEFAULT_WIDTH });
  });

  it("reads a stored choice and clamps the width", () => {
    expect(parsePanelPrefs('{"collapsed":true,"width":500}')).toEqual({
      collapsed: true,
      width: PANEL_MAX_WIDTH,
    });
  });
});
