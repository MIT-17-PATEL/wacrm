import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getT } from '@/lib/i18n/translate'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import {
  META_APP_RATE_LIMIT,
  publicOrigin,
  secretUpdatePatch,
  toPublicMetaApp,
  validateAppCredentials,
} from '@/lib/whatsapp/meta-app'
import { loadOrCreateMetaApp, metaAppAdmin, runTokenAppCheck } from '@/lib/whatsapp/meta-app-server'

const t = getT('Api')

const APP_ID = /^\d{5,25}$/
const SECRET = /^[A-Za-z0-9_-]{16,128}$/

/**
 * Settings › WhatsApp › Meta App.
 *
 * Owner/Admin only (enforced here, not just in the UI). Responses go
 * through `toPublicMetaApp`, so the App Secret — plaintext or
 * encrypted — can never be read back: only its last 4 characters.
 */
export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('admin')
    const db = metaAppAdmin()
    const row = await loadOrCreateMetaApp(db, accountId)
    const { data: config } = await db
      .from('whatsapp_config')
      .select('phone_number_id')
      .eq('account_id', accountId)
      .maybeSingle()
    return NextResponse.json({
      metaApp: toPublicMetaApp(row, publicOrigin(request)),
      numberConnected: !!(config as { phone_number_id?: string } | null)?.phone_number_id,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** Save App ID + App Secret (first time or "Replace secret"). */
export async function PUT(request: Request) {
  try {
    const { accountId } = await requireRole('admin')

    const limited = checkRateLimit(`meta-app:save:${accountId}`, META_APP_RATE_LIMIT)
    if (!limited.success) return rateLimitResponse(limited)

    const body = (await request.json().catch(() => null)) as { appId?: unknown; appSecret?: unknown } | null
    const appId = typeof body?.appId === 'string' ? body.appId.trim() : ''
    const appSecret = typeof body?.appSecret === 'string' ? body.appSecret.trim() : ''
    if (!APP_ID.test(appId)) {
      return NextResponse.json({ error: t('metaApp.appIdInvalid') }, { status: 400 })
    }
    if (!SECRET.test(appSecret)) {
      return NextResponse.json({ error: t('metaApp.secretInvalid') }, { status: 400 })
    }

    // Prove the pair belongs together before storing anything.
    const check = await validateAppCredentials(appId, appSecret)
    if (!check.ok) {
      return check.reason === 'invalid'
        ? NextResponse.json({ error: t('metaApp.wrongCredentials') }, { status: 400 })
        : NextResponse.json({ error: t('metaApp.metaUnreachable') }, { status: 502 })
    }

    const db = metaAppAdmin()
    const row = await loadOrCreateMetaApp(db, accountId)
    const patch = {
      ...secretUpdatePatch(row, appId, appSecret),
      // A new App invalidates the old token check.
      token_check_status: null,
      token_checked_at: null,
    }
    const { error } = await db.from('whatsapp_meta_apps').update(patch).eq('account_id', accountId)
    if (error) {
      console.error('[meta-app] save failed for account', accountId, error.message)
      return NextResponse.json({ error: t('metaApp.saveFailed') }, { status: 500 })
    }

    const saved = await loadOrCreateMetaApp(db, accountId)
    // With a number connected, confirm its token belongs to this App.
    await runTokenAppCheck(db, saved)
    const fresh = await loadOrCreateMetaApp(db, accountId)
    return NextResponse.json({ metaApp: toPublicMetaApp(fresh, publicOrigin(request), { secretValid: true }) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
