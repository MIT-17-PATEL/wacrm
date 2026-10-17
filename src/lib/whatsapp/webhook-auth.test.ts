import { describe, expect, it } from 'vitest'

import { encryptSecret } from '@/lib/crypto/secrets'

import type { MetaAppRow } from './meta-app'
import {
  authorizeSharedDelivery,
  authorizeWorkspaceDelivery,
  type WebhookBody,
  type WebhookLookup,
} from './webhook-auth'
import { signBody } from './webhook-signature'

const NOW = Date.parse('2026-10-17T12:00:00Z')
const SECRET_A = 'secret-of-workspace-a-0000000000'
const SECRET_B = 'secret-of-workspace-b-1111111111'
const ENV = 'deployment-env-secret'

function app(accountId: string, secret: string | null, patch: Partial<MetaAppRow> = {}): MetaAppRow {
  return {
    account_id: accountId,
    meta_app_id: secret ? '111' : null,
    meta_app_secret_encrypted: secret ? encryptSecret(secret) : null,
    meta_app_secret_last4: secret ? secret.slice(-4) : null,
    webhook_verify_token: 't'.repeat(48),
    secret_updated_at: null,
    previous_app_secret_encrypted: null,
    previous_secret_expires_at: null,
    last_webhook_at: null,
    token_check_status: null,
    token_checked_at: null,
    ...patch,
  }
}

/** pn-a → acc-a, pn-b → acc-b, WABA-A → acc-a. */
function lookup(apps: MetaAppRow[]): WebhookLookup {
  const phones = new Map([
    ['pn-a', 'acc-a'],
    ['pn-b', 'acc-b'],
  ])
  const wabas = new Map([['WABA-A', 'acc-a']])
  return {
    accountsForPhones: async (ids) => new Map(ids.filter((i) => phones.has(i)).map((i) => [i, phones.get(i)!])),
    accountsForWabas: async (ids) => new Map(ids.filter((i) => wabas.has(i)).map((i) => [i, wabas.get(i)!])),
    metaApps: async (ids) => new Map(apps.filter((a) => ids.includes(a.account_id)).map((a) => [a.account_id, a])),
  }
}

function messageChange(phone: string) {
  return { field: 'messages', value: { metadata: { phone_number_id: phone }, messages: [{ id: 'wamid.1' }] } }
}

function body(...phones: string[]): WebhookBody {
  return { entry: [{ id: 'WABA-X', changes: phones.map(messageChange) }] }
}

function allowed(auth: Awaited<ReturnType<typeof authorizeSharedDelivery>>, b: WebhookBody): string[] {
  const out: string[] = []
  for (const e of b.entry ?? []) {
    for (const c of e.changes ?? []) {
      if (auth.allowChange(e, c)) out.push(c.value!.metadata!.phone_number_id!)
    }
  }
  return out
}

