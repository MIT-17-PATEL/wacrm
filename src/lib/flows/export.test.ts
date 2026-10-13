import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/webhooks/ssrf", () => ({
  isDeliverableUrl: vi.fn(async (url: string) => !url.includes("169.254")),
}));

import {
  answerVars,
  buildExportPayload,
  exportCompletedRun,
  isAcceptedStatus,
  replyTitleFor,
  sanitizeVarKey,
  saveAsKeyFor,
} from "./export";

const buttons = {
  node_type: "send_buttons",
  config: {
    text: "Which type of home?",
    save_as: "bhk",
    buttons: [
      { reply_id: "b1", title: "2 BHK", next_node_key: "l1" },
      { reply_id: "b2", title: "3 BHK", next_node_key: "l2" },
    ],
  },
};

const list = {
  node_type: "send_list",
  config: {
    text: "Budget?",
    button_label: "Select",
    save_as: "bud get!",
    sections: [
      { rows: [{ reply_id: "r1", title: "₹30L – 35L", next_node_key: "m" }] },
      { rows: [{ reply_id: "r2", title: "₹35L – 40L", next_node_key: "m" }] },
    ],
  },
};

describe("replyTitleFor", () => {
  it("returns the tapped button's title", () => {
    expect(replyTitleFor(buttons, "b2")).toBe("3 BHK");
  });
  it("finds list rows in any section", () => {
    expect(replyTitleFor(list, "r2")).toBe("₹35L – 40L");
  });
  it("returns null for an unknown id or node type", () => {
    expect(replyTitleFor(buttons, "nope")).toBeNull();
    expect(replyTitleFor({ node_type: "end", config: {} }, "b1")).toBeNull();
  });
});

describe("saveAsKeyFor", () => {
  it("reads and sanitises save_as on interactive nodes", () => {
    expect(saveAsKeyFor(buttons)).toBe("bhk");
    expect(saveAsKeyFor(list)).toBe("budget");
  });
  it("ignores other node types and missing keys", () => {
    expect(saveAsKeyFor({ node_type: "collect_input", config: { save_as: "x" } })).toBe("");
    expect(saveAsKeyFor({ node_type: "send_buttons", config: {} })).toBe("");
  });
  it("sanitizeVarKey keeps only letters, digits and underscore", () => {
    expect(sanitizeVarKey("my area-1 ")).toBe("myarea1");
  });
});

describe("answerVars", () => {
  it("keeps scalars as strings and drops internal/structured values", () => {
    expect(
      answerVars({ area: "Vesu", n: 3, ok: true, _tag_chain_depth: 1, obj: { a: 1 } }),
    ).toEqual({ area: "Vesu", n: "3", ok: "true" });
  });
});

describe("buildExportPayload", () => {
  it("flattens contact + answers, answers overriding the profile name", () => {
    const body = buildExportPayload({
      contact: { name: "WA Name", phone: "919999999999" },
      vars: { area: "Vesu", name: "Typed Name" },
      flowName: "Property Lead",
      completedAt: "2026-10-13T00:00:00.000Z",
    });
    expect(body).toEqual({
      name: "Typed Name",
      phone: "919999999999",
      area: "Vesu",
      flow: "Property Lead",
      completed_at: "2026-10-13T00:00:00.000Z",
    });
  });
  it("tolerates a missing contact", () => {
    const body = buildExportPayload({ contact: null, vars: {}, flowName: "", completedAt: "t" });
    expect(body.name).toBe("");
    expect(body.phone).toBe("");
  });
});

describe("isAcceptedStatus", () => {
  it("accepts 2xx and 3xx only", () => {
    expect(isAcceptedStatus(200)).toBe(true);
    expect(isAcceptedStatus(202)).toBe(true);
    expect(isAcceptedStatus(302)).toBe(true);
    expect(isAcceptedStatus(400)).toBe(false);
    expect(isAcceptedStatus(500)).toBe(false);
  });
});

// Minimal chainable Supabase stand-in for the export path.
function makeDb(state: {
  fields?: { id: string; field_name: string }[];
  contact?: { name: string; phone: string } | null;
  flowName?: string;
}) {
  const upserts: unknown[] = [];
  const db = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          if (table === "contacts") return { data: state.contact ?? null, error: null };
          if (table === "flows") return { data: { name: state.flowName ?? "" }, error: null };
          return { data: null, error: null };
        },
        upsert: async (rows: unknown) => {
          upserts.push(rows);
          return { error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: table === "custom_fields" ? state.fields ?? [] : [], error: null }),
      };
      return q;
    },
  };
  return { db: db as never, upserts };
}

describe("exportCompletedRun", () => {
  afterEach(() => vi.unstubAllGlobals());

  const run = {
    flow_id: "f1",
    account_id: "acct",
    contact_id: "c1",
    vars: { area: "Vesu", bhk: "3 BHK", budget: "₹50L – 55L", other: "x" },
  };

  it("saves matching fields and posts the flat payload", async () => {
    const fetchSpy = vi.fn(async () => ({ status: 202 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { db, upserts } = makeDb({
      fields: [
        { id: "fa", field_name: "Area" },
        { id: "fb", field_name: "bhk" },
        { id: "fc", field_name: "budget" },
      ],
      contact: { name: "Mit", phone: "918000000000" },
      flowName: "Property Lead",
    });

    const out = await exportCompletedRun(db, run, {
      webhook_url: "https://example.com/hook",
    });

    expect(out.errors).toEqual([]);
    expect(out.saved_fields.sort()).toEqual(["area", "bhk", "budget"]);
    expect(out.webhook_status).toBe(202);
    expect(upserts[0]).toEqual([
      { contact_id: "c1", custom_field_id: "fa", value: "Vesu" },
      { contact_id: "c1", custom_field_id: "fb", value: "3 BHK" },
      { contact_id: "c1", custom_field_id: "fc", value: "₹50L – 55L" },
    ]);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      name: "Mit",
      phone: "918000000000",
      area: "Vesu",
      bhk: "3 BHK",
      budget: "₹50L – 55L",
      flow: "Property Lead",
    });
    expect(init.redirect).toBe("manual");
  });

  it("skips the webhook when no URL is set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { db } = makeDb({ fields: [] });
    const out = await exportCompletedRun(db, run, {});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out.webhook_status).toBeNull();
    expect(out.errors).toEqual([]);
  });

  it("refuses a private destination without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { db } = makeDb({ fields: [] });
    const out = await exportCompletedRun(db, run, {
      webhook_url: "http://169.254.169.254/latest/",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out.errors).toEqual(["webhook destination not allowed"]);
  });

  it("reports a failing receiver instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 500 })));
    const { db } = makeDb({ fields: [] });
    const out = await exportCompletedRun(db, run, {
      webhook_url: "https://example.com/hook",
    });
    expect(out.errors).toEqual(["webhook returned 500"]);
  });
});
