import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, UserRole, OnboardingFormData } from '../types';
import { mapDbProfileToUserProfile, upsertProfileToSupabase, isValidUuid } from './supabaseService';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';
import { authFetch, getAccessToken, apiFetch } from '../utils/apiClient';
import {
  setStoredActiveSessionId,
  clearStoredActiveSessionId,
  getStoredActiveSessionId,
  newActiveSessionId,
  markSessionClaimGrace,
} from '../utils/singleSession';

export interface SupabaseAuthResult {
  success: boolean;
  user?: UserProfile | null;
  needsOnboarding?: boolean;
  message?: string;
  error?: string;
  session?: any;
  otpCode?: string;
  showOtpInForm?: boolean;
  /** Admin policy: create accounts without email OTP */
  skipOtp?: boolean;
  activeSessionId?: string;
}

/** Deduplicate concurrent claims (login + auth hydrate race). */
let claimInFlight: Promise<string | null> | null = null;

/**
 * Claim exclusive single-device session on the backend and persist locally.
 * Stores the session id BEFORE the DB write so Realtime/heartbeat cannot self-kick.
 */
export async function claimExclusiveLoginSession(opts?: {
  accessToken?: string | null;
  knownSessionId?: string | null;
  /** When false, skip revoking other Supabase refresh sessions (safer during hydrate). */
  revokeOthers?: boolean;
}): Promise<string | null> {
  if (claimInFlight) return claimInFlight;

  claimInFlight = (async () => {
    const revokeOthers = opts?.revokeOthers !== false;
    markSessionClaimGrace(10000);

    if (opts?.knownSessionId && opts.knownSessionId.trim()) {
      const known = opts.knownSessionId.trim();
      setStoredActiveSessionId(known);
      if (revokeOthers) {
        try {
          if (isSupabaseConfigured()) {
            await supabase.auth.signOut({ scope: 'others' });
          }
        } catch (err) {
          console.warn('[single-session] revoke other auth sessions notice:', err);
        }
      }
      return known;
    }

    // Persist first so presence X-Session-Id and Realtime comparisons stay consistent
    const sessionId = newActiveSessionId();
    setStoredActiveSessionId(sessionId);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = opts?.accessToken || (await getAccessToken());
      if (token) headers.Authorization = `Bearer ${token}`;
      headers['X-Session-Id'] = sessionId;

      const res = await authFetch('/api/auth/claim-session', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, activeSessionId: sessionId }),
      });
      const data = await res.json().catch(() => null);
      const confirmed =
        data?.success && typeof data.activeSessionId === 'string'
          ? data.activeSessionId.trim()
          : '';
      if (!res.ok || !confirmed) {
        console.warn('[single-session] claim-session failed:', data?.error || res.status);
        // Keep locally stored id — presence checks tolerate DB null; retry later on next login
        return getStoredActiveSessionId();
      }
      if (confirmed !== sessionId) {
        setStoredActiveSessionId(confirmed);
      }
      if (revokeOthers) {
        try {
          if (isSupabaseConfigured()) {
            await supabase.auth.signOut({ scope: 'others' });
          }
        } catch (err) {
          console.warn('[single-session] revoke other auth sessions notice:', err);
        }
      }
      markSessionClaimGrace(5000);
      return getStoredActiveSessionId();
    } catch (err) {
      console.warn('[single-session] claim-session exception:', err);
      return getStoredActiveSessionId();
    }
  })().finally(() => {
    claimInFlight = null;
  });

  return claimInFlight;
}

const PUBLIC_SIGNUP_ROLES: UserRole[] = [
  'male_user',
  'female_user',
  'female_creator',
  'female_host',
  'other_user',
];

function sanitizeClientSignupRole(role: UserRole | string | undefined): UserRole {
  return PUBLIC_SIGNUP_ROLES.includes(role as UserRole) ? (role as UserRole) : 'male_user';
}

function lockedGenderFromRole(role: UserRole): UserProfile['gender'] {
  if (role === 'female_user' || role === 'female_creator' || role === 'female_host') return 'female';
  if (role === 'other_user') return 'other';
  return 'male';
}

