import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  deleteBroadcast,
  BroadcastDeleteError,
} from '@/lib/broadcasts/delete-broadcast';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const ctx = await getCurrentAccount();
    await deleteBroadcast({
      supabase: ctx.supabase,
      accountId: ctx.accountId,
      userId: ctx.userId,
      role: ctx.role,
      broadcastId: id,
    });
    return NextResponse.json({ ok: true, deleted: id });
  } catch (err) {
    if (err instanceof BroadcastDeleteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return toErrorResponse(err);
  }
}
