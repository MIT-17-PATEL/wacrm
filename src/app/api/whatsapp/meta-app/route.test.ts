import { beforeEach, describe, expect, it, vi } from 'vitest'

import { decryptSecret, encryptSecret } from '@/lib/crypto/secrets'
import type { MetaAppRow } from '@/lib/whatsapp/meta-app'

const h = vi.hoisted(() => ({
  role: 'admin' as 'owner' | 'admin' | 'agent' | 'viewer',
  row: null as unknown as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  tokenChecks: 0,
}))

vi.mock('@/lib/auth/account', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/account')>('@/lib/auth/account')
  const rank = { viewer: 0, agent: 1, admin: 2, owner: 3 }
  return {
    ...actual,
    requireRole: async (min: 'admin') => {
      if (rank[h.role] < rank[min]) throw new actual.ForbiddenError('Requires Admin')
      return { accountId: 'acc-1', userId: 'u-1', role: h.role }
    },
  }
})

vi.mock('@/lib/whatsapp/meta-app-server', () => ({
  metaAppAdmin: () => ({
    from(table: string) {
      if (table === 'whatsapp_config') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { phone_number_id: 'pn-1' } }) }) }) }
      }
      return {
        update: (patch: Record<string, unknown>) => {
          h.writes.push(patch)
          Object.assign(h.row, patch)
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }),
  loadOrCreateMetaApp: async () => ({ ...h.row }),
  runTokenAppCheck: async () => {
    h.tokenChecks++
    return 'ok'
  },
}))

import { __resetRateLimitForTests } from '@/lib/rate-limit'

import { GET, PUT } from './route'
import { POST as TEST } from './test/route'

const OLD_SECRET = '0123456789abcdef0123456789abcdef'
const NEW_SECRET = 'fedcba9876543210fedcba9876543210'

function freshRow(patch: Partial<MetaAppRow> = {}): MetaAppRow {
  return {
    account_id: 'acc-1',
    meta_app_id: null,
    meta_app_secret_encrypted: null,
    meta_app_secret_last4: null,
    webhook_verify_token: 'w'.repeat(48),
    secret_updated_at: null,
    previous_app_secret_encrypted: null,
    previous_secret_expires_at: null,
    last_webhook_at: null,
    token_check_status: null,
    token_checked_at: null,
    ...patch,
  }
}

function req(method: string, body?: unknown) {
  return new Request('https://crm.example.com/api/whatsapp/meta-app', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** Meta answers: valid pair → app token; anything else → OAuth error. */
function mockMeta(validSecret: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input))
    const ok = url.searchParams.get('client_secret') === validSecret
    return new Response(
      JSON.stringify(ok ? { access_token: '123|APP-TOKEN-DO-NOT-STORE' } : { error: { message: 'Error validating client secret.' } }),
      { status: ok ? 200 : 400 },
    )
  })
}

beforeEach(() => {
  h.role = 'admin'
  h.row = { ...freshRow() }
  h.writes = []
  h.tokenChecks = 0
  __resetRateLimitForTests()
  vi.restoreAllMocks()
})

describe('role enforcement', () => {
  for (const role of ['agent', 'viewer'] as const) {
    it(`${role}s cannot read, save or test the Meta App`, async () => {
      h.role = role
      expect((await GET(req('GET'))).status).toBe(403)
      expect((await PUT(req('PUT', { appId: '123456', appSecret: NEW_SECRET }))).status).toBe(403)
      expect((await TEST(req('POST'))).status).toBe(403)
      expect(h.writes).toHaveLength(0)
    })
  }

  it('owners and admins can read it', async () => {
    for (const role of ['owner', 'admin'] as const) {
      h.role = role
      expect((await GET(req('GET'))).status).toBe(200)
    }
  })
})

