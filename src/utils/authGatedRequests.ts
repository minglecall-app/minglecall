/**
 * Small helpers for auth-gated polling and unload offline posts.
 * Kept free of React / secrets logging for unit tests.
 */

export type AdminActiveCallsPollState = {
  /** After 401/403 (or missing fresh token), stop hitting the API until resume. */
  suspended: boolean;
  /** Prevent overlapping HTTP polls. */
  inFlight: boolean;
};

export function createAdminActiveCallsPollState(): AdminActiveCallsPollState {
  return { suspended: false, inFlight: false };
}

/** Fresh session token only — never treat a cached ref as proof of validity. */
export function shouldAttemptAdminActiveCallsPoll(args: {
  isLoggedIn: boolean;
  isAdmin: boolean;
  state: AdminActiveCallsPollState;
  freshAccessToken: string | null | undefined;
}): { attempt: boolean; reason?: 'not_logged_in' | 'not_admin' | 'suspended' | 'in_flight' | 'no_token' } {
  if (!args.isLoggedIn) return { attempt: false, reason: 'not_logged_in' };
  if (!args.isAdmin) return { attempt: false, reason: 'not_admin' };
  if (args.state.suspended) return { attempt: false, reason: 'suspended' };
  if (args.state.inFlight) return { attempt: false, reason: 'in_flight' };
  if (!args.freshAccessToken) return { attempt: false, reason: 'no_token' };
  return { attempt: true };
}

export function applyAdminActiveCallsHttpResult(
  state: AdminActiveCallsPollState,
  status: number
): AdminActiveCallsPollState {
  if (status === 401 || status === 403) {
    return { ...state, suspended: true, inFlight: false };
  }
  return { ...state, inFlight: false };
}

/** Resume after re-login or a newly validated session token. */
export function resumeAdminActiveCallsPoll(
  state: AdminActiveCallsPollState,
  freshAccessToken: string | null | undefined
): AdminActiveCallsPollState {
  if (!freshAccessToken) return state;
  return { ...state, suspended: false };
}

export type OfflineUnloadPaths = {
  updateStatusPath: string;
  presencePath: string;
};

export const DEFAULT_OFFLINE_UNLOAD_PATHS: OfflineUnloadPaths = {
  updateStatusPath: '/api/supabase/update-status',
  presencePath: '/api/presence',
};

export type OfflineUnloadTransport = 'fetch_keepalive' | 'send_beacon' | 'skipped';

/**
 * Best-effort offline presence during page unload / logout.
 * Prefer Authorization Bearer + fetch keepalive; beacon+body token is fallback only.
 * Does not assume success.
 */
export function buildOfflineUnloadPayload(token: string): string {
  return JSON.stringify({ status: 'offline', accessToken: token });
}

export function chooseOfflineUnloadTransport(args: {
  hasToken: boolean;
  fetchKeepaliveAvailable: boolean;
  sendBeaconAvailable: boolean;
}): OfflineUnloadTransport {
  if (!args.hasToken) return 'skipped';
  if (args.fetchKeepaliveAvailable) return 'fetch_keepalive';
  if (args.sendBeaconAvailable) return 'send_beacon';
  return 'skipped';
}

/**
 * Dedup gate for pagehide + beforeunload (and repeated unload events).
 * Returns true only for the first call in a page lifetime / effect scope.
 */
export function createUnloadOnceGate(): { tryClaim: () => boolean; reset: () => void } {
  let claimed = false;
  return {
    tryClaim: () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    reset: () => {
      claimed = false;
    },
  };
}

/**
 * Dispatch offline posts to both endpoints using the chosen transport.
 * Caller supplies fetch/beacon so tests can assert without network.
 */
export function dispatchOfflineUnloadRequests(args: {
  token: string;
  resolveUrl: (path: string) => string;
  paths?: OfflineUnloadPaths;
  transport: OfflineUnloadTransport;
  fetchFn?: (input: string, init: RequestInit) => unknown;
  sendBeaconFn?: (url: string, data: Blob) => boolean;
}): { pathsAttempted: string[]; transport: OfflineUnloadTransport } {
  if (args.transport === 'skipped' || !args.token) {
    return { pathsAttempted: [], transport: 'skipped' };
  }
  const paths = args.paths || DEFAULT_OFFLINE_UNLOAD_PATHS;
  const list = [paths.updateStatusPath, paths.presencePath];
  const body = buildOfflineUnloadPayload(args.token);
  const attempted: string[] = [];

  for (const path of list) {
    const url = args.resolveUrl(path);
    attempted.push(path);
    if (args.transport === 'fetch_keepalive' && args.fetchFn) {
      try {
        args.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${args.token}`,
          },
          body,
          keepalive: true,
        });
        continue;
      } catch {
        // fall through to beacon for this path
      }
    }
    if (args.sendBeaconFn) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        args.sendBeaconFn(url, blob);
      } catch {
        /* best effort */
      }
    }
  }

  return { pathsAttempted: attempted, transport: args.transport };
}
