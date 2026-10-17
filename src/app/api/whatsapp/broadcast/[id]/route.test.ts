import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from './route';

const mockGetCurrentAccount = vi.fn();
const mockDeleteBroadcast = vi.fn();

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: () => mockGetCurrentAccount(),
  toErrorResponse: (err: unknown) => {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  },
}));

vi.mock('@/lib/broadcasts/delete-broadcast', () => {
  class MockBroadcastDeleteError extends Error {
    status: number;
    constructor(msg: string, status = 400) {
      super(msg);
      this.name = 'BroadcastDeleteError';
      this.status = status;
    }
  }
  return {
    BroadcastDeleteError: MockBroadcastDeleteError,
    deleteBroadcast: (opts: unknown) => mockDeleteBroadcast(opts),
  };
});

describe('DELETE /api/whatsapp/broadcast/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a broadcast successfully when authorized', async () => {
    mockGetCurrentAccount.mockResolvedValueOnce({
      supabase: {},
      accountId: 'acc-1',
      userId: 'user-1',
      role: 'owner',
    });
    mockDeleteBroadcast.mockResolvedValueOnce({ success: true, id: 'bc-100' });

    const req = new Request('http://localhost/api/whatsapp/broadcast/bc-100', {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'bc-100' }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true, deleted: 'bc-100' });
    expect(mockDeleteBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        userId: 'user-1',
        role: 'owner',
        broadcastId: 'bc-100',
      })
    );
  });

  it('returns error status when deleteBroadcast throws BroadcastDeleteError', async () => {
    const { BroadcastDeleteError } = await import('@/lib/broadcasts/delete-broadcast');
    mockGetCurrentAccount.mockResolvedValueOnce({
      supabase: {},
      accountId: 'acc-1',
      userId: 'user-1',
      role: 'agent',
    });
    mockDeleteBroadcast.mockRejectedValueOnce(
      new BroadcastDeleteError("Can't delete while sending", 400)
    );

    const req = new Request('http://localhost/api/whatsapp/broadcast/bc-100', {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'bc-100' }) });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Can't delete while sending");
  });
});
