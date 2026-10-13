/**
 * Supabase Realtime signaling — replaces Express WebSocket /ws on Vercel.
 * Channel naming:
 *  - presence: global "app-presence"
 *  - per-user inbox: "user:{profileId}" and optionally "user:{authId}"
 *
 * Call reliability: user inbox alone is enough to mark connected. Presence is
 * best-effort. Callee also polls GET /api/calls/incoming when broadcast drops.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type SignalHandler = (payload: any) => void;

function waitForSubscribe(
  channel: RealtimeChannel,
  timeoutMs = 12000
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') done(true);
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        done(false);
      }
      // Ignore CLOSED during teardown/reconnect — timeout still bounds the wait
    });
  });
}

async function removeChannelSafe(channel: RealtimeChannel | null) {
  if (!channel) return;
  try {
    await channel.untrack();
  } catch {
    /* ignore */
  }
  try {
    await supabase.removeChannel(channel);
  } catch {
    /* ignore */
  }
}

export class RealtimeSignaling {
  private userChannel: RealtimeChannel | null = null;
  /** Extra inboxes when profile.id !== auth.users.id (signals may target either). */
  private aliasChannels: RealtimeChannel[] = [];
  private presenceChannel: RealtimeChannel | null = null;
  private profileId: string | null = null;
  private authId: string | null = null;
  private handler: SignalHandler | null = null;
  private connected = false;
  private connectGeneration = 0;

  isConnected() {
    return this.connected;
  }

  async connect(
    profileId: string,
    accessToken: string,
    onMessage: SignalHandler,
    authId?: string | null
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    const generation = ++this.connectGeneration;
    this.handler = onMessage;
    this.profileId = profileId;
    this.authId = String(authId || '').trim() || null;

    // Prefer Realtime JWT auth — do NOT setSession with access_token as refresh_token
    // (that can corrupt/refresh-fail the client session and drop Realtime).
    try {
      const rt = (supabase as any).realtime;
      if (rt && typeof rt.setAuth === 'function' && accessToken) {
        await rt.setAuth(accessToken);
      }
    } catch (e) {
      console.warn('[RealtimeSignaling] setAuth notice:', e);
    }

    // Await teardown so we do not double-subscribe the same topic (common Vercel flake)
    await this.disconnectAsync();
    if (generation !== this.connectGeneration) return false;

    const inboxIds = Array.from(
      new Set([profileId, this.authId].map((v) => String(v || '').trim()).filter(Boolean))
    );

    const trySubscribePair = async (): Promise<{ userOk: boolean; presenceOk: boolean }> => {
      const bindBroadcast = (ch: RealtimeChannel) => {
        ch.on('broadcast', { event: 'signal' }, ({ payload }) => {
          if (payload && this.handler) this.handler(payload);
        });
      };

      const primaryId = inboxIds[0];
      const userChannel = supabase.channel(`user:${primaryId}`, {
        config: { broadcast: { self: false } },
      });
      bindBroadcast(userChannel);

      const aliases: RealtimeChannel[] = [];
      for (const id of inboxIds.slice(1)) {
        const ch = supabase.channel(`user:${id}`, {
          config: { broadcast: { self: false } },
        });
        bindBroadcast(ch);
        aliases.push(ch);
      }

      // Global app-presence track-all removed — HTTP/Redis heartbeat is authoritative.
      // Optional broadcast-only channel for call signals (no presence.track fan-out).
      const presenceChannel = supabase.channel('app-signals', {
        config: { broadcast: { self: false } },
      });
      presenceChannel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        if (payload && this.handler) this.handler(payload);
      });

      this.userChannel = userChannel;
      this.aliasChannels = aliases;
      this.presenceChannel = presenceChannel;