describe('PUT /api/whatsapp/meta-app', () => {
  it('rejects a wrong App ID / secret pair with a clear message and stores nothing', async () => {
    mockMeta(NEW_SECRET)
    const res = await PUT(req('PUT', { appId: '123456', appSecret: OLD_SECRET }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('App ID or App Secret is wrong')
    expect(h.writes).toHaveLength(0)
  })

  it('saves a valid pair encrypted, never echoes it, and runs the token check', async () => {
    mockMeta(NEW_SECRET)
    const res = await PUT(req('PUT', { appId: '123456', appSecret: NEW_SECRET }))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(NEW_SECRET)
    expect(text).not.toContain(String(h.row.meta_app_secret_encrypted))
    expect(text).not.toContain('APP-TOKEN-DO-NOT-STORE')
    expect(JSON.parse(text).metaApp).toMatchObject({ appId: '123456', secretLast4: '3210', configured: true })
    expect(decryptSecret(String(h.row.meta_app_secret_encrypted))).toBe(NEW_SECRET)
    expect(JSON.stringify(h.writes)).not.toContain('APP-TOKEN-DO-NOT-STORE')
    expect(h.tokenChecks).toBe(1)
  })

  it('replacing a secret keeps the old one as previous for 24h', async () => {
    const oldCipher = encryptSecret(OLD_SECRET)
    h.row = { ...freshRow({ meta_app_id: '123456', meta_app_secret_encrypted: oldCipher, meta_app_secret_last4: 'cdef' }) }
    mockMeta(NEW_SECRET)
    const before = Date.now()
    expect((await PUT(req('PUT', { appId: '123456', appSecret: NEW_SECRET }))).status).toBe(200)
    expect(h.row.previous_app_secret_encrypted).toBe(oldCipher)
    const expires = Date.parse(String(h.row.previous_secret_expires_at))
    expect(expires - before).toBeGreaterThanOrEqual(24 * 3600_000 - 1000)
    expect(expires - before).toBeLessThanOrEqual(24 * 3600_000 + 1000)
  })

  it('validates the input shape before calling Meta', async () => {
    const fetchSpy = mockMeta(NEW_SECRET)
    expect((await PUT(req('PUT', { appId: 'abc', appSecret: NEW_SECRET }))).status).toBe(400)
    expect((await PUT(req('PUT', { appId: '123456', appSecret: 'short' }))).status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is rate-limited to 10 a minute per workspace', async () => {
    mockMeta(NEW_SECRET)
    for (let i = 0; i < 10; i++) {
      expect((await PUT(req('PUT', { appId: '123456', appSecret: OLD_SECRET }))).status).toBe(400)
    }
    expect((await PUT(req('PUT', { appId: '123456', appSecret: NEW_SECRET }))).status).toBe(429)
  })
})

describe('GET / test responses never contain the secret', () => {
  it('only exposes last 4, the webhook URL and the verify token', async () => {
    h.row = {
      ...freshRow({
        meta_app_id: '123456',
        meta_app_secret_encrypted: encryptSecret(NEW_SECRET),
        meta_app_secret_last4: '3210',
        previous_app_secret_encrypted: encryptSecret(OLD_SECRET),
        previous_secret_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
    }
    mockMeta(NEW_SECRET)
    for (const res of [await GET(req('GET')), await TEST(req('POST'))]) {
      expect(res.status).toBe(200)
      const text = await res.text()
      for (const forbidden of [
        NEW_SECRET,
        OLD_SECRET,
        String(h.row.meta_app_secret_encrypted),
        String(h.row.previous_app_secret_encrypted),
        'APP-TOKEN-DO-NOT-STORE',
      ]) {
        expect(text).not.toContain(forbidden)
      }
      const { metaApp } = JSON.parse(text)
      expect(metaApp.webhookUrl).toBe('https://crm.example.com/api/webhook/whatsapp/acc-1')
      expect(metaApp.verifyToken).toBe('w'.repeat(48))
    }
  })

  it('reports an invalid stored secret on Test connection', async () => {
    h.row = {
      ...freshRow({ meta_app_id: '123456', meta_app_secret_encrypted: encryptSecret(OLD_SECRET), meta_app_secret_last4: 'cdef' }),
    }
    mockMeta(NEW_SECRET)
    const { metaApp } = await (await TEST(req('POST'))).json()
    expect(metaApp.status).toBe('secret_invalid')
    expect(h.tokenChecks).toBe(0)
  })
})