function userSafeAuthError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const message = typeof err === 'string' ? err : (err as any)?.message;
  if (typeof message !== 'string' || !message.trim()) return fallback;
  const lower = message.toLowerCase();
  if (
    lower.includes('stack') ||
    lower.includes('supabase') ||
    lower.includes('postgres') ||
    lower.includes('smtp') ||
    lower.includes('service_role') ||
    lower.includes('econn') ||
    lower.includes('enotfound') ||
    message.length > 180
  ) {
    return fallback;
  }
  return message;
}

/**
 * Step 1: Start registration — store pending signup + send OTP.
 * Does NOT create auth.users / profiles until OTP succeeds (or admin skip-OTP policy).
 * Closing the dialog mid-flow leaves only expiring pending/OTP rows, not a real account.
 */
export async function signUpWithEmailOtp(params: {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
}): Promise<SupabaseAuthResult> {
  const { name, email, password, role } = params;
  const passwordError = getPasswordPolicyError(password);
  if (passwordError || typeof password !== 'string') {
    return { success: false, error: passwordError ?? 'Password is required.' };
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes('@')) {
    return { success: false, error: 'Please provide a valid email address.' };
  }
  const safeRole = sanitizeClientSignupRole(role);
  const lockedGender = lockedGenderFromRole(safeRole);

  // Block if a real profile already exists for this email
  if (isSupabaseConfigured()) {
    try {
      const { data: existingByEmail } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', cleanEmail)
        .maybeSingle();
      if ((existingByEmail as { id?: string } | null)?.id) {
        return {
          success: false,
          error: 'An account with this email is already registered. Please log in or use Forgot Password.',
        };
      }
    } catch (err) {
      console.warn('[signUpWithEmailOtp] profile existence check notice:', err);
    }
  }

  // Pending signup + OTP only (server stores auth_pending_signups; no Auth/profile yet)
  let capturedOtpCode: string | undefined;
  let capturedShowOtpInForm: boolean | undefined;
  let skipOtp = false;

  try {
    const sRes = await apiFetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        name,
        role: safeRole,
        password,
      }),
    });
    const sData = await sRes.json().catch(() => ({}));
    if (!sRes.ok) {
      return {
        success: false,
        error: userSafeAuthError(sData.error, 'Could not send verification email. Please try again.'),
      };
    }
    capturedOtpCode = sData.otpCode;
    capturedShowOtpInForm = sData.showOtpInForm;
    if (sData.skipOtp) skipOtp = true;
  } catch (err) {
    console.warn('[signUpWithEmailOtp] send-otp error:', err);
    return { success: false, error: 'Could not send verification email. Please try again.' };
  }

  // Admin policy: create Auth + profile only when OTP is explicitly skipped
  if (skipOtp) {
    try {
      const bootRes = await apiFetch('/api/auth/register-bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          name,
          role: safeRole,
        }),
      });
      const bootData = await bootRes.json().catch(() => ({}));
      const bootId = bootData?.authId || bootData?.userId;

      if (bootData?.code === 'ALREADY_REGISTERED' || /already registered/i.test(String(bootData?.error || ''))) {
        return {
          success: false,
          error: 'An account with this email is already registered. Please log in or use Forgot Password.',
        };
      }

      if (!bootRes.ok || !bootData?.success || !bootId || !isValidUuid(bootId)) {
        return {
          success: false,
          error: userSafeAuthError(
            bootData?.error,
            'Could not create an authenticated account. Please try again.'
          ),
        };
      }

      const isFemaleRole = lockedGender === 'female';
      const createdProfile: UserProfile = {
        id: bootId,
        authId: bootId,
        name,
        email: cleanEmail,
        gender: lockedGender,
        genderLocked: true,
        role: safeRole,
        age: 24,
        dob: '2000-01-01',
        nationality: 'United States',
        countryCode: 'US',
        spokenLanguages: ['English'],
        bio: '',
        interests: [],
        avatarUrl: isFemaleRole
          ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400'
          : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
        gallery: [],
        isVerified: false,
        isOnboarded: false,
        onlineStatus: 'online',
        createdAt: new Date().toISOString().split('T')[0],
        coinBalance: isFemaleRole ? 0 : 50,
        hourlyCoinRate: safeRole === 'female_creator' ? 10 : 0,
        earningsCoins: 0,
        totalLifetimeEarnedUSD: 0,
        emailVerified: true,
        agencyName: undefined,
        commissionPercent: undefined,
      };

      try {
        await upsertProfileToSupabase(createdProfile);
      } catch (err) {
        console.warn('[signUpWithEmailOtp] skip-OTP profile upsert notice:', err);
      }

      return {
        success: true,
        skipOtp: true,
        needsOnboarding: true,
        user: createdProfile,
        message:
          bootData.message ||
          'Account created without email OTP (admin policy). You can sign in now.',
      };
    } catch (bootErr) {
      console.warn('[signUpWithEmailOtp] skip-OTP bootstrap failed:', bootErr);
      return {
        success: false,
        error: 'Could not create an authenticated account. Please try again.',
      };
    }
  }

  // Normal path: OTP sent; Auth/profile are created only after verifyEmailOtp succeeds
  return {
    success: true,
    needsOnboarding: true,
    otpCode: capturedOtpCode,
    showOtpInForm: capturedShowOtpInForm,
    message: `A 6-digit verification code has been dispatched to ${cleanEmail}. Please check your email inbox.`,
  };
}

