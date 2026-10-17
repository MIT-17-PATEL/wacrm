import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { decrypt } from './encryption'
import {
  META_APP_COLUMNS,
  candidateSecrets,
  checkTokenApp,
  hasOwnSecret,
  type MetaAppRow,
  type TokenCheckStatus,
} from './meta-app'

/**
 * Service-role access to `whatsapp_meta_apps` for server routes. The
 * table has no RLS policies, so every caller must have done its own
 * Owner/Admin check first (see /api/whatsapp/meta-app).
 */

let admin: SupabaseClient | null = null
export function metaAppAdmin(): SupabaseClient {
  admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return admin
}

export async function loadMetaApp(db: SupabaseClient, accountId: string): Promise<MetaAppRow | null> {
  const { data, error } = await db.from('whatsapp_meta_apps').select(META_APP_COLUMNS).eq('account_id', accountId).maybeSingle()
  if (error) throw new Error(`whatsapp_meta_apps read failed: ${error.message}`)
  return (data as unknown as MetaAppRow | null) ?? null
}

/** The row, created on first use (the DB generates the verify token). */
export async function loadOrCreateMetaApp(db: SupabaseClient, accountId: string): Promise<MetaAppRow> {
  const existing = await loadMetaApp(db, accountId)
  if (existing) return existing
  const { data, error } = await db
    .from('whatsapp_meta_apps')
    .upsert({ account_id: accountId }, { onConflict: 'account_id', ignoreDuplicates: true })
    .select(META_APP_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`whatsapp_meta_apps create failed: ${error.message}`)
  return (data as unknown as MetaAppRow | null) ?? (await loadMetaApp(db, accountId))!
}

/**
 * The workspace's own Meta App ID, else META_APP_ID. Used for the
 * app-scoped resumable upload (template image headers) and the
 * "WABA subscribed to our app" check. Never throws: a missing table or
 * read error falls back to the env value.
 */
export async function effectiveAppId(accountId: string, db?: SupabaseClient): Promise<string | null> {
  try {
    const row = await loadMetaApp(db ?? metaAppAdmin(), accountId)
    if (row?.meta_app_id) return row.meta_app_id
  } catch {
    // fall through to the env value
  }
  return process.env.META_APP_ID?.trim() || null
}

/**
 * /debug_token: does the connected number's access token belong to this
 * workspace's App? Stores the result on the row. Returns null when
 * there's nothing to check (no own secret, or no number connected).
 */
export async function runTokenAppCheck(
  db: SupabaseClient,
  row: MetaAppRow,
  accessToken?: string | null,
): Promise<TokenCheckStatus | null> {
  if (!hasOwnSecret(row) || !row.meta_app_id) return null
  const secret = candidateSecrets({ ...row, previous_app_secret_encrypted: null })[0]
  if (!secret) return null

  let token = accessToken ?? null
  if (!token) {
    const { data } = await db
      .from('whatsapp_config')
      .select('access_token')
      .eq('account_id', row.account_id)
      .maybeSingle()
    const encrypted = (data as { access_token?: string } | null)?.access_token
    if (!encrypted) return null
    try {
      token = decrypt(encrypted)
    } catch {
      return 'error'
    }
  }

  const status = await checkTokenApp({ accessToken: token, appId: row.meta_app_id, secret })
  await db
    .from('whatsapp_meta_apps')
    .update({ token_check_status: status, token_checked_at: new Date().toISOString() })
    .eq('account_id', row.account_id)
  return status
}
