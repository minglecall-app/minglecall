/**
 * Targeted Supabase Realtime Broadcast helpers (server / Vercel CJS).
 * Prefer user:{userId} topics — never fan out on global postgres_changes.
 */

async function subscribeAndBroadcast(client, topic, event, payload) {
  const channel = client.channel(topic, {
    config: { broadcast: { self: false, ack: false } },
  });
  await new Promise((resolve) => {
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

/**
 * After a durable messages insert, notify peer + sender (multi-device) inboxes.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {object} message — camelCase client shape
 * @param {string[]} userIds
 */
async function broadcastChatMessage(client, message, userIds) {
  if (!client || !message) {
    return { users: [], errors: ['missing client or message'] };
  }
  const ids = Array.from(
    new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  const payload = {
    type: 'chat:message',
    message,
  };
  const delivery = { users: [], errors: [] };

  // Pair conversation topic (deterministic order) for open-thread subscribers
  if (message.senderId && message.receiverId) {
    const a = String(message.senderId);
    const b = String(message.receiverId);
    const pair = a < b ? `${a}:${b}` : `${b}:${a}`;
    try {
      const ok = await subscribeAndBroadcast(client, `conversation:${pair}`, 'chat', payload);
      if (!ok) delivery.errors.push(`conversation:${pair}: send error`);
    } catch (e) {
      delivery.errors.push(`conversation:${pair}: ${(e && e.message) || 'broadcast failed'}`);
    }
  }

  for (const uid of ids) {
    try {
      const ok = await subscribeAndBroadcast(client, `user:${uid}`, 'chat', payload);
      if (ok) delivery.users.push(uid);
      else delivery.errors.push(`user:${uid}: send error`);
    } catch (e) {
      delivery.errors.push(`user:${uid}: ${(e && e.message) || 'broadcast failed'}`);
    }
  }
  return delivery;
}

/**
 * Broadcast read/update events to conversation participants.
 */
async function broadcastChatUpdate(client, message, userIds) {
  if (!client || !message) return { users: [], errors: ['missing client or message'] };
  const ids = Array.from(
    new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  const payload = { type: 'chat:update', message };
  const delivery = { users: [], errors: [] };
  for (const uid of ids) {
    try {
      const ok = await subscribeAndBroadcast(client, `user:${uid}`, 'chat', payload);
      if (ok) delivery.users.push(uid);
      else delivery.errors.push(`user:${uid}: send error`);
    } catch (e) {
      delivery.errors.push(`user:${uid}: ${(e && e.message) || 'broadcast failed'}`);
    }
  }
  return delivery;
}

module.exports = {
  broadcastChatMessage,
  broadcastChatUpdate,
  subscribeAndBroadcast,
};