/**
 * Step 1b: Verify 6-digit Email OTP code
 */
export async function verifyEmailOtp(
  paramsOrEmail:
    | {
        email: string;
        token: string;
        type?: 'signup' | 'email' | 'recovery';
        role?: UserRole;
        name?: string;
        password?: string;
      }
    | string,
  tokenArg?: string,
  roleArg?: UserRole,
  nameArg?: string
): Promise<SupabaseAuthResult> {
  let email = '';
  let token = '';
  let type: 'signup' | 'email' | 'recovery' = 'signup';
  let role: UserRole | undefined = roleArg;
  let name: string | undefined = nameArg;
  let password: string | undefined;

  if (typeof paramsOrEmail === 'string') {
    email = paramsOrEmail;
    token = tokenArg || '';
  } else if (paramsOrEmail && typeof paramsOrEmail === 'object') {
    email = paramsOrEmail.email;
    token = paramsOrEmail.token;
    if (paramsOrEmail.type) type = paramsOrEmail.type;
    if (paramsOrEmail.role) role = paramsOrEmail.role;
    if (paramsOrEmail.name) name = paramsOrEmail.name;
    if (paramsOrEmail.password) password = paramsOrEmail.password;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = token.trim();

  // Custom registration OTP: verify on server first so Auth/profile are created only after OTP succeeds.
  // (supabase.auth.signUp is no longer called during registration start.)
  const preferServerVerify = Boolean(password) || type === 'signup';

  const trySupabaseNativeVerify = async (): Promise<SupabaseAuthResult | null> => {
    if (!isSupabaseConfigured()) return null;
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: type as any,
      });

      if (!error && data.user) {
        const userId = data.user.id;

        let dbProfile: any = null;
        const { data: byId } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (byId) {
          dbProfile = byId;
        } else {
          const { data: byAuth } = await supabase
            .from('profiles')
            .select('*')
            .eq('auth_id', userId)
            .maybeSingle();
          if (byAuth) {
            dbProfile = byAuth;
          } else {
            const { data: byEmail } = await supabase
              .from('profiles')
              .select('*')
              .ilike('email', cleanEmail)
              .maybeSingle();
            dbProfile = byEmail;
          }
        }

        let profile: UserProfile;
        if (dbProfile) {
          profile = mapDbProfileToUserProfile(dbProfile);
          const forcedRole = role ? sanitizeClientSignupRole(role) : null;
          profile = {
            ...profile,
            authId: userId,
            emailVerified: true,
            ...(forcedRole
              ? {
                  role: forcedRole,
                  gender: lockedGenderFromRole(forcedRole),
                  genderLocked: true,
                  agencyName: undefined,
                  commissionPercent: undefined,
                }
              : {}),
          };
          const needsRoleFix =
            Boolean(forcedRole) &&
            (dbProfile.role !== forcedRole || dbProfile.gender !== lockedGenderFromRole(forcedRole!));
          if (!dbProfile.auth_id || dbProfile.auth_id !== userId || needsRoleFix) {
            await upsertProfileToSupabase({
              ...profile,
              id: profile.id || userId,
              authId: userId,
              emailVerified: true,
            });
          }
        } else {
          const metaRole = sanitizeClientSignupRole(
            (role as UserRole) || (data.user.user_metadata?.role as UserRole) || 'male_user'
          );
          const lockedGender = lockedGenderFromRole(metaRole);
          const isMetaFemale = lockedGender === 'female';
          profile = {
            id: userId,
            authId: userId,
            name: data.user.user_metadata?.full_name || name || cleanEmail.split('@')[0] || 'User',
            email: cleanEmail,
            gender: lockedGender,
            genderLocked: true,
            role: metaRole,
            age: 21,
            dob: '2003-01-01',
            nationality: 'United States',
            countryCode: 'US',
            spokenLanguages: ['English'],
            bio: '',
            interests: [],
            avatarUrl: isMetaFemale
              ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400'
              : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
            gallery: [],
            isVerified: false,
            isOnboarded: false,
            onlineStatus: 'online',
            createdAt: new Date().toISOString().split('T')[0],
            coinBalance: isMetaFemale ? 0 : 50,
            hourlyCoinRate: metaRole === 'female_creator' ? 10 : 0,
            earningsCoins: 0,
            totalLifetimeEarnedUSD: 0,
            emailVerified: true,
          };
          await upsertProfileToSupabase(profile);
        }

        return {
          success: true,
          user: profile,
          needsOnboarding: !profile.isOnboarded,
          message: 'Email successfully verified!',
          session: data.session,
        };
      }

      if (error) {
        console.warn('Supabase verifyOtp error, falling back to server verification:', error.message);
      }
    } catch (err: any) {
      console.warn('Supabase verifyOtp exception:', err);
    }
    return null;
  };

  if (!preferServerVerify) {
    const native = await trySupabaseNativeVerify();
    if (native) return native;
  }

  // Server-side OTP verification (creates Auth user from pending signup after OTP succeeds)
  try {
    const serverVerifyRes = await apiFetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        token: cleanToken,
        // Activates Auth password + email_confirm for pending signups (required for first login)
        ...(password ? { password } : {}),
      }),
    });
    if (serverVerifyRes.ok) {
      const sData = await serverVerifyRes.json();
      if (sData.success) {
        const metaRole = sanitizeClientSignupRole(
          (role as UserRole) || (sData.metadata?.role as UserRole) || 'male_user'
        );
        const lockedGender = lockedGenderFromRole(metaRole);
        const isMetaFemale = lockedGender === 'female';
        const isMetaOther = lockedGender === 'other';

        // Require a real auth/profile identity — never mint orphan UUIDs for the same inbox.
        // Prefer server-returned authId: custom OTP leaves no browser session, and profiles
        // SELECT is authenticated-only under RLS, so client lookups often fail here.
        let resolvedId: string | null = null;
        let existingProfile: UserProfile | null = null;
        const serverAuthId = sData.authId || sData.userId;
        if (typeof serverAuthId === 'string' && isValidUuid(serverAuthId)) {
          resolvedId = serverAuthId;
        }

        if (isSupabaseConfigured()) {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData.session?.user?.id) {
              resolvedId = resolvedId || sessionData.session.user.id;
            }

            const { data: existingByEmail } = await supabase
              .from('profiles')
              .select('*')
              .ilike('email', cleanEmail)
              .maybeSingle();
            if (existingByEmail) {
              existingProfile = mapDbProfileToUserProfile(existingByEmail);
              resolvedId = resolvedId || existingProfile.id || existingProfile.authId || null;
            }

            if (!resolvedId) {
              const { data: listData } = await supabase.auth.getUser();
              if (listData.user?.id && listData.user.email?.toLowerCase() === cleanEmail) {
                resolvedId = listData.user.id;
              }
            }
          } catch (e) {
            console.warn('Email profile lookup during OTP fallback failed:', e);
          }
        }

        if (!resolvedId || !isValidUuid(resolvedId)) {
          return {
            success: false,
            error:
              'Email code verified, but no authenticated account was found. Please complete registration again or sign in.',
          };
        }

        const displayName =
          existingProfile?.name ||
          sData.metadata?.name ||
          name ||
          cleanEmail.split('@')[0] ||
          'User';

        const verifiedUser: UserProfile = existingProfile
          ? {
              ...existingProfile,
              id: existingProfile.id || resolvedId,
              authId: existingProfile.authId || resolvedId,
              name: existingProfile.name && existingProfile.name !== 'New Member' && existingProfile.name !== 'Member'
                ? existingProfile.name
                : displayName,
              // Force public signup role over stale TL/admin rows
              role: metaRole,
              gender: lockedGender,
              genderLocked: true,
              agencyName: undefined,
              commissionPercent: undefined,
              emailVerified: true,
              isOnboarded: Boolean(existingProfile.isOnboarded),
            }
          : {
              id: resolvedId,
              authId: resolvedId,
              name: displayName,
              email: cleanEmail,
              gender: lockedGender,
              genderLocked: true,
              role: metaRole,
              age: 21,
              dob: '2003-01-01',
              nationality: 'United States',
              countryCode: 'US',
              spokenLanguages: ['English'],
              bio: '',
              interests: [],
              avatarUrl: isMetaFemale
                ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400'
                : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
              gallery: [],
              isVerified: false,
              isOnboarded: false,
              onlineStatus: 'online',
              createdAt: new Date().toISOString().split('T')[0],
              coinBalance: isMetaFemale ? 0 : 50,
              hourlyCoinRate: metaRole === 'female_creator' ? 10 : 0,
              earningsCoins: 0,
              totalLifetimeEarnedUSD: 0,
              emailVerified: true,
            };

        try {
          await upsertProfileToSupabase({
            ...verifiedUser,
            role: metaRole,
            gender: lockedGender,
            emailVerified: true,
          });
        } catch (e) {
          console.warn('Upsert verified user error:', e);
        }

        return {
          success: true,
          user: verifiedUser,
          needsOnboarding: !verifiedUser.isOnboarded,
          message: '6-digit OTP code verified successfully!',
        };
      }
    } else {
      const failData = await serverVerifyRes.json().catch(() => ({}));
      if (failData?.error) {
        return {
          success: false,
          error: userSafeAuthError(failData.error, 'Invalid or expired 6-digit verification code.'),
        };
      }
    }
  } catch (e) {
    console.warn('Server verify check error:', e);
  }

  // Non-signup recovery paths may still use native Supabase OTP
  if (preferServerVerify) {
    const native = await trySupabaseNativeVerify();
    if (native) return native;
  }

  return {
    success: false,
    error: 'Invalid or expired 6-digit verification code. Please check your email inbox.',
  };
}

