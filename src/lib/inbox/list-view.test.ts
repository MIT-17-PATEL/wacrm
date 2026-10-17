import { describe, expect, it } from "vitest";

import type { Conversation } from "@/types";

import { matchesInboxView, sortConversations, stepCursor } from "./list-view";

function conv(id: string, patch: Partial<Conversation> = {}): Conversation {
  return {
    id,
    user_id: "u",
    contact_id: "c",
    status: "open",
    unread_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

describe("matchesInboxView", () => {
  const mine = conv("a", { assigned_agent_id: "me" });
  const theirs = conv("b", { assigned_agent_id: "them", unread_count: 2 });
  const nobody = conv("c");

  it("filters Mine / Unassigned / Unread", () => {
    expect([mine, theirs, nobody].filter((c) => matchesInboxView(c, "mine", "me"))).toEqual([mine]);
    expect([mine, theirs, nobody].filter((c) => matchesInboxView(c, "unassigned", "me"))).toEqual([nobody]);
    expect([mine, theirs, nobody].filter((c) => matchesInboxView(c, "unread", "me"))).toEqual([theirs]);
    expect([mine, theirs, nobody].filter((c) => matchesInboxView(c, "all", "me"))).toHaveLength(3);
  });

  it("shows nothing under Mine before the user is known", () => {
    expect(matchesInboxView(mine, "mine", null)).toBe(false);
  });
});

describe("sortConversations", () => {
  it("puts pinned chats first, then the newest message", () => {
    const old = conv("old", { last_message_at: "2026-01-01T00:00:00Z" });
    const mid = conv("mid", { last_message_at: "2026-01-02T00:00:00Z" });
    const fresh = conv("new", { last_message_at: "2026-01-03T00:00:00Z" });
    expect(sortConversations([old, fresh, mid], new Set()).map((c) => c.id)).toEqual(["new", "mid", "old"]);
    expect(sortConversations([old, fresh, mid], new Set(["old"])).map((c) => c.id)).toEqual(["old", "new", "mid"]);
  });
});

describe("stepCursor", () => {
  const ids = ["a", "b", "c"];
  it("starts at an end and clamps", () => {
    expect(stepCursor(ids, null, 1)).toBe("a");
    expect(stepCursor(ids, null, -1)).toBe("c");
    expect(stepCursor(ids, "b", 1)).toBe("c");
    expect(stepCursor(ids, "c", 1)).toBe("c");
    expect(stepCursor(ids, "a", -1)).toBe("a");
    expect(stepCursor([], "a", 1)).toBeNull();
  });
});
