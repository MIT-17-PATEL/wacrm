import { describe, expect, it } from "vitest";

import { initialsOf } from "./contact-avatar";

describe("initialsOf", () => {
  it("uses the first and last word", () => {
    expect(initialsOf("MIT DHARMESHBHAI PATEL")).toBe("MP");
    expect(initialsOf("Mit D Patel")).toBe("MP");
    expect(initialsOf("priya sharma")).toBe("PS");
  });

  it("handles single words, numbers and empty input", () => {
    expect(initialsOf("Priya")).toBe("P");
    expect(initialsOf("+91 98765 43210")).toBe("94");
    expect(initialsOf("  ")).toBe("?");
  });
});
