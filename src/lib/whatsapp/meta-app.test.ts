import { describe, expect, it, vi } from 'vitest'

import { decryptSecret, encryptSecret } from '@/lib/crypto/secrets'

import {
  PREVIOUS_SECRET_TTL_MS,
  candidateSecrets,
  checkTokenApp,
  connectionStatus,
  secretUpdatePatch,
  toPublicMetaApp,
  validateAppCredentials,
  type MetaAppRow,
} from './meta-app'

const NOW = Date.parse('2026-10-17T12:00:00Z')
const SECRET = 'feedfacecafebeef0123456789abcdef'

function row(patch: Partial<MetaAppRow> = {}): MetaAppRow {
  return {
    account_id: 'acc-1',
    meta_app_id: '1234567890',
    meta_app_secret_encrypted: encryptSecret(SECRET),
    meta_app_secret_last4: 'cdef',
    webhook_verify_token: 'v'.repeat(48),
    secret_updated_at: new Date(NOW - 60 * 60 * 1000).toISOString(),
    previous_app_secret_encrypted: null,
    previous_secret_expires_at: null,
    last_webhook_at: new Date(NOW - 60 * 1000).toISOString(),
    token_check_status: 'ok',
    token_checked_at: null,
    ...patch,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('candidateSecrets', () => {
  it('returns the current secret, plus the previous one only before it expires', () => {
    const prev = encryptSecret('old-secret')
    expect(
      candidateSecrets(
        row({ previous_app_secret_encrypted: prev, previous_secret_expires_at: new Date(NOW + 1000).toISOString() }),
        NOW,
      ),
    ).toEqual([SECRET, 'old-secret'])
    expect(
      candidateSecrets(
        row({ previous_app_secret_encrypted: prev, previous_secret_expires_at: new Date(NOW - 1000).toISOString() }),
        NOW,
      ),
    ).toEqual([SECRET])
  })

  it('skips a secret that no longer decrypts, without logging it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = row({ meta_app_secret_encrypted: 'aa:bb:cc' })
    expect(candidateSecrets(broken, NOW)).toEqual([])
    expect(spy.mock.calls.flat().join(' ')).not.toContain('aa:bb:cc')
    spy.mockRestore()
  })
})

describe('secretUpdatePatch', () => {
  it('moves the old secret to previous with a 24h expiry on replace', () => {
    const existing = row()
    const patch = secretUpdatePatch(existing, '1234567890', 'new-secret-9999', NOW)
    expect(decryptSecret(patch.meta_app_secret_encrypted!)).toBe('new-secret-9999')
    expect(patch.meta_app_secret_last4).toBe('9999')
    expect(patch.previous_app_secret_encrypted).toBe(existing.meta_app_secret_encrypted)
    expect(Date.parse(patch.previous_secret_expires_at!)).toBe(NOW + PREVIOUS_SECRET_TTL_MS)
  })

  it('sets no previous secret on the first save', () => {
    const patch = secretUpdatePatch(null, '1', 'first-secret', NOW)
    expect(patch.previous_app_secret_encrypted).toBeUndefined()
  })
})

describe('toPublicMetaApp', () => {
  it('never contains the secret or its ciphertext', () => {
    const r = row({ previous_app_secret_encrypted: encryptSecret('old-secret') })
    const out = JSON.stringify(toPublicMetaApp(r, 'https://crm.example.com', { now: NOW }))
    expect(out).not.toContain(SECRET)
    expect(out).not.toContain('old-secret')
    expect(out).not.toContain(r.meta_app_secret_encrypted!)
    expect(out).not.toContain(r.previous_app_secret_encrypted!)
    expect(out).toContain('"secretLast4":"cdef"')
    expect(out).toContain('https://crm.example.com/api/webhook/whatsapp/acc-1')
  })
})

describe('connectionStatus', () => {
  it('reports each state', () => {
    expect(connectionStatus(row({ meta_app_secret_encrypted: null, meta_app_id: null }), { now: NOW })).toBe(
      'not_configured',
    )
    expect(connectionStatus(row(), { now: NOW })).toBe('connected')
    expect(connectionStatus(row(), { now: NOW, secretValid: false })).toBe('secret_invalid')
    expect(connectionStatus(row({ token_check_status: 'mismatch' }), { now: NOW })).toBe('token_app_mismatch')
    expect(
      connectionStatus(row({ last_webhook_at: new Date(NOW - 2 * 86400000).toISOString() }), { now: NOW }),
    ).toBe('webhook_silent')
  })
})

describe('validateAppCredentials', () => {
  it('accepts when Meta issues an app token and discards it', async () => {
    const fetchImpl = vi.fn(async () => json({ access_token: '123|app-token', token_type: 'bearer' }))
    await expect(validateAppCredentials('123', SECRET, fetchImpl)).resolves.toEqual({ ok: true })
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0])
    expect(url).toContain('/oauth/access_token?')
    expect(url).toContain('grant_type=client_credentials')
  })

  it('rejects when Meta returns an error', async () => {
    const fetchImpl = vi.fn(async () => json({ error: { message: 'Error validating client secret.' } }, 400))
    await expect(validateAppCredentials('123', 'wrong', fetchImpl)).resolves.toEqual({ ok: false, reason: 'invalid' })
  })

  it('reports Meta being unreachable separately', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ENOTFOUND')
    })
    await expect(validateAppCredentials('123', SECRET, fetchImpl)).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    })
  })
})

describe('checkTokenApp', () => {
  it('ok when the token belongs to the app, mismatch otherwise', async () => {
    await expect(
      checkTokenApp({ accessToken: 't', appId: '123', secret: SECRET }, async () => json({ data: { app_id: '123' } })),
    ).resolves.toBe('ok')
    await expect(
      checkTokenApp({ accessToken: 't', appId: '123', secret: SECRET }, async () => json({ data: { app_id: '999' } })),
    ).resolves.toBe('mismatch')
    await expect(
      checkTokenApp({ accessToken: 't', appId: '123', secret: SECRET }, async () =>
        json({ error: { message: '(#100) The App_id in the input_token did not match the Viewing App' } }, 400),
      ),
    ).resolves.toBe('mismatch')
    await expect(
      checkTokenApp({ accessToken: 't', appId: '123', secret: SECRET }, async () => json({ error: {} }, 500)),
    ).resolves.toBe('error')
  })
})