/**
 * Resend OTP Code
 * Pass password/name/role during registration so pending signup is refreshed if it expired.
 */
export async function resendEmailOtp(
  email: string,
  opts?: { password?: string; name?: string; role?: UserRole }
): Promise<{ success: boolean; message: string; error?: string; otpCode?: string; showOtpInForm?: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  let serverOtpCode: string | undefined;
  let serverShowOtpInForm: boolean | undefined;

  // 1. Trigger server email dispatch
  try {
    const sRes = await apiFetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        ...(opts?.password ? { password: opts.password } : {}),
        ...(opts?.name ? { name: opts.name } : {}),
        ...(opts?.role ? { role: sanitizeClientSignupRole(opts.role) } : {}),
      }),
    });
    if (sRes.ok) {
      const data = await sRes.json();
      serverOtpCode = data.otpCode;
      serverShowOtpInForm = data.showOtpInForm;
      return {
        success: true,
        message: data.message || `A fresh 6-digit verification code has been dispatched to ${cleanEmail}.`,
        otpCode: data.otpCode,
        showOtpInForm: data.showOtpInForm,
      };
    }
  } catch (e) {
    console.warn('Server resend error:', e);
  }

  // 2. Trigger Supabase resend if configured
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
      });

      if (!error) {
        return {
          success: true,
          message: 'A fresh 6-digit verification code & confirmation link have been dispatched to your email.',
          otpCode: serverOtpCode,
          showOtpInForm: serverShowOtpInForm,
        };
      }
      
      const isRateLimit =
        error.message.toLowerCase().includes('rate limit') ||
        error.message.toLowerCase().includes('over_email_send_rate_limit') ||
        (error as any).status === 429;
      
      if (isRateLimit) {
        return {
          success: true,
          message: `A fresh 6-digit verification code has been dispatched to ${cleanEmail}.`,
          otpCode: serverOtpCode,
          showOtpInForm: serverShowOtpInForm,
        };
      }
    } catch (e) {
      console.warn('Resend OTP error:', e);
    }
  }

  return {
    success: true,
    message: `Verification code sent to ${cleanEmail}. Please check your inbox.`,
    otpCode: serverOtpCode,
    showOtpInForm: serverShowOtpInForm,
  };
}

