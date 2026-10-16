import { describe, expect, it } from "vitest";

import { phoneCountry } from "./phone-country";

describe("phoneCountry", () => {
  it("detects India from +91", () => {
    expect(phoneCountry("+91 98765 43210")).toEqual({ iso: "IN", flag: "🇮🇳" });
    expect(phoneCountry("919876543210")?.iso).toBe("IN");
  });

  it("prefers the longest prefix", () => {
    expect(phoneCountry("+971501234567")?.iso).toBe("AE");
    expect(phoneCountry("+14155552671")?.iso).toBe("US");
  });

  it("returns null for short or unknown numbers", () => {
    expect(phoneCountry("12345")).toBeNull();
    expect(phoneCountry(null)).toBeNull();
    expect(phoneCountry("+999123456789")).toBeNull();
  });
});
