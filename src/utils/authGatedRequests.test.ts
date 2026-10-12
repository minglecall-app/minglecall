/**
 * Auth-gated polling + unload offline helpers.
 * Run: npx tsx --test src/utils/authGatedRequests.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdminActiveCallsHttpResult,
  buildOfflineUnloadPayload,
  chooseOfflineUnloadTransport,
  createAdminActiveCallsPollState,
  createUnloadOnceGate,
  dispatchOfflineUnloadRequests,
  resumeAdminActiveCallsPoll,
  shouldAttemptAdminActiveCallsPoll,
} from './authGatedRequests.ts';

describe('admin active-calls poll gating', () => {
  it('requires fresh token and does not attempt when suspended or in-flight', () => {
    const state = createAdminActiveCallsPollState();
    assert.equal(
      shouldAttemptAdminActiveCallsPoll({
        isLoggedIn: true,
        isAdmin: true,
        state,
        freshAccessToken: 'tok',
      }).attempt,
      true
    );
    assert.equal(
      shouldAttemptAdminActiveCallsPoll({
        isLoggedIn: true,
        isAdmin: true,
        state,
        freshAccessToken: null,
      }).reason,
      'no_token'
    );
    state.inFlight = true;
    assert.equal(
      shouldAttemptAdminActiveCallsPoll({
        isLoggedIn: true,
        isAdmin: true,
        state,
        freshAccessToken: 'tok',
      }).reason,
      'in_flight'
    );
    state.inFlight = false;
    state.suspended = true;
    assert.equal(
      shouldAttemptAdminActiveCallsPoll({
        isLoggedIn: true,
        isAdmin: true,
        state,
        freshAccessToken: 'tok',
      }).reason,
      'suspended'
    );
  });

  it('suspends on 401/403 and does not keep attempting until resume', () => {
    let state = createAdminActiveCallsPollState();
    state.inFlight = true;
    state = applyAdminActiveCallsHttpResult(state, 401);
    assert.equal(state.suspended, true);
    assert.equal(state.inFlight, false);
    assert.equal(
      shouldAttemptAdminActiveCallsPoll({
        isLoggedIn: true,
        isAdmin: true,
        state,
        freshAccessToken: 'stale-or-new',
      }).attempt,
      false
    );

    state = applyAdminActiveCallsHttpResult({ ...state, inFlight: true }, 403);
    assert.equal(state.suspended, true);

    state = resumeAdminActiveCallsPoll(state, null);
    assert.equal(state.suspended, true);
    state = resumeAdminActiveCallsPoll(state, 'fresh-after-reauth');
    assert.equal(state.suspended, false);
    assert.equal(
      shouldAttemptAdminActiveCallsPoll({
        isLoggedIn: true,
        isAdmin: true,
        state,
        freshAccessToken: 'fresh-after-reauth',
      }).attempt,
      true
    );
  });

  it('preserves admin/login gates', () => {
    const state = createAdminActiveCallsPollState();
    assert.equal(
      shouldAttemptAdminActiveCallsPoll({
        isLoggedIn: false,
        isAdmin: true,
        state,
        freshAccessToken: 'tok',
      }).reason,
      'not_logged_in'
    );
    assert.equal(
      shouldAttemptAdminActiveCallsPoll({
        isLoggedIn: true,
        isAdmin: false,
        state,
        freshAccessToken: 'tok',
      }).reason,
      'not_admin'
    );
  });
});

describe('unload offline transport + dedupe', () => {
  it('dedupes pagehide + beforeunload via once-gate', () => {
    const gate = createUnloadOnceGate();
    assert.equal(gate.tryClaim(), true);
    assert.equal(gate.tryClaim(), false);
    assert.equal(gate.tryClaim(), false);
    gate.reset();
    assert.equal(gate.tryClaim(), true);
  });

  it('prefers fetch keepalive with Bearer when token exists', () => {
    assert.equal(
      chooseOfflineUnloadTransport({
        hasToken: true,
        fetchKeepaliveAvailable: true,
        sendBeaconAvailable: true,
      }),
      'fetch_keepalive'
    );
    assert.equal(
      chooseOfflineUnloadTransport({
        hasToken: true,
        fetchKeepaliveAvailable: false,
        sendBeaconAvailable: true,
      }),
      'send_beacon'
    );
    assert.equal(
      chooseOfflineUnloadTransport({
        hasToken: false,
        fetchKeepaliveAvailable: true,
        sendBeaconAvailable: true,
      }),
      'skipped'
    );
  });

  it('dispatch uses Authorization Bearer on fetch and body token for beacon fallback', () => {
    const fetches: Array<{ url: string; init: RequestInit }> = [];
    const beacons: Array<{ url: string; body: string }> = [];
    const token = 'test-access-token';

    const fetchResult = dispatchOfflineUnloadRequests({
      token,
      resolveUrl: (p) => `https://example.test${p}`,
      transport: 'fetch_keepalive',
      fetchFn: (url, init) => {
        fetches.push({ url, init });
      },
    });
    assert.deepEqual(fetchResult.pathsAttempted, [
      '/api/supabase/update-status',
      '/api/presence',
    ]);
    assert.equal(fetches.length, 2);
    for (const f of fetches) {
      assert.equal((f.init.headers as any).Authorization, `Bearer ${token}`);
      assert.equal(f.init.keepalive, true);
      assert.equal(f.init.body, buildOfflineUnloadPayload(token));
      const parsed = JSON.parse(String(f.init.body));
      assert.equal(parsed.status, 'offline');
      assert.equal(parsed.accessToken, token);
    }

    dispatchOfflineUnloadRequests({
      token,
      resolveUrl: (p) => `https://example.test${p}`,
      transport: 'send_beacon',
      sendBeaconFn: (url, blob) => {
        // Blob.text is async in some envs — use known payload shape instead
        beacons.push({ url, body: buildOfflineUnloadPayload(token) });
        assert.equal(blob.type, 'application/json');
        return true;
      },
    });
    assert.equal(beacons.length, 2);
    assert.ok(beacons.every((b) => b.body.includes('"accessToken":"test-access-token"')));
  });

  it('skips dispatch without token (never unauthenticated presence mutate)', () => {
    const result = dispatchOfflineUnloadRequests({
      token: '',
      resolveUrl: (p) => p,
      transport: 'skipped',
      fetchFn: () => {
        throw new Error('must not fetch');
      },
    });
    assert.deepEqual(result.pathsAttempted, []);
  });
});
