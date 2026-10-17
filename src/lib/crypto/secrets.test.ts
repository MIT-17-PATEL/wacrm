import crypto from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'

import { decrypt, encrypt } from '@/lib/whatsapp/encryption'

import {
  assertEncryptionKeyForStartup,
  decryptSecret,
  encryptSecret,
  lastFour,
  parseEncryptionKey,
} from './secrets'

const ORIGINAL = process.env.ENCRYPTION_KEY

afterEach(() => {
  process.env.ENCRYPTION_KEY = ORIGINAL
})

describe('parseEncryptionKey', () => {
  it('accepts the historical 64-char hex form', () => {
    const hex = crypto.randomBytes(32).toString('hex')
    expect(parseEncryptionKey(hex).equals(Buffer.from(hex, 'hex'))).toBe(true)
  })

  it('accepts 32 bytes of base64 (openssl rand -base64 32)', () => {
    const bytes = crypto.randomBytes(32)
    expect(parseEncryptionKey(bytes.toString('base64')).equals(bytes)).toBe(true)
  })

  it('rejects missing, short or malformed keys', () => {
    expect(() => parseEncryptionKey(undefined)).toThrow(/not set/)
    expect(() => parseEncryptionKey('')).toThrow(/not set/)
    expect(() => parseEncryptionKey(crypto.randomBytes(16).toString('base64'))).toThrow(/32 bytes/)
    expect(() => parseEncryptionKey('not a key!')).toThrow(/32 bytes/)
  })
})

describe('assertEncryptionKeyForStartup', () => {
  it('fails loudly in production without a key', () => {
    expect(() => assertEncryptionKeyForStartup({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /ENCRYPTION_KEY/,
    )
  })

  it('stays quiet outside production', () => {
    expect(() => assertEncryptionKeyForStartup({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow()
  })
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips and never contains the plaintext', () => {
    const secret = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'
    const ct = encryptSecret(secret)
    expect(ct).not.toContain(secret)
    expect(ct.split(':')).toHaveLength(3)
    expect(decryptSecret(ct)).toBe(secret)
  })

  it('uses a fresh iv every time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const [iv, ct, tag] = encryptSecret('secret-value').split(':')
    const flipped = (parseInt(ct[0], 16) ^ 1).toString(16) + ct.slice(1)
    expect(() => decryptSecret([iv, flipped, tag].join(':'))).toThrow()
  })

  it('round-trips with a base64 key too, and interoperates with the token helper', () => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
    expect(decryptSecret(encryptSecret('x'))).toBe('x')
    expect(decrypt(encryptSecret('shared format'))).toBe('shared format')
    expect(decryptSecret(encrypt('shared format'))).toBe('shared format')
  })
})

describe('lastFour', () => {
  it('returns the last four characters', () => {
    expect(lastFour('abcdef123456')).toBe('3456')
  })
})
