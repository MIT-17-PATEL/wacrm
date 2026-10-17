import { describe, it, expect, vi } from 'vitest';
import { deleteBroadcast, BroadcastDeleteError } from './delete-broadcast';
import type { SupabaseClient } from '@supabase/supabase-js';

function createMockSupabase(initialBroadcast: Record<string, unknown> | null) {
  const deletedTables: { table: string; filter: Record<string, unknown> }[] = [];

  const client = {
    from: vi.fn((table: string) => {
      let filterVal: unknown = null;
      let accountVal: unknown = null;

      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: unknown) => {
          if (col === 'id' || col === 'broadcast_id') {
            filterVal = val;
          }
          if (col === 'account_id') {
            accountVal = val;
          }
          return builder;
        }),
        maybeSingle: vi.fn(async () => {
          if (!initialBroadcast) return { data: null, error: null };
          if (filterVal && initialBroadcast.id !== filterVal) {
            return { data: null, error: null };
          }
          if (accountVal && initialBroadcast.account_id !== accountVal) {
            return { data: null, error: null };
          }
          return { data: initialBroadcast, error: null };
        }),
        delete: vi.fn(() => {
          return {
            eq: vi.fn((col: string, val: unknown) => {
              deletedTables.push({ table, filter: { [col]: val } });
              return {
                eq: vi.fn((col2: string, val2: unknown) => {
                  deletedTables.push({ table, filter: { [col]: val, [col2]: val2 } });
                  return Promise.resolve({ error: null });
                }),
                then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
              };
            }),
          };
        }),
      };
      return builder;
    }),
    _deletedTables: deletedTables,
  } as unknown as SupabaseClient & { _deletedTables: typeof deletedTables };

  return client;
}

describe('deleteBroadcast', () => {
  it('allows owner to delete a sent broadcast', async () => {
    const supabase = createMockSupabase({
      id: 'bc-1',
      account_id: 'acc-1',
      user_id: 'user-creator',
      status: 'sent',
      name: 'Promo Campaign',
    });

    const res = await deleteBroadcast({
      supabase,
      accountId: 'acc-1',
      userId: 'user-owner',
      role: 'owner',
      broadcastId: 'bc-1',
    });

    expect(res).toEqual({ success: true, id: 'bc-1' });
    expect(supabase.from).toHaveBeenCalledWith('broadcast_recipients');
    expect(supabase.from).toHaveBeenCalledWith('broadcasts');
    // Confirms conversation messages or inbox were never touched
    expect(supabase.from).not.toHaveBeenCalledWith('messages');
    expect(supabase.from).not.toHaveBeenCalledWith('conversations');
  });

  it('allows admin to delete a draft broadcast', async () => {
    const supabase = createMockSupabase({
      id: 'bc-2',
      account_id: 'acc-1',
      user_id: 'user-creator',
      status: 'draft',
      name: 'Draft Campaign',
    });

    const res = await deleteBroadcast({
      supabase,
      accountId: 'acc-1',
      userId: 'user-admin',
      role: 'admin',
      broadcastId: 'bc-2',
    });

    expect(res.success).toBe(true);
  });

  it('allows the creator to delete their own broadcast even if agent role', async () => {
    const supabase = createMockSupabase({
      id: 'bc-3',
      account_id: 'acc-1',
      user_id: 'agent-alice',
      status: 'scheduled',
      name: 'Alice Campaign',
    });

    const res = await deleteBroadcast({
      supabase,
      accountId: 'acc-1',
      userId: 'agent-alice',
      role: 'agent',
      broadcastId: 'bc-3',
    });

    expect(res.success).toBe(true);
  });

  it('forbids non-creator agent from deleting someone elses broadcast', async () => {
    const supabase = createMockSupabase({
      id: 'bc-4',
      account_id: 'acc-1',
      user_id: 'agent-bob',
      status: 'sent',
      name: 'Bob Campaign',
    });

    await expect(
      deleteBroadcast({
        supabase,
        accountId: 'acc-1',
        userId: 'agent-charlie',
        role: 'agent',
        broadcastId: 'bc-4',
      })
    ).rejects.toThrow(BroadcastDeleteError);
  });

  it('forbids viewer from deleting broadcast', async () => {
    const supabase = createMockSupabase({
      id: 'bc-5',
      account_id: 'acc-1',
      user_id: 'user-1',
      status: 'sent',
      name: 'Campaign',
    });

    await expect(
      deleteBroadcast({
        supabase,
        accountId: 'acc-1',
        userId: 'viewer-1',
        role: 'viewer',
        broadcastId: 'bc-5',
      })
    ).rejects.toThrow('You do not have permission to delete this broadcast');
  });

  it('blocks deletion of a broadcast while in sending status', async () => {
    const supabase = createMockSupabase({
      id: 'bc-sending',
      account_id: 'acc-1',
      user_id: 'user-owner',
      status: 'sending',
      name: 'Sending Live',
    });

    await expect(
      deleteBroadcast({
        supabase,
        accountId: 'acc-1',
        userId: 'user-owner',
        role: 'owner',
        broadcastId: 'bc-sending',
      })
    ).rejects.toThrow("Can't delete while sending");
  });

  it('returns 404 when broadcast belongs to a different workspace', async () => {
    const supabase = createMockSupabase({
      id: 'bc-diff-account',
      account_id: 'acc-OTHER',
      user_id: 'user-1',
      status: 'sent',
      name: 'Other Account Campaign',
    });

    await expect(
      deleteBroadcast({
        supabase,
        accountId: 'acc-MY-WORKSPACE',
        userId: 'user-owner',
        role: 'owner',
        broadcastId: 'bc-diff-account',
      })
    ).rejects.toThrow('Broadcast not found');
  });

  it('deletes scheduled broadcast and does not affect inbox messages', async () => {
    const supabase = createMockSupabase({
      id: 'bc-sched',
      account_id: 'acc-1',
      user_id: 'user-1',
      status: 'scheduled',
      name: 'Scheduled Broadcast',
    });

    const res = await deleteBroadcast({
      supabase,
      accountId: 'acc-1',
      userId: 'user-1',
      role: 'owner',
      broadcastId: 'bc-sched',
    });

    expect(res.success).toBe(true);
    // Messages and conversations remain untouched in DB
    expect(supabase.from).not.toHaveBeenCalledWith('messages');
    expect(supabase.from).not.toHaveBeenCalledWith('conversations');
  });
});