/**
 * Password Login with Supabase / Server backend
 */
export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<SupabaseAuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!password || password.trim().length === 0) {
    return { success: false, error: 'Invalid email or password. Please check your credentials.' };
  }

  // Prefer native Supabase Auth — exact password required (no hash fallback, no padding tricks)
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error || !data?.user) {
        const raw = (error?.message || '').toLowerCase();
        if (raw.includes('email not confirmed') || raw.includes('not confirmed')) {
          return {
            success: false,
            error:
              'Please verify your email with the 6-digit code we sent before signing in. You can also use Forgot Password.',
          };
        }
        return {
          success: false,
          error: 'Invalid email or password. Please check your credentials.',
        };
      }

      let dbProfile: any = null;
      const { data: byEmail } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (byEmail) {
        dbProfile = byEmail;
      } else {
        const { data: byId } = await supabase
          .from('profiles')
          .select('*')
          .or(`id.eq.${data.user.id},auth_id.eq.${data.user.id}`)
          .maybeSingle();
        dbProfile = byId;
      }

      if (dbProfile) {
        const profile = mapDbProfileToUserProfile(dbProfile);
        if (!profile.authId || profile.authId !== data.user.id) {
          profile.authId = data.user.id;
          (supabase.from('profiles') as any).update({ auth_id: data.user.id }).eq('id', profile.id).then(() => {});
        }

        if (profile.isBanned) {
          const bannedUntil = profile.bannedUntil;
          if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) {
            const banner = profile.bannedByRole === 'team_leader' ? 'your agency' : 'Administration';
            const reason = profile.banReason || 'Policy review';
            await supabase.auth.signOut();
            return {
              success: false,
              error: `Your host account has been suspended by ${banner} until ${new Date(bannedUntil).toLocaleString()}.\nReason: "${reason}". Please contact your agency manager.`,
            };
          } else if (!bannedUntil) {
            await supabase.auth.signOut();
            return {
              success: false,
              error: `Your account has been permanently suspended. Reason: "${profile.banReason || 'Policy violation'}"`,
            };
          }
        }

        const activeSessionId = await claimExclusiveLoginSession({
          accessToken: data.session?.access_token || null,
        });

        return {
          success: true,
          user: profile,
          needsOnboarding: !profile.isOnboarded,
          session: data.session,
          activeSessionId: activeSessionId || undefined,
        };
      }

      // Auth OK but no profiles row — deleted / orphan Auth. Never invent a synthetic profile.
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Account not found or was deleted. Please register again.',
      };
    } catch (err: any) {
      console.warn('Supabase signIn exception:', err);
      return {
        success: false,
        error:
          err?.message && String(err.message).length < 160
            ? `Unable to connect to authentication server (${err.message}).`
            : 'Unable to connect to authentication server. Check Supabase URL/anon key env vars.',
      };
    }
  }

  // Server Auth-only verification when client Supabase is not configured
  try {
    const res = await apiFetch('/api/auth/login-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password }),
    });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error:
          res.status === 403
            ? 'Login blocked by Vercel security checkpoint. Disable Attack Challenge Mode for /api or allowlist the domain, then retry.'
            : `Unable to connect to authentication server (HTTP ${res.status}, non-JSON response).`,
      };
    }

    const data = await res.json();
    if (res.ok && data.success && data.user) {
      if (data.session?.access_token && data.session?.refresh_token && isSupabaseConfigured()) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionError) {
          console.warn('Could not persist auth session after password login:', sessionError.message);
        }
      }
      const activeSessionId = await claimExclusiveLoginSession({
        accessToken: data.session?.access_token || null,
        knownSessionId: typeof data.activeSessionId === 'string' ? data.activeSessionId : null,
      });
      return {
        success: true,
        user: data.user,
        needsOnboarding: !data.user.isOnboarded,
        session: data.session,
        activeSessionId: activeSessionId || undefined,
      };
    }
    return {
      success: false,
      error: data.error || 'Invalid email or password. Please check your credentials.',
    };
  } catch (err: any) {
    return {
      success: false,
      error:
        err?.message && String(err.message).length < 160
          ? `Unable to connect to authentication server (${err.message}).`
          : 'Unable to connect to authentication server.',
    };
  }
}

