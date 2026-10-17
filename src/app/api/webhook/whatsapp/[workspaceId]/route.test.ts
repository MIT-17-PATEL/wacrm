import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptSecret } from '@/lib/crypto/secrets'
import { signBody } from '@/lib/whatsapp/webhook-signature'

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const SECRET_A = 'workspace-a-app-secret-000000000'
const SECRET_B = 'workspace-b-app-secret-111111111'

const h = vi.hoisted(() => ({
  apps: {} as Record<string, Record<string, unknown>>,
  owners: {} as Record<string, string>,
  after: [] as (() => Promise<void>)[],
  processed: [] as { body: unknown; allowed: string[] }[],
  touched: [] as string[][],
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (cb: () => Promise<void>) => h.after.push(cb) }
})

vi.mock('@/lib/whatsapp/webhook-processor', () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      if (table === 'whatsapp_meta_apps') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => ({ data: h.apps[id] ?? null, error: null }),
            }),
            in: async (_col: string, ids: string[]) => ({
              data: ids.map((id) => h.apps[id]).filter(Boolean),
              error: null,
            }),
          }),
          update: () => ({
            in: async (_c: string, ids: string[]) => {
              h.touched.push(ids)
              return { error: null }
            },
          }),
        }
      }
      // whatsapp_config routing lookup
      return {
        select: () => ({
          in: async (_col: string, ids: string[]) => ({
            data: ids
              .filter((id) => h.owners[id])
              .map((id) => ({ account_id: h.owners[id], phone_number_id: id, waba_id: id })),
            error: null,
          }),
        }),
      }
    },
  }),
  processWebhook: async (
    body: { entry: { changes: { value: { metadata: { phone_number_id: string } } }[] }[] },
    opts: { allowChange: (e: unknown, c: unknown) => boolean },
  ) => {
    const allowed: string[] = []
    for (const e of body.entry) for (const c of e.changes) if (opts.allowChange(e, c)) allowed.push(c.value.metadata.phone_number_id)
    h.processed.push({ body, allowed })
  },
}))

import { GET, POST } from './route'

function app(id: string, secret: string) {
  return {
    account_id: id,
    meta_app_id: '123',
    meta_app_secret_encrypted: encryptSecret(secret),
    meta_app_secret_last4: secret.slice(-4),
    webhook_verify_token: `verify-token-for-${id}`,
    secret_updated_at: null,
    previous_app_secret_encrypted: null,
    previous_secret_expires_at: null,
    last_webhook_at: null,
    token_check_status: null,
    token_checked_at: null,
  }
}

const ctx = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) })

function delivery(phones: string[]) {
  return JSON.stringify({
    entry: [{ changes: phones.map((p) => ({ field: 'messages', value: { metadata: { phone_number_id: p }, messages: [] } })) }],
  })
}

function post(workspaceId: string, raw: string, signature: string | null) {
  return POST(
    new Request(`https://crm.example.com/api/webhook/whatsapp/${workspaceId}`, {
      method: 'POST',
      body: raw,
      headers: signature ? { 'x-hub-signature-256': signature } : {},
    }),
    ctx(workspaceId),
  )
}

beforeEach(() => {
  h.apps = { [WS_A]: app(WS_A, SECRET_A), [WS_B]: app(WS_B, SECRET_B) }
  h.owners = { 'pn-a': WS_A, 'pn-b': WS_B }
  h.after = []
  h.processed = []
  h.touched = []
})

describe('GET (Meta verification) — per workspace', () => {
  const verify = (ws: string, token: string) =>
    GET(
      new Request(
        `https://crm.example.com/api/webhook/whatsapp/${ws}?hub.mode=subscribe&hub.challenge=CH-42&hub.verify_token=${token}`,
      ),
      ctx(ws),
    )

  it("echoes the challenge for this workspace's own token", async () => {
    const res = await verify(WS_A, `verify-token-for-${WS_A}`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('CH-42')
  })

  it("rejects another workspace's token", async () => {
    expect((await verify(WS_A, `verify-token-for-${WS_B}`)).status).toBe(403)
  })

  it('rejects unknown workspaces and malformed ids', async () => {
    expect((await verify('33333333-3333-4333-8333-333333333333', 'x')).status).toBe(403)
    expect((await verify('not-a-uuid', 'x')).status).toBe(403)
  })
})

describe('POST — signed deliveries', () => {
  it('accepts a valid signature, returns 200 and processes after the response', async () => {
    const raw = delivery(['pn-a'])
    const res = await post(WS_A, raw, signBody(raw, SECRET_A))
    expect(res.status).toBe(200)
    expect(h.processed).toHaveLength(0) // not before the response
    for (const cb of h.after) await cb()
    expect(h.processed[0].allowed).toEqual(['pn-a'])
    expect(h.touched).toEqual([[WS_A]])
  })

  it('rejects a wrong signature with 401 and does nothing', async () => {
    const raw = delivery(['pn-a'])
    const res = await post(WS_A, raw, signBody(raw, 'wrong-secret'))
    expect(res.status).toBe(401)
    expect(h.after).toHaveLength(0)
  })

  it('rejects a missing signature', async () => {
    expect((await post(WS_A, delivery(['pn-a']), null)).status).toBe(401)
  })

  it("rejects workspace B's valid signature on workspace A's URL", async () => {
    const raw = delivery(['pn-b'])
    expect((await post(WS_A, raw, signBody(raw, SECRET_B))).status).toBe(401)
    expect(h.after).toHaveLength(0)
  })

  it("drops changes for another workspace's number even when signed by this workspace", async () => {
    const raw = delivery(['pn-a', 'pn-b'])
    expect((await post(WS_A, raw, signBody(raw, SECRET_A))).status).toBe(200)
    for (const cb of h.after) await cb()
    expect(h.processed[0].allowed).toEqual(['pn-a'])
  })

  it('accepts the previous secret before expiry and rejects it after', async () => {
    const raw = delivery(['pn-a'])
    h.apps[WS_A] = {
      ...app(WS_A, 'brand-new-secret-for-a-2222222222'),
      previous_app_secret_encrypted: encryptSecret(SECRET_A),
      previous_secret_expires_at: new Date(Date.now() + 60_000).toISOString(),
    }
    expect((await post(WS_A, raw, signBody(raw, SECRET_A))).status).toBe(200)
    h.apps[WS_A].previous_secret_expires_at = new Date(Date.now() - 1000).toISOString()
    expect((await post(WS_A, raw, signBody(raw, SECRET_A))).status).toBe(401)
  })
})
