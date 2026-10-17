/**
 * Runs once per server start (Next.js instrumentation hook). In
 * production a missing or malformed ENCRYPTION_KEY stops the server
 * here, loudly, instead of surfacing later as failed decrypts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertEncryptionKeyForStartup } = await import('@/lib/crypto/secrets')
  assertEncryptionKeyForStartup()
}