/**
 * Request a password-reset OTP email (no password change until /reset-password).
 */
export async function requestPasswordResetOtp(email: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  otpCode?: string;
  showOtpInForm?: boolean;
}> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes('@')) {
    return { success: false, error: 'Please provide a valid email address.' };
  }

  try {
    const sRes = await apiFetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        name: 'User',
        role: 'male_user',
      }),
    });
    const data = await sRes.json().catch(() => ({}));
    if (!sRes.ok) {
      return {
        success: false,
        error: data.error || 'Failed to send password reset code.',
      };
    }
    return {
      success: true,
      message: data.message || `A reset code was sent to ${cleanEmail}.`,
      otpCode: data.otpCode,
      showOtpInForm: data.showOtpInForm,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send password reset code.' };
  }
}

/**
 * Complete password reset after OTP verification (server enforces policy + OTP).
 */
export async function resetPasswordWithOtp(params: {
  email: string;
  token: string;
  newPassword: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const policyError = getPasswordPolicyError(params.newPassword);
  if (policyError) {
    return { success: false, error: policyError, message: policyError };
  }

  try {
    const res = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email.trim().toLowerCase(),
        token: params.token.trim(),
        newPassword: params.newPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Password reset failed.',
        message: data.error || 'Password reset failed.',
      };
    }
    return {
      success: true,
      message: data.message || 'Password reset successfully.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Password reset failed.',
      message: err?.message || 'Password reset failed.',
    };
  }
}