describe('authorizeSharedDelivery', () => {
  it("accepts a delivery signed with the owning workspace's own secret", async () => {
    const b = body('pn-a')
    const raw = JSON.stringify(b)
    const auth = await authorizeSharedDelivery({
      rawBody: raw,
      signature: signBody(raw, SECRET_A),
      body: b,
      lookup: lookup([app('acc-a', SECRET_A)]),
      envSecrets: [],
      now: NOW,
    })
    expect(auth.ok).toBe(true)
    expect(auth.ownSecretAccounts).toEqual(['acc-a'])
    expect(allowed(auth, b)).toEqual(['pn-a'])
    expect(auth.scopeFor(b.entry![0], b.entry![0].changes![0])).toBe('acc-a')
  })

  it('rejects a wrong signature', async () => {
    const b = body('pn-a')
    const raw = JSON.stringify(b)
    const auth = await authorizeSharedDelivery({
      rawBody: raw,
      signature: signBody(raw, 'wrong'),
      body: b,
      lookup: lookup([app('acc-a', SECRET_A)]),
      envSecrets: [ENV],
      now: NOW,
    })
    expect(auth.ok).toBe(false)
  })

  it('does not let the env secret stand in for a workspace that has its own secret', async () => {
    const b = body('pn-a')
    const raw = JSON.stringify(b)
    const auth = await authorizeSharedDelivery({
      rawBody: raw,
      signature: signBody(raw, ENV),
      body: b,
      lookup: lookup([app('acc-a', SECRET_A)]),
      envSecrets: [ENV],
      now: NOW,
    })
    expect(auth.ok).toBe(false)
  })

  it('falls back to META_APP_SECRET for workspaces without their own secret', async () => {
    const b = body('pn-b')
    const raw = JSON.stringify(b)
    const auth = await authorizeSharedDelivery({
      rawBody: raw,
      signature: signBody(raw, ENV),
      body: b,
      lookup: lookup([app('acc-b', null)]),
      envSecrets: [ENV],
      now: NOW,
    })
    expect(auth.ok).toBe(true)
    expect(auth.ownSecretAccounts).toEqual([])
    // Env-verified changes keep the historical unscoped status handling.
    expect(auth.scopeFor(b.entry![0], b.entry![0].changes![0])).toBeNull()
  })

  it("workspace A's valid signature cannot write into workspace B (mixed body)", async () => {
    const b = body('pn-a', 'pn-b')
    const raw = JSON.stringify(b)
    const auth = await authorizeSharedDelivery({
      rawBody: raw,
      signature: signBody(raw, SECRET_A),
      body: b,
      lookup: lookup([app('acc-a', SECRET_A), app('acc-b', SECRET_B)]),
      envSecrets: [],
      now: NOW,
    })
    expect(auth.ok).toBe(true)
    expect(allowed(auth, b)).toEqual(['pn-a'])
    expect(auth.verifiedAccounts).toEqual(['acc-a'])
  })

  it('accepts the previous secret before it expires and rejects it after', async () => {
    const b = body('pn-a')
    const raw = JSON.stringify(b)
    const rotated = app('acc-a', 'brand-new-secret-2222222222222', {
      previous_app_secret_encrypted: encryptSecret(SECRET_A),
      previous_secret_expires_at: new Date(NOW + 60_000).toISOString(),
    })
    const params = { rawBody: raw, signature: signBody(raw, SECRET_A), body: b, lookup: lookup([rotated]), envSecrets: [] }
    expect((await authorizeSharedDelivery({ ...params, now: NOW })).ok).toBe(true)
    expect((await authorizeSharedDelivery({ ...params, now: NOW + 120_000 })).ok).toBe(false)
  })

  it('routes template events by WABA id', async () => {
    const b: WebhookBody = { entry: [{ id: 'WABA-A', changes: [{ field: 'message_template_status_update', value: {} }] }] }
    const raw = JSON.stringify(b)
    const auth = await authorizeSharedDelivery({
      rawBody: raw,
      signature: signBody(raw, SECRET_A),
      body: b,
      lookup: lookup([app('acc-a', SECRET_A)]),
      envSecrets: [],
      now: NOW,
    })
    expect(auth.ok).toBe(true)
    expect(auth.allowChange(b.entry![0], b.entry![0].changes![0])).toBe(true)
  })

  it('fails closed with no secrets configured anywhere', async () => {
    const b = body('pn-b')
    const raw = JSON.stringify(b)
    const auth = await authorizeSharedDelivery({
      rawBody: raw,
      signature: signBody(raw, ENV),
      body: b,
      lookup: lookup([]),
      envSecrets: [],
      now: NOW,
    })
    expect(auth.ok).toBe(false)
  })
})

describe('authorizeWorkspaceDelivery', () => {
  it("accepts the workspace's own signature and keeps only its own numbers", async () => {
    const b = body('pn-a', 'pn-b')
    const raw = JSON.stringify(b)
    const auth = await authorizeWorkspaceDelivery({
      workspaceId: 'acc-a',
      rawBody: raw,
      signature: signBody(raw, SECRET_A),
      body: b,
      lookup: lookup([app('acc-a', SECRET_A)]),
      now: NOW,
    })
    expect(auth.ok).toBe(true)
    expect(allowed(auth, b)).toEqual(['pn-a'])
  })

  it("rejects another workspace's signature on this workspace's URL", async () => {
    const b = body('pn-b')
    const raw = JSON.stringify(b)
    const auth = await authorizeWorkspaceDelivery({
      workspaceId: 'acc-a',
      rawBody: raw,
      signature: signBody(raw, SECRET_B),
      body: b,
      lookup: lookup([app('acc-a', SECRET_A), app('acc-b', SECRET_B)]),
      now: NOW,
    })
    expect(auth.ok).toBe(false)
  })

  it('rejects everything when the workspace has no secret saved', async () => {
    const b = body('pn-a')
    const raw = JSON.stringify(b)
    const auth = await authorizeWorkspaceDelivery({
      workspaceId: 'acc-a',
      rawBody: raw,
      signature: signBody(raw, ENV),
      body: b,
      lookup: lookup([app('acc-a', null)]),
      now: NOW,
    })
    expect(auth.ok).toBe(false)
  })
})
