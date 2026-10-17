import type { SupabaseClient } from '@supabase/supabase-js'

import { META_APP_COLUMNS, candidateSecrets, hasOwnSecret, type MetaAppRow } from './meta-app'
import { parseAppSecrets, signatureMatchesAny } from './webhook-signature'

/**
 * Who may write what, for one webhook delivery.
 *
 * Meta signs the whole body with ONE app secret, but a body can carry
 * changes for several phone numbers / WABAs. So we:
 *   1. read only routing ids from the parsed body (phone_number_id, or
 *      entry.id = WABA id for template events) — nothing is acted on;
 *   2. find the workspace that owns each id;
 *   3. check the signature per owner: its own App Secret(s) when it has
 *      one, else the deployment's META_APP_SECRET list (fallback);
 *   4. let processing touch only changes whose owner verified.
 *
 * A valid signature for workspace A therefore can't create data in
 * workspace B. With no per-workspace secrets anywhere, every owner
 * falls back to the env list and the outcome is exactly the old
 * single-check behaviour.
 */

export interface WebhookChange {
  field?: string
  value?: { metadata?: { phone_number_id?: string } } & Record<string, unknown>
}
export interface WebhookEntry {
  id?: string
  changes?: WebhookChange[]
}
export interface WebhookBody {
  entry?: WebhookEntry[]
}

/** Data access the verifier needs; injected so it can be tested without a DB. */
export interface WebhookLookup {
  /** phone_number_id → owning account (absent when unknown or ambiguous). */
  accountsForPhones(ids: string[]): Promise<Map<string, string>>
  /** waba_id → owning account (absent when unknown or ambiguous). */
  accountsForWabas(ids: string[]): Promise<Map<string, string>>
  /** Per-workspace Meta App rows for these accounts (missing = none set). */
  metaApps(accountIds: string[]): Promise<Map<string, MetaAppRow>>
}

export interface DeliveryAuth {
  ok: boolean
  /** Accounts whose changes may be processed. */
  verifiedAccounts: string[]
  /** Of those, the ones verified with their own App Secret (status line). */
  ownSecretAccounts: string[]
  /** Processing filter: may this change be acted on? */
  allowChange: (entry: WebhookEntry, change: WebhookChange) => boolean
  /**
   * Account to scope a change's status updates to — set only for owners
   * verified with their OWN secret (env-verified changes keep the
   * historical, unscoped behaviour).
   */
  scopeFor: (entry: WebhookEntry, change: WebhookChange) => string | null
}

const DENY: DeliveryAuth = {
  ok: false,
  verifiedAccounts: [],
  ownSecretAccounts: [],
  allowChange: () => false,
  scopeFor: () => null,
}

function isTemplateField(field: string | undefined): boolean {
  return !!field && field.startsWith('message_template_')
}

/** Routing id of a change: its phone number, or the WABA for template events. */
export function routingKey(entry: WebhookEntry, change: WebhookChange): { kind: 'phone' | 'waba'; id: string } | null {
  if (isTemplateField(change.field)) return entry.id ? { kind: 'waba', id: String(entry.id) } : null
  const phone = change.value?.metadata?.phone_number_id
  return phone ? { kind: 'phone', id: String(phone) } : null
}

async function resolveOwners(body: WebhookBody, lookup: WebhookLookup) {
  const phones = new Set<string>()
  const wabas = new Set<string>()
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const key = routingKey(entry, change)
      if (key?.kind === 'phone') phones.add(key.id)
      else if (key?.kind === 'waba') wabas.add(key.id)
    }
  }
  const [byPhone, byWaba] = await Promise.all([
    phones.size ? lookup.accountsForPhones([...phones]) : Promise.resolve(new Map<string, string>()),
    wabas.size ? lookup.accountsForWabas([...wabas]) : Promise.resolve(new Map<string, string>()),
  ])
  const ownerOf = (entry: WebhookEntry, change: WebhookChange): string | null => {
    const key = routingKey(entry, change)
    if (!key) return null
    return (key.kind === 'phone' ? byPhone.get(key.id) : byWaba.get(key.id)) ?? null
  }
  return ownerOf
}

