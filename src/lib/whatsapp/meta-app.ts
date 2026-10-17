import { decryptSecret, encryptSecret, lastFour } from '@/lib/crypto/secrets'

/**
 * Per-workspace Meta App (App ID + App Secret), stored server-only in
 * `whatsapp_meta_apps` (migration 047). Server code only — nothing in
 * here may be imported by a client component.
 *
 * Secret hygiene: plaintext secrets exist only in memory inside these
 * functions and the webhook verifier. They are never logged, never
 * returned from an API (see `toPublicMetaApp`), and never put in an
 * error message.
 */

const GRAPH = 'https://graph.facebook.com/v21.0'

/** Saves + tests call Meta's API; each workspace gets 10 a minute. */
export const META_APP_RATE_LIMIT = { limit: 10, windowMs: 60_000 }

/** A replaced secret keeps verifying webhooks this long. */
export const PREVIOUS_SECRET_TTL_MS = 24 * 60 * 60 * 1000

/** "Webhook not receiving events" once nothing arrived for this long. */
export const WEBHOOK_STALE_MS = 24 * 60 * 60 * 1000

export const META_APP_COLUMNS =
  'account_id, meta_app_id, meta_app_secret_encrypted, meta_app_secret_last4, webhook_verify_token, ' +
  'secret_updated_at, previous_app_secret_encrypted, previous_secret_expires_at, last_webhook_at, ' +
  'token_check_status, token_checked_at'

export type TokenCheckStatus = 'ok' | 'mismatch' | 'error'

export interface MetaAppRow {
  account_id: string
  meta_app_id: string | null
  meta_app_secret_encrypted: string | null
  meta_app_secret_last4: string | null
  webhook_verify_token: string
  secret_updated_at: string | null
  previous_app_secret_encrypted: string | null
  previous_secret_expires_at: string | null
  last_webhook_at: string | null
  token_check_status: TokenCheckStatus | null
  token_checked_at: string | null
}

/** True when the workspace verifies webhooks with its own secret. */
export function hasOwnSecret(row: Pick<MetaAppRow, 'meta_app_secret_encrypted'> | null | undefined): boolean {
  return !!row?.meta_app_secret_encrypted
}

/**
 * Secrets that may sign this workspace's webhooks right now: the
 * current one, plus the previous one until it expires. A secret that
 * no longer decrypts (rotated ENCRYPTION_KEY) is skipped, not thrown.
 */
export function candidateSecrets(
  row: Pick<
    MetaAppRow,
    'account_id' | 'meta_app_secret_encrypted' | 'previous_app_secret_encrypted' | 'previous_secret_expires_at'
  >,
  now: number = Date.now(),
): string[] {
  const out: string[] = []
  const tryDecrypt = (value: string, which: string) => {
    try {
      out.push(decryptSecret(value))
    } catch {
      // Account id only — never the ciphertext or anything derived from it.
      console.error(`[meta-app] ${which} app secret for account ${row.account_id} could not be decrypted`)
    }
  }
  if (row.meta_app_secret_encrypted) tryDecrypt(row.meta_app_secret_encrypted, 'current')
  if (
    row.previous_app_secret_encrypted &&
    row.previous_secret_expires_at &&
    new Date(row.previous_secret_expires_at).getTime() > now
  ) {
    tryDecrypt(row.previous_app_secret_encrypted, 'previous')
  }
  return out
}

/** The columns to write when saving App ID + secret (handles rotation). */
export function secretUpdatePatch(
  row: Pick<MetaAppRow, 'meta_app_secret_encrypted'> | null,
  appId: string,
  secret: string,
  now: number = Date.now(),
): Partial<MetaAppRow> & { updated_at: string } {
  const iso = new Date(now).toISOString()
  const patch: Partial<MetaAppRow> & { updated_at: string } = {
    meta_app_id: appId,
    meta_app_secret_encrypted: encryptSecret(secret),
    meta_app_secret_last4: lastFour(secret),
    secret_updated_at: iso,
    updated_at: iso,
  }
  // Replacing a secret: the old one keeps verifying for 24h.
  if (row?.meta_app_secret_encrypted) {
    patch.previous_app_secret_encrypted = row.meta_app_secret_encrypted
    patch.previous_secret_expires_at = new Date(now + PREVIOUS_SECRET_TTL_MS).toISOString()
  }
  return patch
}

export type ConnectionStatus =
  | 'not_configured'
  | 'connected'
  | 'secret_invalid'
  | 'token_app_mismatch'
  | 'webhook_silent'