/**
 * Update user password across client Supabase session and server backend
 */
export async function updateUserPassword(params: {
  userId: string;
  email?: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string; error?: string }> {
  const { newPassword } = params;

  const passwordError = getPasswordPolicyError(newPassword);
  if (passwordError) {
    return { success: false, message: passwordError, error: passwordError };
  }

  const token = await getAccessToken();
  if (!token && isSupabaseConfigured()) {
    return {
      success: false,
      message: 'You must be signed in to change your password.',
      error: 'You must be signed in to change your password.',
    };
  }

  let clientUpdated = false;

  // 1. Try updating active Supabase client session if available
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        console.warn('Client Supabase updateUser notice:', error.message);
      } else {
        clientUpdated = true;
      }
    } catch (e: any) {
      console.warn('Supabase client password update exception:', e?.message || e);
    }
  }

  // 2. Call server update-password API (updates Supabase Auth via admin and server memory)
  try {
    const res = await apiFetch('/api/auth/update-password', {
      method: 'POST',
      headers: await (await import('../utils/apiClient')).authHeaders(),
      body: JSON.stringify({ newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, message: data.message || 'Password updated successfully!' };
    }
    if (!clientUpdated) {
      const errMsg = userSafeAuthError(data.error, 'Failed to update password.');
      return { success: false, message: errMsg, error: errMsg };
    }
    // Client session updated even if server echo failed
    return { success: true, message: 'Password updated successfully!' };
  } catch (err: any) {
    console.warn('Server password update API exception:', err);
    if (clientUpdated) {
      return { success: true, message: 'Password updated successfully!' };
    }
    return {
      success: false,
      message: 'Failed to update password. Please try again.',
      error: 'Failed to update password. Please try again.',
    };
  }
}


/**
 * Step 2: Complete Profile Onboarding Wizard & save to Supabase (via authenticated Express path)
 */
export async function completeUserProfileOnboarding(
  currentUser: UserProfile,
  formData: OnboardingFormData
): Promise<{ success: boolean; updatedProfile?: UserProfile; error?: string }> {
  if (!currentUser?.id) {
    return { success: false, error: 'Missing authenticated user. Please sign in again.' };
  }

  if (isSupabaseConfigured()) {
    const token = await getAccessToken();
    if (!token) {
      return {
        success: false,
        error: 'Your session expired. Please sign in again to finish profile setup.',
      };
    }
  }

  if (!formData.agreedToTerms) {
    return { success: false, error: 'You must agree to the Platform Terms of Service.' };
  }

  const lockedRole = sanitizeClientSignupRole(currentUser.role);
  const lockedGender = lockedGenderFromRole(lockedRole);
  const isFemaleHost = lockedRole === 'female_creator' || lockedRole === 'female_host';

  if (formData.age < 18) {
    return { success: false, error: 'You must be 18 years or older to use this service.' };
  }

  if (!isFemaleHost && !formData.agreedToAdultTerms) {
    return { success: false, error: 'You must acknowledge the 18+ Adult & Content Policy.' };
  }

  if (isFemaleHost && !formData.agreedToHostTerms) {
    return { success: false, error: 'You must accept the Host Code of Conduct.' };
  }

  // Safe onboarding fields only — never send wallet/role/ban privileged mutations
  const safeUpdates: Partial<UserProfile> = {
    dob: formData.dob,
    age: formData.age,
    gender: lockedGender,
    genderLocked: true,
    nationality: formData.nationality,
    countryCode: formData.countryCode,
    zodiac: formData.zodiac || currentUser.zodiac,
    spokenLanguages: formData.spokenLanguages,
    bio: formData.bio,
    interests: formData.interests,
    interestedIn: formData.interestedIn,
    tags: formData.tags,
    avatarUrl: formData.avatarUrl || currentUser.avatarUrl,
    gallery: formData.gallery.length > 0 ? formData.gallery : currentUser.gallery,
    introVideoUrl: formData.introVideoUrl || currentUser.introVideoUrl,
    agreedToTerms: formData.agreedToTerms,
    agreedToAdultTerms: formData.agreedToAdultTerms,
    agreedToHostTerms: formData.agreedToHostTerms,
    isOnboarded: true,
    onboardingStep: 4,
    kycStatus: 'unsubmitted',
  };

  // Host rate may be set during onboarding; stripPrivileged keeps role/wallet/ban off the wire
  if (isFemaleHost) {
    safeUpdates.hourlyCoinRate = formData.hourlyCoinRate || currentUser.hourlyCoinRate || 10;
  }

  const updatedProfile: UserProfile = {
    ...currentUser,
    ...safeUpdates,
    role: lockedRole,
    gender: lockedGender,
    genderLocked: true,
    // Preserve authoritative privileged fields from existing profile — do not invent client values
    coinBalance: currentUser.coinBalance,
    earningsCoins: currentUser.earningsCoins,
    totalLifetimeEarnedUSD: currentUser.totalLifetimeEarnedUSD,
    isBanned: currentUser.isBanned,
    isVerified: currentUser.isVerified,
    isOnboarded: true,
  };

  try {
    const res = await authFetch('/api/supabase/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        updates: safeUpdates,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      // Fallback: authenticated upsert (also strips privileged fields server-side for non-admins)
      const upsertRes = await authFetch('/api/supabase/upsert-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile),
      });
      const upsertData = await upsertRes.json().catch(() => ({}));
      if (!upsertRes.ok || !upsertData.success) {
        return {
          success: false,
          error: userSafeAuthError(
            data.error || upsertData.error,
            'Could not save your profile. Please try again.'
          ),
        };
      }
      const persisted = upsertData.user
        ? { ...updatedProfile, ...upsertData.user, isOnboarded: true, role: lockedRole }
        : updatedProfile;
      return { success: true, updatedProfile: persisted };
    }

    return { success: true, updatedProfile };
  } catch (err) {
    console.error('Error completing onboarding profile:', err);
    return {
      success: false,
      error: 'Could not save your profile. Please try again.',
    };
  }
}

/**
 * Sign Out
 */
export async function signOutSupabase(): Promise<void> {
  clearStoredActiveSessionId();
  if (isSupabaseConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
  }
}
