import crypto from 'node:crypto'

/**
 * Server-only secret encryption (AES-256-GCM) and the shared
 * `ENCRYPTION_KEY` reader.
 *
 * One key for the whole app — the same variable that has always
 * encrypted WhatsApp access tokens and AI keys. It is accepted in
 * either form, so existing installs need no change:
 *   - 64 hex characters (the historical format), or
 *   - 32 bytes as base64 (`openssl rand -base64 32`, the documented
 *     format for new installs).
 *
 * Ciphertext format: `<iv-hex>:<ciphertext-hex>:<authTag-hex>` — iv,
 * auth tag and ciphertext stored together in one string. This is the
 * same shape `lib/whatsapp/encryption.ts` writes, so either helper can
 * read the other's output.
 *
 * Never log plaintext or ciphertext from here, and never let either
 * reach an API response — callers expose only `last4` style metadata.
 */

const GCM_IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncryptionKeyError'
  }
}

/** Parses a key string into 32 raw bytes, or explains why it can't. */
export function parseEncryptionKey(raw: string | undefined): Buffer {
  const value = raw?.trim()
  if (!value) {
    throw new EncryptionKeyError(
      'ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32',
    )
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex')
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) || /^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    const bytes = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (bytes.length === 32) return bytes
  }
  throw new EncryptionKeyError(
    'ENCRYPTION_KEY must be 64 hex characters or 32 bytes of base64 ' +
      '(generate one with: openssl rand -base64 32).',
  )
}

let cached: { raw: string | undefined; key: Buffer } | null = null

/** The app's 32-byte key. Throws `EncryptionKeyError` if missing/invalid. */
export function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (cached && cached.raw === raw) return cached.key
  const key = parseEncryptionKey(raw)
  cached = { raw, key }
  return key
}

/**
 * Startup guard (see `src/instrumentation.ts`): in production a missing
 * or malformed key stops the server instead of failing on first use.
 */
export function assertEncryptionKeyForStartup(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return
  parseEncryptionKey(env.ENCRYPTION_KEY)
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${ct.toString('hex')}:${cipher.getAuthTag().toString('hex')}`
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('Encrypted secret has an unrecognised format')
  const [ivHex, ctHex, tagHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  if (iv.length !== GCM_IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Encrypted secret has an unexpected iv or auth-tag length')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8')
}

/** Last four characters, for "••••••••abcd" displays. */
export function lastFour(secret: string): string {
  return secret.slice(-4)
}
