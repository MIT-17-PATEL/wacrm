-- ============================================================
-- 047_workspace_meta_app.sql — per-workspace Meta App (App ID + secret)
-- ============================================================
--
-- Each workspace (account) can connect its own Meta App from
-- Settings › WhatsApp. Webhooks for that workspace are then verified
-- with its own App Secret instead of the deployment-wide
-- META_APP_SECRET, which stays as the fallback for workspaces that
-- never set one (self-hosted / single-tenant installs keep working
-- unchanged).
--
-- Why a companion table instead of new whatsapp_config columns:
-- whatsapp_config is SELECT-able by every account member (policy
-- whatsapp_config_select, migration 017), so agents and viewers could
-- read anything stored there from the browser. This table has RLS on
-- and NO policies — only the service role (server routes, after an
-- Owner/Admin check) can read or write it.

CREATE TABLE IF NOT EXISTS whatsapp_meta_apps (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  meta_app_id text,
  -- AES-256-GCM, `<iv>:<ciphertext>:<tag>` (lib/crypto/secrets.ts).
  meta_app_secret_encrypted text,
  meta_app_secret_last4 text,
  -- Random per workspace; Meta echoes it on the webhook GET handshake.
  webhook_verify_token text NOT NULL
    DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  secret_updated_at timestamptz,
  -- Rotation: the replaced secret keeps verifying for 24h so deliveries
  -- signed during the switch still pass.
  previous_app_secret_encrypted text,
  previous_secret_expires_at timestamptz,
  -- Last verified delivery (Settings status line).
  last_webhook_at timestamptz,
  -- Result of the /debug_token check: does the connected number's access
  -- token belong to this App?
  token_check_status text CHECK (token_check_status IN ('ok', 'mismatch', 'error')),
  token_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_meta_apps_verify_token_len CHECK (char_length(webhook_verify_token) >= 32),
  CONSTRAINT whatsapp_meta_apps_secret_pair CHECK (
    (meta_app_secret_encrypted IS NULL) = (meta_app_id IS NULL)
  )
);

ALTER TABLE whatsapp_meta_apps ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service role only.
REVOKE ALL ON whatsapp_meta_apps FROM anon, authenticated;

-- Every existing workspace gets its verify token now; new workspaces
-- get a row the first time an Owner/Admin opens the Meta App section.
INSERT INTO whatsapp_meta_apps (account_id)
SELECT id FROM accounts
ON CONFLICT (account_id) DO NOTHING;