/** Shared route (/api/whatsapp/webhook): per-owner secret, env fallback. */
export async function authorizeSharedDelivery(params: {
  rawBody: string
  signature: string | null
  body: WebhookBody
  lookup: WebhookLookup
  envSecrets?: string[]
  now?: number
}): Promise<DeliveryAuth> {
  const { rawBody, signature, body, lookup } = params
  const envSecrets = params.envSecrets ?? parseAppSecrets(process.env.META_APP_SECRET)
  const now = params.now ?? Date.now()

  const ownerOf = await resolveOwners(body, lookup)
  const owners = new Set<string>()
  let unresolved = 0
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const owner = ownerOf(entry, change)
      if (owner) owners.add(owner)
      else unresolved++
    }
  }

  const apps = owners.size ? await lookup.metaApps([...owners]) : new Map<string, MetaAppRow>()

  let envResult: boolean | null = null
  const envOk = () => {
    if (envResult === null) envResult = envSecrets.length > 0 && signatureMatchesAny(rawBody, signature, envSecrets)
    return envResult
  }

  const verified = new Set<string>()
  const ownSecret = new Set<string>()
  let needsEnv = unresolved > 0 || owners.size === 0
  for (const account of owners) {
    const row = apps.get(account)
    if (hasOwnSecret(row)) {
      if (signatureMatchesAny(rawBody, signature, candidateSecrets(row!, now))) {
        verified.add(account)
        ownSecret.add(account)
      }
    } else {
      needsEnv = true
      if (envOk()) verified.add(account)
    }
  }

  if (needsEnv && envSecrets.length === 0) {
    console.error(
      '[webhook] META_APP_SECRET is not set and a workspace in this delivery has no App Secret of its own — ' +
        'those changes are rejected. Set the secret in Settings › WhatsApp › Meta App, or configure META_APP_SECRET.',
    )
  }

  // Changes with no known owner were always handed to processing (which
  // then logs "No config found" and skips them); keep that when the env
  // secret verified the delivery.
  const unresolvedOk = (unresolved > 0 || owners.size === 0) && envOk()
  if (verified.size === 0 && !unresolvedOk) return DENY

  return {
    ok: true,
    verifiedAccounts: [...verified],
    ownSecretAccounts: [...ownSecret],
    allowChange: (entry, change) => {
      const owner = ownerOf(entry, change)
      return owner ? verified.has(owner) : unresolvedOk
    },
    scopeFor: (entry, change) => {
      const owner = ownerOf(entry, change)
      return owner && ownSecret.has(owner) ? owner : null
    },
  }
}

/** Per-workspace route (/api/webhook/whatsapp/[workspaceId]): that workspace's secrets only. */
export async function authorizeWorkspaceDelivery(params: {
  workspaceId: string
  rawBody: string
  signature: string | null
  body: WebhookBody
  lookup: WebhookLookup
  now?: number
}): Promise<DeliveryAuth> {
  const { workspaceId, rawBody, signature, body, lookup } = params
  const row = (await lookup.metaApps([workspaceId])).get(workspaceId)
  if (!hasOwnSecret(row)) return DENY
  if (!signatureMatchesAny(rawBody, signature, candidateSecrets(row!, params.now ?? Date.now()))) return DENY

  // Only this workspace's numbers / WABAs; anything else in the body is dropped.
  const ownerOf = await resolveOwners(body, lookup)
  return {
    ok: true,
    verifiedAccounts: [workspaceId],
    ownSecretAccounts: [workspaceId],
    allowChange: (entry, change) => ownerOf(entry, change) === workspaceId,
    scopeFor: () => workspaceId,
  }
}

/** Real lookup backed by the service-role client. */
export function dbWebhookLookup(admin: SupabaseClient): WebhookLookup {
  const ownersBy = async (column: 'phone_number_id' | 'waba_id', ids: string[]) => {
    const { data, error } = await admin.from('whatsapp_config').select(`account_id, ${column}`).in(column, ids)
    const out = new Map<string, string>()
    if (error || !data) return out
    const seen = new Map<string, Set<string>>()
    for (const row of data as Array<Record<string, string>>) {
      const id = row[column]
      if (!seen.has(id)) seen.set(id, new Set())
      seen.get(id)!.add(row.account_id)
    }
    // Ambiguous ids (claimed by two accounts) resolve to no owner.
    for (const [id, accounts] of seen) if (accounts.size === 1) out.set(id, [...accounts][0])
    return out
  }
  return {
    accountsForPhones: (ids) => ownersBy('phone_number_id', ids),
    accountsForWabas: (ids) => ownersBy('waba_id', ids),
    async metaApps(accountIds) {
      const out = new Map<string, MetaAppRow>()
      const { data, error } = await admin.from('whatsapp_meta_apps').select(META_APP_COLUMNS).in('account_id', accountIds)
      // Table missing (migration 047 not applied yet) or any read error:
      // treat as "no per-workspace secrets" so the env fallback applies.
      if (error || !data) return out
      for (const row of data as unknown as MetaAppRow[]) out.set(row.account_id, row)
      return out
    },
  }
}

/** Records a verified delivery for the Settings status line (best effort). */
export async function touchLastWebhook(admin: SupabaseClient, accountIds: string[]): Promise<void> {
  if (accountIds.length === 0) return
  const { error } = await admin
    .from('whatsapp_meta_apps')
    .update({ last_webhook_at: new Date().toISOString() })
    .in('account_id', accountIds)
  if (error) console.warn('[webhook] could not record last_webhook_at:', error.message)
}