      const [userOk, ...aliasResults] = await Promise.all([
        waitForSubscribe(userChannel, 12000),
        ...aliases.map((ch) => waitForSubscribe(ch, 12000)),
      ]);
      // Best-effort signal channel; do not block connect on it
      const presenceOk = await waitForSubscribe(presenceChannel, 8000);
      const anyInbox = userOk || aliasResults.some(Boolean);
      return { userOk: anyInbox, presenceOk };
    };

    let { userOk, presenceOk } = await trySubscribePair();
    if (generation !== this.connectGeneration) return false;

    // One retry — Realtime often flakes once after auth/page load on Vercel
    if (!userOk) {
      console.warn('[RealtimeSignaling] user channel failed; retrying once…');
      await this.disconnectAsync();
      if (generation !== this.connectGeneration) return false;
      ({ userOk, presenceOk } = await trySubscribePair());
      if (generation !== this.connectGeneration) return false;
    }

    if (!presenceOk) {
      console.warn('[RealtimeSignaling] signal channel unavailable — calls still use user inbox + DB poll');
    }

    // User inbox is enough for call signaling; Redis/HTTP owns presence
    this.connected = Boolean(userOk);

    if (this.connected && this.handler) {
      this.handler({ type: 'auth:ok', userId: profileId });
    } else {
      console.warn('[RealtimeSignaling] connect failed — DB call sync/incoming poll remains available');
    }
    return this.connected;
  }

  async send(payload: Record<string, any>): Promise<boolean> {
    if (!this.connected || !this.userChannel) return false;
    const type = String(payload.type || '');

    // Route directed events to recipient user channel(s).
    // Include profile id + auth id aliases — peers may subscribe under either.
    const targetIds = new Set<string>();
    const pushTarget = (v: unknown) => {
      const id = String(v || '').trim();
      if (id) targetIds.add(id);
    };
    pushTarget(payload.toUserId);
    pushTarget(payload.targetUserId);
    pushTarget(payload.calleeId);
    pushTarget(payload.toAuthId);
    pushTarget(payload.receiverAuthId);
    pushTarget(payload.callerAuthId);
    if (
      type === 'call:accept' ||
      type === 'call:accepted' ||
      type === 'call:reject' ||
      type === 'call:cancel' ||
      type === 'call:end' ||
      type === 'call:ended' ||
      type === 'call:safety_warning'
    ) {
      pushTarget(payload.callerId);
      pushTarget(payload.receiverId);
    }
    if (type === 'call:initiate' || type === 'call:incoming' || type === 'call:ringing') {
      pushTarget(payload.receiverId);
    }
    pushTarget(payload.receiverId);
    pushTarget(payload.userId);

    try {
      if (
        targetIds.size > 0 &&
        (type.startsWith('call:') ||
          type.startsWith('friend_request:') ||
          type === 'chat:message' ||
          type === 'chat:incall_preview' ||
          type.startsWith('quick_match:') ||
          type === 'match:created')
      ) {
        // Presence first — both peers already subscribe to app-presence
        try {
          await this.presenceChannel?.send({
            type: 'broadcast',
            event: 'signal',
            payload,
          });
        } catch {
          /* best-effort */
        }

        let delivered = false;
        for (const targetId of targetIds) {
          // Must use the same topic the peer subscribed to in connect(): user:{profileId|authId}
          const targetChannel = supabase.channel(`user:${targetId}`, {
            config: { broadcast: { self: false, ack: true } },
          });
          // CRITICAL: wait until SUBSCRIBED before broadcast — otherwise initiate/accept are dropped
          const ok = await waitForSubscribe(targetChannel, 5000);
          if (!ok) {
            console.warn('[RealtimeSignaling] target channel subscribe failed', targetId, type);
            await removeChannelSafe(targetChannel);
            continue;
          }
          const sendStatus = await targetChannel.send({
            type: 'broadcast',
            event: 'signal',
            payload,
          });
          // Keep the ephemeral channel briefly so the broadcast can flush to peers.
          await new Promise((r) => setTimeout(r, 350));
          await removeChannelSafe(targetChannel);
          if (sendStatus !== 'error') delivered = true;
          else console.warn('[RealtimeSignaling] target broadcast error', targetId, type);
        }
        // Presence fanout already attempted — treat as success so caller UX continues;
        // callee also polls GET /api/calls/incoming as hard fallback.
        return delivered || Boolean(this.presenceChannel) || this.connected;
      }

      if (type === 'presence:update' || type === 'heartbeat' || type === 'user:update') {
        const nextStatus = String(payload.status || 'online').toLowerCase();
        if (nextStatus === 'offline') {
          try {
            await this.presenceChannel?.untrack();
          } catch {
            /* ignore */
          }
        } else if (this.presenceChannel) {
          await this.presenceChannel.track({
            userId: this.profileId,
            online_at: new Date().toISOString(),
            status: nextStatus === 'busy' || nextStatus === 'in_call' ? 'busy' : 'online',
            ...(payload.user ? { user: payload.user } : {}),
          });
        }
        try {
          await this.presenceChannel?.send({
            type: 'broadcast',
            event: 'signal',
            payload,
          });
        } catch {
          /* ignore */
        }
        return true;
      }

      await this.userChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload,
      });
      return true;
    } catch (e) {
      console.warn('[RealtimeSignaling] send failed', e);
      return false;
    }
  }

  /** Fire-and-forget disconnect (legacy callers). */
  disconnect() {
    void this.disconnectAsync();
  }

  async disconnectAsync() {
    const presence = this.presenceChannel;
    const user = this.userChannel;
    const aliases = this.aliasChannels.slice();
    this.presenceChannel = null;
    this.userChannel = null;
    this.aliasChannels = [];
    this.connected = false;
    await removeChannelSafe(presence);
    await removeChannelSafe(user);
    for (const ch of aliases) {
      await removeChannelSafe(ch);
    }
  }
}

function readPublicEnv(key: string): string {
  try {
    const fromVite = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[key];
    if (fromVite) return String(fromVite).trim();
  } catch {
    /* Next does not fill import.meta.env */
  }
  return String(typeof process !== 'undefined' ? process.env[key] || '' : '').trim();
}

export function shouldUseRealtimeSignaling(): boolean {
  if (!isSupabaseConfigured()) return false;
  const flag = (readPublicEnv('NEXT_PUBLIC_USE_REALTIME') || readPublicEnv('VITE_USE_REALTIME')).toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  if ((readPublicEnv('NEXT_PUBLIC_WS_URL') || readPublicEnv('VITE_WS_URL')).length > 0) return false;
  // Next.js on localhost and Vercel uses Supabase Realtime. There is no Express /ws.
  return true;
}
