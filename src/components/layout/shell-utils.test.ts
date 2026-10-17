import { describe, expect, it } from "vitest";

import { isTypingTarget } from "./keyboard-shortcuts";
import { withUnreadPrefix } from "./unread-title";

describe("withUnreadPrefix", () => {
  it("adds, updates and removes the (n) prefix", () => {
    expect(withUnreadPrefix("Inbox — Neno Connect", 3)).toBe("(3) Inbox — Neno Connect");
    expect(withUnreadPrefix("(3) Inbox — Neno Connect", 4)).toBe("(4) Inbox — Neno Connect");
    expect(withUnreadPrefix("(4) Inbox — Neno Connect", 0)).toBe("Inbox — Neno Connect");
    expect(withUnreadPrefix("Neno Connect", 250)).toBe("(99+) Neno Connect");
    expect(withUnreadPrefix("(99+) Neno Connect", 2)).toBe("(2) Neno Connect");
  });
});

describe("isTypingTarget", () => {
  it("ignores non-elements", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
