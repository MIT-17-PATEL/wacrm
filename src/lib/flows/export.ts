/**
 * What happens to a flow's answers when the run reaches an End node.
 *
 *   1. Every run var whose key matches a custom field name (both
 *      normalised by `fieldKey`) is written onto the contact, so the
 *      answers show up on the contact page.
 *   2. If the End node has a `webhook_url`, the answers are POSTed there
 *      as one flat JSON object — the shape no-code tools (Power Automate,
 *      Make, Zapier) map straight onto spreadsheet columns.
 *
 * Kept out of engine.ts so the pure pieces are unit-testable without a
 * Supabase or Meta mock.
 */

import { fieldKey } from "@/lib/contacts/field-key";
import { isDeliverableUrl } from "@/lib/webhooks/ssrf";
import type {
  EndNodeConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
} from "./types";
import type { supabaseAdmin } from "./admin-client";

type AdminClient = ReturnType<typeof supabaseAdmin>;

/** Same character rule as collect_input's `var_key`. */
export function sanitizeVarKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, "");
}

/**
 * The visible title of the button / list row the customer tapped, or
 * null when the reply id matches nothing on the node. Read from the
 * node config rather than the inbound message so the stored answer is
 * exactly what the author wrote, whatever the client echoed back.
 */
export function replyTitleFor(
  node: { node_type: string; config: Record<string, unknown> },
  replyId: string,
): string | null {
  if (node.node_type === "send_buttons") {
    const cfg = node.config as unknown as SendButtonsNodeConfig;
    return cfg.buttons?.find((b) => b.reply_id === replyId)?.title ?? null;
  }
  if (node.node_type === "send_list") {
    const cfg = node.config as unknown as SendListNodeConfig;
    for (const section of cfg.sections ?? []) {
      const hit = section.rows?.find((r) => r.reply_id === replyId);
      if (hit) return hit.title;
    }
  }
  return null;
}

/** The node's `save_as` key, sanitised; empty string when unset. */
export function saveAsKeyFor(node: {
  node_type: string;
  config: Record<string, unknown>;
}): string {
  if (node.node_type !== "send_buttons" && node.node_type !== "send_list") {
    return "";
  }
  const raw = (node.config as { save_as?: unknown }).save_as;
  return typeof raw === "string" ? sanitizeVarKey(raw.trim()) : "";
}

/** Scalar run vars as strings; anything structured is internal and skipped. */
export function answerVars(vars: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars ?? {})) {
    if (key.startsWith("_")) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = String(value);
    }
  }
  return out;
}

/**
 * Flat body for the End node webhook. Contact name/phone come first so
 * a flow that collects its own `name` answer overrides the WhatsApp
 * profile name; `flow` and `completed_at` are added last and always win.
 */
export function buildExportPayload(args: {
  contact: { name?: string | null; phone?: string | null } | null;
  vars: Record<string, string>;
  flowName: string;
  completedAt: string;
}): Record<string, string> {
  return {
    name: args.contact?.name ?? "",
    phone: args.contact?.phone ?? "",
    ...args.vars,
    flow: args.flowName,
    completed_at: args.completedAt,
  };
}

/** A 3xx is the receiver's answer (redirects are not followed), not a failure. */
export function isAcceptedStatus(status: number): boolean {
  return (status >= 200 && status < 300) || (status >= 300 && status < 400);
}

/**
 * Write answers onto custom fields whose names match var keys.
 * Returns the matched field keys. Scoped to the run's account: the
 * service-role client bypasses RLS.
 */
export async function saveAnswersToContact(
  db: AdminClient,
  accountId: string,
  contactId: string,
  vars: Record<string, string>,
): Promise<string[]> {
  const keys = Object.keys(vars);
  if (keys.length === 0) return [];
  const { data: fields, error } = await db
    .from("custom_fields")
    .select("id, field_name")
    .eq("account_id", accountId);
  if (error) throw new Error(`custom field lookup failed: ${error.message}`);

  const byKey = new Map<string, string>();
  for (const f of (fields ?? []) as { id: string; field_name: string }[]) {
    if (f.field_name) byKey.set(fieldKey(f.field_name), f.id);
  }

  const rows: { contact_id: string; custom_field_id: string; value: string }[] = [];
  const saved: string[] = [];
  for (const key of keys) {
    const id = byKey.get(fieldKey(key));
    if (!id) continue;
    rows.push({ contact_id: contactId, custom_field_id: id, value: vars[key] });
    saved.push(fieldKey(key));
  }
  if (rows.length === 0) return [];

  const { error: upErr } = await db
    .from("contact_custom_values")
    .upsert(rows, { onConflict: "contact_id,custom_field_id" });
  if (upErr) throw new Error(`saving answers failed: ${upErr.message}`);
  return saved;
}

/**
 * POST the answers to the End node's URL. Throws on a refused
 * destination or a non-accepted status, so the caller can log it.
 */
export async function postAnswers(
  db: AdminClient,
  args: {
    url: string;
    accountId: string;
    contactId: string | null;
    flowId: string;
    vars: Record<string, string>;
  },
): Promise<number> {
  // SSRF guard, same as the automations send_webhook step: the URL is
  // account-controlled and the server makes the request.
  if (!(await isDeliverableUrl(args.url))) {
    throw new Error("webhook destination not allowed");
  }

  let contact: { name: string | null; phone: string | null } | null = null;
  if (args.contactId) {
    const { data } = await db
      .from("contacts")
      .select("name, phone")
      .eq("id", args.contactId)
      .eq("account_id", args.accountId)
      .maybeSingle();
    contact = (data as typeof contact) ?? null;
  }
  const { data: flow } = await db
    .from("flows")
    .select("name")
    .eq("id", args.flowId)
    .maybeSingle();

  const body = buildExportPayload({
    contact,
    vars: args.vars,
    flowName: (flow as { name?: string } | null)?.name ?? "",
    completedAt: new Date().toISOString(),
  });

  const res = await fetch(args.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // Not following redirects keeps a public URL from bouncing the
    // request to an internal address.
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (!isAcceptedStatus(res.status)) {
    throw new Error(`webhook returned ${res.status}`);
  }
  return res.status;
}

/**
 * Run both export steps for a completed run. Each step is independent:
 * a failed field save doesn't stop the webhook, and vice versa. Never
 * throws — failures come back in `errors` for the caller to log.
 */
export async function exportCompletedRun(
  db: AdminClient,
  run: {
    flow_id: string;
    account_id: string;
    contact_id: string | null;
    vars: Record<string, unknown>;
  },
  endCfg: EndNodeConfig | null | undefined,
): Promise<{ saved_fields: string[]; webhook_status: number | null; errors: string[] }> {
  const vars = answerVars(run.vars);
  const result = {
    saved_fields: [] as string[],
    webhook_status: null as number | null,
    errors: [] as string[],
  };

  if (run.contact_id) {
    try {
      result.saved_fields = await saveAnswersToContact(
        db,
        run.account_id,
        run.contact_id,
        vars,
      );
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const url = endCfg?.webhook_url?.trim();
  if (url) {
    try {
      result.webhook_status = await postAnswers(db, {
        url,
        accountId: run.account_id,
        contactId: run.contact_id,
        flowId: run.flow_id,
        vars,
      });
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return result;
}
