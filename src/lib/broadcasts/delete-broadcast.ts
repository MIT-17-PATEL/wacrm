import type { SupabaseClient } from '@supabase/supabase-js';
import { hasMinRole, type AccountRole } from '@/lib/auth/roles';

export class BroadcastDeleteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'BroadcastDeleteError';
    this.status = status;
  }
}

export interface DeleteBroadcastOptions {
  supabase: SupabaseClient;
  accountId: string;
  userId: string;
  role: AccountRole;
  broadcastId: string;
}

/**
 * Delete a broadcast and its recipient rows.
 * Enforces:
 *   - Tenancy: scoped strictly to accountId
 *   - Permissions: Owner/Admin or the original creator only
 *   - Status rules: Sending status is blocked
 *   - Inbox safety: conversation messages remain intact
 */
export async function deleteBroadcast({
  supabase,
  accountId,
  userId,
  role,
  broadcastId,
}: DeleteBroadcastOptions): Promise<{ success: boolean; id: string }> {
  // 1. Fetch broadcast scoped to account
  const { data: broadcast, error: fetchErr } = await supabase
    .from('broadcasts')
    .select('id, user_id, account_id, status, name')
    .eq('id', broadcastId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (fetchErr) {
    throw new BroadcastDeleteError(fetchErr.message, 500);
  }
  if (!broadcast) {
    throw new BroadcastDeleteError('Broadcast not found', 404);
  }

  // 2. Check permissions: Owner/Admin or the creator only
  const isOwnerOrAdmin = hasMinRole(role, 'admin');
  const isCreator = broadcast.user_id === userId;
  if (!isOwnerOrAdmin && !isCreator) {
    throw new BroadcastDeleteError(
      'You do not have permission to delete this broadcast',
      403
    );
  }

  // 3. Status rule: Draft / Sent / Failed / Scheduled can delete; Sending is blocked
  if (broadcast.status === 'sending') {
    throw new BroadcastDeleteError("Can't delete while sending", 400);
  }

  // 4. Delete recipient / stat rows
  const { error: recErr } = await supabase
    .from('broadcast_recipients')
    .delete()
    .eq('broadcast_id', broadcastId);

  if (recErr) {
    throw new BroadcastDeleteError(recErr.message, 500);
  }

  // 5. Delete parent broadcast row
  const { error: delErr } = await supabase
    .from('broadcasts')
    .delete()
    .eq('id', broadcastId)
    .eq('account_id', accountId);

  if (delErr) {
    throw new BroadcastDeleteError(delErr.message, 500);
  }

  return { success: true, id: broadcastId };
}
