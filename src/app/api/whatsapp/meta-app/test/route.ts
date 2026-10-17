import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getT } from '@/lib/i18n/translate'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import {
  META_APP_RATE_LIMIT,
  candidateSecrets,
  hasOwnSecret,
  publicOrigin,
  toPublicMetaApp,
  validateAppCredentials,
} from '@/lib/whatsapp/meta-app'
import { loadOrCreateMetaApp, metaAppAdmin, runTokenAppCheck } from '@/lib/whatsapp/meta-app-server'


/**
 * "Test connection": re-validates the stored App ID + secret with Meta,
 * re-runs the access-token /debug_token check, and returns the status
 * line (Connected / Secret invalid / Access token belongs to a different
 * Meta App / Webhook not receiving events). Owner/Admin only.
 */
export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('admin')

    const limited = checkRateLimit(`meta-app:test:${accountId}`, META_APP_RATE_LIMIT)
    if (!limited.success) return rateLimitResponse(limited)

    const db = metaAppAdmin()
    const row = await loadOrCreateMetaApp(db, accountId)
    if (!hasOwnSecret(row) || !row.meta_app_id) {
      return NextResponse.json({ metaApp: toPublicMetaApp(row, publicOrigin(request)) })
    }

    const [secret] = candidateSecrets({ ...row, previous_app_secret_encrypted: null })
    const check = secret ? await validateAppCredentials(row.meta_app_id, secret) : { ok: false as const, reason: 'invalid' as const }
    if (!check.ok && check.reason === 'unreachable') {
      return NextResponse.json({ error: getT('Api')('metaApp.metaUnreachable') }, { status: 502 })
    }
    if (check.ok) await runTokenAppCheck(db, row)

    const fresh = await loadOrCreateMetaApp(db, accountId)
    return NextResponse.json({
      metaApp: toPublicMetaApp(fresh, publicOrigin(request), { secretValid: check.ok }),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