/** What the API may return. No secret, no ciphertext — by construction. */
export interface PublicMetaApp {
  configured: boolean
  appId: string | null
  secretLast4: string | null
  secretUpdatedAt: string | null
  previousSecretExpiresAt: string | null
  webhookUrl: string
  verifyToken: string
  lastWebhookAt: string | null
  tokenCheck: { status: TokenCheckStatus | null; checkedAt: string | null }
  status: ConnectionStatus
}

export function webhookUrlFor(origin: string, accountId: string): string {
  return `${origin.replace(/\/+$/, '')}/api/webhook/whatsapp/${accountId}`
}

/** Public origin for webhook URLs: NEXT_PUBLIC_SITE_URL, else the request's. */
export function publicOrigin(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  return new URL(request.url).origin
}

export function connectionStatus(
  row: MetaAppRow,
  opts: { secretValid?: boolean; now?: number } = {},
): ConnectionStatus {
  if (!hasOwnSecret(row)) return 'not_configured'
  if (opts.secretValid === false) return 'secret_invalid'
  if (row.token_check_status === 'mismatch') return 'token_app_mismatch'
  const now = opts.now ?? Date.now()
  const last = row.last_webhook_at ? new Date(row.last_webhook_at).getTime() : null
  const since = row.secret_updated_at ? new Date(row.secret_updated_at).getTime() : now
  // Silent = nothing ever arrived (after a grace period since saving),
  // or nothing for a day.
  if (last === null ? now - since > 15 * 60 * 1000 : now - last > WEBHOOK_STALE_MS) return 'webhook_silent'
  return 'connected'
}

export function toPublicMetaApp(
  row: MetaAppRow,
  origin: string,
  opts: { secretValid?: boolean; now?: number } = {},
): PublicMetaApp {
  return {
    configured: hasOwnSecret(row),
    appId: row.meta_app_id,
    secretLast4: row.meta_app_secret_last4,
    secretUpdatedAt: row.secret_updated_at,
    previousSecretExpiresAt: row.previous_secret_expires_at,
    webhookUrl: webhookUrlFor(origin, row.account_id),
    verifyToken: row.webhook_verify_token,
    lastWebhookAt: row.last_webhook_at,
    tokenCheck: { status: row.token_check_status, checkedAt: row.token_checked_at },
    status: connectionStatus(row, opts),
  }
}

/* ------------------------------------------------------------------ */
/* Graph API checks                                                     */
/* ------------------------------------------------------------------ */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export type CredentialCheck = { ok: true } | { ok: false; reason: 'invalid' | 'unreachable' }

/**
 * Proves App ID + App Secret belong together by asking Meta for an app
 * access token (client_credentials). The returned token is discarded
 * immediately — never stored, never logged.
 */
export async function validateAppCredentials(
  appId: string,
  secret: string,
  fetchImpl: FetchLike = fetch,
): Promise<CredentialCheck> {
  const qs = new URLSearchParams({ client_id: appId, client_secret: secret, grant_type: 'client_credentials' })
  let res: Response
  try {
    res = await fetchImpl(`${GRAPH}/oauth/access_token?${qs}`, { cache: 'no-store' })
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
  const body = (await res.json().catch(() => null)) as { access_token?: unknown; error?: unknown } | null
  if (!res.ok || !body || body.error || typeof body.access_token !== 'string') {
    return { ok: false, reason: res.status >= 500 ? 'unreachable' : 'invalid' }
  }
  return { ok: true }
}

/**
 * Does the connected number's access token belong to this App?
 * `GET /debug_token` authenticated as the app (`APP_ID|APP_SECRET`).
 */
export async function checkTokenApp(
  params: { accessToken: string; appId: string; secret: string },
  fetchImpl: FetchLike = fetch,
): Promise<TokenCheckStatus> {
  const qs = new URLSearchParams({
    input_token: params.accessToken,
    access_token: `${params.appId}|${params.secret}`,
  })
  try {
    const res = await fetchImpl(`${GRAPH}/debug_token?${qs}`, { cache: 'no-store' })
    const body = (await res.json().catch(() => null)) as {
      data?: { app_id?: unknown; error?: { message?: unknown } }
      error?: { message?: unknown }
    } | null
    // Meta reports a token from another app either as data.app_id ≠ ours
    // or as "(#100) The App_id in the input_token did not match the
    // Viewing App" — both mean the same thing here.
    const message = String(body?.error?.message ?? body?.data?.error?.message ?? '')
    if (/did not match|does not match/i.test(message)) return 'mismatch'
    if (!res.ok || !body?.data) return 'error'
    return String(body.data.app_id ?? '') === params.appId ? 'ok' : 'mismatch'
  } catch {
    return 'error'
  }
}
