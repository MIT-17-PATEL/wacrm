# Several WhatsApp Business Accounts on one wacrm deployment

Issue #500 asked how one deployment can serve accounts whose numbers
belong to different WhatsApp Business Accounts (WABAs) and different
Meta Apps. Since migration 047 every workspace can connect **its own
Meta App** (App ID + App Secret) from Settings › WhatsApp › Meta App.
`META_APP_SECRET` is now an **optional fallback** for workspaces that
don't, which keeps self-hosted and single-tenant installs working with
no change.

## What is per workspace and what is per deployment

| Value | Lives in | Scope |
| --- | --- | --- |
| Phone Number ID, WABA ID, access token, two-step PIN | `whatsapp_config` (one row per workspace, token encrypted) | per workspace |
| Meta App ID, App Secret, webhook verify token, last webhook time | `whatsapp_meta_apps` (migration 047; secret AES-256-GCM encrypted; service-role only) | per workspace |
| Webhook callback URL | your Meta App → WhatsApp → Configuration | per Meta App |
| `META_APP_SECRET` | server environment | fallback for workspaces without their own secret — **may list several** |
| `META_APP_ID` | server environment | fallback App ID for template image-header uploads |
| `ENCRYPTION_KEY` | server environment | one key; 64 hex chars or 32 bytes base64 (`openssl rand -base64 32`) |

`whatsapp_meta_apps` has RLS enabled with no policies: agents and
viewers can't read it from the browser. Only Owners and Admins see the
Meta App section, and the API (`/api/whatsapp/meta-app`) enforces that
role on the server. The App Secret is write-only — after saving, the UI
and API show only its last 4 characters.

## Setup 0 — each workspace brings its own Meta App (recommended)

1. In the workspace, open **Settings › WhatsApp › Meta App** (Owner or
   Admin) and enter the App ID and App Secret from Meta for Developers
   → App settings → Basic. wacrm validates the pair with Meta
   (`GET /oauth/access_token?grant_type=client_credentials`; the
   returned app token is discarded) and rejects a wrong pair with
   "App ID or App Secret is wrong".
2. Copy the workspace's **Webhook URL**
   (`https://<host>/api/webhook/whatsapp/<workspaceId>`) and **Verify
   token** into the Meta App → WhatsApp → Configuration → Webhook, then
   subscribe to the `messages` field.
3. Connect the number as usual (Phone Number ID, WABA ID, access token).
   wacrm runs `GET /debug_token` with the App credentials and shows
   **"Access token belongs to a different Meta App"** when the token was
   issued for another app. The same check runs on save and on
   **Test connection**.

How deliveries are verified:

* **Per-workspace URL** — the raw body's `X-Hub-Signature-256` must
  match that workspace's current secret (or the previous one, see
  rotation). Anything else → 401, nothing processed. Changes in the body
  for phone numbers or WABAs owned by another workspace are dropped.
* **Shared URL** (`/api/whatsapp/webhook`) — the body is parsed only to
  read `metadata.phone_number_id` (or `entry.id`, the WABA, for template
  events). Each owning workspace is verified with its own secret when it
  has one, else with `META_APP_SECRET`. Only verified workspaces'
  changes are processed, so a valid signature for workspace A can never
  create data in workspace B. A workspace that has its own secret is
  **not** accepted via `META_APP_SECRET`.

Rotating a secret: click **Replace secret** and save the new one. The
old secret keeps verifying webhooks for 24 hours, so deliveries signed
while you switch Meta over still pass; after that only the new one does.

Status line (Test connection): **Connected ✓**, **Secret invalid** (Meta
no longer accepts the stored pair), **Access token belongs to a
different Meta App**, or **Webhook not receiving events** (nothing
verified in the last 24 hours, with the last received time).

The workspace's App ID is also used for template image-header uploads
(Meta's resumable upload is app-scoped), falling back to `META_APP_ID`.

## Setup A — many accounts, one Meta App, many WABAs (env fallback)

This is the normal case for an agency or a company with several
brands. Nothing to configure beyond a single-tenant install.

1. Create one Meta App and add the WhatsApp product. Under
   **WhatsApp → Configuration** set the callback URL to
   `https://<your host>/api/whatsapp/webhook` and subscribe to the
   `messages` field. Set `META_APP_SECRET` to this app's secret.
2. For each WABA, make sure the Business portfolio that owns it has
   access to the app (Business Settings → Accounts → WhatsApp accounts →
   Assigned assets, or add the WABA through the app's WhatsApp product).
3. Each wacrm account opens Settings → WhatsApp connection and enters
   its own Phone Number ID, WABA ID, a System User access token that
   can manage *that* WABA, a verify token, and (for production numbers)
   the two-step PIN.

On save, wacrm verifies the number with the token, registers it
(`POST /{phone_number_id}/register`, PIN required) and subscribes the
WABA to the app (`POST /{waba_id}/subscribed_apps`).
From then on Meta delivers every WABA's events to the one callback URL
and wacrm fans them out by `phone_number_id`.

Constraints:

* One phone number can be connected to one wacrm account only — the
  route refuses a `phone_number_id` already claimed by another account.
* The **verify token** typed into the Meta App's webhook settings must
  equal the verify token saved by at least one wacrm account; the
  handshake (`GET /api/whatsapp/webhook`) accepts any account's token.
  Using the same string in every account keeps this simple.

## Setup B — WABAs under different Meta Apps (env fallback)

Sometimes the WABAs cannot share an app: two clients each own their own
Meta App and portfolio, or an existing app cannot be granted access to
another business's WABA. Each app signs webhooks with its own secret,
so wacrm needs all of them.

1. In **every** Meta App, set the same callback URL
   (`https://<your host>/api/whatsapp/webhook`) and subscribe to
   `messages`. Use a verify token that at least one wacrm account has
   saved (see the note above).
2. Set `META_APP_SECRET` to the comma-separated list of all those apps'
   secrets:

   ```
   META_APP_SECRET=secret-of-app-one,secret-of-app-two
   ```

   Whitespace around commas is ignored, empty slots are dropped. A
   delivery is accepted when its `X-Hub-Signature-256` matches **any**
   listed secret; each comparison is constant-time. An empty or
   comma-only value still fails closed — every request is rejected.
3. Each wacrm account connects its number exactly as in setup A, using a
   token generated inside the Business portfolio that owns its app.
   The save subscribes the WABA to *that* app (the one the token
   belongs to).

Rotating a secret: add the new one to the list, redeploy, then rotate
in Meta, then remove the old one. Deliveries keep verifying throughout.

## Setup C — per-workspace App ID for template image headers (now supported)

This used to be the unsupported case: `META_APP_ID` was a single value,
so with WABAs under several apps every image-header template upload
went through one app and failed for the others. A workspace that saves
its own Meta App (setup 0) now uploads through **its own** App ID; only
workspaces without one still use `META_APP_ID`. Text-only templates,
sending and receiving never depended on it.

## Checking a multi-WABA deployment

* Settings → WhatsApp connection → **Verify with Meta** runs, per
  account, the per-check diagnostic (`phone_metadata_ok`,
  `waba_subscribed_to_app`, `locally_marked_registered`).
  `waba_subscribed_to_app` false means the save never managed to
  subscribe the WABA to its app — re-enter the token and save again.
* A webhook delivery that is rejected with 401 means no configured
  secret produced its signature — the WABA is subscribed to an app
  whose secret is missing from `META_APP_SECRET` — or, for a workspace
  with its own Meta App, the delivery wasn't signed by that app's
  current (or 24h-previous) secret. Settings › WhatsApp › Meta App →
  Test connection shows which.
