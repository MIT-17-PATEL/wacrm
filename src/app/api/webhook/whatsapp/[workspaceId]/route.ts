import crypto from 'node:crypto'
import { NextResponse, after } from 'next/server'

import type { MetaAppRow } from '@/lib/whatsapp/meta-app'
import { authorizeWorkspaceDelivery, dbWebhookLookup, touchLastWebhook } from '@/lib/whatsapp/webhook-auth'
import { processWebhook, supabaseAdmin, type WhatsAppWebhookEntry } from '@/lib/whatsapp/webhook-processor'

/**
 * Per-workspace webhook: https://<host>/api/webhook/whatsapp/<workspaceId>
 *
 * Set in the workspace's own Meta App (Settings › WhatsApp › Meta App
 * shows the URL and verify token). Deliveries are verified with that
 * workspace's App Secret only — the current one, or the previous one
 * for 24h after a rotation — and only changes for that workspace's
 * phone numbers / WABAs are processed. Processing is shared with the
 * legacy shared route (/api/whatsapp/webhook).
 */

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Ctx = { params: Promise<{ workspaceId: string }> }

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// GET — Meta's verification handshake, against this workspace's token.
export async function GET(request: Request, ctx: Ctx) {
  const { workspaceId } = await ctx.params
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const challenge = searchParams.get('hub.challenge')
  const verifyToken = searchParams.get('hub.verify_token')

  if (mode !== 'subscribe' || !challenge || !verifyToken) {
    return NextResponse.json({ error: 'Missing verification parameters' }, { status: 400 })
  }
  if (!UUID.test(workspaceId)) {
    return NextResponse.json({ error: 'Verification token mismatch' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin()
    .from('whatsapp_meta_apps')
    .select('webhook_verify_token')
    .eq('account_id', workspaceId)
    .maybeSingle()

  const expected = (data as Pick<MetaAppRow, 'webhook_verify_token'> | null)?.webhook_verify_token
  if (error || !expected || !safeEqual(verifyToken, expected)) {
    return NextResponse.json({ error: 'Verification token mismatch' }, { status: 403 })
  }
  return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

// POST — signed deliveries for this workspace only.
export async function POST(request: Request, ctx: Ctx) {
  const { workspaceId } = await ctx.params
  // Raw bytes first: the HMAC covers exactly what Meta sent.
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  if (!UUID.test(workspaceId)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: { entry?: WhatsAppWebhookEntry[] } | null = null
  try {
    body = JSON.parse(rawBody)
  } catch {
    body = null
  }

  const auth = await authorizeWorkspaceDelivery({
    workspaceId,
    rawBody,
    signature,
    body: body ?? {},
    lookup: dbWebhookLookup(supabaseAdmin()),
  })
  if (!auth.ok) {
    console.warn(`[webhook] rejected delivery for workspace ${workspaceId}: invalid signature`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const verifiedBody = body

  // Ack fast; process inside after() so serverless keeps the work alive.
  after(async () => {
    try {
      await touchLastWebhook(supabaseAdmin(), auth.ownSecretAccounts)
      await processWebhook(verifiedBody, { allowChange: auth.allowChange, scopeFor: auth.scopeFor })
    } catch (error) {
      console.error('Error processing webhook:', error)
    }
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

