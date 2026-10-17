import { describe, expect, it } from "vitest";

import { isWonStage } from "./won";

describe("isWonStage", () => {
  it("recognises the seeded Won stage in every UI language", () => {
    for (const name of ["Won", "Ganado", "Ganho", "성사", " closed won "]) {
      expect(isWonStage({ name }), name).toBe(true);
    }
  });

  it("ignores other stages and missing stages", () => {
    expect(isWonStage({ name: "Negotiation" })).toBe(false);
    expect(isWonStage({ name: "Wonderful leads" })).toBe(false);
    expect(isWonStage(null)).toBe(false);
  });
});
