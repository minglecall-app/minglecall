/**
 * Targeted Supabase Realtime Broadcast (Next.js / server).
 * Channels: user:{userId}, conversation:{sortedPair}
 */
import type { SupabaseClient } from '@supabase/supabase-js';

async function subscribeAndBroadcast(
  client: SupabaseClient,
  topic: string,
  event: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const channel = client.channel(topic, {
    config: { broadcast: { self: false, ack: false } },
  });
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 4000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') done();
    });
  });
  const status = await channel.send({
    type: 'broadcast',
    event,
    payload,
  });
  await new Promise((r) => setTimeout(r, 150));
  try {
    await client.removeChannel(channel);
  } catch {
    /* ignore */
  }
  return status !== 'error';
}

export type BroadcastChatMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  text?: string;
  mediaUrl?: string;
  type?: string;
  isRead?: boolean;
  createdAt?: string;
  timestamp?: string;
  clientTempId?: string;
};

export async function broadcastChatMessage(
  client: SupabaseClient,
  message: BroadcastChatMessage,
  userIds: string[]
): Promise<{ users: string[]; errors: string[] }> {
  const ids = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const payload = { type: 'chat:message', message };
  const delivery = { users: [] as string[], errors: [] as string[] };

  if (message.senderId && message.receiverId) {
    const a = String(message.senderId);
    const b = String(message.receiverId);
    const pair = a < b ? `${a}:${b}` : `${b}:${a}`;
    try {
      const ok = await subscribeAndBroadcast(client, `conversation:${pair}`, 'chat', payload);
      if (!ok) delivery.errors.push(`conversation:${pair}: send error`);
    } catch (e: any) {
      delivery.errors.push(`conversation:${pair}: ${e?.message || 'broadcast failed'}`);
    }
  }

  for (const uid of ids) {
    try {
      const ok = await subscribeAndBroadcast(client, `user:${uid}`, 'chat', payload);
      if (ok) delivery.users.push(uid);
      else delivery.errors.push(`user:${uid}: send error`);
    } catch (e: any) {
      delivery.errors.push(`user:${uid}: ${e?.message || 'broadcast failed'}`);
    }
  }
  return delivery;
}
