import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dedupeByPhone,
  findExistingContact,
  isExactMatch,
  isUniqueViolation,
  normalizeKey,
} from "./dedupe";

describe("normalizeKey", () => {
  it("strips every non-digit", () => {
    expect(normalizeKey("+1 (555) 123-4567")).toBe("15551234567");
    expect(normalizeKey("15551234567")).toBe("15551234567");
  });

  it("collapses different formats of the same number to one key", () => {
    expect(normalizeKey("+44 7911 123456")).toBe(normalizeKey("447911123456"));
  });
});

describe("isExactMatch", () => {
  it("treats different formatting of the same digits as exact", () => {
    expect(isExactMatch({ id: "1", phone: "+1 555-123-4567" }, "15551234567")).toBe(
      true,
    );
  });

  it("is false for a trunk-variant (fuzzy) match", () => {
    // last-8 match but not the same full number
    expect(isExactMatch({ id: "1", phone: "37063949836" }, "370063949836")).toBe(
      false,
    );
  });
});

describe("isUniqueViolation", () => {
  it("detects Postgres 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });
  it("is false for other errors / non-objects", () => {
    expect(isUniqueViolation({ code: "23502" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("boom")).toBe(false);
  });
});

describe("dedupeByPhone", () => {
  it("keeps the first occurrence and counts in-file duplicates", () => {
    const { unique, duplicates } = dedupeByPhone([
      { phone: "+1 415 555-1111", name: "A" },
      { phone: "+1 (415) 555 1111", name: "B" }, // same digits as #1
      { phone: "+1 415 555-2222", name: "C" },
    ]);
    expect(unique.map((r) => r.name)).toEqual(["A", "C"]);
    expect(duplicates).toBe(1);
  });

  it("normalizes numbers without country code using default country (defaults to IN)", () => {
    const { unique, duplicates, invalid } = dedupeByPhone([
      { phone: "9876543210", name: "Indian national" },
      { phone: "+91 98765 43210", name: "Indian duplicate with formatting" },
      { phone: "+14155552671", name: "US with code" },
    ]);
    expect(unique).toHaveLength(2);
    expect(unique[0].phone).toBe("+919876543210");
    expect(unique[0].name).toBe("Indian national");
    expect(unique[1].phone).toBe("+14155552671");
    expect(duplicates).toBe(1);
    expect(invalid).toBe(0);
  });

  it("normalizes numbers without country code using specified defaultCountry (e.g. US)", () => {
    const { unique, duplicates, invalid } = dedupeByPhone(
      [
        { phone: "4155552671", name: "US national" },
        { phone: "+1 (415) 555-2671", name: "US duplicate" },
        { phone: "+919876543210", name: "Indian with code" },
      ],
      "US"
    );
    expect(unique).toHaveLength(2);
    expect(unique[0].phone).toBe("+14155552671");
    expect(duplicates).toBe(1);
    expect(invalid).toBe(0);
  });

  it("drops invalid rows, counted as invalid rather than duplicate", () => {
    const { unique, duplicates, invalid } = dedupeByPhone([
      { phone: "   " },
      { phone: "123" },
      { phone: "not-a-number" },
      { phone: "+91 98765 43210" },
    ]);
    expect(unique).toHaveLength(1);
    expect(unique[0].phone).toBe("+919876543210");
    expect(duplicates).toBe(0);
    expect(invalid).toBe(3);
  });
});

describe("findExistingContact", () => {
  // Minimal SupabaseClient stub: resolves the .from().select().eq().like()
  // chain to a fixed candidate set.
  function stubDb(rows: Array<{ id: string; phone: string }>): SupabaseClient {
    const builder = {
      select: () => builder,
      eq: () => builder,
      like: () => Promise.resolve({ data: rows, error: null }),
    };
    return { from: () => builder } as unknown as SupabaseClient;
  }

  it("returns a trunk-variant match via phonesMatch", async () => {
    const db = stubDb([{ id: "c1", phone: "37063949836" }]);
    const hit = await findExistingContact(db, "acct", "+370 063 949 836");
    expect(hit?.id).toBe("c1");
  });

  it("returns null when no candidate matches", async () => {
    const db = stubDb([{ id: "c1", phone: "15559999999" }]);
    const hit = await findExistingContact(db, "acct", "+1 555-123-4567");
    expect(hit).toBeNull();
  });

  it("returns null for an empty phone without querying", async () => {
    const db = stubDb([{ id: "c1", phone: "15551234567" }]);
    expect(await findExistingContact(db, "acct", "   ")).toBeNull();
  });
});
