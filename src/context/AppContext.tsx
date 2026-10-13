import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import {
  UserProfile,
  CoinPackage,
  VirtualGift,
  CallSession,
  PayoutRequest,
  ChatMessage,
  FeedPost,
  SystemSettings,
  UserRole,
  CallLogItem,
  FriendRequest,
  HomeBanner,
  PolicyDocument,
  HomeQuickLink,
  AdminActiveCall,
  IncidentEvidence,
  ResetDataOptions,
  ResetResult,
  CreatorReview,
  QuickMatchItem,
  DailyRewardRecord,
  CreatorMetrics,
  CreatorTier,
} from '../types';
import { getCoinUsdPeg, coinsToUsd } from '../../shared/finance/fx';
import {
  DEFAULT_COIN_BURN_RATE_PER_MIN,
  DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
  DEFAULT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
  DEFAULT_TEAM_LEADER_SHARE_PERCENT,
} from '../../shared/finance/economyBurn';
import {
  DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
  computeGiftCoinSplit,
} from '../../shared/finance/economyGift';
import {
  INITIAL_SYSTEM_SETTINGS,
  INITIAL_COIN_PACKAGES,
  VIRTUAL_GIFTS,
  DEFAULT_ADMIN_USER,
  DEFAULT_TEAM_LEADER_USER,
  INITIAL_HOME_BANNERS,
  INITIAL_POLICY_DOCUMENTS,
  INITIAL_HOME_QUICK_LINKS,
  INITIAL_APP_NAV_ITEMS,
  INITIAL_CREATOR_REVIEWS,
} from '../constants/appDefaults';
import type { AppNavItem } from '../../shared/appNav';
import { mapNavRow, mergeNavWithDefaults } from '../../shared/appNav';
import { authFetch, getAccessToken, apiUrl, getWsUrl, SESSION_REPLACED_EVENT } from '../utils/apiClient';
import {
  applyAdminActiveCallsHttpResult,
  chooseOfflineUnloadTransport,
  createAdminActiveCallsPollState,
  createUnloadOnceGate,
  dispatchOfflineUnloadRequests,
  resumeAdminActiveCallsPoll,
  shouldAttemptAdminActiveCallsPoll,
  type AdminActiveCallsPollState,
} from '../utils/authGatedRequests';
import { RealtimeSignaling, shouldUseRealtimeSignaling } from '../services/realtimeSignaling';
import {
  fetchProfilesFromSupabase,
  upsertProfileToSupabase,
  updateUserProfileInSupabase,
  persistUserProfileUpdate,
  bulkUpsertProfilesToSupabase,
  updateUserStatusInSupabase,
  fetchUserStatusesFromSupabase,
  purgeMockProfilesFromSupabase,
  purgeMessagesFromSupabase,
  purgeMatchesFromSupabase,
  purgeCallLogsFromSupabase,
  purgeFriendRequestsFromSupabase,
  purgePayoutRequestsFromSupabase,
  purgeFeedPostsFromSupabase,
  purgeFavoritesFromSupabase,
  purgeBlockedUsersFromSupabase,
  purgeCreatorGoalsFromSupabase,
  resetFinancialBalancesInSupabase,
  purgeModerationReportsFromSupabase,
  purgeAllProfilesFromSupabase,
  subscribeToRealtimeProfiles,
  subscribeToRealtimeChat,
  subscribeToFriendRequests,
  fetchRecentMessagesForUser,
  loadConversationHistoryPage,
  fetchPayoutRequestsFromSupabase,
  upsertPayoutRequestToSupabase,
  fetchCallLogsFromSupabase,
  fetchSystemConfigsFromSupabase,
  updateSystemConfigsInSupabase,
  fetchHomeBannersFromSupabase,
  fetchUiFeedbackMessagesFromSupabase,
  fetchCmsSiteBrandingFromSupabase,
  fetchCmsPoliciesFromSupabase,
  fetchHomeQuickLinksFromSupabase,
  fetchAppNavItemsFromSupabase,
  fetchFeedPostsFromSupabase,
  upsertFeedPostToSupabase,
  deleteFeedPostFromSupabase,
  fetchCoinPackagesFromSupabase,
  upsertCoinPackageToSupabase,
  deleteCoinPackageFromSupabase,
  fetchCurrencyConfigsFromSupabase,
  fetchCountryConfigsFromSupabase,
  fetchLanguageConfigsFromSupabase,
  fetchZodiacConfigsFromSupabase,
  fetchInterestConfigsFromSupabase,
  upsertCurrencyConfigsToSupabase,
  upsertMatchToSupabase,
  fetchMatchesForUser,
  deleteMatchFromSupabase,
  isSupabaseConfigured,
  generateValidUuid,
  isValidUuid,
  pushAllTaxonomiesAndSettingsToSupabase,
  fetchUserDailyRewardsFromSupabase,
  mapDbProfileToUserProfile,
} from '../services/supabaseService';
import { parseDiscoveryCardLayout } from '../../shared/discoveryCardLayout';
import {
  DEFAULT_FEEDBACK_CATALOG,
  applyFeedbackVars,
  buildDefaultFingerprintIndex,
  feedbackFingerprint,
  mergeFeedbackCatalog,
  resolveFeedback,
  type FeedbackCatalogEntry,
  type FeedbackType,
} from '../../shared/cms/feedbackCatalog';
import {
  DEFAULT_SITE_BRANDING,
  applySiteBrandingToDocument,
  mapSiteBrandingRow,
  type SiteBranding,
} from '../../shared/cms/siteBranding';
import {
  updateUserPassword,
  signOutSupabase,
  claimExclusiveLoginSession,
} from '../services/supabaseAuthService';
import { getUserEffectiveLocation } from '../utils/location';
import { supabase } from '../lib/supabase';
import type { Session, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';
import { DEFAULT_CURRENCIES, type CurrencyItem } from '../utils/taxonomies';
import {
  getStoredActiveSessionId,
  clearStoredActiveSessionId,
  shouldIgnoreSessionKick,
} from '../utils/singleSession';


const DEFAULT_FALLBACK_USER: UserProfile = {
  id: 'guest_user',
  name: 'New Member',
  email: '',
  gender: 'male',
  genderLocked: true,
  age: 21,
  dob: '2000-01-01',
  nationality: 'United States',
  countryCode: 'US',
  spokenLanguages: ['English'],
  bio: '',
  avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
  gallery: [],
  galleryVideos: [],
  isVerified: false,
  isOnboarded: false,
  agreedToTerms: true,
  onlineStatus: 'online',
  role: 'male_user',
  createdAt: new Date().toISOString().split('T')[0],
  coinBalance: 50,
  hourlyCoinRate: 10,
  earningsCoins: 0,
  totalLifetimeEarnedUSD: 0,
  interests: [],
  tags: [],
};

interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}

interface AppContextType {
  // State
  users: UserProfile[];
  currentUser: UserProfile;
  isLoggedIn: boolean;
  systemSettings: SystemSettings;
  coinPackages: CoinPackage[];
  currencyConfigs: CurrencyItem[];
  virtualGifts: VirtualGift[];
  payoutRequests: PayoutRequest[];
  activeCall: CallSession | null;
  chatMessages: ChatMessage[];
  unreadMessagesCount: number;
  pendingFriendRequestsCount: number;
  missedCallsCount: number;
  readMessageIds: string[];
  markChatAsRead: (otherUserId: string) => void;
  markAllChatsAsRead: () => void;
  markCallLogsSeen: () => void;
  feedPosts: FeedPost[];
  callLogs: CallLogItem[];
  friendRequests: FriendRequest[];
  toast: ToastNotification | null;

  // Home & Policies CMS
  homeBanners: HomeBanner[];
  policyDocuments: PolicyDocument[];
  homeQuickLinks: HomeQuickLink[];
  appNavItems: AppNavItem[];
  activePolicyDoc: PolicyDocument | null;
  openPolicyModal: (policyIdOrSlug: string) => void;
  closePolicyModal: () => void;
  saveHomeBanner: (banner: Partial<HomeBanner> & { id?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteHomeBanner: (bannerId: string) => Promise<{ success: boolean; error?: string }>;
  toggleBannerActive: (bannerId: string) => Promise<{ success: boolean; error?: string }>;
  savePolicyDocument: (policy: Partial<PolicyDocument> & { id?: string }) => Promise<{ success: boolean; error?: string }>;
  deletePolicyDocument: (policyId: string) => Promise<{ success: boolean; error?: string }>;
  saveHomeQuickLink: (link: Partial<HomeQuickLink> & { id?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteHomeQuickLink: (linkId: string) => Promise<{ success: boolean; error?: string }>;
  seedHomeCmsDefaults: () => Promise<{ success: boolean; error?: string }>;
  saveAppNavSlice: (payload: {
    audienceRole: string;
    bar: string;
    slot?: string | null;
    items: AppNavItem[];
  }) => Promise<{ success: boolean; error?: string }>;

  // CMS feedback catalog (toasts / alerts)
  feedbackCatalog: FeedbackCatalogEntry[];
  reloadFeedbackCatalog: () => Promise<void>;
  resolveFeedback: (
    key: string,
    vars?: Record<string, string | number | null | undefined>
  ) => ReturnType<typeof resolveFeedback>;
  showToastKey: (
    key: string,
    opts?: { type?: FeedbackType; vars?: Record<string, string | number | null | undefined> }
  ) => void;

  // CMS SEO & branding
  siteBranding: SiteBranding;
  reloadSiteBranding: () => Promise<void>;

  // Handlers
  showToast: (title: string, message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  hideToast: () => void;
  switchUser: (userOrId: string | UserProfile) => void;
  /** Apply a profile only after password/OTP Auth succeeded (not passwordless impersonation). */
  completeAuthenticatedLogin: (profile: UserProfile) => void;
  switchRolePersona: (role: UserRole) => void;
  loginUser: (identifier: string) => boolean;
  logoutUser: (opts?: { reason?: 'manual' | 'other_device' }) => void;
  registerUser: (userData: Partial<UserProfile>) => UserProfile;
  updateUserProfile: (
    userId: string,
    updates: Partial<UserProfile>,
    options?: { silentSuccess?: boolean }
  ) => Promise<boolean>;
  changeUserPassword: (userId: string, currentPassword: string, newPassword: string) => { success: boolean; message: string };

  // Economy & Store
  buyCoinPackage: (packageId: string) => void;
  claimDailyBonus: () => void;
  dailyBonusClaimed: boolean;

  // Daily Rewards & Quests
  dailyRewardRecord: DailyRewardRecord | null;
  isDailyRewardsModalOpen: boolean;
  openDailyRewardsModal: () => void;
  closeDailyRewardsModal: () => void;
  claimDailyStreak: () => Promise<boolean>;
  claimDailyMission: (missionKey: string) => Promise<boolean>;
  claimDailyMasterChest: () => Promise<boolean>;
  hasUnclaimedDailyRewards: boolean;
  recordChatFriendInteraction: (receiverId: string) => void;
  recordQuickMatchInteraction: () => void;
  recordVideoCallDuration: (seconds: number) => void;
  recordMomentInteraction: () => void;
  recordGiftSentInteraction: () => void;

  // Calls
  startCall: (receiverId: string) => boolean;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  /** Mark LiveKit peer connected — starts coin burn clock (caller billing). */
  markCallMediaConnected: (callId: string) => void;
  sendGiftInCall: (giftId: string) => boolean;
  getEffectiveCallRate: (hostId?: string, callerId?: string) => number;

  // Chat & Social
  sendMessage: (
    receiverId: string,
    text: string,
    targetLang?: string,
    mediaUrl?: string,
    type?: 'text' | 'gift' | 'system' | 'friend_request' | 'image',
    /** Shared optimistic id so in-call overlay can paint before HTTP returns */
    clientTempId?: string
  ) => Promise<{ ok: boolean; clientTempId?: string }>;
  /** Cursor page of older messages for a 1:1 thread (server-authoritative). */
  loadOlderMessages: (
    otherUserId: string,
    cursor?: string | null
  ) => Promise<{ nextCursor: string | null; loaded: number }>;
  /** Peer fast-path: upsert temp in-call chat from LiveKit data / WS preview (deduped). */
  ingestInCallChatPreview: (payload: {
    clientTempId: string;
    text: string;
    senderId: string;
    receiverId: string;
    messageType?: string;
  }) => void;
  /** WS-mediated in-call preview to peer (no DB wait). Used when LiveKit data channel unavailable. */
  notifyInCallChatPreview: (payload: {
    clientTempId: string;
    text: string;
    receiverId: string;
    messageType?: string;
  }) => void;
  clearChatHistory: (otherUserId: string) => Promise<boolean>;
  favorites: string[];
  friends: string[];
  blockedUserIds: string[];
  /** Users who blocked the current user (for discovery exclusion). */
  blockedByUserIds: string[];
  creatorGoals: Record<string, { title: string; currentCoins: number; targetCoins: number }>;
  toggleFavorite: (userId: string) => Promise<boolean>;
  /** Persist swipe like via Express (pending unless reciprocal → matched). */
  likeUser: (targetUserId: string, options?: { superLike?: boolean }) => Promise<boolean>;
  /** Persist swipe pass via Express (status=rejected). */
  passUser: (targetUserId: string) => Promise<boolean>;
  /** Match rows for swipe exclusion / mutual status (from /api/v1/matches/me). */
  userMatchRecords: Array<{
    id: string;
    otherUserId: string;
    status: 'pending' | 'matched' | 'rejected' | 'unmatched';
    initiatedBy: string;
  }>;
  toggleFriend: (userId: string) => void;
  addFriend: (userId: string) => void;
  removeFriend: (userId: string) => Promise<boolean>;
  isFriend: (userId: string) => boolean;
  sendFriendRequest: (femaleId: string, maleId: string, callLogId?: string) => Promise<boolean>;
  acceptFriendRequest: (requestId: string) => Promise<boolean>;
  declineFriendRequest: (requestId: string) => Promise<boolean>;
  blockUser: (userId: string, reason?: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  reportUser: (userId: string, reason: string, details?: string) => Promise<boolean>;
  /** Opens BlockReportModal for report/block against a user. */
  openBlockReportModal: (userId: string, action?: 'report' | 'block') => void;
  closeBlockReportModal: () => void;
  blockReportModal: { userId: string; action: 'report' | 'block' } | null;
  contributeToGoal: (creatorId: string, coins: number) => Promise<boolean>;

  // Creator Reviews & Ratings (DB-backed via Express — not localStorage)
  creatorReviews: CreatorReview[];
  refreshCreatorReviews: (creatorId?: string) => Promise<void>;
  submitCreatorReview: (
    reviewData: Omit<CreatorReview, 'id' | 'createdAt'> & { ratingRequestMessageId?: string }
  ) => Promise<boolean>;
  sendRatingRequest: (creatorId: string, callerId: string, callLogId?: string) => Promise<boolean>;
  pendingRatingCall: {
    creatorId: string;
    creatorName: string;
    creatorAvatar: string;
    callLogId: string;
    durationSeconds: number;
    ratingRequestMessageId?: string;
  } | null;
  setPendingRatingCall: (call: {
    creatorId: string;
    creatorName: string;
    creatorAvatar: string;
    callLogId: string;
    durationSeconds: number;
    ratingRequestMessageId?: string;
  } | null) => void;

  // Female Creator Performance Metrics & Intelligence
  creatorMetricsMap: Record<string, CreatorMetrics>;
  myCreatorMetrics: CreatorMetrics | null;
  toggleReadyNow: (creatorIdOrActive?: string | boolean) => Promise<boolean>;
  sendCreatorHeartbeat: () => Promise<void>;
  claimDailyFirstCallBonus: () => Promise<boolean>;

  // Payouts
  submitPayoutRequest: (amountCoins: number, payoutMethod: string, accountDetails: string) => boolean;

  // Quick Match Live Host Pool & Matches (Last 50)
  liveHostIds: string[];
  activeQuickMatchCallerIds: string[];
  connectedCallersByHost: Record<string, UserProfile[]>;
  connectCallerToHost: (callerProfile: UserProfile, hostId: string) => void;
  disconnectCallerFromHost: (callerId: string, hostId?: string) => void;
  setCallerQuickMatchBrowsing: (isBrowsing: boolean) => void;
  toggleGoLiveQuickMatch: (targetUserId?: string, forceState?: boolean) => boolean;
  isHostLive: (userId: string) => boolean;
  quickMatches: QuickMatchItem[];
  recordQuickMatch: (matchedUser: UserProfile, giftsCoins?: number) => Promise<boolean>;
  sendQuickMatchGift: (targetUserId: string, giftKey: string, giftCost: number, giftName: string) => Promise<boolean>;

  // Admin Operations
  updateSystemSettings: (newSettings: Partial<SystemSettings>) => void;
  updateLiveKitConfig: (config?: { apiKey?: string; apiSecret?: string; wsUrl?: string }) => Promise<boolean>;
  saveCoinPackage: (pkg: Partial<CoinPackage> & { id?: string }) => void;
  deleteCoinPackage: (packageId: string) => void;
  saveCurrencyConfigs: (configs: CurrencyItem[]) => void;
  saveVirtualGift: (gift: Partial<VirtualGift> & { id?: string }) => void;
  deleteVirtualGift: (giftId: string) => void;
  resetVirtualGifts: () => void;
  adminApprovePayout: (requestId: string, note?: string) => void;
  adminRejectPayout: (requestId: string, note?: string) => void;
  adminUpdateUser: (userId: string, updates: Partial<UserProfile>) => void;
  adminDeleteUser: (userId: string) => Promise<boolean> | boolean | void;
  toggleVerifyUser: (userId: string) => void;
  toggleUserStatus: (userId: string, newStatus: 'online' | 'busy' | 'offline' | 'in_call') => void;
  manualGrantCoins: (userId: string, amount: number, reason?: string) => void;
  syncAllProfilesToSupabase: () => Promise<{ success: boolean; count: number; error?: string }>;
  syncUsersFromSupabase: (showNotification?: boolean) => Promise<{ success: boolean; count: number; users?: UserProfile[] }>;
  purgeAllMockData: () => Promise<{ success: boolean; deletedCount: number; message: string }>;
  resetMockDataGranular: (options: ResetDataOptions) => Promise<ResetResult>;
  likePost: (postId: string) => Promise<{ liked: boolean; likes: number } | null>;
  likeUserMoment: (
    userId: string,
    momentId: string
  ) => Promise<{ liked: boolean; likes: number } | null>;
  tipMomentCreator: (creatorId: string, coinAmount?: number, postId?: string) => Promise<boolean>;
  addFeedPost: (
    post: Omit<FeedPost, 'id' | 'createdAt' | 'likes' | 'commentsCount'>
  ) => Promise<boolean>;
  deleteFeedPost: (postId: string) => Promise<boolean>;
  refreshFeedPosts: () => Promise<void>;
  fetchUserMoments: (userId: string) => Promise<FeedPost[]>;

  // Team Leader Operations
  createTeamLeader: (leaderData: Partial<UserProfile> & { password?: string }) => Promise<UserProfile | null>;
  createCreatorByTeamLeader: (creatorData: Partial<UserProfile>, leaderId?: string) => Promise<UserProfile | null>;
  updateCreatorCoinEarnOverride: (creatorId: string, overrideRate: number | null) => void;
  banCreatorByTeamLeader: (creatorId: string, days: number, reason: string) => Promise<boolean>;
  unbanCreatorByTeamLeader: (creatorId: string) => Promise<boolean>;
  deleteCreatorByTeamLeader: (creatorId: string) => Promise<boolean>;
  refreshTeamLeaderCreators: () => Promise<UserProfile[]>;

  // Silent Admin Video Call Monitoring
  adminActiveCalls: AdminActiveCall[];
  incidentEvidenceLogs: IncidentEvidence[];
  refreshAdminActiveCalls: () => void;
  adminTerminateCall: (callId: string, reason?: string) => Promise<boolean>;
  adminIssueCallWarning: (callId: string, warningText: string) => Promise<boolean>;
  adminCaptureEvidence: (callId: string, note?: string, snapshotUrl?: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Load state — authoritative social data starts empty and is hydrated from Supabase/server
  const [users, setUsers] = useState<UserProfile[]>(() => []);

  // When Supabase Auth is configured, do not restore identity from localStorage before
  // session+profile hydrate — that briefly shows DEFAULT_FALLBACK_USER ("New Member").
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    if (isSupabaseConfigured()) return '';
    const saved = localStorage.getItem('livecall_current_user_id');
    return saved || '';
  });

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    if (isSupabaseConfigured()) return false;
    const saved = localStorage.getItem('livecall_logged_in');
    if (saved === 'false') return false;
    if (saved === 'true') return true;
    return false;
  });

  const [systemSettings, setSystemSettings] = useState<SystemSettings>(() => {
    const saved = localStorage.getItem('livecall_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migrate legacy 1080p test defaults to system default 720p
        const resolution = parsed.livekitCaptureResolution === '1080p' && !parsed.livekitExplicitlySet ? '720p' : (parsed.livekitCaptureResolution || '720p');
        const profile = resolution === '4k' ? 'ultra_4k' : resolution === '1080p' ? 'hd_1080p' : resolution === '480p' ? 'standard_480p' : 'high_720p';
        // Align with smooth-call bands: 480≈1200, 720≈2200, 1080≈4000, 4k≈8500
        const bitrate = resolution === '4k' ? 8500 : resolution === '1080p' ? 4000 : resolution === '480p' ? 1200 : 2200;
        // Legacy 60fps defaults → 30 unless admin explicitly configured LiveKit
        const framerate =
          !parsed.livekitExplicitlySet && (!parsed.livekitMaxFramerate || parsed.livekitMaxFramerate > 30)
            ? 30
            : (parsed.livekitMaxFramerate || 30);

        return {
          ...INITIAL_SYSTEM_SETTINGS,
          ...parsed,
          quickMatchTimerSeconds: parsed.quickMatchTimerSeconds !== undefined ? Number(parsed.quickMatchTimerSeconds) : (INITIAL_SYSTEM_SETTINGS.quickMatchTimerSeconds || 5),
          quickMatchGiftPrices: {
            ...INITIAL_SYSTEM_SETTINGS.quickMatchGiftPrices,
            ...(parsed.quickMatchGiftPrices || {}),
          },
          livekitCaptureResolution: resolution,
          videoQualityProfile: profile,
          livekitMaxBitrateKbps: parsed.livekitMaxBitrateKbps && parsed.livekitCaptureResolution !== '1080p' ? parsed.livekitMaxBitrateKbps : bitrate,
          livekitMaxFramerate: framerate,
        };
      } catch (e) {}
    }
    return INITIAL_SYSTEM_SETTINGS;
  });

  const [coinPackages, setCoinPackages] = useState<CoinPackage[]>(() => {
    const saved = localStorage.getItem('livecall_packages');
    return saved ? JSON.parse(saved) : INITIAL_COIN_PACKAGES;
  });
  const [currencyConfigs, setCurrencyConfigs] = useState<CurrencyItem[]>(() =>
    DEFAULT_CURRENCIES.map((c) => ({ ...c }))
  );

  const [virtualGifts, setVirtualGifts] = useState<VirtualGift[]>(() => {
    try {
      const saved = localStorage.getItem('livecall_virtual_gifts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { }
    return VIRTUAL_GIFTS;
  });

  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>(() => []);

  const [feedPosts, setFeedPosts] = useState<FeedPost[]>(() => []);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => []);

  const [callLogs, setCallLogs] = useState<CallLogItem[]>(() => []);
  const [callLogsSeenAt, setCallLogsSeenAt] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('livecall_call_logs_seen_at');
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  });

  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(() => []);

  const [creatorReviews, setCreatorReviews] = useState<CreatorReview[]>([]);

  const [pendingRatingCall, setPendingRatingCall] = useState<{
    creatorId: string;
    creatorName: string;
    creatorAvatar: string;
    callLogId: string;
    durationSeconds: number;
    ratingRequestMessageId?: string;
  } | null>(null);

  const [readMessageIds, setReadMessageIds] = useState<string[]>([]);

  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  // Reset barrier: prevents realtime/pollers from repopulating cleared state during a reset.
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const isResettingRef = useRef<boolean>(false);

  // Dark-only: lock document theme once (clear any stale light preference)
  useEffect(() => {
    try {
      localStorage.removeItem('livecall_user_theme');
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    document.body.classList.add('dark');
    document.body.classList.remove('light');
  }, []);

  // Social & Goals State — favorites/blocks hydrate from Express/Supabase (not localStorage-as-DB)
  const [favorites, setFavorites] = useState<string[]>([]);

  const [friends, setFriends] = useState<string[]>(() => []);

  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [blockedByUserIds, setBlockedByUserIds] = useState<string[]>([]);
  const [userMatchRecords, setUserMatchRecords] = useState<
    Array<{
      id: string;
      otherUserId: string;
      status: 'pending' | 'matched' | 'rejected' | 'unmatched';
      initiatedBy: string;
    }>
  >([]);

  const [dailyBonusClaimed, setDailyBonusClaimed] = useState<boolean>(false);
  const [dailyRewardRecord, setDailyRewardRecord] = useState<DailyRewardRecord | null>(null);
  const [isDailyRewardsModalOpen, setIsDailyRewardsModalOpen] = useState<boolean>(false);
  const [blockReportModal, setBlockReportModal] = useState<{
    userId: string;
    action: 'report' | 'block';
  } | null>(null);

  const [creatorGoals, setCreatorGoals] = useState<Record<string, { title: string; currentCoins: number; targetCoins: number }>>({});

  // Quick Match Live Host Pool (Authoritative real-time live host IDs, initial state is empty [])
  const [liveHostIds, setLiveHostIds] = useState<string[]>([]);
  const [activeQuickMatchCallerIds, setActiveQuickMatchCallerIds] = useState<string[]>([]);
  const [connectedCallersByHost, setConnectedCallersByHost] = useState<Record<string, UserProfile[]>>({});

  // Sync live hosts to local storage
  useEffect(() => {
    localStorage.setItem('livecall_live_host_ids_v2', JSON.stringify(liveHostIds));
  }, [liveHostIds]);

  // Home Banners, Policies & Quick Links — authoritative source is Supabase (not localStorage).
  // Start with built-in defaults so a fresh/empty DB never blanks the hero & shortcuts.
  const [homeBanners, setHomeBanners] = useState<HomeBanner[]>(() => [...INITIAL_HOME_BANNERS]);
  const [feedbackCatalog, setFeedbackCatalog] = useState<FeedbackCatalogEntry[]>(() => [
    ...DEFAULT_FEEDBACK_CATALOG,
  ]);
  const [siteBranding, setSiteBranding] = useState<SiteBranding>(() => ({ ...DEFAULT_SITE_BRANDING }));
  const feedbackCatalogRef = useRef<FeedbackCatalogEntry[]>(DEFAULT_FEEDBACK_CATALOG);
  const feedbackFingerprintIndexRef = useRef<Map<string, string>>(
    buildDefaultFingerprintIndex(DEFAULT_FEEDBACK_CATALOG)
  );
  const feedbackByKeyRef = useRef<Map<string, FeedbackCatalogEntry>>(
    new Map(DEFAULT_FEEDBACK_CATALOG.map((e) => [e.key, e]))
  );
  const [policyDocuments, setPolicyDocuments] = useState<PolicyDocument[]>(() => [...INITIAL_POLICY_DOCUMENTS]);
  const [homeQuickLinks, setHomeQuickLinks] = useState<HomeQuickLink[]>(() => [...INITIAL_HOME_QUICK_LINKS]);
  const [appNavItems, setAppNavItems] = useState<AppNavItem[]>(() => mergeNavWithDefaults([]));

  const [activePolicyDoc, setActivePolicyDoc] = useState<PolicyDocument | null>(null);

  // Silent Admin Video Call Monitoring State (Real-time active calls ONLY)
  const [adminActiveCalls, setAdminActiveCalls] = useState<AdminActiveCall[]>(() => {
    const saved = localStorage.getItem('livecall_admin_active_calls');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Strictly filter out any mock demo IDs
          return parsed.filter((c: any) => c.id && !c.id.startsWith('call_live_78219') && !c.id.startsWith('call_live_44901'));
        }
      } catch (e) { }
    }
    return [];
  });

  const [incidentEvidenceLogs, setIncidentEvidenceLogs] = useState<IncidentEvidence[]>(() => {
    const saved = localStorage.getItem('livecall_incident_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) { }
    }
    return [];
  });

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('livecall_admin_active_calls', JSON.stringify(adminActiveCalls));
  }, [adminActiveCalls]);

  useEffect(() => {
    localStorage.setItem('livecall_incident_logs', JSON.stringify(incidentEvidenceLogs));
  }, [incidentEvidenceLogs]);

  // Live timer for Admin Active Call Monitoring (real duration/coin fields only — no fake audio levels)
  useEffect(() => {
    if (adminActiveCalls.length === 0) return;

    const timer = setInterval(() => {
      setAdminActiveCalls((prevCalls) =>
        prevCalls.map((call) => {
          if (call.status !== 'active') return call;
          const newDuration = call.durationSeconds + 1;
          const coinsPerMin = call.burnRatePerMin || 10;
          const totalSpent = Math.max(0, Math.floor((newDuration / 60) * coinsPerMin));
          const totalEarned = Math.floor(totalSpent * 0.6); // 60% creator share

          return {
            ...call,
            durationSeconds: newDuration,
            coinsSpent: totalSpent,
            coinsEarned: totalEarned,
          };
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [adminActiveCalls.length]);

  // Persist non-authoritative UI preferences only (not user/social/business data)
  useEffect(() => {
    localStorage.setItem('livecall_current_user_id', currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem('livecall_settings', JSON.stringify(systemSettings));
  }, [systemSettings]);

  useEffect(() => {
    localStorage.setItem('livecall_packages', JSON.stringify(coinPackages));
  }, [coinPackages]);

  // readMessageIds mirrors DB is_read — do not persist as authoritative localStorage state

  // Real-time cross-tab synchronization listener (UI preferences / ephemeral match signals only)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'livecall_quick_matches_sync' && e.newValue) {
        try {
          const syncData = JSON.parse(e.newValue);
          const myUid = currentUserIdRef.current;
          if (myUid && (myUid === syncData.userA || myUid === syncData.userB)) {
            const saved = localStorage.getItem('livecall_quick_matches_v4_' + myUid);
            if (saved) {
              setQuickMatches(JSON.parse(saved));
            }
          }
        } catch {}
      }
      if (e.key === 'livecall_live_host_ids_v2' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setLiveHostIds(parsed);
        } catch {}
      }
      if (e.key === 'livecall_quick_match_callers_sync' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setActiveQuickMatchCallerIds(parsed);
        } catch {}
      }
      if (e.key === 'livecall_quick_match_caller_connected_sync' && e.newValue) {
        try {
          const payload = JSON.parse(e.newValue);
          if (payload.type === 'connect' && payload.hostId && payload.callerProfile) {
            setConnectedCallersByHost((prev) => {
              const existing = prev[payload.hostId] || [];
              if (existing.some((u) => u.id === payload.callerProfile.id)) return prev;
              return { ...prev, [payload.hostId]: [payload.callerProfile, ...existing] };
            });
          } else if (payload.type === 'disconnect' && payload.callerId) {
            setConnectedCallersByHost((prev) => {
              const next: Record<string, UserProfile[]> = {};
              for (const [hId, callers] of Object.entries(prev)) {
                if (payload.hostId && hId !== payload.hostId) {
                  next[hId] = callers;
                } else {
                  next[hId] = callers.filter((c) => c.id !== payload.callerId);
                }
              }
              return next;
            });
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const currentUser =
    (currentUserId
      ? users.find((u) => u.id === currentUserId) ||
        users.find((u) => u.authId && u.authId === currentUserId) ||
        users.find((u) => u.email && currentUserId && u.email.toLowerCase() === currentUserId.toLowerCase())
      : undefined) ||
    DEFAULT_FALLBACK_USER;

  // Unread messages count for current user (DB is_read wins; readMessageIds is mirror cache)
  const unreadMessagesCount = chatMessages.filter(
    (m) =>
      m.receiverId === currentUser.id &&
      currentUser.id !== 'guest_user' &&
      m.isRead !== true &&
      !readMessageIds.includes(m.id)
  ).length;

  // Pending incoming friend requests count for current user
  const pendingFriendRequestsCount = friendRequests.filter(
    (r) =>
      r.receiverId === currentUser.id &&
      currentUser.id !== 'guest_user' &&
      r.status === 'pending'
  ).length;

  const markCallLogsSeen = () => {
    const now = Date.now();
    setCallLogsSeenAt(now);
    try {
      localStorage.setItem('livecall_call_logs_seen_at', String(now));
    } catch {
      /* ignore */
    }
  };
  const missedCallsCount =
    currentUser.id === 'guest_user'
      ? 0
      : callLogs.filter((log) => {
          const mine =
            log.receiverId === currentUser.id || log.callerId === currentUser.id;
          if (!mine) return false;
          const st = String(log.status || '').toLowerCase();
          if (st !== 'missed' && st !== 'declined') return false;
          const ts = Number(log.endTime || log.startTime || 0);
          return !callLogsSeenAt || (Number.isFinite(ts) && ts > callLogsSeenAt);
        }).length;

  // Real-time signaling: Supabase Realtime on Vercel; WebSocket /ws for local Express
  const wsRef = useRef<WebSocket | null>(null);
  const realtimeRef = useRef<RealtimeSignaling | null>(null);
  const wsAuthenticatedRef = useRef(false);
  const signalSend = (data: Record<string, any>) => {
    void signalSendAsync(data);
  };
  const signalSendAsync = async (data: Record<string, any>): Promise<boolean> => {
    if (realtimeRef.current?.isConnected()) {
      return realtimeRef.current.send(data);
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  };
  const isSignalOpen = () =>
    Boolean(realtimeRef.current?.isConnected()) ||
    Boolean(wsRef.current && wsRef.current.readyState === WebSocket.OPEN);
  const wsConnectRef = useRef<() => void>(() => {});
  const pendingCallReceiverRef = useRef<string | null>(null);
  /** Clears when call is accepted / ended — auto-missed if still ringing. */
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimedOutRef = useRef(false);
  const clearRingTimeout = () => {
    if (ringTimeoutRef.current != null) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (ringPollRef.current != null) {
      clearInterval(ringPollRef.current);
      ringPollRef.current = null;
    }
    ringTimedOutRef.current = false;
  };
  const activateCallLocally = (startTime?: number) => {
    billedMinutesRef.current.clear();
    burnInFlightRef.current.clear();
    insufficientEndToastShownRef.current = false;
    billingCapSecondsRef.current = null;
    const accepted = activeCallRef.current;
    setActiveCall((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'active',
        startTime: startTime || Date.now(),
        billedMinutes: 0,
        mediaConnected: false,
        durationSeconds: prev.mediaConnected ? prev.durationSeconds : 0,
      };
    });
    if (accepted) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === accepted.callerId || u.id === accepted.receiverId
            ? { ...u, onlineStatus: 'busy' as const }
            : u
        )
      );
    }
  };
  const showToastRef = useRef<(title: string, message: string, type?: 'success' | 'error' | 'info' | 'warning') => void>(
    () => {}
  );
  const showToastKeyRef = useRef<
    (
      key: string,
      opts?: { type?: FeedbackType; vars?: Record<string, string | number | null | undefined> }
    ) => void
  >(() => {});
  const logoutUserRef = useRef<(opts?: { reason?: 'manual' | 'other_device' }) => void>(() => {});
  const sessionKickInFlightRef = useRef(false);
  const sessionKickPendingRef = useRef(false);
  const usersRef = useRef<UserProfile[]>(users);
  /** IDs hard-deleted this session — blocks sync/upsert resurrection. */
  const deletedUserIdsRef = useRef<Set<string>>(new Set());
  const prevUserIdRef = useRef<string | null>(null);
  const isLoggedInRef = useRef<boolean>(isLoggedIn);
  const currentUserIdRef = useRef<string>(currentUserId);
  /** Skip duplicate directory syncs on refresh / Discovery remount (Vercel). */
  const lastDirectorySyncAtRef = useRef(0);
  const refreshCallLogsFromDbRef = useRef<() => Promise<void>>(async () => {});
  /**
   * Editable profile fields saved locally but not yet confirmed by a matching
   * server row. Heartbeat realtime echoes must not paint the previous values
   * back over this patch.
   */
  const pendingSelfProfileRef = useRef<{ userId: string; fields: Partial<UserProfile> } | null>(null);
  const profileSaveGenRef = useRef(0);
  const profileSaveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const SELF_PROFILE_FIELD_KEYS: (keyof UserProfile)[] = [
    'name',
    'nationality',
    'countryCode',
    'spokenLanguages',
    'avatarUrl',
    'bio',
    'extendedBio',
    'zodiac',
    'locationCity',
    'interests',
    'interestedIn',
    'tags',
    'gallery',
    'galleryVideos',
    'introVideoUrl',
    'exactLocation',
    'isUsingMockLocation',
    'mockLocationCity',
    'mockLocationCountry',
    'mockLocationCountryCode',
    'hourlyCoinRate',
  ];
  const pickSelfProfileFields = (fields: Partial<UserProfile>): Partial<UserProfile> => {
    const content: Partial<UserProfile> = {};
    for (const key of SELF_PROFILE_FIELD_KEYS) {
      if (fields[key] !== undefined) {
        (content as any)[key] = fields[key];
      }
    }
    return content;
  };
  const sameProfileValue = (a: unknown, b: unknown) => {
    if (Array.isArray(a) || Array.isArray(b) || (a !== null && typeof a === 'object') || (b !== null && typeof b === 'object')) {
      return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    }
    return a === b;
  };
  const isSelfProfileRow = (user: { id?: string; authId?: string | null }) => {
    const selfId = currentUserIdRef.current;
    const pendingId = pendingSelfProfileRef.current?.userId;
    if (!user?.id && !user?.authId) return false;
    return Boolean(
      (selfId && (user.id === selfId || user.authId === selfId)) ||
      (pendingId && (user.id === pendingId || user.authId === pendingId))
    );
  };
  const rememberPendingSelfProfile = (userId: string, fields: Partial<UserProfile>) => {
    const content = pickSelfProfileFields(fields);
    if (Object.keys(content).length === 0) return;
    const prev = pendingSelfProfileRef.current;
    const sameUser = Boolean(prev && (prev.userId === userId || prev.userId === currentUserIdRef.current));
    pendingSelfProfileRef.current = {
      userId: currentUserIdRef.current || userId,
      fields: sameUser ? { ...prev!.fields, ...content } : content,
    };
  };
  const overlayPendingSelfProfile = <T extends UserProfile>(user: T): T => {
    const pending = pendingSelfProfileRef.current;
    if (!pending || !isSelfProfileRow(user)) return user;
    return { ...user, ...pending.fields, onlineStatus: user.onlineStatus };
  };
  const settlePendingFromIncoming = (incoming: Partial<UserProfile>, isSelf: boolean) => {
    const pending = pendingSelfProfileRef.current;
    if (!isSelf || !pending) return;
    const next: Partial<UserProfile> = {};
    for (const key of Object.keys(pending.fields) as (keyof UserProfile)[]) {
      const want = pending.fields[key];
      const got = incoming[key];
      if (got !== undefined && sameProfileValue(want, got)) continue;
      (next as any)[key] = want;
    }
    pendingSelfProfileRef.current =
      Object.keys(next).length === 0 ? null : { userId: pending.userId, fields: next };
  };
  /** Cached access token for sync unload beacons (sendBeacon cannot set Authorization headers). */
  const accessTokenRef = useRef<string | null>(null);
  /** Admin active-calls HTTP poll — suspended after 401/403 until fresh session. */
  const adminActiveCallsPollStateRef = useRef<AdminActiveCallsPollState>(createAdminActiveCallsPollState());
  const adminActiveCallsPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshAdminActiveCallsRef = useRef<() => Promise<void>>(async () => {});
  const adminActiveCallsRef = useRef<AdminActiveCall[]>(adminActiveCalls);
  const activeCallRef = useRef<CallSession | null>(activeCall);
  /**
   * User-chosen availability (online | busy | offline). Call lifecycle sets display
   * busy without changing this — so after hangup / heartbeat we restore correctly
   * and sticky call-busy cannot overwrite a manual Online choice.
   */
  const preferredStatusRef = useRef<'online' | 'busy' | 'offline'>('online');
  const billedMinutesRef = useRef<Set<number>>(new Set());
  const burnInFlightRef = useRef<Set<number>>(new Set());
  /** Prevents stacked insufficient-balance end toasts for the same call. */
  const insufficientEndToastShownRef = useRef(false);
  /** Max call seconds from balance at media-connect (floor(coins/rate)*60). Cleared when call ends. */
  const billingCapSecondsRef = useRef<number | null>(null);
  /** Caller billing function, invoked by the visible clock when a new minute starts. */
  const requestBurnRef = useRef<(billingMinute: number) => void>(() => {});
  const endCallRef = useRef<() => void>(() => {});
  const syncCallEndAndPresenceRef = useRef<
    (payload: Record<string, unknown>, restoreIds: string[]) => Promise<void>
  >(async () => {});
  const applyBurnBalancesRef = useRef<(payload: any) => void>(() => {});
  const applyWalletBalanceRef = useRef<(payload: {
    userId?: string;
    authId?: string;
    email?: string;
    coinBalance?: number;
    earningsCoins?: number;
  }) => void>(() => {});

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    isLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const stopAdminActiveCallsPoll = useCallback(() => {
    if (adminActiveCallsPollTimerRef.current) {
      clearInterval(adminActiveCallsPollTimerRef.current);
      adminActiveCallsPollTimerRef.current = null;
    }
  }, []);

  const startAdminActiveCallsPoll = useCallback(() => {
    stopAdminActiveCallsPoll();
    if (!isLoggedInRef.current || !currentUserIdRef.current) return;
    const me = usersRef.current.find((u) => u.id === currentUserIdRef.current);
    if (me?.role !== 'admin') return;
    adminActiveCallsPollStateRef.current = {
      ...adminActiveCallsPollStateRef.current,
      suspended: false,
      inFlight: false,
    };
    const tick = () => {
      void refreshAdminActiveCallsRef.current();
    };
    tick();
    adminActiveCallsPollTimerRef.current = setInterval(tick, 2500);
  }, [stopAdminActiveCallsPoll]);

  // Keep a sync-readable access token for beacons and auth-gated polling.
  // Also resume admin active-calls poll after a successful session refresh.
  useEffect(() => {
    let cancelled = false;
    const refreshToken = async () => {
      const token = await getAccessToken();
      if (cancelled) return;
      accessTokenRef.current = token;
      if (
        token &&
        adminActiveCallsPollStateRef.current.suspended &&
        isLoggedInRef.current
      ) {
        const me = usersRef.current.find((u) => u.id === currentUserIdRef.current);
        if (me?.role === 'admin') {
          adminActiveCallsPollStateRef.current = resumeAdminActiveCallsPoll(
            adminActiveCallsPollStateRef.current,
            token
          );
          if (!adminActiveCallsPollTimerRef.current) {
            startAdminActiveCallsPoll();
          }
        }
      }
    };
    void refreshToken();
    const timer = setInterval(refreshToken, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isLoggedIn, currentUserId, startAdminActiveCallsPoll]);

  // -------------------------------------------------------------------------
  // Supabase Auth rehydration — session.user.id is the identity source of truth
  // when a valid session exists. localStorage remains a fallback for offline /
  // persona / custom-OTP flows that have no Supabase session yet.
  // -------------------------------------------------------------------------
  const authHydratingRef = useRef(false);
  const supabaseAuthUserIdRef = useRef<string | null>(null);

  const clearLocalAuthState = useCallback((prevId?: string) => {
    const clearedId = prevId || currentUserIdRef.current;
    isLoggedInRef.current = false;
    currentUserIdRef.current = '';
    preferredStatusRef.current = 'offline';
    supabaseAuthUserIdRef.current = null;
    accessTokenRef.current = null;
    setIsLoggedIn(false);
    setCurrentUserId('');
    localStorage.setItem('livecall_logged_in', 'false');
    localStorage.removeItem('livecall_current_user_id');
    clearStoredActiveSessionId();

    if (clearedId) {
      setUsers((prev) =>
        prev.map((u) => (u.id === clearedId || u.authId === clearedId ? { ...u, onlineStatus: 'offline' as const } : u))
      );
    }
  }, []);

  const applySupabaseSessionUser = useCallback(async (authUser: SupabaseAuthUser) => {
    const authUserId = String(authUser.id || '').trim();
    if (!authUserId) return;

    authHydratingRef.current = true;
    supabaseAuthUserIdRef.current = authUserId;

    try {
      const email = (authUser.email || '').trim().toLowerCase();
      const meta = authUser.user_metadata || {};
      const emailLocal = email ? email.split('@')[0] : '';
      const metaName = String(meta.full_name || meta.display_name || meta.name || '').trim();

      // Always prefer DB profile on hydrate so we never flash a stub "Member" name
      // from an empty in-memory users list or incomplete auth metadata.
      let profile: UserProfile | undefined;
      let dbActiveSessionId = '';

      if (isSupabaseConfigured()) {
        try {
          let dbProfile: any = null;
          // Public columns only (wallet/email REVOKE'd from client roles).
          const profileSelect =
            'id, auth_id, name, gender, age, dob, nationality, country_code, spoken_languages, bio, extended_bio, location_city, zodiac, interests, tags, interested_in, avatar_url, gallery, gallery_videos, intro_video_url, is_verified, online_status, role, is_onboarded, hourly_coin_rate, rating_score, total_reviews_count, total_calls_hosted, team_leader_id, created_by_id, active_session_id, created_at';
          // One round-trip for auth_id or id (Vercel refresh path); email only if needed.
          const { data: matched } = await supabase
            .from('profiles')
            .select(profileSelect)
            .or(`auth_id.eq.${authUserId},id.eq.${authUserId}`)
            .limit(2);
          if (Array.isArray(matched) && matched.length > 0) {
            dbProfile =
              matched.find((row: any) => String(row?.auth_id || '') === authUserId) ||
              matched.find((row: any) => String(row?.id || '') === authUserId) ||
              matched[0];
          }
          // Email lookup omitted: email column is REVOKE'd from client roles.
          if (dbProfile) {
            dbActiveSessionId = dbProfile.active_session_id
              ? String(dbProfile.active_session_id).trim()
              : '';
            profile = mapDbProfileToUserProfile(dbProfile);
            if (!profile.authId) profile.authId = authUserId;
          }

          // Wallet columns are REVOKE'd from client roles — load via service-role API.
          try {
            const walletRes = await authFetch('/api/v1/users/me');
            const walletJson = await walletRes.json().catch(() => null);
            const me = walletJson?.data?.user;
            if (walletRes.ok && me && profile) {
              if (typeof me.coinBalance === 'number') profile.coinBalance = me.coinBalance;
              if (typeof me.earningsCoins === 'number') profile.earningsCoins = me.earningsCoins;
              if (me.email) profile.email = me.email;
            }
          } catch (walletErr) {
            console.warn('[Auth Rehydrate] wallet hydrate notice:', walletErr);
          }
        } catch (err) {
          console.warn('[Auth Rehydrate] Profile fetch warning:', err);
        }
      }

      if (!profile) {
        profile =
          usersRef.current.find((u) => u.id === authUserId) ||
          usersRef.current.find((u) => u.authId === authUserId) ||
          (email
            ? usersRef.current.find((u) => u.email && u.email.toLowerCase().trim() === email)
            : undefined);
      }

      // Minimal safe stub only when DB/profile are unavailable (e.g. brand-new session)
      // Never accept privileged roles from Auth metadata on public rehydrate.
      if (!profile) {
        const PUBLIC_ROLES = new Set([
          'male_user',
          'female_user',
          'female_creator',
          'female_host',
          'other_user',
        ]);
        const rawMetaRole = String(meta.role || 'male_user');
        const metaRole = (PUBLIC_ROLES.has(rawMetaRole) ? rawMetaRole : 'male_user') as UserRole;
        const isFemale =
          metaRole === 'female_user' || metaRole === 'female_creator' || metaRole === 'female_host';
        const stubName = metaName || emailLocal || 'User';
        profile = {
          ...DEFAULT_FALLBACK_USER,
          id: authUserId,
          authId: authUserId,
          name: stubName,
          email: email || '',
          gender: isFemale ? 'female' : metaRole === 'other_user' ? 'other' : 'male',
          role: metaRole,
          isOnboarded: Boolean(meta.is_onboarded),
          onlineStatus: 'online',
          coinBalance: isFemale ? 0 : 50,
        };
      } else {
        // Upgrade placeholder names if auth metadata / email local-part is better
        const placeholder =
          !profile.name ||
          profile.name === 'Member' ||
          profile.name === 'New Member' ||
          profile.name === 'User';
        if (placeholder && (metaName || emailLocal)) {
          profile = { ...profile, name: metaName || emailLocal };
        }
      }

      // Prefer the persistent profile id when present; keep authId linked
      const activeId = profile.id || authUserId;
      profile = {
        ...profile,
        id: activeId,
        authId: profile.authId || authUserId,
        onlineStatus: 'online',
      };

      // Ensure token is cached before flipping login flags so the WS effect can authenticate immediately
      try {
        const token = await getAccessToken();
        if (token) accessTokenRef.current = token;
      } catch {
        // WS connect will retry token fetch
      }

      // Single-device gate: if another device claimed the session, sign out here.
      // If this browser has no claimed id yet (upgrade / first visit), claim one.
      try {
        const localSid = getStoredActiveSessionId();
        if (dbActiveSessionId && localSid && dbActiveSessionId !== localSid) {
          await signOutSupabase().catch(() => {});
          clearLocalAuthState(activeId);
          showToastRef.current?.(
            'Signed out',
            'Your account was signed in on another device. Only one login is allowed at a time.',
            'warning'
          );
          return;
        }
        if (!localSid) {
          // Hydrate-only claim: do not revoke other refresh tokens here (login path does that).
          await claimExclusiveLoginSession({
            accessToken: accessTokenRef.current,
            revokeOthers: false,
          });
        }
      } catch (err) {
        console.warn('[Auth Rehydrate] single-session gate notice:', err);
      }

      isLoggedInRef.current = true;
      currentUserIdRef.current = activeId;
      preferredStatusRef.current = 'online';
      setCurrentUserId(activeId);
      setIsLoggedIn(true);
      localStorage.setItem('livecall_logged_in', 'true');
      localStorage.setItem('livecall_current_user_id', activeId);

      setUsers((prev) => {
        const cleanEmail = profile!.email ? profile!.email.toLowerCase().trim() : null;
        const remaining = prev.filter((u) => {
          if (u.id === activeId || u.id === authUserId) return false;
          if (u.authId && (u.authId === authUserId || u.authId === activeId)) return false;
          if (cleanEmail && u.email && u.email.toLowerCase().trim() === cleanEmail) return false;
          return true;
        });
        const next = [profile!, ...remaining];
        usersRef.current = next;
        return next;
      });

      // Push online so rediscovered sessions do not stay sticky-busy from old call_logs
      authFetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'online' }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json().catch(() => null);
          if (!data?.success || !data.presence) return;
          const presence = data.presence as Record<string, 'online' | 'busy' | 'offline'>;
          setUsers((prev) =>
            prev.map((u) => {
              if (!(u.id in presence) && u.id !== activeId) return u;
              const live =
                u.id === activeId
                  ? data.status || presence[u.id] || 'online'
                  : presence[u.id] || 'offline';
              return u.onlineStatus === live ? u : { ...u, onlineStatus: live };
            })
          );
        })
        .catch(() => {});
    } finally {
      authHydratingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const bootstrapAuth = async () => {
      if (!isSupabaseConfigured()) {
        // No Supabase — keep localStorage identity for offline / persona mode
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error) {
          console.warn('[Auth Rehydrate] getSession error:', error.message);
        }

        const session = data?.session as Session | null;
        if (session?.user?.id) {
          await applySupabaseSessionUser(session.user);
        } else {
          clearLocalAuthState();
        }
      } catch (err) {
        console.warn('[Auth Rehydrate] bootstrap exception:', err);
      }
    };

    bootstrapAuth();

    if (isSupabaseConfigured()) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (cancelled) return;

        if (event === 'SIGNED_OUT') {
          clearLocalAuthState();
          return;
        }

        if (
          (event === 'SIGNED_IN' ||
            event === 'TOKEN_REFRESHED' ||
            event === 'USER_UPDATED' ||
            event === 'INITIAL_SESSION') &&
          session?.user?.id
        ) {
          // Avoid fighting an in-progress hydrate from getSession()
          if (authHydratingRef.current && event === 'INITIAL_SESSION') return;
          await applySupabaseSessionUser(session.user);
        }
      });
      subscription = data.subscription;
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [applySupabaseSessionUser, clearLocalAuthState]);

  useEffect(() => {
    adminActiveCallsRef.current = adminActiveCalls;
  }, [adminActiveCalls]);

  useEffect(() => {
    activeCallRef.current = activeCall;
    // Apply deferred single-session kick after ringing/active call ends
    if (!activeCall && sessionKickPendingRef.current && isLoggedInRef.current) {
      sessionKickPendingRef.current = false;
      if (!shouldIgnoreSessionKick() && !sessionKickInFlightRef.current) {
        sessionKickInFlightRef.current = true;
        logoutUserRef.current({ reason: 'other_device' });
      }
    }
  }, [activeCall]);

  // Local call lock → busy ONLY while this client still has a live CallSession.
  // Server presence is authoritative for everyone else (and for self when not in a call).
  const getUserCallStatus = (
    uid: string,
    fallbackStatus: 'online' | 'busy' | 'offline' | 'in_call'
  ): 'online' | 'busy' | 'offline' | 'in_call' => {
    if (
      activeCallRef.current &&
      (activeCallRef.current.callerId === uid || activeCallRef.current.receiverId === uid) &&
      activeCallRef.current.status !== 'ended'
    ) {
      return 'busy';
    }
    // Normalize legacy in_call from any payload to busy
    if (fallbackStatus === 'in_call') return 'busy';
    return fallbackStatus;
  };

  /** Resolve presence for a user id or auth_id alias. */
  const presenceFor = (
    presence: Record<string, 'online' | 'busy' | 'offline'>,
    u: { id: string; authId?: string }
  ): 'online' | 'busy' | 'offline' | undefined => {
    if (u.id && u.id in presence) return presence[u.id];
    if (u.authId && u.authId in presence) return presence[u.authId];
    return undefined;
  };

  /** Apply a presence map from the server — single source of truth for discovery + profile. */
  const applyPresenceMap = useCallback(
    (presence: Record<string, 'online' | 'busy' | 'offline'>, selfStatus?: string) => {
      const selfId = currentUserIdRef.current;
      const resolvedSelf =
        (selfStatus as 'online' | 'busy' | 'offline' | undefined) ||
        (selfId ? presence[selfId] : undefined);

      // Never clear a live ringing/active CallSession from presence alone.
      // Heartbeat often races ahead of /api/calls/sync and briefly reports "online",
      // which was auto-closing the calling popup after ~1–2s before the peer rang.
      const localCall = activeCallRef.current;
      const hasLiveLocalCall =
        Boolean(localCall) &&
        localCall!.status !== 'ended' &&
        (localCall!.status === 'ringing' || localCall!.status === 'active');
      if (
        resolvedSelf &&
        resolvedSelf !== 'busy' &&
        localCall &&
        localCall.status !== 'ended' &&
        !hasLiveLocalCall
      ) {
        activeCallRef.current = null;
        setActiveCall(null);
      }
      if (resolvedSelf && resolvedSelf !== 'busy' && !hasLiveLocalCall) {
        setAdminActiveCalls((prev) =>
          prev.filter((ac) => ac.hostId !== selfId && ac.callerId !== selfId)
        );
      }
      // Do not overwrite preferred availability with call-derived busy from the server map.
      if (
        (resolvedSelf === 'online' || resolvedSelf === 'offline') &&
        !hasLiveLocalCall
      ) {
        preferredStatusRef.current = resolvedSelf;
      } else if (resolvedSelf === 'busy' && preferredStatusRef.current === 'offline') {
        // keep offline preference; busy is call-derived
      }

      setUsers((prev) => {
        let changed = false;
        const next = prev.map((u) => {
          const fromMap =
            u.id === selfId
              ? resolvedSelf || presenceFor(presence, u) || preferredStatusRef.current
              : presenceFor(presence, u);
          if (fromMap == null) return u;
          // Trust server presence; only force busy if THIS client still has an active call UI
          const liveStatus = getUserCallStatus(u.id, fromMap);
          if (u.onlineStatus !== liveStatus) {
            changed = true;
            return { ...u, onlineStatus: liveStatus };
          }
          return u;
        });
        return changed ? next : prev;
      });
    },
    []
  );

  /** Close call on server first, then refresh presence (avoids sticky busy from open call_logs). */
  const syncCallEndAndPresence = useCallback(
    async (payload: Record<string, unknown>, restoreIds: string[]) => {
      // Clear local call lock immediately so heartbeat cannot re-apply busy
      activeCallRef.current = null;
      try {
        await authFetch('/api/calls/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        /* best effort */
      }
      // Host + caller call-log UIs must refresh after missed/declined/completed
      void refreshCallLogsFromDbRef.current();
      // After a call, return to online (unless user chose offline). Clears sticky busy.
      if (preferredStatusRef.current !== 'offline') {
        preferredStatusRef.current = 'online';
      }
      const restore = preferredStatusRef.current;
      setUsers((prev) =>
        prev.map((u) => (restoreIds.includes(u.id) ? { ...u, onlineStatus: restore } : u))
      );
      try {
        const res = await authFetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: restore }),
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (data?.success && data.presence) {
          applyPresenceMap(data.presence, data.status);
        }
      } catch {
        /* best effort */
      }
    },
    [applyPresenceMap]
  );

  syncCallEndAndPresenceRef.current = syncCallEndAndPresence;

  // Call lifecycle → local busy + DB sync + heartbeat refresh (call=busy; end handled in endCall)
  useEffect(() => {
    if (!isLoggedInRef.current || !currentUserIdRef.current) return;
    if (!activeCall || activeCall.status === 'ended') return;
    const { callerId, receiverId, id: callId, status } = activeCall;
    setUsers((prev) => {
      let changed = false;
      const next = prev.map((u) => {
        if (u.id !== callerId && u.id !== receiverId) return u;
        if (u.onlineStatus === 'busy') return u;
        changed = true;
        return { ...u, onlineStatus: 'busy' as const };
      });
      return changed ? next : prev;
    });
    const callerProfile = usersRef.current.find((u) => u.id === callerId);
    const receiverProfile = usersRef.current.find((u) => u.id === receiverId);
    authFetch('/api/calls/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId,
        callerId,
        receiverId,
        status: status === 'active' ? 'active' : 'ringing',
        startTime: new Date(activeCall.startTime || Date.now()).toISOString(),
        callerName: callerProfile?.name,
        receiverName: receiverProfile?.name,
        hostName: receiverProfile?.name,
      }),
    }).catch(() => {});
    // While in a call UI, heartbeat as busy so presence cannot race back to "online"
    // and clear the ringing popup (or hide the callee as available).
    authFetch('/api/presence/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'busy' }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data?.success || !data.presence) return;
        const presence = data.presence as Record<string, 'online' | 'busy' | 'offline'>;
        setUsers((prev) =>
          prev.map((u) => {
            if (!(u.id in presence)) return u;
            const live = getUserCallStatus(u.id, presence[u.id] || 'offline');
            return u.onlineStatus === live ? u : { ...u, onlineStatus: live };
          })
        );
      })
      .catch(() => {});
  }, [activeCall?.id, activeCall?.status]);

  /** Collect every id alias for this session (profile id ↔ auth.users.id). */
  const collectSelfIds = useCallback((): Set<string> => {
    const me = String(currentUserIdRef.current || '').trim();
    const meAuth = String(supabaseAuthUserIdRef.current || '').trim();
    const ids = new Set<string>();
    if (me) ids.add(me);
    if (meAuth) ids.add(meAuth);
    const row = usersRef.current.find(
      (u) =>
        u.id === me ||
        u.authId === me ||
        (meAuth && (u.id === meAuth || u.authId === meAuth))
    );
    if (row?.id) ids.add(String(row.id));
    if (row?.authId) ids.add(String(row.authId));
    return ids;
  }, []);

  /** True if id matches this session's profile id or auth id (either direction). */
  const isSelfId = useCallback(
    (id?: string | null) => {
      const sid = String(id || '').trim();
      if (!sid) return false;
      return collectSelfIds().has(sid);
    },
    [collectSelfIds]
  );

  const applyIncomingRing = useCallback(
    (opts: {
      callId: string;
      callerId: string;
      receiverId: string;
      /** When true, server/poll already verified we are the callee — do not drop on id alias mismatch. */
      trusted?: boolean;
    }) => {
      const callId = String(opts.callId || '').trim();
      const callerId = String(opts.callerId || '').trim();
      let receiverId = String(opts.receiverId || currentUserIdRef.current || '').trim();
      if (!callId || !callerId) return;

      const selfIds = collectSelfIds();
      const amCaller = selfIds.has(callerId);
      const amReceiver = selfIds.has(receiverId);

      // Never show incoming UI for a call we placed ourselves
      if (amCaller && !amReceiver) return;
      if (!opts.trusted && !amReceiver) return;
      // Trusted poll/API path: force canonical self id so Accept UI treats us as receiver
      if (opts.trusted && !amReceiver) {
        receiverId = String(currentUserIdRef.current || [...selfIds][0] || receiverId).trim();
      }

      const cur = activeCallRef.current;
      if (cur && cur.status === 'active') return;
      if (cur && cur.id === callId && cur.status === 'ringing') return;

      billedMinutesRef.current.clear();
      burnInFlightRef.current.clear();
      insufficientEndToastShownRef.current = false;
      setActiveCall({
        id: callId,
        callerId,
        receiverId,
        startTime: Date.now(),
        durationSeconds: 0,
        coinsSpent: 0,
        coinsEarned: 0,
        giftsSent: [],
        status: 'ringing',
        mediaConnected: false,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === callerId ||
          u.id === receiverId ||
          u.authId === callerId ||
          u.authId === receiverId ||
          selfIds.has(u.id) ||
          (u.authId ? selfIds.has(u.authId) : false)
            ? { ...u, onlineStatus: 'busy' as const }
            : u
        )
      );
      showToastRef.current?.(
        'Incoming Video Call 📹',
        'Incoming call ringing on your device!',
        'info'
      );
    },
    [collectSelfIds]
  );
  const applyIncomingRingRef = useRef(applyIncomingRing);
  useEffect(() => {
    applyIncomingRingRef.current = applyIncomingRing;
  }, [applyIncomingRing]);
  const isSelfIdRef = useRef(isSelfId);
  useEffect(() => {
    isSelfIdRef.current = isSelfId;
  }, [isSelfId]);

  const CALL_TERMINAL_STATUSES = useMemo(
    () =>
      new Set([
        'missed',
        'declined',
        'cancelled',
        'canceled',
        'rejected',
        'failed',
        'completed',
        'ended',
      ]),
    []
  );

  /** Peer hung up / cancelled — close local call UI + restore presence (no re-broadcast). */
  const closeCallFromRemote = useCallback(
    (opts: { callId: string; status?: string; silent?: boolean }) => {
      const cur = activeCallRef.current;
      const callId = String(opts.callId || '').trim();
      if (!cur || !callId || cur.id !== callId) return false;

      clearRingTimeout();
      billedMinutesRef.current.clear();
      burnInFlightRef.current.clear();
      billingCapSecondsRef.current = null;
      activeCallRef.current = null;
      setActiveCall(null);

      if (preferredStatusRef.current !== 'offline') {
        preferredStatusRef.current = 'online';
      }
      const restore = preferredStatusRef.current;
      setUsers((prev) =>
        prev.map((u) =>
          u.id === cur.callerId || u.id === cur.receiverId
            ? { ...u, onlineStatus: restore }
            : u
        )
      );
      void authFetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: restore }),
      }).catch(() => {});

      if (!opts.silent) {
        const st = String(opts.status || '').toLowerCase();
        if (st === 'declined') {
          showToastRef.current?.('Call Declined 🚫', 'The other person declined the call.', 'info');
        } else if (st === 'missed' || st === 'cancelled' || st === 'canceled') {
          showToastRef.current?.(
            'Call Ended',
            'The other person ended or cancelled the call.',
            'info'
          );
        } else {
          showToastRef.current?.('Call Ended', 'The other person left the call.', 'info');
        }
      }

      void refreshCallLogsFromDbRef.current();
      return true;
    },
    []
  );
  const closeCallFromRemoteRef = useRef(closeCallFromRemote);
  useEffect(() => {
    closeCallFromRemoteRef.current = closeCallFromRemote;
  }, [closeCallFromRemote]);

  // DB + HTTP fallback for incoming rings when Realtime broadcast is dropped (Vercel).
  useEffect(() => {
    if (!isLoggedIn || !currentUserId) return;
    let cancelled = false;

    const freshSelfIds = (): string[] => Array.from(collectSelfIds());

    const onCallLogRow = (row: Record<string, any>) => {
      const callId = String(row.id || '').trim();
      const callerId = String(row.caller_id || '').trim();
      const receiverId = String(row.receiver_id || row.host_id || '').trim();
      const hostId = String(row.host_id || '').trim();
      const st = String(row.status || '').toLowerCase();
      if (!callId) return;

      const myIds = freshSelfIds();
      const involvesMe =
        myIds.includes(callerId) || myIds.includes(receiverId) || myIds.includes(hostId);
      if (!involvesMe) return;

      if (st === 'ringing') {
        // Only callee should open incoming UI
        const amCallee = myIds.includes(receiverId) || myIds.includes(hostId);
        const amCaller = myIds.includes(callerId);
        if (amCallee && !amCaller) {
          applyIncomingRingRef.current({
            callId,
            callerId,
            receiverId: receiverId || currentUserIdRef.current || '',
            trusted: true,
          });
        }
        return;
      }

      if (CALL_TERMINAL_STATUSES.has(st)) {
        closeCallFromRemoteRef.current({ callId, status: st });
        return;
      }

      // Live session earnings/spend — host UI needs this when burn fanout is missing (Vercel)
      if (st === 'active' || st === 'accepted' || st === 'in_call') {
        const cur = activeCallRef.current;
        if (!cur || cur.id !== callId) return;
        const earned = Number(row.coins_earned);
        const spent = Number(row.coins_spent);
        if (!Number.isFinite(earned) && !Number.isFinite(spent)) return;
        setActiveCall((prev) => {
          if (!prev || prev.id !== callId) return prev;
          const nextEarned =
            Number.isFinite(earned) ? Math.max(prev.coinsEarned || 0, earned) : prev.coinsEarned;
          const nextSpent =
            Number.isFinite(spent) ? Math.max(prev.coinsSpent || 0, spent) : prev.coinsSpent;
          if (nextEarned === prev.coinsEarned && nextSpent === prev.coinsSpent) return prev;
          const next = { ...prev, coinsEarned: nextEarned, coinsSpent: nextSpent };
          activeCallRef.current = next;
          return next;
        });
      }
    };

    const applyRingFromRow = (top: {
      callId?: string;
      id?: string;
      callerId?: string;
      receiverId?: string;
    }) => {
      const callId = String(top.callId || top.id || '').trim();
      const callerId = String(top.callerId || '').trim();
      if (!callId || !callerId) return;
      applyIncomingRingRef.current({
        callId,
        callerId,
        receiverId: String(top.receiverId || currentUserIdRef.current || ''),
        trusted: true,
      });
    };

    const pollIncoming = async () => {
      if (cancelled || isResettingRef.current) return;
      const cur = activeCallRef.current;
      if (cur && cur.status === 'active') return;
      const myIds = freshSelfIds();
      const meId = String(currentUserIdRef.current || '').trim();

      try {
        const res = await authFetch('/api/calls/incoming');
        if (cancelled) return;
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const rows = Array.isArray(json?.data) ? json.data : [];
          if (rows.length) {
            applyRingFromRow(rows[0]);
            return;
          }
        }

        // Client DB fallback — recovers when API is slow or id aliases differ
        if (isSupabaseConfigured() && myIds.length) {
          const orFilter = myIds
            .flatMap((id) => [`receiver_id.eq.${id}`, `host_id.eq.${id}`])
            .join(',');
          const { data, error } = await supabase
            .from('call_logs')
            .select(
              'id, caller_id, receiver_id, host_id, status, started_at, start_time, updated_at'
            )
            .eq('status', 'ringing')
            .or(orFilter)
            .order('started_at', { ascending: false })
            .limit(5);
          if (!error && data?.length) {
            const now = Date.now();
            const fresh = data.filter((row) => {
              const startedMs =
                Date.parse(
                  String(
                    (row as any).started_at ||
                      (row as any).start_time ||
                      (row as any).updated_at ||
                      ''
                  )
                ) || 0;
              const ageMs = startedMs ? now - startedMs : 0;
              return ageMs >= 0 && ageMs < 75_000;
            });
            if (fresh.length) {
              const row = fresh[0] as any;
              applyRingFromRow({
                callId: String(row.id),
                callerId: String(row.caller_id || ''),
                receiverId: String(row.receiver_id || row.host_id || meId),
              });
              return;
            }
          }
        }

        // Ringing cancelled remotely — clear local ringing UI
        if (cur && cur.status === 'ringing') {
          const curReceiver = String(cur.receiverId || '');
          if (myIds.includes(curReceiver) || isSelfIdRef.current(curReceiver)) {
            if (isSupabaseConfigured()) {
              const { data } = await supabase
                .from('call_logs')
                .select('status')
                .eq('id', cur.id)
                .maybeSingle();
              const st = String((data as any)?.status || '').toLowerCase();
              if (CALL_TERMINAL_STATUSES.has(st)) {
                closeCallFromRemoteRef.current({ callId: cur.id, status: st });
              }
            }
          }
        }
      } catch (e) {
        console.warn('[calls/incoming] poll failed', e);
      }
    };

    // If presence already says busy but Accept UI never opened, force a poll now
    const recoverBusyWithoutRing = () => {
      if (cancelled || activeCallRef.current) return;
      const me = usersRef.current.find((u) => {
        const ids = freshSelfIds();
        return ids.includes(u.id) || (u.authId ? ids.includes(u.authId) : false);
      });
      if (me?.onlineStatus === 'busy' || me?.onlineStatus === 'in_call') {
        void pollIncoming();
      }
    };

    void pollIncoming();
    // Realtime inbox is primary; HTTP poll is slow backoff safety net only
    const pollTimer = setInterval(() => void pollIncoming(), 8000);
    const recoverTimer = setInterval(() => recoverBusyWithoutRing(), 15000);

    const channels: ReturnType<typeof supabase.channel>[] = [];
    if (isSupabaseConfigured()) {
      const attach = (filterCol: 'receiver_id' | 'caller_id' | 'host_id', id: string) => {
        const ch = supabase
          .channel(`call_logs_${filterCol}_${id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'call_logs',
              filter: `${filterCol}=eq.${id}`,
            },
            (payload: any) => {
              try {
                const row = (payload.new || payload.old || {}) as Record<string, any>;
                onCallLogRow(row);
              } catch (e) {
                console.warn('[call_logs] inbox handler error', e);
              }
            }
          )
          .subscribe();
        channels.push(ch);
      };
      for (const id of freshSelfIds()) {
        attach('receiver_id', id);
        attach('caller_id', id);
        attach('host_id', id);
      }
    }

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      clearInterval(recoverTimer);
      for (const ch of channels) {
        void supabase.removeChannel(ch);
      }
    };
  }, [
    isLoggedIn,
    currentUserId,
    currentUser?.authId,
    collectSelfIds,
    CALL_TERMINAL_STATUSES,
  ]);

  // While in a call, poll call_logs for hangup + live coins_earned/spent (host badge on Vercel)
  useEffect(() => {
    if (!isLoggedIn || !activeCall?.id || !isSupabaseConfigured()) return;
    const callId = activeCall.id;
    let cancelled = false;

    const pollStatus = async () => {
      if (cancelled || isResettingRef.current) return;
      const cur = activeCallRef.current;
      if (!cur || cur.id !== callId) return;
      try {
        const { data, error } = await supabase
          .from('call_logs')
          .select('status, coins_earned, coins_spent')
          .eq('id', callId)
          .maybeSingle();
        if (error || !data) return;
        const row = data as { status?: string; coins_earned?: number; coins_spent?: number };
        const st = String(row.status || '').toLowerCase();
        if (CALL_TERMINAL_STATUSES.has(st)) {
          closeCallFromRemoteRef.current({ callId, status: st });
          return;
        }
        if (cur.status !== 'active') return;
        const earned = Number(row.coins_earned);
        const spent = Number(row.coins_spent);
        if (!Number.isFinite(earned) && !Number.isFinite(spent)) return;
        setActiveCall((prev) => {
          if (!prev || prev.id !== callId || prev.status !== 'active') return prev;
          const nextEarned =
            Number.isFinite(earned) ? Math.max(prev.coinsEarned || 0, earned) : prev.coinsEarned;
          const nextSpent =
            Number.isFinite(spent) ? Math.max(prev.coinsSpent || 0, spent) : prev.coinsSpent;
          if (nextEarned === prev.coinsEarned && nextSpent === prev.coinsSpent) return prev;
          const next = { ...prev, coinsEarned: nextEarned, coinsSpent: nextSpent };
          activeCallRef.current = next;
          return next;
        });
      } catch (e) {
        console.warn('[call] end-status poll failed', e);
      }
    };

    void pollStatus();
    const timer = setInterval(() => void pollStatus(), 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isLoggedIn, activeCall?.id, activeCall?.status, CALL_TERMINAL_STATUSES]);

  // Keep host/user call logs fresh (missed / completed) without relying on WS fanout
  useEffect(() => {
    if (!isLoggedIn || !currentUserId || !isSupabaseConfigured()) return;
    const tick = () => {
      void refreshCallLogsFromDbRef.current();
    };
    const timer = setInterval(tick, 12000);
    return () => clearInterval(timer);
  }, [isLoggedIn, currentUserId]);

  /** Scoped call-log hydrate for Vercel refresh (Redis stays for presence; Supabase for rows). */
  const refreshCallLogsFromDb = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const uid = String(currentUserIdRef.current || '').trim();
    if (!uid) return;
    const me = usersRef.current.find((u) => u.id === uid || u.authId === uid);
    const role = me?.role;
    const needsPlatformLogs =
      role === 'admin' || role === 'team_leader' || role === 'agency_manager';
    try {
      const logs = await fetchCallLogsFromSupabase({
        userId: needsPlatformLogs ? undefined : uid,
        limit: role === 'admin' ? 500 : needsPlatformLogs ? 300 : 100,
      });
      if (Array.isArray(logs)) setCallLogs(logs);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshCallLogsFromDbRef.current = refreshCallLogsFromDb;
  }, [refreshCallLogsFromDb]);

  // Unified helper to calculate effective coin burn rate per minute for any host/caller pair
  const getEffectiveCallRate = (hostId?: string, callerId?: string): number => {
    if (!hostId) {
      return systemSettings.coinBurnRatePerMin ?? DEFAULT_COIN_BURN_RATE_PER_MIN;
    }

    // Determine if the caller and host have an active, accepted friendship
    let isFriendPair = false;
    if (callerId && hostId) {
      const activeReq = friendRequests.find(
        (r) =>
          r.status === 'accepted' &&
          ((r.senderId === callerId && r.receiverId === hostId) ||
            (r.senderId === hostId && r.receiverId === callerId))
      );
      if (activeReq) {
        isFriendPair = true;
      }
    } else if (hostId) {
      isFriendPair = isFriend(hostId);
    }

    if (isFriendPair) {
      return systemSettings.coinBurnRateFriendPerMin ?? DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN;
    }
    return systemSettings.coinBurnRatePerMin ?? DEFAULT_COIN_BURN_RATE_PER_MIN;
  };

  // Live user directory sync (DiscoveryGrid, Admin, mount).
  // Prefer union of: service-role /api/users (authoritative on Vercel) + RLS Supabase read + local session.
  const syncUsersFromSupabase = async (showNotification: boolean = false): Promise<{
    success: boolean;
    count: number;
    users?: UserProfile[];
  }> => {
    try {
      // Refresh + Discovery remount often fire back-to-back; skip if we just synced.
      if (!showNotification) {
        const elapsed = Date.now() - lastDirectorySyncAtRef.current;
        if (
          lastDirectorySyncAtRef.current > 0 &&
          elapsed < 60_000 &&
          usersRef.current.length > 0
        ) {
          return {
            success: true,
            count: usersRef.current.length,
            users: usersRef.current,
          };
        }
      }

      // Backend directory (service role) — cursor pages of 50 (never unbounded)
      let apiUsers: UserProfile[] | null = null;
      try {
        const collected: UserProfile[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < 10; page++) {
          const qs = new URLSearchParams({ limit: '50' });
          if (cursor) qs.set('cursor', cursor);
          const res = await authFetch(`/api/users?${qs.toString()}`);
          if (!res.ok) {
            console.warn('[syncUsersFromSupabase] /api/users HTTP', res.status);
            break;
          }
          const data = await res.json().catch(() => ({}));
          if (!data?.success || !Array.isArray(data.users)) break;
          collected.push(...(data.users as UserProfile[]));
          cursor = typeof data.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null;
          if (!cursor) break;
        }
        if (collected.length) apiUsers = collected;
      } catch (apiErr: any) {
        console.warn('[syncUsersFromSupabase] /api/users failed:', apiErr?.message || apiErr);
      }

      let supabaseProfiles: UserProfile[] | null = null;
      if (isSupabaseConfigured()) {
        supabaseProfiles = await fetchProfilesFromSupabase();
      }

      const remoteProfiles: UserProfile[] = [];
      const seenIds = new Set<string>();
      // API first (complete directory), then Supabase rows not already present
      for (const p of apiUsers || []) {
        if (!p?.id || deletedUserIdsRef.current.has(p.id) || seenIds.has(p.id)) continue;
        seenIds.add(p.id);
        remoteProfiles.push(p);
      }
      for (const p of supabaseProfiles || []) {
        if (!p?.id || deletedUserIdsRef.current.has(p.id) || seenIds.has(p.id)) continue;
        seenIds.add(p.id);
        remoteProfiles.push(p);
      }

      if (remoteProfiles.length > 0 || supabaseProfiles !== null || apiUsers !== null) {
          // Merge remote directory with local users so session user is never wiped
          const localUsers = usersRef.current && usersRef.current.length > 0 ? usersRef.current : [];
          const mergedMap = new Map<string, UserProfile>();
          const emailMap = new Map<string, string>(); // lowercase email -> profileId

          // Add remote profiles first (strictly preserving live in-memory presence and active user edits)
          remoteProfiles.forEach((p) => {
            if (deletedUserIdsRef.current.has(p.id)) {
              return;
            }
            const localUser = localUsers.find(
              (u) =>
                u.id === p.id ||
                (p.email && u.email && u.email.toLowerCase().trim() === p.email.toLowerCase().trim())
            );
            const isCurrentLoggedIn =
              localUser &&
              (localUser.id === currentUserIdRef.current ||
                (localUser.email && p.email && localUser.email.toLowerCase().trim() === p.email.toLowerCase().trim()));

            if (isCurrentLoggedIn && localUser) {
              // Preserve active logged-in user's profile and location state so background sync never reverts local edits
              const isDisplayableGalleryPhoto = (url: string) => {
                const u = String(url || '').trim();
                if (!u) return false;
                if (u.startsWith('__mc_gv1__:')) return false;
                if (u.startsWith('blob:') || u.startsWith('data:')) return false;
                return (
                  u.startsWith('http://') ||
                  u.startsWith('https://') ||
                  u.startsWith('/api/storage/media')
                );
              };
              const mergePhotoGalleries = (localG?: string[], remoteG?: string[]) => {
                const local = Array.isArray(localG) ? localG : [];
                const remote = Array.isArray(remoteG) ? remoteG : [];
                if (!local.length) return remote.filter(isDisplayableGalleryPhoto);
                if (!remote.length) return local.filter(isDisplayableGalleryPhoto);
                const seen = new Set<string>();
                const out: string[] = [];
                for (const url of [...remote, ...local]) {
                  const u = String(url || '').trim();
                  if (!isDisplayableGalleryPhoto(u) || seen.has(u)) continue;
                  seen.add(u);
                  out.push(u);
                }
                return out;
              };
              const mergeVideoGalleries = (
                localV?: UserProfile['galleryVideos'],
                remoteV?: UserProfile['galleryVideos']
              ) => {
                const local = Array.isArray(localV) ? localV : [];
                const remote = Array.isArray(remoteV) ? remoteV : [];
                if (!local.length) return remote;
                if (!remote.length) return local;
                const map = new Map<string, NonNullable<UserProfile['galleryVideos']>[number]>();
                const keyOf = (v: NonNullable<UserProfile['galleryVideos']>[number]) =>
                  String(v.storageKey || v.url || '').trim();
                for (const v of remote) {
                  const k = keyOf(v);
                  if (k) map.set(k, v);
                }
                for (const v of local) {
                  const k = keyOf(v);
                  if (k) map.set(k, v);
                }
                return Array.from(map.values());
              };
              mergedMap.set(p.id, {
                ...p,
                name: localUser.name || p.name,
                nationality: localUser.nationality || p.nationality,
                countryCode: (localUser.countryCode || p.countryCode || 'US').toUpperCase(),
                locationCity: localUser.locationCity || p.locationCity,
                bio: localUser.bio !== undefined ? localUser.bio : p.bio,
                extendedBio: localUser.extendedBio !== undefined ? localUser.extendedBio : p.extendedBio,
                avatarUrl: localUser.avatarUrl || p.avatarUrl,
                zodiac: localUser.zodiac || p.zodiac,
                spokenLanguages: localUser.spokenLanguages || p.spokenLanguages,
                interests: localUser.interests || p.interests,
                gallery: mergePhotoGalleries(localUser.gallery, p.gallery),
                galleryVideos: mergeVideoGalleries(localUser.galleryVideos, p.galleryVideos),
                exactLocation: localUser.exactLocation || p.exactLocation,
                allowMockLocation: localUser.allowMockLocation ?? p.allowMockLocation,
                isUsingMockLocation: localUser.isUsingMockLocation ?? p.isUsingMockLocation,
                mockLocationCity: localUser.mockLocationCity ?? p.mockLocationCity,
                mockLocationCountry: localUser.mockLocationCountry ?? p.mockLocationCountry,
                mockLocationCountryCode: localUser.mockLocationCountryCode ?? p.mockLocationCountryCode,
                onlineStatus: localUser.onlineStatus || 'offline',
              });
            } else {
              const liveStatus = localUser
                ? localUser.onlineStatus || 'offline'
                : p.onlineStatus === 'busy' || p.onlineStatus === 'in_call'
                  ? 'online'
                  : p.onlineStatus || 'offline';
              mergedMap.set(p.id, {
                ...p,
                // Prefer a non-empty remote avatar so discovery cards never stay blank after sync
                avatarUrl: (p.avatarUrl && String(p.avatarUrl).trim()) || localUser?.avatarUrl || p.avatarUrl,
                onlineStatus: liveStatus,
              });
            }
            if (p.email) {
              emailMap.set(p.email.toLowerCase().trim(), p.id);
            }
          });

          // Check if there is already an admin profile from Supabase
          const hasSupabaseAdmin = Array.from(mergedMap.values()).some((u) => u.role === 'admin');

            // Preserve any custom newly registered local profiles not yet in Supabase
          // NEVER re-upsert deleted users (that resurrected deleted Discovery profiles).
          localUsers.forEach((lu) => {
            if (deletedUserIdsRef.current.has(lu.id)) {
              return;
            }

            const cleanEmail = lu.email ? lu.email.toLowerCase().trim() : null;

            // If a profile with the same email already exists, merge fields without creating duplicate
            if (cleanEmail && emailMap.has(cleanEmail)) {
              const existingId = emailMap.get(cleanEmail)!;
              if (deletedUserIdsRef.current.has(existingId)) {
                return;
              }
              const existing = mergedMap.get(existingId);
              if (existing) {
                mergedMap.set(existingId, {
                  ...existing,
                  teamLeaderId: existing.teamLeaderId || lu.teamLeaderId,
                  createdById: existing.createdById || lu.createdById,
                  agencyName: existing.agencyName || lu.agencyName,
                  coinEarnOverrideRate: existing.coinEarnOverrideRate ?? lu.coinEarnOverrideRate,
                  commissionPercent: existing.commissionPercent ?? lu.commissionPercent,
                  teamLeaderNote: existing.teamLeaderNote || lu.teamLeaderNote,
                  hasPasswordSet: lu.hasPasswordSet || existing.hasPasswordSet,
                });
              }
              return;
            }

            // Skip legacy mock placeholder admin IDs if a real admin exists
            if (
              (lu.id === 'admin_user' || lu.id === '00000000-0000-0000-0000-000000000001') &&
              hasSupabaseAdmin
            ) {
              return;
            }

            // Local-only profiles missing from Supabase: keep in memory for the current
            // session user only. Do NOT upsert — that recreates admin-deleted accounts.
            if (!mergedMap.has(lu.id)) {
              const isCurrent =
                lu.id === currentUserIdRef.current ||
                (cleanEmail &&
                  usersRef.current
                    .find((u) => u.id === currentUserIdRef.current)
                    ?.email?.toLowerCase()
                    .trim() === cleanEmail);
              if (isCurrent) {
                mergedMap.set(lu.id, lu);
                if (cleanEmail) {
                  emailMap.set(cleanEmail, lu.id);
                }
              }
            }
          });

          // Drop any previously deleted IDs that somehow lingered in merge
          for (const deletedId of deletedUserIdsRef.current) {
            mergedMap.delete(deletedId);
          }

          const finalProfiles = (
            mergedMap.size > 0 ? Array.from(mergedMap.values()) : remoteProfiles
          ).map((p) => overlayPendingSelfProfile(p));

          // Never wipe a non-empty in-memory directory with an empty remote result
          if (finalProfiles.length === 0 && localUsers.length > 0) {
            if (showNotification) {
              showToast(
                'Directory unchanged',
                'No remote profiles returned; keeping your current session directory.',
                'info'
              );
            }
            return { success: true, count: localUsers.length, users: localUsers };
          }

          setUsers(finalProfiles);
          usersRef.current = finalProfiles;
          lastDirectorySyncAtRef.current = Date.now();

          // Heavy POST — only on manual sync or admin (skip every Vercel refresh).
          const role = usersRef.current.find(
            (u) => u.id === currentUserIdRef.current || u.authId === currentUserIdRef.current
          )?.role;
          if (showNotification || role === 'admin') {
            authFetch('/api/users/sync-all', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ users: finalProfiles, overwrite: true }),
            }).catch((e) => console.warn('Server memory sync notice:', e));
          }

          if (showNotification) {
            showToast(
              'Directory Synchronized',
              `Loaded ${finalProfiles.length} profiles for discovery.`,
              'success'
            );
          }
          return { success: true, count: finalProfiles.length, users: finalProfiles };
      }

      return { success: false, count: 0 };
    } catch (e: any) {
      console.warn('Sync from Supabase notice:', e);
      if (showNotification) {
        showToast('Sync Notice', e.message || 'Could not reach Supabase database.', 'warning');
      }
      return { success: false, count: 0 };
    }
  };

  // Granular Reset: Selective or Full Wipe of Application & Storage State
  const resetMockDataGranular = async (options: ResetDataOptions): Promise<ResetResult> => {
    if (isResettingRef.current) {
      return {
        success: false,
        categoriesCleared: [],
        summary: 'Reset is already in progress.',
      };
    }

    isResettingRef.current = true;
    setIsResetting(true);

    try {
      const categoriesCleared: string[] = [];
      let currentUsersList = [...users];

      // 1. Users & Accounts — never treat "all female/male" as mock demo roster.
      // User deletion is clearAllUsers (all non-admin) only, enforced server-side behind ALLOW_FACTORY_RESET.
      const adminDefault = currentUsersList.find((u) => u.role === 'admin') || DEFAULT_ADMIN_USER;

      const idsToRemove: string[] = [];

      if (options.customUsers) {
        const nonAdminIds = currentUsersList.filter((u) => u.role !== 'admin').map((u) => u.id);
        idsToRemove.push(...nonAdminIds);
        categoriesCleared.push('All Non-Admin Users');
      }

      if (options.teamLeaderAgencies) {
        const teamLeaderIds = currentUsersList
          .filter((u) => u.role === 'team_leader' || u.role === 'agency_manager' || Boolean(u.teamLeaderId))
          .map((u) => u.id);
        idsToRemove.push(...teamLeaderIds);
        if (teamLeaderIds.length > 0) {
          categoriesCleared.push('Agency Data');
        }
      }

      // Server/database purge must succeed before local UI state is wiped.
      // Previously a 401 (no Auth JWT) was ignored, the UI reported success, then reload restored Supabase data.
      if (options.syncWithServer !== false) {
        const sessionRes = await supabase.auth.getSession();
        const accessToken = sessionRes.data.session?.access_token;
        if (!accessToken) {
          throw new Error(
            'Reset requires a live admin sign-in session. Sign out, sign in again, then retry Reset Data.'
          );
        }

        const resetRes = await authFetch('/api/admin/granular-reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            clearMockUsers: false,
            clearAllUsers: Boolean(options.customUsers),
            clearAdmin: Boolean(options.adminAccount),
            clearActiveCalls: Boolean(options.surveillanceLogs || options.callLogs || options.customUsers),
            clearPresence: true,
            mockIds: options.customUsers ? [] : idsToRemove,
            chatMessages: Boolean(options.chatMessages),
            callLogs: Boolean(options.callLogs || options.quickMatchQueues),
            friendRequests: Boolean(options.friendRequests || options.friendsList),
            payoutRequests: Boolean(options.payoutRequests),
            moderationReports: Boolean(options.surveillanceLogs || options.taxonomiesAndFlags),
            feedPosts: Boolean(options.feedPosts),
            favorites: Boolean(options.favoritesList),
            blockedUsers: Boolean(options.blockedList),
            homeBanners: Boolean(options.homeBanners),
            homeQuickLinks: Boolean(options.quickLinks),
            cmsPolicies: Boolean(options.policyDocuments),
            systemSettings: Boolean(options.systemSettings),
            coinPackages: Boolean(options.coinPackages),
            virtualGiftsCatalog: Boolean(options.virtualGiftsCatalog),
            creatorGoals: Boolean(options.creatorGoals),
            creatorAnalytics: Boolean(options.creatorAnalytics),
            creatorReviews: Boolean(options.creatorReviews),
            dailyRewardsAndQuests: Boolean(options.dailyRewardsAndQuests),
            taxonomiesAndFlags: Boolean(options.taxonomiesAndFlags),
            walletLedger: Boolean(
              options.walletLedger ||
                options.userCoins ||
                options.creatorEarnings ||
                options.callLogs ||
                options.customUsers
            ),
            purgeR2MediaStorage: Boolean(options.profilesMedia || options.r2PurgeAllUploads),
            purgeAllR2Uploads: Boolean(options.r2PurgeAllUploads),
            resetBalances: {
              callerCoins: Boolean(options.userCoins),
              creatorEarnings: Boolean(options.creatorEarnings),
            },
          }),
        });

        const resetJson = await resetRes.json().catch(() => ({} as any));
        if (!resetRes.ok || resetJson?.success === false) {
          const rawError = resetJson?.error;
          const code = typeof rawError === 'object' ? rawError?.code : undefined;
          if (code === 'FACTORY_RESET_DISABLED' || resetRes.status === 403) {
            throw new Error(
              'Factory / destructive data reset is disabled. Set ALLOW_FACTORY_RESET=true in Vercel Environment Variables (or local .env), redeploy/restart, run the wipe, then disable it again.'
            );
          }
          const message =
            (typeof rawError === 'string' && rawError) ||
            rawError?.message ||
            `Reset API failed (${resetRes.status}).`;
          throw new Error(message);
        }

        const serverWarnings: string[] = Array.isArray(resetJson?.warnings)
          ? resetJson.warnings.map((w: unknown) => String(w || '').trim()).filter(Boolean)
          : [];
        const r2WasRequested = Boolean(resetJson?.r2PurgeRequested || options.r2PurgeAllUploads);
        const r2WasPurged = resetJson?.r2Purged === true;
        if (r2WasRequested && !r2WasPurged) {
          const r2Note =
            serverWarnings.find((w) => /R2/i.test(w)) ||
            'R2 media was NOT deleted (database-only reset on Vercel).';
          showToast('R2 media not deleted', r2Note, 'warning');
        }

        // Tombstone wiped users so Discovery sync cannot resurrect them this session
        if (options.customUsers) {
          for (const id of idsToRemove) deletedUserIdsRef.current.add(id);
          for (const u of usersRef.current) {
            if (u.role !== 'admin') deletedUserIdsRef.current.add(u.id);
          }
        } else {
          for (const id of idsToRemove) deletedUserIdsRef.current.add(id);
        }
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).removeAllChannels?.();
      } catch {}
      try {
        wsRef.current?.close();
      } catch {}

      if (idsToRemove.length > 0) {
        const removeSet = new Set(idsToRemove);
        currentUsersList = currentUsersList.filter((u) => !removeSet.has(u.id));
      }

      if (options.adminAccount) {
        const adminIndex = currentUsersList.findIndex((u) => u.role === 'admin' || u.id === 'admin_user');
        if (adminIndex >= 0) {
          const existing = currentUsersList[adminIndex];
          // Profile fields only — never restore a weak password or inflate coin balance
          const { password: _discardPassword, ...adminSafe } = { ...adminDefault } as UserProfile & { password?: string };
          currentUsersList[adminIndex] = {
            ...existing,
            ...adminSafe,
            id: existing.id,
            email: existing.email,
            coinBalance: existing.coinBalance,
            password: undefined,
          };
        }
        categoriesCleared.push('Admin Profile Fields (password unchanged)');
      }

      // 2. Profiles & Media (local UI URLs only — remote R2 objects are not deleted on Vercel)
      if (options.profilesMedia) {
        currentUsersList = currentUsersList.map((u) => {
          return {
            ...u,
            avatarUrl: DEFAULT_FALLBACK_USER.avatarUrl,
            gallery: [],
            galleryVideos: [],
            verificationVideoUrl: undefined,
            introVideoUrl: undefined,
            isUsingMockLocation: false,
            mockLocationCity: undefined,
            mockLocationCountry: undefined,
          };
        });
        categoriesCleared.push('Profiles & Media (local URLs cleared; R2 objects retained)');
      }
      if (options.r2PurgeAllUploads) {
        categoriesCleared.push('R2 purge requested but NOT executed on Vercel');
      }

      // 3. Coins & Wallet Balances
      if (options.userCoins) {
        currentUsersList = currentUsersList.map((u) =>
          u.role === 'male_user' ? { ...u, coinBalance: 0 } : u
        );
        categoriesCleared.push('Caller Coins');
      }
      if (options.creatorEarnings) {
        currentUsersList = currentUsersList.map((u) =>
          u.role === 'female_creator'
            ? { ...u, earningsCoins: 0, totalLifetimeEarnedUSD: 0, totalCallsHosted: 0, totalCallMinutes: 0 }
            : u
        );
        categoriesCleared.push('Creator Earnings');
      }

      // Ensure at least admin exists if all users were wiped (no password backdoor)
      if (currentUsersList.length === 0) {
        const { password: _discard, ...adminSafe } = { ...adminDefault } as UserProfile & { password?: string };
        currentUsersList = [{ ...adminSafe, coinBalance: adminSafe.coinBalance ?? 0 }];
      }

      // If current user was removed, switch to admin or next available user
      const isCurrentUserStillPresent = currentUsersList.some((u) => u.id === currentUserId);
      if (!isCurrentUserStillPresent) {
        const nextUser = currentUsersList.find((u) => u.role === 'admin') || currentUsersList[0];
        setCurrentUserId(nextUser.id);
        localStorage.setItem('livecall_current_user_id', nextUser.id);
      }

      // Save users to state & localStorage
      setUsers(currentUsersList);
      usersRef.current = currentUsersList;

      // 4. Transactions & Store
      if (options.payoutRequests) {
        setPayoutRequests([]);
        localStorage.removeItem('livecall_payouts');
        categoriesCleared.push('Payout Requests');
      }
      if (options.coinPackages) {
        setCoinPackages(INITIAL_COIN_PACKAGES);
        localStorage.setItem('livecall_packages', JSON.stringify(INITIAL_COIN_PACKAGES));
        categoriesCleared.push('Coin Store Packages');
      }

      if (options.virtualGiftsCatalog) {
        setVirtualGifts(VIRTUAL_GIFTS);
        localStorage.setItem('livecall_virtual_gifts', JSON.stringify(VIRTUAL_GIFTS));
        categoriesCleared.push('Virtual Gifts Catalog');
      }

      // 5. Chats & Social
      if (options.chatMessages) {
        setChatMessages([]);
        setReadMessageIds([]);
        localStorage.removeItem('livecall_chat');
        localStorage.removeItem('livecall_read_message_ids');
        categoriesCleared.push('Chat Messages');
      }
      if (options.friendRequests || options.friendsList) {
        setFriendRequests([]);
        localStorage.removeItem('livecall_friend_requests');
        if (options.friendRequests) {
          categoriesCleared.push('Friend Requests');
        }
      }
      if (options.friendsList) {
        setFriends([]);
        localStorage.removeItem('livecall_friends');
        categoriesCleared.push('Friends List');
      }
      if (options.favoritesList) {
        setFavorites([]);
        localStorage.removeItem('livecall_favorites');
        categoriesCleared.push('Favorites');
      }
      if (options.blockedList) {
        setBlockedUserIds([]);
        setBlockedByUserIds([]);
        localStorage.removeItem('livecall_blocked');
        categoriesCleared.push('Blocked Users');
      }

      // 6. Matches & Activity Calls
      if (options.callLogs || options.quickMatchQueues) {
        setCallLogs([]);
        localStorage.removeItem('livecall_call_logs');
        categoriesCleared.push('Call History Logs');
      }
      if (options.quickMatchQueues) {
        setQuickMatches([]);
        localStorage.removeItem('livecall_quick_matches_sync');
        localStorage.removeItem('livecall_quick_match_callers_sync');
        localStorage.removeItem('livecall_quick_match_caller_connected_sync');
        try {
          const uid = currentUserIdRef.current;
          if (uid) {
            localStorage.removeItem('livecall_quick_matches_v4_' + uid);
          }
        } catch {}
        categoriesCleared.push('QuickMatch Queues');
      }
      if (options.liveHostsPool) {
        setLiveHostIds([]);
        localStorage.removeItem('livecall_live_host_ids_v2');
        categoriesCleared.push('Live Hosts Pool');
      }
      if (options.surveillanceLogs) {
        setIncidentEvidenceLogs([]);
        setAdminActiveCalls([]);
        localStorage.removeItem('livecall_incident_logs');
        localStorage.removeItem('livecall_admin_active_calls');
        categoriesCleared.push('Surveillance Evidence');
      }

      // 7. Feed & Community
      if (options.feedPosts) {
        setFeedPosts([]);
        localStorage.removeItem('livecall_posts');
        categoriesCleared.push('Feed Moments');
      }
      if (options.creatorGoals) {
        setCreatorGoals({});
        categoriesCleared.push('Creator Goals');
      }

      if (options.creatorReviews) {
        setCreatorReviews([]);
        localStorage.removeItem('livecall_creator_reviews');
        categoriesCleared.push('Creator Reviews & Feedback');
      }

      if (options.creatorAnalytics) {
        setCreatorMetricsMap({});
        categoriesCleared.push('Creator Analytics & Metrics');
      }

      if (options.dailyRewardsAndQuests) {
        setDailyBonusClaimed(false);
        setDailyRewardRecord(null);
        categoriesCleared.push('Daily Rewards & Quests');
      }

      // 8. CMS & Settings
      if (options.taxonomiesAndFlags) {
        setSystemSettings(INITIAL_SYSTEM_SETTINGS);
        localStorage.setItem('livecall_settings', JSON.stringify(INITIAL_SYSTEM_SETTINGS));
        if (!options.systemSettings) {
          categoriesCleared.push('Taxonomies, Tags & Moderation Flags');
        }
      }
      if (options.homeBanners || options.policyDocuments || options.quickLinks) {
        try {
          const payload: Record<string, unknown> = {};
          if (options.homeBanners) payload.banners = INITIAL_HOME_BANNERS;
          if (options.policyDocuments) payload.policies = INITIAL_POLICY_DOCUMENTS;
          if (options.quickLinks) payload.quickLinks = INITIAL_HOME_QUICK_LINKS;
          const seedRes = await authFetch('/api/admin/cms/seed-defaults', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const seedData = await seedRes.json().catch(() => ({}));
          if (seedRes.ok && seedData.success && seedData.data) {
            if (options.homeBanners && seedData.data.banners) {
              setHomeBanners(seedData.data.banners);
              categoriesCleared.push('Home Banners');
            }
            if (options.policyDocuments && seedData.data.policies) {
              setPolicyDocuments(seedData.data.policies);
              categoriesCleared.push('Policy Documents');
            }
            if (options.quickLinks && seedData.data.quickLinks) {
              setHomeQuickLinks(seedData.data.quickLinks);
              categoriesCleared.push('Quick Links');
            }
            localStorage.removeItem('livecall_home_banners');
            localStorage.removeItem('livecall_policy_documents');
            localStorage.removeItem('livecall_home_quick_links');
          } else {
            console.warn('CMS seed during reset failed:', seedData.error);
          }
        } catch (e) {
          console.warn('CMS seed during reset exception:', e);
        }
      }
      if (options.systemSettings) {
        setSystemSettings(INITIAL_SYSTEM_SETTINGS);
        localStorage.setItem('livecall_settings', JSON.stringify(INITIAL_SYSTEM_SETTINGS));
        categoriesCleared.push('System Settings');
      }

      // 9. Sync remaining in-memory users with the Node server after a successful database reset
      if (options.syncWithServer !== false) {
        try {
          await authFetch('/api/users/sync-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ users: currentUsersList, overwrite: true }),
          });
        } catch (e) {
          console.warn('Server memory sync warning during granular reset:', e);
        }
      }

      // 10. Sync with Supabase (disabled): destructive purges must be server-side only.
      if (false && options.syncWithSupabase && isSupabaseConfigured()) {
        try {
          const promises: Promise<any>[] = [];

          if (options.chatMessages) {
            promises.push(purgeMessagesFromSupabase());
          }
          if (options.callLogs) {
            promises.push(purgeCallLogsFromSupabase());
          }
          if (options.callLogs || options.liveHostsPool) {
            promises.push(purgeMatchesFromSupabase());
          }
          if (options.friendRequests || options.friendsList) {
            promises.push(purgeFriendRequestsFromSupabase());
          }
          if (options.payoutRequests) {
            promises.push(purgePayoutRequestsFromSupabase());
          }
          if (options.surveillanceLogs) {
            promises.push(purgeModerationReportsFromSupabase());
          }
          if (options.feedPosts) {
            promises.push(purgeFeedPostsFromSupabase());
          }
          if (options.favoritesList) {
            promises.push(purgeFavoritesFromSupabase());
          }
          if (options.blockedList) {
            promises.push(purgeBlockedUsersFromSupabase());
          }
          if (options.creatorGoals) {
            promises.push(purgeCreatorGoalsFromSupabase());
          }
          if (options.userCoins) {
            promises.push(resetFinancialBalancesInSupabase('caller_coins'));
          }
          if (options.creatorEarnings) {
            promises.push(resetFinancialBalancesInSupabase('creator_earnings'));
          }

          // Await relation table purges first before deleting profiles to prevent FK constraint violations
          await Promise.allSettled(promises);

          if (idsToRemove.length > 0) {
            await purgeMockProfilesFromSupabase(idsToRemove);
          } else if (options.customUsers) {
            await purgeAllProfilesFromSupabase(true);
          }
        } catch (e) {
          console.warn('Supabase sync warning during granular reset:', e);
        }
      }

      const summaryText = categoriesCleared.length > 0
        ? `Successfully reset: ${categoriesCleared.join(', ')}.`
        : 'No categories were selected for reset.';

      showToast('Data Reset Applied 🧹', summaryText, 'success');

      if (options.clientStoragePurge) {
        try {
          await signOutSupabase();
        } catch {}
        try {
          localStorage.clear();
        } catch {}
        try {
          sessionStorage.clear();
        } catch {}
        try {
          // Best-effort cookie cleanup (can't guarantee host-level cookies in all browsers)
          document.cookie.split(';').forEach((c) => {
            const [name] = c.trim().split('=');
            if (!name) return;
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
          });
        } catch {}
      }

      // Hard reload prevents realtime listeners and in-memory caches from repopulating during/after reset.
      try {
        isResettingRef.current = false;
        setIsResetting(false);
        window.location.href = '/';
      } catch {}

      return {
        success: true,
        categoriesCleared,
        summary: summaryText,
      };
    } catch (err: any) {
      isResettingRef.current = false;
      setIsResetting(false);
      showToast('Reset Error', err.message || 'Failed to complete data reset.', 'error');
      return {
        success: false,
        categoriesCleared: [],
        summary: 'Error during reset',
        error: err.message,
      };
    }
  };

  // Full Wipe: Resets all mock data categories across storage and runtime
  const purgeAllMockData = async (): Promise<{
    success: boolean;
    deletedCount: number;
    message: string;
  }> => {
    const result = await resetMockDataGranular({
      mockFemaleCreators: false,
      mockMaleCallers: false,
      adminAccount: false,
      customUsers: true,
      profilesMedia: true,
      userCoins: true,
      creatorEarnings: true,
      payoutRequests: true,
      coinPackages: true,
      chatMessages: true,
      friendRequests: true,
      friendsList: true,
      favoritesList: true,
      blockedList: true,
      callLogs: true,
      liveHostsPool: true,
      surveillanceLogs: true,
      feedPosts: true,
      creatorGoals: true,
      homeBanners: true,
      policyDocuments: true,
      quickLinks: true,
      systemSettings: true,
      syncWithSupabase: isSupabaseConfigured(),
      syncWithServer: true,
    });

    return {
      success: result.success,
      deletedCount: result.categoriesCleared.length,
      message: result.summary,
    };
  };

  // Sync / seed all user profiles to Supabase on demand
  const syncAllProfilesToSupabase = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    try {
      const profilesToSync = usersRef.current && usersRef.current.length > 0 ? usersRef.current : (currentUser ? [currentUser] : [DEFAULT_ADMIN_USER]);
      const res = await bulkUpsertProfilesToSupabase(profilesToSync);
      if (res.success) {
        showToast('Supabase Synced 🟢', `Successfully populated ${res.count} profiles into Supabase database!`, 'success');
      } else {
        showToast('Supabase Sync Failed', res.error || 'Failed to sync profiles to Supabase.', 'error');
      }
      return res;
    } catch (err: any) {
      showToast('Supabase Sync Error', err.message || 'Exception during bulk upsert.', 'error');
      return { success: false, count: 0, error: err.message };
    }
  };

  // Realtime Supabase Profiles Listener: Instant multi-device registration & update sync
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const unsubscribe = subscribeToRealtimeProfiles((event) => {
      try {
        if (event.eventType === 'DELETE') {
          if (event.userId) {
            setUsers((prev) => prev.filter((u) => u.id !== event.userId));
          }
        } else if (event.profile) {
          const liveProfile = event.profile;
          const liveEmail = liveProfile.email ? liveProfile.email.toLowerCase().trim() : null;
          setUsers((prev) => {
            const exists = prev.some(
              (u) =>
                u.id === liveProfile.id ||
                (liveProfile.authId && (u.authId === liveProfile.authId || u.id === liveProfile.authId)) ||
                (liveEmail && u.email && u.email.toLowerCase().trim() === liveEmail)
            );
            if (exists) {
              return prev.map((u) => {
                const isMatch =
                  u.id === liveProfile.id ||
                  (liveProfile.authId && (u.authId === liveProfile.authId || u.id === liveProfile.authId)) ||
                  (liveEmail && u.email && u.email.toLowerCase().trim() === liveEmail);
                if (!isMatch) return u;
                const isSelf = isSelfProfileRow(u);
                const incomingVideos = Array.isArray(liveProfile.galleryVideos)
                  ? liveProfile.galleryVideos
                  : [];
                const localVideos = Array.isArray(u.galleryVideos) ? u.galleryVideos : [];
                const videoKey = (v: { storageKey?: string; url?: string }) =>
                  String(v.storageKey || v.url || '').trim();
                const mergedVideos = (() => {
                  if (!localVideos.length) return incomingVideos;
                  if (!incomingVideos.length) return localVideos;
                  const map = new Map<string, (typeof localVideos)[number]>();
                  for (const v of incomingVideos) {
                    const k = videoKey(v);
                    if (k) map.set(k, v);
                  }
                  for (const v of localVideos) {
                    const k = videoKey(v);
                    if (k) map.set(k, v);
                  }
                  return Array.from(map.values());
                })();
                const incomingPhotos = Array.isArray(liveProfile.gallery) ? liveProfile.gallery : [];
                const localPhotos = Array.isArray(u.gallery) ? u.gallery : [];
                const isDisplayableGalleryPhoto = (url: string) => {
                  const s = String(url || '').trim();
                  if (!s || s.startsWith('__mc_gv1__:') || s.startsWith('blob:') || s.startsWith('data:')) {
                    return false;
                  }
                  return (
                    s.startsWith('http://') ||
                    s.startsWith('https://') ||
                    s.startsWith('/api/storage/media')
                  );
                };
                const mergedPhotos = (() => {
                  if (!localPhotos.length) return incomingPhotos.filter(isDisplayableGalleryPhoto);
                  if (!incomingPhotos.length) return localPhotos.filter(isDisplayableGalleryPhoto);
                  const seen = new Set<string>();
                  const out: string[] = [];
                  for (const url of [...incomingPhotos, ...localPhotos]) {
                    const s = String(url || '').trim();
                    if (!isDisplayableGalleryPhoto(s) || seen.has(s)) continue;
                    seen.add(s);
                    out.push(s);
                  }
                  return out;
                })();
                const merged = {
                  ...u,
                  ...liveProfile,
                  id: u.id === currentUserIdRef.current ? u.id : liveProfile.id || u.id,
                  coinBalance:
                    liveProfile.coinBalance !== undefined ? liveProfile.coinBalance : u.coinBalance,
                  earningsCoins:
                    liveProfile.earningsCoins !== undefined ? liveProfile.earningsCoins : u.earningsCoins,
                  // Union by key so a stale shorter remote list cannot drop just-uploaded media.
                  gallery: mergedPhotos,
                  galleryVideos: mergedVideos,
                  // Presence heartbeat owns onlineStatus — never re-stick Busy from raw DB
                  onlineStatus: u.onlineStatus || 'offline',
                };
                if (!isSelf) return merged;
                settlePendingFromIncoming(liveProfile, true);
                return overlayPendingSelfProfile(merged);
              });
            }
            return [
              {
                ...liveProfile,
                // New row: prefer non-busy until presence map confirms
                onlineStatus:
                  liveProfile.onlineStatus === 'busy' || liveProfile.onlineStatus === 'in_call'
                    ? 'online'
                    : liveProfile.onlineStatus || 'offline',
              },
              ...prev,
            ];
          });
        }
      } catch (err) {
        console.warn('Realtime Supabase profiles sync exception:', err);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId || !isSupabaseConfigured()) return;
    let cancelled = false;
    fetchRecentMessagesForUser(currentUserId)
      .then((msgs) => {
        if (!cancelled && msgs) {
          setChatMessages(msgs);
          setReadMessageIds(
            msgs.filter((m) => m.isRead || m.senderId === currentUserId).map((m) => m.id)
          );
        }
      })
      .catch((e) => console.warn('Supabase messages hydrate note:', e));
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    // One directory sync on boot (was duplicated: fetchUsersFromServer + syncUsersFromSupabase).
    void syncUsersFromSupabase(false);

    if (isSupabaseConfigured()) {
      // Call logs / payouts wait for auth — see logged-in hydrate effect below.

      fetchSystemConfigsFromSupabase()
        .then((data) => {
          if (data) {
            setSystemSettings((prev) => ({
              ...prev,
              coinBurnRatePerMin: data.coin_burn_rate_per_min ?? prev.coinBurnRatePerMin,
              coinBurnRateFriendPerMin: data.coin_burn_rate_friend_per_min ?? prev.coinBurnRateFriendPerMin,
              femaleHostSharePercent:
                data.female_host_share_percent ??
                prev.femaleHostSharePercent ??
                DEFAULT_FEMALE_HOST_SHARE_PERCENT,
              femaleHostTargetSharePercent:
                (data as any).female_host_target_share_percent ??
                prev.femaleHostTargetSharePercent ??
                DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
              teamLeaderSharePercent:
                data.team_leader_share_percent ??
                prev.teamLeaderSharePercent ??
                DEFAULT_TEAM_LEADER_SHARE_PERCENT,
              giftFemaleHostSharePercent:
                data.gift_female_host_share_percent ??
                prev.giftFemaleHostSharePercent ??
                DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
              giftTeamLeaderSharePercent:
                data.gift_team_leader_share_percent ??
                prev.giftTeamLeaderSharePercent ??
                DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
              enableVirtualGifts: data.enable_virtual_gifts !== undefined ? data.enable_virtual_gifts : (prev.enableVirtualGifts ?? true),
              femaleEarningRatePerMin: data.female_earning_rate_per_min ?? prev.femaleEarningRatePerMin,
              coinUsdPeg:
                (data as any).coin_usd_peg ??
                data.female_payout_ratio_usd ??
                data.coin_to_usd_ratio ??
                prev.coinUsdPeg,
              coinToUSDRatio:
                (data as any).coin_usd_peg ??
                data.coin_to_usd_ratio ??
                prev.coinToUSDRatio,
              femalePayoutRatioUSD:
                (data as any).coin_usd_peg ??
                data.female_payout_ratio_usd ??
                prev.femalePayoutRatioUSD,
              minPayoutThresholdUSD: data.min_payout_threshold_usd ?? prev.minPayoutThresholdUSD,
              aiNudityShieldEnabled: data.ai_nudity_shield_enabled !== undefined ? data.ai_nudity_shield_enabled : prev.aiNudityShieldEnabled,
              screenRecordingProtection: data.screen_recording_protection !== undefined ? data.screen_recording_protection : prev.screenRecordingProtection,
              freeDailyLoginCoins: Number.isFinite(Number((data as any).free_daily_login_coins))
                ? Math.max(0, Math.round(Number((data as any).free_daily_login_coins)))
                : prev.freeDailyLoginCoins,
              showDevPersonaBar: data.show_dev_persona_bar !== undefined ? data.show_dev_persona_bar : prev.showDevPersonaBar,
              // Prefer non-empty system_configs allow-lists over stale localStorage.
              // Empty DB arrays → undefined so getAllowed* shows the full catalog.
              allowedCountryCodes:
                Array.isArray(data.allowed_country_codes) && data.allowed_country_codes.length > 0
                  ? data.allowed_country_codes
                  : Array.isArray(data.allowed_country_codes)
                    ? undefined
                    : prev.allowedCountryCodes,
              allowedLanguages:
                Array.isArray((data as any).allowed_languages) && (data as any).allowed_languages.length > 0
                  ? (data as any).allowed_languages
                  : Array.isArray((data as any).allowed_languages)
                    ? undefined
                    : prev.allowedLanguages,
              allowedZodiacSigns:
                Array.isArray((data as any).allowed_zodiac_signs) && (data as any).allowed_zodiac_signs.length > 0
                  ? (data as any).allowed_zodiac_signs
                  : Array.isArray((data as any).allowed_zodiac_signs)
                    ? undefined
                    : prev.allowedZodiacSigns,
              allowedInterests:
                Array.isArray((data as any).allowed_interests) && (data as any).allowed_interests.length > 0
                  ? (data as any).allowed_interests
                  : Array.isArray((data as any).allowed_interests)
                    ? undefined
                    : prev.allowedInterests,
              flagSizes: (data as any).flag_sizes_json
                ? (typeof (data as any).flag_sizes_json === 'string'
                    ? JSON.parse((data as any).flag_sizes_json)
                    : (data as any).flag_sizes_json)
                : prev.flagSizes,
              discoveryCardLayout: (data as any).discovery_card_layout_json
                ? parseDiscoveryCardLayout((data as any).discovery_card_layout_json)
                : prev.discoveryCardLayout,
              creatorTargetCycle: (data as any).creator_target_cycle ?? prev.creatorTargetCycle,
              periodCloseUtcTime: (data as any).period_close_utc_time ?? prev.periodCloseUtcTime,
              financeCronCadence: (data as any).finance_cron_cadence ?? prev.financeCronCadence ?? 'daily',
              settlementEnabled: (data as any).settlement_enabled !== undefined ? (data as any).settlement_enabled : prev.settlementEnabled,
              profileVideoQuotaMb:
                (data as any).r2_profile_video_quota_mb ?? prev.profileVideoQuotaMb ?? 100,
              r2MaxVideoSizeMb:
                (data as any).r2_max_video_size_mb ?? prev.r2MaxVideoSizeMb ?? 100,
              creatorTargetBronzeHours: (data as any).creator_target_bronze_hours ?? prev.creatorTargetBronzeHours,
              creatorTargetBronzeCoins: (data as any).creator_target_bronze_coins ?? prev.creatorTargetBronzeCoins,
              creatorTargetBronzeBonusUSD: (data as any).creator_target_bronze_bonus_usd ?? prev.creatorTargetBronzeBonusUSD,
              creatorTargetSilverHours: (data as any).creator_target_silver_hours ?? prev.creatorTargetSilverHours,
              creatorTargetSilverCoins: (data as any).creator_target_silver_coins ?? prev.creatorTargetSilverCoins,
              creatorTargetSilverBonusUSD: (data as any).creator_target_silver_bonus_usd ?? prev.creatorTargetSilverBonusUSD,
              creatorTargetGoldHours: (data as any).creator_target_gold_hours ?? prev.creatorTargetGoldHours,
              creatorTargetGoldCoins: (data as any).creator_target_gold_coins ?? prev.creatorTargetGoldCoins,
              creatorTargetGoldBonusUSD: (data as any).creator_target_gold_bonus_usd ?? prev.creatorTargetGoldBonusUSD,
              peakHoursStart: (data as any).peak_hours_start ?? prev.peakHoursStart,
              peakHoursEnd: (data as any).peak_hours_end ?? prev.peakHoursEnd,
              peakHoursEnabled: (data as any).peak_hours_enabled !== undefined ? (data as any).peak_hours_enabled : prev.peakHoursEnabled,
              callRingTimeoutSeconds: (data as any).call_ring_timeout_seconds ?? prev.callRingTimeoutSeconds,
              dailyFirstCallBonusCoins: (data as any).daily_first_call_bonus_coins ?? prev.dailyFirstCallBonusCoins,
              dailyFirstCallBonusUSD: (data as any).daily_first_call_bonus_usd ?? prev.dailyFirstCallBonusUSD,
              dailyFirstCallMinDurationSec: (data as any).daily_first_call_min_duration_sec ?? prev.dailyFirstCallMinDurationSec,
              streakTargetDays: (data as any).streak_target_days ?? prev.streakTargetDays,
              streakBoostDurationDays: (data as any).streak_boost_duration_days ?? prev.streakBoostDurationDays,
              minDailyActiveHoursForStreak: (data as any).min_daily_active_hours_for_streak ?? prev.minDailyActiveHoursForStreak,
            }));

            if (data.virtual_gifts_json) {
              try {
                const parsed = typeof data.virtual_gifts_json === 'string'
                  ? JSON.parse(data.virtual_gifts_json)
                  : data.virtual_gifts_json;
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setVirtualGifts(parsed);
                  localStorage.setItem('livecall_virtual_gifts', JSON.stringify(parsed));
                }
              } catch { }
            }
          }
        })
        .catch((e) => console.warn('Supabase initial system config fetch note:', e));

      fetchHomeBannersFromSupabase()
        .then((banners) => {
          if (banners === null) return;
          // Empty new DB → keep built-in hero defaults (do not blank the homepage).
          setHomeBanners(banners.length > 0 ? banners : [...INITIAL_HOME_BANNERS]);
          localStorage.removeItem('livecall_home_banners');
        })
        .catch((e) => console.warn('Home banners hydrate failed:', e));

      fetchUiFeedbackMessagesFromSupabase()
        .then((rows) => {
          if (rows === null) return;
          const merged = mergeFeedbackCatalog(DEFAULT_FEEDBACK_CATALOG, rows);
          setFeedbackCatalog(merged);
        })
        .catch((e) => console.warn('Feedback catalog hydrate failed:', e));

      fetchCmsSiteBrandingFromSupabase()
        .then((row) => {
          if (row === null) return;
          setSiteBranding(mapSiteBrandingRow(row));
        })
        .catch((e) => console.warn('Site branding hydrate failed:', e));

      fetchCmsPoliciesFromSupabase()
        .then((policies) => {
          if (policies === null) return;
          setPolicyDocuments(policies.length > 0 ? policies : [...INITIAL_POLICY_DOCUMENTS]);
          localStorage.removeItem('livecall_policy_documents');
        })
        .catch((e) => console.warn('CMS policies hydrate failed:', e));

      fetchHomeQuickLinksFromSupabase()
        .then((links) => {
          if (links === null) return;
          // Drop retired VIP Pass shortcut if a stale DB/CMS row still exists
          const filtered = links.filter((l: any) => {
            const title = String(l?.title || '').trim().toLowerCase();
            const target = String(l?.actionTarget || '').trim().toLowerCase();
            return title !== 'vip pass' && target !== 'vip' && l?.id !== 'link_vip_club';
          });
          setHomeQuickLinks(filtered.length > 0 ? filtered : [...INITIAL_HOME_QUICK_LINKS]);
          localStorage.removeItem('livecall_home_quick_links');
        })
        .catch((e) => console.warn('Home quick links hydrate failed:', e));

      fetchAppNavItemsFromSupabase()
        .then((rows) => {
          if (rows === null) return;
          const mapped = rows.map((row) => (row?.audienceRole ? row : mapNavRow(row)));
          setAppNavItems(mergeNavWithDefaults(mapped));
        })
        .catch((e) => console.warn('App nav hydrate failed:', e));

      fetchCoinPackagesFromSupabase()
        .then((pkgs) => {
          if (pkgs && pkgs.length > 0) {
            setCoinPackages(pkgs);
            localStorage.setItem('livecall_packages', JSON.stringify(pkgs));
          }
        })
        .catch(() => { });

      fetchCurrencyConfigsFromSupabase()
        .then((rows) => {
          if (rows && rows.length > 0) {
            setCurrencyConfigs(rows);
          }
        })
        .catch(() => { });

      // Fallback allow-lists from *_configs.enabled when system_configs arrays are empty.
      void Promise.all([
        fetchCountryConfigsFromSupabase(),
        fetchLanguageConfigsFromSupabase(),
        fetchZodiacConfigsFromSupabase(),
        fetchInterestConfigsFromSupabase(),
      ])
        .then(([countries, languages, zodiacs, interests]) => {
          setSystemSettings((prev) => {
            const next = { ...prev };
            let changed = false;

            if ((!prev.allowedCountryCodes || prev.allowedCountryCodes.length === 0) && Array.isArray(countries)) {
              const enabled = countries
                .filter((r: any) => r && r.enabled !== false && r.code)
                .map((r: any) => String(r.code).toUpperCase());
              if (enabled.length > 0) {
                next.allowedCountryCodes = enabled;
                changed = true;
              }
            }

            if ((!prev.allowedLanguages || prev.allowedLanguages.length === 0) && Array.isArray(languages)) {
              const enabled = languages
                .filter((r: any) => r && r.enabled !== false)
                .map((r: any) => String(r.name || r.code || '').trim())
                .filter(Boolean);
              if (enabled.length > 0) {
                next.allowedLanguages = enabled;
                changed = true;
              }
            }

            if ((!prev.allowedZodiacSigns || prev.allowedZodiacSigns.length === 0) && Array.isArray(zodiacs)) {
              const enabled = zodiacs
                .filter((r: any) => r && r.enabled !== false)
                .map((r: any) => String(r.key || r.name || '').trim())
                .filter(Boolean);
              if (enabled.length > 0) {
                next.allowedZodiacSigns = enabled;
                changed = true;
              }
            }

            if ((!prev.allowedInterests || prev.allowedInterests.length === 0) && Array.isArray(interests)) {
              const enabled = interests
                .filter((r: any) => r && r.enabled !== false)
                .map((r: any) => String(r.name || r.id || '').trim())
                .filter(Boolean);
              if (enabled.length > 0) {
                next.allowedInterests = enabled;
                changed = true;
              }
            }

            return changed ? next : prev;
          });
        })
        .catch(() => { });
    }

    // Check for email confirmation link in URL params or hash
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isAuthVerify = urlParams.get('auth_verify') === '1';
      const verifyEmail = urlParams.get('email');
      const verifyCode = urlParams.get('code');

      if (isAuthVerify && verifyEmail && verifyCode) {
        // Auto verify from email link
        authFetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: verifyEmail, code: verifyCode }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              showToast(
                'Email Confirmed! 🎉',
                `Your email ${verifyEmail} has been successfully verified. Welcome!`,
                'success'
              );
            }
          })
          .catch((e) => {
            console.warn('URL auto-verify error:', e);
          })
          .finally(() => {
            // Clean URL query parameters while preserving SPA navigation history state
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState(window.history.state ?? {}, document.title, cleanUrl);
          });
      }
    } catch (e) {
      console.warn('URL auth check exception:', e);
    }
  }, []);

  // After session hydrate: scoped call logs + payouts + feed (not on anonymous boot).
  useEffect(() => {
    if (!isLoggedIn || !currentUserId || !isSupabaseConfigured()) return;
    let cancelled = false;
    void refreshCallLogsFromDb();
    void refreshFeedPosts().catch(() => {});
    fetchPayoutRequestsFromSupabase()
      .then((data) => {
        if (!cancelled && data && data.length > 0) {
          setPayoutRequests(data);
        }
      })
      .catch((e) => console.warn('Supabase payout fetch note:', e));
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, currentUserId, refreshCallLogsFromDb]);

  // Helper to map server-side active calls into AdminActiveCall
  const mapServerCallToAdminCall = (sc: any, userList: UserProfile[]): AdminActiveCall => {
    const host =
      userList.find((u) => u.id === sc.receiverId) ||
      userList.find((u) => u.id === sc.callerId && (u.gender === 'female' || u.role === 'female_creator')) ||
      userList.find((u) => u.gender === 'female') ||
      userList[1] || {
        id: sc.receiverId,
        name: 'Elena Petrov',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
        hourlyCoinRate: 12,
        nationality: 'Spain',
        countryCode: 'ES',
        age: 24,
        earningsCoins: 7500,
        gender: 'female',
        role: 'female_creator',
      };

    const caller =
      userList.find((u) => u.id === sc.callerId) ||
      userList.find((u) => u.id === sc.receiverId && (u.gender === 'male' || u.role === 'male_user')) ||
      userList.find((u) => u.gender === 'male') ||
      userList[0] || {
        id: sc.callerId,
        name: 'Alex Vance',
        avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=400',
        nationality: 'United States',
        countryCode: 'US',
        coinBalance: 350,
        gender: 'male',
        role: 'male_user',
      };

    const durationSec =
      sc.durationSeconds !== undefined
        ? sc.durationSeconds
        : sc.startTime
          ? Math.max(0, Math.floor((Date.now() - sc.startTime) / 1000))
          : 0;
    const burnRate = host.hourlyCoinRate || 10;
    const coinsSpent = Math.floor((durationSec / 60) * burnRate);
    const coinsEarned = Math.floor(coinsSpent * 0.6);

    return {
      id: sc.id,
      hostId: host.id,
      hostName: host.name,
      hostAvatar: host.avatarUrl,
      hostCountry: host.nationality || 'Spain',
      hostCountryCode: host.countryCode || 'ES',
      hostHourlyRate: host.hourlyCoinRate || 10,
      hostRating: 4.97,
      hostAge: host.age || 24,
      hostEarningsCoins: host.earningsCoins || 7500,
      callerId: caller.id,
      callerName: caller.name,
      callerAvatar: caller.avatarUrl,
      callerCountry: caller.nationality || 'United States',
      callerCountryCode: caller.countryCode || 'US',
      callerCoinBalance: caller.coinBalance || 350,
      startTime: sc.startTime || Date.now(),
      durationSeconds: durationSec,
      coinsSpent,
      coinsEarned,
      status: sc.status || 'active',
      burnRatePerMin: burnRate,
      videoQuality: systemSettings.livekitCaptureResolution === '4k' ? '4K Ultra HD' : systemSettings.livekitCaptureResolution === '1080p' ? '1080p FHD' : systemSettings.livekitCaptureResolution === '480p' ? '480p SD' : '720p HD',
      fps: 60,
      bitrateKbps: 2400,
      latencyMs: 35,
      packetLoss: 0.01,
      safetyScore: 99.9,
      safetyFlag: 'clean',
      aiShieldActive: false,
    };
  };

  const refreshAdminActiveCalls = async () => {
    const me = usersRef.current.find((u) => u.id === currentUserIdRef.current);
    const isAdmin = me?.role === 'admin';
    // Fresh session only — never treat accessTokenRef as proof the JWT is valid.
    const freshToken = await getAccessToken();
    const gate = shouldAttemptAdminActiveCallsPoll({
      isLoggedIn: Boolean(isLoggedInRef.current),
      isAdmin: Boolean(isAdmin),
      state: adminActiveCallsPollStateRef.current,
      freshAccessToken: freshToken,
    });
    if (!gate.attempt) {
      if (gate.reason === 'no_token' && isAdmin && isLoggedInRef.current) {
        adminActiveCallsPollStateRef.current = {
          ...adminActiveCallsPollStateRef.current,
          suspended: true,
        };
        stopAdminActiveCallsPoll();
      }
      return;
    }

    accessTokenRef.current = freshToken!;
    adminActiveCallsPollStateRef.current = {
      ...adminActiveCallsPollStateRef.current,
      inFlight: true,
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'admin:get_active_calls' }));
      } catch {
        /* ignore */
      }
    }
    try {
      const res = await authFetch('/api/admin/active-calls');
      if (res.status === 401 || res.status === 403) {
        adminActiveCallsPollStateRef.current = applyAdminActiveCallsHttpResult(
          adminActiveCallsPollStateRef.current,
          res.status
        );
        stopAdminActiveCallsPoll();
        return;
      }
      adminActiveCallsPollStateRef.current = applyAdminActiveCallsHttpResult(
        adminActiveCallsPollStateRef.current,
        res.status
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.activeCalls)) {
          if (data.activeCalls.length === 0) {
            setAdminActiveCalls([]);
          } else {
            const mapped = data.activeCalls.map((sc: any) =>
              mapServerCallToAdminCall(sc, usersRef.current)
            );
            setAdminActiveCalls(mapped);
          }
        }
      }
    } catch {
      adminActiveCallsPollStateRef.current = {
        ...adminActiveCallsPollStateRef.current,
        inFlight: false,
      };
    }
  };
  refreshAdminActiveCallsRef.current = refreshAdminActiveCalls;

  // Periodic polling for active calls — admin only; stops on 401/403 until re-auth.
  useEffect(() => {
    if (!isLoggedIn || !currentUserId) {
      stopAdminActiveCallsPoll();
      adminActiveCallsPollStateRef.current = createAdminActiveCallsPollState();
      return;
    }
    startAdminActiveCallsPoll();
    return () => {
      stopAdminActiveCallsPoll();
    };
  }, [isLoggedIn, currentUserId, startAdminActiveCallsPoll, stopAdminActiveCallsPoll]);

  useEffect(() => {
    let isCancelled = false;
    let ws: WebSocket | null = null;
    let heartbeatTimer: any = null;
    let presenceSyncTimer: any = null;
    let userDirectoryTimer: any = null;
    let supabaseStatusTimer: any = null;

    // Direct HTTP heartbeat & presence sync (guarantees sync even if WS reconnects or across separate tabs/devices)
    const syncPresenceDirect = async () => {
      if (isCancelled || isResettingRef.current) return;
      if (!isLoggedInRef.current || !currentUserIdRef.current) return;
      const token = accessTokenRef.current || (await getAccessToken());
      if (!token) return;
      accessTokenRef.current = token;
      try {
        // Prefer busy while this client has a live call UI so heartbeat cannot
        // race ahead of call_logs sync and report "online" mid-ring.
        const liveCall = activeCallRef.current;
        const inLiveCall =
          Boolean(liveCall) &&
          (liveCall!.status === 'ringing' || liveCall!.status === 'active');
        const myStatus: 'online' | 'busy' | 'offline' = !isLoggedInRef.current
          ? 'offline'
          : inLiveCall
            ? 'busy'
            : preferredStatusRef.current;

        // Ask only for presence of users currently in local directory (viewport-scale), not full DB scan
        const peerIds = (usersRef.current || [])
          .map((u) => u.id)
          .filter((id) => id && id !== currentUserIdRef.current)
          .slice(0, 200);
        const res = await authFetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: myStatus, peerIds }),
        });

        if (res.ok && !isCancelled) {
          const data = await res.json();
          if (data.success && data.presence) {
            applyPresenceMap(
              data.presence as Record<string, 'online' | 'busy' | 'offline'>,
              data.status
            );
          }
        }
      } catch (e) {
        // WS takes over seamlessly
      }
    };

    // Dedicated Supabase Social & Friend Requests Synchronizer (preserves server authoritative presence)
    const syncSupabaseStatusCycle = async () => {
      if (isCancelled || isResettingRef.current) return;
      if (!isLoggedInRef.current || !currentUserIdRef.current) return;
      const token = accessTokenRef.current || (await getAccessToken());
      if (!token) return;
      accessTokenRef.current = token;
      try {
        // Status/last_seen persistence is server-owned via presence heartbeat.
        // Do not push client online_status here — it can overwrite authoritative busy.

        // 2. Sync friend requests from Express (JWT-derived actor; not client Supabase)
        const frRes = await authFetch('/api/v1/friends/requests');
        if (frRes.ok && !isCancelled) {
          const frJson = await frRes.json().catch(() => null);
          if (frJson?.success) {
            if (Array.isArray(frJson.data?.requests)) {
              setFriendRequests(frJson.data.requests as FriendRequest[]);
            }
            if (Array.isArray(frJson.data?.friendIds)) {
              setFriends(frJson.data.friendIds.map(String));
            }
          }
        }
      } catch (e) {
        // Continue silently
      }
    };

    // User directory sync to pick up new accounts created in other tabs or devices (preserves live presence)
    const syncUserDirectory = async () => {
      if (isCancelled || isResettingRef.current) return;
      if (!isLoggedInRef.current || !currentUserIdRef.current) return;
      const token = accessTokenRef.current || (await getAccessToken());
      if (!token) return;
      accessTokenRef.current = token;
      try {
        const res = await authFetch('/api/users');
        if (res.ok && !isCancelled) {
          const data = await res.json();
          if (data.success && Array.isArray(data.users)) {
            setUsers((prev) => {
              const serverUsersMap = new Map<string, UserProfile>(
                data.users
                  .filter((u: UserProfile) => u?.id && !deletedUserIdsRef.current.has(u.id))
                  .map((u: UserProfile) => [u.id, u])
              );
              const updated = prev
                .filter((u) => !deletedUserIdsRef.current.has(u.id))
                .map((u) => {
                // NEVER overwrite current logged-in user profile details with stale server data
                if (u.id === currentUserIdRef.current && isLoggedInRef.current) {
                  return u;
                }
                const sUser = serverUsersMap.get(u.id);
                if (sUser) {
                  // Directory sync must NOT overwrite live presence (raw DB busy sticks wrongly).
                  return {
                    ...u,
                    ...sUser,
                    onlineStatus: u.onlineStatus || 'offline',
                  };
                }
                return u;
              });
              data.users.forEach((su: UserProfile) => {
                if (!su?.id || deletedUserIdsRef.current.has(su.id)) return;
                if (!updated.some((u) => u.id === su.id)) {
                  // New discovery cards: do not seed Busy from sticky DB — presence will confirm
                  const seeded =
                    su.onlineStatus === 'busy' || su.onlineStatus === 'in_call'
                      ? 'online'
                      : su.onlineStatus || 'offline';
                  updated.push({
                    ...su,
                    onlineStatus: seeded,
                  });
                }
              });
              return updated;
            });
            // Refresh presence so discovery badges match server (not sticky DB busy)
            void syncPresenceDirect();
          }
        }
      } catch (e) {
        // silent
      }
    };

    function connect(retryAttempt = 0) {
      if (isCancelled) return;
      // Do not open a socket until we have a real session — unauthenticated open/close spam is noisy in DevTools
      if (!isLoggedInRef.current || !currentUserIdRef.current) return;

      // Avoid stacking duplicate sockets while one is already connecting/open
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const cachedToken = accessTokenRef.current;
      if (!cachedToken) {
        void getAccessToken().then((token) => {
          if (isCancelled) return;
          if (!token) {
            // Session may still be settling after login — retry briefly
            if (retryAttempt < 8) {
              setTimeout(() => connect(retryAttempt + 1), 250 * (retryAttempt + 1));
            }
            return;
          }
          accessTokenRef.current = token;
          connect(0);
        });
        return;
      }

      // Prefer Supabase Realtime on Vercel (no persistent /ws)
      if (shouldUseRealtimeSignaling() && !realtimeRef.current?.isConnected()) {
        const rt = realtimeRef.current || new RealtimeSignaling();
        realtimeRef.current = rt;
        void (async () => {
          const accessToken = accessTokenRef.current || (await getAccessToken());
          if (!accessToken || isCancelled) return;
          const ok = await rt.connect(
            currentUserIdRef.current,
            accessToken,
            (data) => {
            if (isCancelled || isResettingRef.current) return;
            try {
              if (data.type === 'presence:sync' && data.state) {
                const state = data.state as Record<string, any[]>;
                setUsers((prev) => {
                  let changed = false;
                  const onlineIds = new Set<string>();
                  Object.values(state).forEach((arr) => {
                    (arr || []).forEach((p: any) => {
                      if (p?.userId) onlineIds.add(String(p.userId));
                    });
                  });
                  const next = prev.map((u) => {
                    if (u.id === currentUserIdRef.current) return u;
                    // Realtime presence is an UPGRADE-only signal (join → online).
                    // Never demote to offline here — HTTP /api/presence/heartbeat is
                    // the authority for offline/stale/busy (avoids badge flicker).
                    // Do not preserve sticky busy from local state when they appear in RT.
                    if (!onlineIds.has(u.id)) return u;
                    if (u.onlineStatus === 'online') return u;
                    // Only keep busy if this client knows they are in an active call
                    const live = getUserCallStatus(u.id, 'online');
                    if (u.onlineStatus !== live) {
                      changed = true;
                      return { ...u, onlineStatus: live };
                    }
                    return u;
                  });
                  return changed ? next : prev;
                });
                return;
              }
              const bridge = (window as any).__mingleDeliverSignal as ((d: any) => void) | undefined;
              if (bridge) bridge(data);
            } catch (e) {
              console.warn('[Realtime] signal handler error', e);
            }
          },
            supabaseAuthUserIdRef.current ||
              usersRef.current.find((u) => u.id === currentUserIdRef.current)?.authId ||
              null
          );
          // Keep retrying — Vercel has no /ws; Realtime is optional for rings (DB poll works)
          if (!ok && !isCancelled && retryAttempt < 12) {
            setTimeout(() => connect(retryAttempt + 1), Math.min(8000, 600 * (retryAttempt + 1)));
          }
        })();
        // Continue to register the shared signal deliverer below (no native WebSocket on Vercel)
      }

      const useNativeWs = !shouldUseRealtimeSignaling();
      if (useNativeWs) {
      const wsUrl = getWsUrl();

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      wsAuthenticatedRef.current = false;

      ws.onopen = () => {
        if (isCancelled) return;
        void (async () => {
          const accessToken = accessTokenRef.current || (await getAccessToken());
          if (!accessToken) {
            wsAuthenticatedRef.current = false;
            ws?.close();
            if (!isCancelled && retryAttempt < 8) {
              setTimeout(() => connect(retryAttempt + 1), 400);
            }
            return;
          }
          accessTokenRef.current = accessToken;
          ws?.send(
            JSON.stringify({
              type: 'auth',
              accessToken,
            })
          );
          prevUserIdRef.current = currentUserIdRef.current;
        })();
      };
      }

      // Shared deliverer for WebSocket + Realtime broadcast payloads
      const runDeliverRegistration = () => {
      const deliver = (data: any) => {
        if (isCancelled || isResettingRef.current) return;
        try {
          if (data.type === 'auth:ok') {
            wsAuthenticatedRef.current = true;
            const me = usersRef.current.find((u) => u.id === currentUserIdRef.current);
            if (me?.role === 'admin') {
              signalSend({ type: 'admin:get_active_calls' });
            }
            signalSend({ type: 'heartbeat', userId: currentUserIdRef.current });

            // Flush a call that was waiting for signaling to come online
            const pendingReceiver = pendingCallReceiverRef.current;
            if (pendingReceiver && isSignalOpen()) {
              pendingCallReceiverRef.current = null;
              signalSend({
                  type: 'call:initiate',
                  callerId: currentUserIdRef.current,
                  receiverId: pendingReceiver,
                });
              const receiver = usersRef.current.find((u) => u.id === pendingReceiver);
              showToastRef.current(
                'Calling... 📞',
                `Ringing ${receiver?.name || 'user'}. Waiting for call acceptance...`,
                'info'
              );
            }
            return;
          }

          if (data.type === 'auth:error') {
            wsAuthenticatedRef.current = false;
            console.warn('[WS] Auth failed:', data.error);
            // Refresh token and reconnect
            accessTokenRef.current = null;
            void getAccessToken().then((token) => {
              if (token) accessTokenRef.current = token;
              try {
                ws?.close();
              } catch {
                // ignore
              }
            });
            return;
          }

          if (data.type === 'presence:all') {
            const presence: Record<string, 'online' | 'busy' | 'offline'> = data.presence || {};
            setUsers((prev) => {
              let changed = false;
              const next = prev.map((u) => {
                if (u.id === currentUserIdRef.current && isLoggedInRef.current) {
                  return u;
                }
                const liveStatus = getUserCallStatus(u.id, presence[u.id] || 'offline');
                if (u.onlineStatus !== liveStatus) {
                  changed = true;
                  return { ...u, onlineStatus: liveStatus };
                }
                return u;
              });
              return changed ? next : prev;
            });
          } else if (data.type === 'heartbeat:ack') {
            if (data.status && currentUserIdRef.current) {
              const live = getUserCallStatus(currentUserIdRef.current, data.status);
              setUsers((prev) => {
                const idx = prev.findIndex((u) => u.id === currentUserIdRef.current);
                if (idx === -1 || prev[idx].onlineStatus === live) return prev;
                const next = [...prev];
                next[idx] = { ...next[idx], onlineStatus: live };
                return next;
              });
            }
          } else if (data.type === 'creator_metrics:all') {
            if (data.metrics && typeof data.metrics === 'object') {
              setCreatorMetricsMap(data.metrics as Record<string, CreatorMetrics>);
            }
          } else if (data.type === 'creator_metrics:update') {
            if (data.creatorId && data.metrics) {
              setCreatorMetricsMap((prev) => ({
                ...prev,
                [data.creatorId]: data.metrics as CreatorMetrics,
              }));
            }
          } else if (data.type === 'users:all') {
            if (Array.isArray(data.users) && data.users.length > 0) {
              setUsers((prev) => {
                const serverMap = new Map<string, UserProfile>(
                  data.users
                    .filter((u: UserProfile) => u?.id && !deletedUserIdsRef.current.has(u.id))
                    .map((u: UserProfile) => [u.id, u])
                );
                const merged = prev
                  .filter((u) => !deletedUserIdsRef.current.has(u.id))
                  .map((u) => {
                  const serverUser =
                    serverMap.get(u.id) ||
                    (u.authId
                      ? data.users.find((su: UserProfile) => su.id === u.authId || su.authId === u.authId)
                      : undefined) ||
                    (u.email
                      ? data.users.find(
                          (su: UserProfile) =>
                            su.email && su.email.toLowerCase().trim() === u.email.toLowerCase().trim()
                        )
                      : undefined);

                  if (u.id === currentUserIdRef.current) {
                    if (!serverUser) return u;
                    return {
                      ...u,
                      coinBalance:
                        serverUser.coinBalance !== undefined ? serverUser.coinBalance : u.coinBalance,
                      earningsCoins:
                        serverUser.earningsCoins !== undefined ? serverUser.earningsCoins : u.earningsCoins,
                    };
                  }
                  if (!serverUser) return u;
                  // Preserve live presence from heartbeat — never take raw DB busy from users:all
                  return { ...u, ...serverUser, onlineStatus: u.onlineStatus || 'offline' };
                });
                data.users.forEach((su: UserProfile) => {
                  if (!su?.id || deletedUserIdsRef.current.has(su.id)) return;
                  const suEmail = su.email ? su.email.toLowerCase().trim() : null;
                  const alreadyPresent = merged.some(
                    (u) =>
                      u.id === su.id ||
                      (su.authId && (u.authId === su.authId || u.id === su.authId)) ||
                      (suEmail && u.email && u.email.toLowerCase().trim() === suEmail)
                  );
                  if (!alreadyPresent) {
                    const seeded =
                      su.onlineStatus === 'busy' || su.onlineStatus === 'in_call'
                        ? 'online'
                        : su.onlineStatus || 'offline';
                    merged.push({
                      ...su,
                      onlineStatus: seeded,
                    });
                  }
                });
                return merged;
              });
            }
          } else if (data.type === 'users:deleted') {
            const deletedId = data.userId ? String(data.userId) : '';
            if (deletedId) {
              deletedUserIdsRef.current.add(deletedId);
            }
            setUsers((prev) => {
              let next = prev.filter((u) => !deletedUserIdsRef.current.has(u.id));
              if (deletedId) {
                next = next.filter((u) => u.id !== deletedId);
              }
              if (Array.isArray(data.users) && data.users.length > 0) {
                const map = new Map<string, UserProfile>();
                for (const u of next) {
                  if (!deletedUserIdsRef.current.has(u.id)) map.set(u.id, u);
                }
                for (const su of data.users as UserProfile[]) {
                  if (!su?.id || deletedUserIdsRef.current.has(su.id)) continue;
                  const prior = map.get(su.id);
                  map.set(
                    su.id,
                    prior
                      ? { ...prior, ...su, onlineStatus: prior.onlineStatus || 'offline' }
                      : {
                          ...su,
                          onlineStatus:
                            su.onlineStatus === 'busy' || su.onlineStatus === 'in_call'
                              ? 'online'
                              : su.onlineStatus || 'offline',
                        }
                  );
                }
                if (deletedId) map.delete(deletedId);
                next = Array.from(map.values());
              }
              usersRef.current = next;
              return next;
            });
            if (deletedId) {
              setCreatorMetricsMap((prev) => {
                if (!prev[deletedId]) return prev;
                const next = { ...prev };
                delete next[deletedId];
                return next;
              });
            }
          } else if (data.type === 'users:updated') {
            if (data.user) {
              setUsers((prev) => {
                const incoming = data.user as UserProfile;
                if (incoming?.id && deletedUserIdsRef.current.has(incoming.id)) {
                  return prev;
                }
                const cleanEmail = incoming.email ? incoming.email.toLowerCase().trim() : null;
                const authId = incoming.authId || null;
                const remaining = prev.filter((u) => {
                  if (u.id === incoming.id) return false;
                  if (authId && (u.id === authId || u.authId === authId || u.authId === incoming.id)) return false;
                  if (cleanEmail && u.email && u.email.toLowerCase().trim() === cleanEmail) return false;
                  return true;
                });
                // Only match the same person — never fall back to the logged-in user
                // (that briefly turned Team Leader into the newly created female_creator).
                const prior =
                  prev.find((u) => u.id === incoming.id) ||
                  (authId
                    ? prev.find((u) => u.id === authId || u.authId === authId)
                    : undefined) ||
                  (cleanEmail
                    ? prev.find((u) => u.email && u.email.toLowerCase().trim() === cleanEmail)
                    : undefined);
                const currentId = currentUserIdRef.current;
                const refersToLoggedInUser = Boolean(
                  currentId &&
                    (incoming.id === currentId ||
                      incoming.authId === currentId ||
                      (authId && authId === currentId) ||
                      (prior && prior.id === currentId) ||
                      (cleanEmail &&
                        prev.some(
                          (u) =>
                            u.id === currentId &&
                            u.email &&
                            u.email.toLowerCase().trim() === cleanEmail
                        )))
                );
                const resolvedId =
                  (refersToLoggedInUser ? currentId : undefined) ||
                  incoming.id ||
                  prior?.id;
                if (!resolvedId) {
                  return prev;
                }
                const incomingWsVideos = Array.isArray(incoming.galleryVideos)
                  ? incoming.galleryVideos
                  : undefined;
                let mergedUser: UserProfile = {
                  ...(prior || {}),
                  ...incoming,
                  id: resolvedId,
                  coinBalance:
                    incoming.coinBalance !== undefined
                      ? incoming.coinBalance
                      : prior?.coinBalance ?? 0,
                  earningsCoins:
                    incoming.earningsCoins !== undefined
                      ? incoming.earningsCoins
                      : prior?.earningsCoins ?? 0,
                  galleryVideos:
                    incomingWsVideos && incomingWsVideos.length > 0
                      ? incomingWsVideos
                      : Array.isArray(prior?.galleryVideos) && prior!.galleryVideos!.length > 0
                        ? prior!.galleryVideos!
                        : incomingWsVideos || prior?.galleryVideos || [],
                  // Presence map owns status — ignore sticky busy on user broadcast payloads
                  onlineStatus: prior?.onlineStatus || 'offline',
                };
                if (refersToLoggedInUser) {
                  settlePendingFromIncoming(incoming, true);
                  mergedUser = overlayPendingSelfProfile(mergedUser);
                }
                return [...remaining, mergedUser];
              });
            }
          } else if (
            data.type === 'call:incoming' ||
            data.type === 'call:initiate' ||
            data.type === 'call:ringing'
          ) {
            const callId =
              String(data.callId || '').trim() ||
              `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const callerId = String(data.callerId || '').trim();
            const receiverId = String(data.receiverId || '').trim();
            if (!callerId || !receiverId) return;
            const selfCheck = isSelfIdRef.current;
            // Only the callee should enter incoming ringing from initiate/incoming.
            // Match profile id OR auth id (discovery vs session can disagree).
            if (data.type === 'call:initiate' || data.type === 'call:incoming') {
              if (!selfCheck(receiverId)) return;
              applyIncomingRingRef.current({ callId, callerId, receiverId });
              return;
            }
            // call:ringing — caller echo (Express) or party update
            if (!selfCheck(callerId) && !selfCheck(receiverId)) return;
            const cur = activeCallRef.current;
            if (cur && cur.status === 'active') return;
            if (cur && cur.id === callId && cur.status === 'ringing') return;
            if (selfCheck(receiverId) && !selfCheck(callerId)) {
              applyIncomingRingRef.current({ callId, callerId, receiverId });
              return;
            }
            // Caller keeps/aligns local ringing session id from server echo
            setActiveCall({
              id: callId,
              callerId,
              receiverId,
              startTime: Date.now(),
              durationSeconds: 0,
              coinsSpent: 0,
              coinsEarned: 0,
              giftsSent: [],
              status: 'ringing',
            });
            setUsers((prev) =>
              prev.map((u) =>
                u.id === callerId || u.id === receiverId
                  ? { ...u, onlineStatus: 'busy' as const }
                  : u
              )
            );
          } else if (data.type === 'call:accepted') {
            clearRingTimeout();
            const { startTime } = data;
            const accepted = activeCallRef.current;
            // If we have no local ringing session yet, hydrate from signal (caller recovery)
            if (!accepted) {
              const callerId = String(data.callerId || '').trim();
              const receiverId = String(data.receiverId || '').trim();
              const callId = String(data.callId || '').trim();
              if (
                callId &&
                callerId &&
                receiverId &&
                (isSelfIdRef.current(callerId) || isSelfIdRef.current(receiverId))
              ) {
                activeCallRef.current = {
                  id: callId,
                  callerId,
                  receiverId,
                  startTime: typeof startTime === 'number' ? startTime : Date.now(),
                  durationSeconds: 0,
                  coinsSpent: 0,
                  coinsEarned: 0,
                  giftsSent: [],
                  status: 'ringing',
                };
                setActiveCall(activeCallRef.current);
              } else {
                return;
              }
            }
            const session = activeCallRef.current;
            if (!session || session.status === 'active') return;
            // Party check — profile id OR auth id
            if (
              !isSelfIdRef.current(session.callerId) &&
              !isSelfIdRef.current(session.receiverId) &&
              !isSelfIdRef.current(data.callerId) &&
              !isSelfIdRef.current(data.receiverId)
            ) {
              return;
            }
            activateCallLocally(typeof startTime === 'number' ? startTime : Date.now());
            authFetch('/api/calls/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callId: session.id,
                callerId: session.callerId,
                receiverId: session.receiverId,
                status: 'active',
                startTime: new Date(startTime || Date.now()).toISOString(),
              }),
            }).catch(() => {});
            showToastKeyRef.current('calls.call_connected');
          } else if (data.type === 'call:ended' || data.type === 'call:end' || data.type === 'call:cancel' || data.type === 'call:reject') {
            const endedId = String(data.callId || activeCallRef.current?.id || '').trim();
            const outcomeStatus = String(data.outcome || data.status || 'completed');
            if (endedId) {
              closeCallFromRemoteRef.current({
                callId: endedId,
                status: outcomeStatus,
                silent:
                  data.code === 'INSUFFICIENT_BALANCE' || data.reason === 'INSUFFICIENT_BALANCE',
              });
            }
            if (data.code === 'INSUFFICIENT_BALANCE' || data.reason === 'INSUFFICIENT_BALANCE') {
              if (!insufficientEndToastShownRef.current) {
                insufficientEndToastShownRef.current = true;
                showToastKeyRef.current('calls.call_ended', { type: 'error' });
              }
            } else if (data.endedBy === 'admin_moderator' || outcomeStatus === 'terminated') {
              showToast(
                'Call Terminated',
                data.reason || 'This call was ended by Safety & Compliance Administration.',
                'error'
              );
            }
          } else if (data.type === 'call:safety_warning') {
            const warnCallId = String(data.callId || '').trim();
            const warnText = String(data.message || data.warningText || '').trim();
            const session = activeCallRef.current;
            if (
              session &&
              warnText &&
              (!warnCallId || warnCallId === session.id)
            ) {
              const next = { ...session, warningMessage: warnText };
              activeCallRef.current = next;
              setActiveCall(next);
              showToast('Safety Advisory', warnText, 'warning');
            }
          } else if (data.type === 'wallet:burn_result') {
            // Authoritative balances from server billing — update HUD immediately
            applyBurnBalancesRef.current({
              callId: data.callId,
              callerId: data.callerId,
              receiverId: data.receiverId,
              tlId: data.tlId,
              newCallerBalance: data.newCallerBalance,
              newHostEarnings: data.newHostEarnings,
              newTlEarnings: data.newTlEarnings,
              callCoinsSpent: data.callCoinsSpent,
              callCoinsEarned: data.callCoinsEarned,
              billingMinute: data.billingMinute,
              coinsBurned: data.coinsBurned,
              hostCoinsEarned: data.hostCoinsEarned,
              duplicate: data.duplicate,
            });
          } else if (data.type === 'wallet:balance_update') {
            applyWalletBalanceRef.current({
              userId: data.userId,
              authId: data.authId,
              email: data.email,
              coinBalance: data.coinBalance,
              earningsCoins: data.earningsCoins,
            });
          } else if (data.type === 'call:failed') {
            setActiveCall(null);
            showToastKeyRef.current('calls.unavailable_detail', {
              vars: { detail: data.reason || 'User is offline or unavailable.' },
            });
          } else if (data.type === 'call_logs:updated') {
            // Refresh platform/admin financial KPIs from authoritative DB call_logs
            void refreshCallLogsFromDbRef.current().catch((e) =>
              console.warn('[WS] call_logs refresh note:', e)
            );
          } else if (data.type === 'admin:active_calls_update') {
            const serverCalls: Array<{ id: string; callerId: string; receiverId: string; status: 'active' | 'ringing'; startTime: number; durationSeconds: number }> = data.activeCalls || [];
            if (serverCalls.length === 0) {
              setAdminActiveCalls([]);
            } else {
              const mappedCalls = serverCalls.map((sc) => mapServerCallToAdminCall(sc, usersRef.current));
              setAdminActiveCalls(mappedCalls);
            }
          } else if (data.type === 'chat:message') {
            // Fast WS notify after POST /api/messages (server-authored). Dedupe vs Realtime / optimistic.
            const incoming = data.message;
            if (incoming?.id && typeof incoming.id === 'string') {
              setChatMessages((prev) => {
                if (prev.some((m) => m.id === incoming.id)) {
                  // Ensure clientTempId sticks on an existing durable row (helps overlay reconcile)
                  const tempId =
                    typeof incoming.clientTempId === 'string' ? incoming.clientTempId : null;
                  if (!tempId) return prev;
                  return prev.map((m) =>
                    m.id === incoming.id && !m.clientTempId ? { ...m, clientTempId: tempId } : m
                  );
                }
                const tempId =
                  typeof incoming.clientTempId === 'string' ? incoming.clientTempId : null;
                const withoutTemp = tempId
                  ? prev.filter((m) => m.id !== tempId && m.clientTempId !== tempId)
                  : prev;
                return [
                  ...withoutTemp,
                  {
                    ...incoming,
                    isRead: Boolean(incoming.isRead),
                    createdAt: incoming.createdAt || incoming.timestamp,
                    timestamp: incoming.createdAt || incoming.timestamp || new Date().toISOString(),
                    clientTempId: tempId || incoming.clientTempId,
                  },
                ];
              });
            }
          } else if (data.type === 'chat:incall_preview') {
            // Pre-DB peer notify for in-call chat (WS path). Durable chat:message reconciles later.
            const p = data.payload || data;
            const tempId = typeof p.clientTempId === 'string' ? p.clientTempId.trim() : '';
            const senderId = typeof p.senderId === 'string' ? p.senderId : '';
            const receiverId = typeof p.receiverId === 'string' ? p.receiverId : '';
            const text = typeof p.text === 'string' ? p.text : '';
            const myUid = currentUserIdRef.current;
            if (
              tempId &&
              senderId &&
              receiverId &&
              myUid &&
              (myUid === receiverId || myUid === senderId) &&
              text
            ) {
              setChatMessages((prev) => {
                if (prev.some((m) => m.id === tempId || m.clientTempId === tempId)) return prev;
                // Already have durable copy for this logical message
                if (
                  prev.some(
                    (m) =>
                      !m.id.startsWith('temp_') &&
                      m.senderId === senderId &&
                      m.receiverId === receiverId &&
                      m.text === text
                  )
                ) {
                  return prev;
                }
                const msgType = p.messageType === 'gift' ? 'gift' : 'text';
                const nowIso = new Date().toISOString();
                return [
                  ...prev,
                  {
                    id: tempId,
                    clientTempId: tempId,
                    senderId,
                    receiverId,
                    text,
                    originalLanguage: 'English',
                    type: msgType as ChatMessage['type'],
                    isRead: myUid === senderId,
                    createdAt: nowIso,
                    timestamp: nowIso,
                  },
                ];
              });
            }
          } else if (data.type === 'match:created') {
            const { senderId, receiverId, matchItem } = data;
            const myUid = currentUserIdRef.current;
            if (myUid && (myUid === receiverId || myUid === senderId)) {
              const otherUserId = myUid === receiverId ? senderId : receiverId;
              const otherUser = usersRef.current.find((u) => u.id === otherUserId);
              if (otherUser) {
                const loc = getUserEffectiveLocation(otherUser);
                const newMatch: QuickMatchItem = {
                  id: matchItem?.id || `qm_${Date.now()}_${otherUser.id}`,
                  matchedUserId: otherUser.id,
                  matchedUserName: otherUser.name,
                  matchedUserAvatar: otherUser.avatarUrl,
                  matchedUserGender: otherUser.gender,
                  matchedUserAge: otherUser.age,
                  matchedUserCountryCode: otherUser.countryCode,
                  matchedUserCity: loc.displayCity,
                  matchedAt: matchItem?.matchedAt || new Date().toISOString(),
                  giftsExchangedCoins: matchItem?.giftsExchangedCoins || 0,
                };

                setQuickMatches((prev) => {
                  const filtered = prev.filter((m) => m.matchedUserId !== otherUser.id);
                  const next = [newMatch, ...filtered].slice(0, 50);
                  try {
                    localStorage.setItem('livecall_quick_matches_v4_' + myUid, JSON.stringify(next));
                  } catch (e) {}
                  return next;
                });

                if (myUid === receiverId) {
                  showToastKeyRef.current('match.mutual_quick', { vars: { name: otherUser.name } });
                }
              }
            }
          } else if (data.type === 'quick_match:live_hosts') {
            if (Array.isArray(data.liveHostIds)) {
              setLiveHostIds(data.liveHostIds);
            }
          } else if (data.type === 'quick_match:active_callers') {
            if (Array.isArray(data.activeCallerIds)) {
              setActiveQuickMatchCallerIds(data.activeCallerIds);
            }
          } else if (data.type === 'quick_match:caller_connected_to_host') {
            const { callerId, hostId, callerProfile } = data;
            if (hostId && (callerProfile || callerId)) {
              const profileToAdd = callerProfile || users.find((u) => u.id === callerId);
              if (profileToAdd) {
                setConnectedCallersByHost((prev) => {
                  const existing = prev[hostId] || [];
                  if (existing.some((u) => u.id === profileToAdd.id)) return prev;
                  return { ...prev, [hostId]: [profileToAdd, ...existing] };
                });
              }
            }
          } else if (data.type === 'quick_match:caller_disconnected_from_host') {
            const { callerId, hostId } = data;
            if (callerId) {
              setConnectedCallersByHost((prev) => {
                const next: Record<string, UserProfile[]> = {};
                for (const [hId, callers] of Object.entries(prev)) {
                  if (hostId && hId !== hostId) {
                    next[hId] = callers;
                  } else {
                    next[hId] = callers.filter((c) => c.id !== callerId);
                  }
                }
                return next;
              });
            }
          } else if (data.type === 'friend_request:incoming' || data.type === 'friend_request:send') {
            // Express remaps send→incoming; Realtime may deliver either
            const req = data.request;
            if (req?.id) {
              setFriendRequests((prev) => {
                if (prev.some((r) => r.id === req.id)) return prev;
                return [req, ...prev];
              });
              if (req.receiverId === currentUserIdRef.current) {
                showToast(
                  '🌸 Friend Request Received!',
                  `${req.senderName || 'Someone'} sent you a Friend Request! Accept to unlock discounted Friend Call Rates.`,
                  'success'
                );
              }
            }
          } else if (data.type === 'friend_request:accepted') {
            const { requestId, senderId, receiverId } = data;
            if (requestId) {
              setFriendRequests((prev) =>
                prev.map((r) => (r.id === requestId ? { ...r, status: 'accepted' } : r))
              );
              setChatMessages((prev) =>
                prev.map((m) => {
                  if (m.friendRequestInfo && m.friendRequestInfo.id === requestId) {
                    return {
                      ...m,
                      friendRequestInfo: { ...m.friendRequestInfo, status: 'accepted' },
                      text: `✓ Friend Request Accepted! Special Friend Rate is active for video calls.`,
                    };
                  }
                  return m;
                })
              );
            }
            if (senderId && receiverId) {
              const otherId = senderId === currentUserIdRef.current ? receiverId : senderId;
              setFriends((prev) => {
                const next = Array.from(new Set([...prev, senderId, receiverId, otherId]));
                return next;
              });
            }
          } else if (data.type === 'friend_request:declined') {
            const { requestId } = data;
            if (requestId) {
              setFriendRequests((prev) =>
                prev.map((r) => (r.id === requestId ? { ...r, status: 'declined' } : r))
              );
              setChatMessages((prev) =>
                prev.map((m) => {
                  if (m.friendRequestInfo && m.friendRequestInfo.id === requestId) {
                    return {
                      ...m,
                      friendRequestInfo: { ...m.friendRequestInfo, status: 'declined' },
                      text: `Friend Request declined. Standard call rates remain active.`,
                    };
                  }
                  return m;
                })
              );
            }
          } else if (data.type === 'friend_request:removed') {
            const { userA, userB } = data;
            if (userA === currentUserIdRef.current || userB === currentUserIdRef.current) {
              const otherId = userA === currentUserIdRef.current ? userB : userA;
              setFriends((prev) => {
                const next = prev.filter((id) => id !== otherId && id !== userA && id !== userB);
                return next;
              });
              setFriendRequests((prev) => {
                const next = prev.filter(
                  (r) =>
                    !(
                      (r.senderId === userA && r.receiverId === userB) ||
                      (r.senderId === userB && r.receiverId === userA)
                    )
                );
                return next;
              });
            }
          }
        } catch (e) {
          console.error('WS Parse Error:', e);
        }
      };
      (window as any).__mingleDeliverSignal = deliver;
      if (useNativeWs && ws) {
        ws.onmessage = (event) => {
          try {
            const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            deliver(raw);
          } catch (e) {
            console.error('WS Parse Error:', e);
          }
        };
        ws.onclose = () => {
          wsAuthenticatedRef.current = false;
          if (!isCancelled && !isResettingRef.current && isLoggedInRef.current) {
            setTimeout(() => connect(0), 1500);
          }
        };
        ws.onerror = () => {
          // Browser fires error before close for failed handshakes; reconnect handled in onclose
        };
      }
      };

      runDeliverRegistration();
    }

    wsConnectRef.current = () => connect(0);

    // Connect WebSocket only when authenticated (effect re-runs on currentUserId / login)
    connect(0);

    // Initial presence + Supabase status push (authoritative DB sync; not a tight poll loop)
    if (isLoggedInRef.current) {
      syncPresenceDirect();
      syncSupabaseStatusCycle();
      syncUserDirectory();
    }

    // 1. Signaling heartbeat — WS or Supabase Realtime (light)
    heartbeatTimer = setInterval(() => {
      if (isResettingRef.current) return;
      if (isSignalOpen()) {
        signalSend({ type: 'heartbeat', userId: currentUserId });
      }
    }, 15000);

    // 2. HTTP presence — jittered ~30s (Redis lease); never full-directory Postgres writes
    const presenceIntervalMs = 30000 + Math.floor(Math.random() * 10000) - 5000;
    presenceSyncTimer = setInterval(() => {
      if (isResettingRef.current) return;
      syncPresenceDirect();
    }, Math.max(25000, presenceIntervalMs));

    // 3. User directory refresh — slowed; presence comes from Redis peer ids, not full map
    userDirectoryTimer = setInterval(() => {
      if (isResettingRef.current) return;
      syncUserDirectory();
    }, 120000);

    // 4. Friend requests + social hydrate (badge counts) — poll often enough for pending badges
    supabaseStatusTimer = setInterval(() => {
      if (isResettingRef.current) return;
      syncSupabaseStatusCycle();
    }, 12000);

    // Cross-tab Synchronization using BroadcastChannel (presence only; no social data dumps)
    let broadcastChannel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        broadcastChannel = new BroadcastChannel('livecall_presence_sync_channel');
        broadcastChannel.onmessage = (event) => {
          if (event.data?.type === 'presence_updated' || event.data?.type === 'user_switched') {
            syncPresenceDirect();
            syncSupabaseStatusCycle();
          }
        };
        broadcastChannel.postMessage({ type: 'presence_updated', userId: currentUserId });
      }
    } catch (e) { }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'livecall_presence_trigger' || e.key === 'livecall_current_user_id') {
        syncPresenceDirect();
        syncSupabaseStatusCycle();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (isSignalOpen()) {
          signalSend({ type: 'heartbeat', userId: currentUserIdRef.current });
        }
        syncPresenceDirect();
        syncSupabaseStatusCycle();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Browser close / tab close / navigation away — offline best-effort (deduped).
    // Prefer fetch+keepalive+Bearer; sendBeacon+body token only as fallback. No success assumed.
    const unloadOnce = createUnloadOnceGate();
    const handleUnload = () => {
      if (!unloadOnce.tryClaim()) return;
      const activeUid = currentUserIdRef.current;
      const accessToken = accessTokenRef.current;
      if (!activeUid || !accessToken) return;
      try {
        const transport = chooseOfflineUnloadTransport({
          hasToken: true,
          fetchKeepaliveAvailable: typeof fetch === 'function',
          sendBeaconAvailable: typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function',
        });
        dispatchOfflineUnloadRequests({
          token: accessToken,
          resolveUrl: apiUrl,
          transport,
          fetchFn: (url, init) => {
            void fetch(url, init).catch(() => {});
          },
          sendBeaconFn: (url, blob) => {
            try {
              return navigator.sendBeacon(url, blob);
            } catch {
              return false;
            }
          },
        });
      } catch {
        /* best effort — unload must not throw */
      }
    };
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);

    // Supabase Realtime channel subscription for multi-device broadcast redundancy
    let unsubscribeSupabaseChat = () => { };
    let unsubscribeFriendRequests = () => { };
    if (isSupabaseConfigured()) {
      unsubscribeSupabaseChat = subscribeToRealtimeChat(
        currentUserId,
        (incomingMsg) => {
          setChatMessages((prev) => {
            // Dedupe by server id; also replace optimistic temp rows and keep clientTempId
            if (prev.some((m) => m.id === incomingMsg.id)) return prev;
            const matchedTemp = prev.find(
              (m) =>
                m.id.startsWith('temp_') &&
                m.senderId === incomingMsg.senderId &&
                m.receiverId === incomingMsg.receiverId &&
                m.text === incomingMsg.text &&
                (m.mediaUrl || '') === (incomingMsg.mediaUrl || '')
            );
            const withoutTempDup = matchedTemp
              ? prev.filter((m) => m.id !== matchedTemp.id && m.clientTempId !== matchedTemp.id)
              : prev.filter(
                  (m) =>
                    !(
                      m.id.startsWith('temp_') &&
                      m.senderId === incomingMsg.senderId &&
                      m.receiverId === incomingMsg.receiverId &&
                      m.text === incomingMsg.text &&
                      (m.mediaUrl || '') === (incomingMsg.mediaUrl || '')
                    )
                );
            return [
              ...withoutTempDup,
              {
                ...incomingMsg,
                clientTempId:
                  incomingMsg.clientTempId ||
                  matchedTemp?.clientTempId ||
                  matchedTemp?.id ||
                  undefined,
              },
            ];
          });
        },
        (updatedMsg) => {
          setChatMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
          );
        }
      );
      unsubscribeFriendRequests = subscribeToFriendRequests(currentUserId, (row) => {
        setFriendRequests((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          const status = (row.status || 'pending') as FriendRequest['status'];
          if (idx === -1) {
            const sender = usersRef.current.find((u) => u.id === row.senderId);
            const receiver = usersRef.current.find((u) => u.id === row.receiverId);
            return [
              {
                id: row.id,
                senderId: row.senderId,
                senderName: sender?.name || 'User',
                senderAvatar: sender?.avatarUrl || '',
                receiverId: row.receiverId,
                receiverName: receiver?.name || 'User',
                receiverAvatar: receiver?.avatarUrl || '',
                status,
                timestamp: row.createdAt || new Date().toISOString(),
              },
              ...prev,
            ];
          }
          const next = [...prev];
          next[idx] = { ...next[idx], status };
          return next;
        });
        // Keep list authoritative via API hydrate as well
        void authFetch('/api/v1/friends/requests')
          .then(async (res) => {
            if (!res.ok) return;
            const frJson = await res.json().catch(() => null);
            if (frJson?.success && Array.isArray(frJson.data?.requests)) {
              setFriendRequests(frJson.data.requests as FriendRequest[]);
            }
            if (Array.isArray(frJson?.data?.friendIds)) {
              setFriends(frJson.data.friendIds.map(String));
            }
          })
          .catch(() => {});
      });
    }

    return () => {
      isCancelled = true;
      wsAuthenticatedRef.current = false;
      wsConnectRef.current = () => {};
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (presenceSyncTimer) clearInterval(presenceSyncTimer);
      if (userDirectoryTimer) clearInterval(userDirectoryTimer);
      if (supabaseStatusTimer) clearInterval(supabaseStatusTimer);
      if (broadcastChannel) broadcastChannel.close();
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      try {
        delete (window as any).__mingleDeliverSignal;
      } catch {
        // ignore
      }
      if (ws) ws.close();
      try {
        realtimeRef.current?.disconnect();
      } catch {
        // ignore
      }
      realtimeRef.current = null;
      unsubscribeSupabaseChat();
      unsubscribeFriendRequests();
    };
  }, [currentUserId, isLoggedIn]);

  const toastTimerRef = useRef<any>(null);

  useEffect(() => {
    feedbackCatalogRef.current = feedbackCatalog;
    feedbackByKeyRef.current = new Map(feedbackCatalog.map((e) => [e.key, e]));
  }, [feedbackCatalog]);

  const hideToast = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  };

  const pushToast = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'info'
  ) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    const id = Date.now().toString();
    setToast({ id, title, message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  /** Static title+message call sites: overlay CMS copy via default fingerprint → key. */
  const showToast = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'info'
  ) => {
    const key = feedbackFingerprintIndexRef.current.get(feedbackFingerprint(title, message));
    if (key) {
      const entry = feedbackByKeyRef.current.get(key);
      if (entry) {
        pushToast(entry.title, entry.message, type || entry.defaultType);
        return;
      }
    }
    pushToast(title, message, type);
  };
  showToastRef.current = showToast;

  const showToastKey = (
    key: string,
    opts?: { type?: FeedbackType; vars?: Record<string, string | number | null | undefined> }
  ) => {
    const entry = feedbackByKeyRef.current.get(key);
    if (entry) {
      pushToast(
        applyFeedbackVars(entry.title, opts?.vars),
        applyFeedbackVars(entry.message, opts?.vars),
        opts?.type || entry.defaultType
      );
      return;
    }
    const fallback = resolveFeedback(key, opts?.vars, DEFAULT_FEEDBACK_CATALOG);
    pushToast(fallback.title, fallback.message, opts?.type || fallback.type);
  };
  showToastKeyRef.current = showToastKey;

  const resolveFeedbackCopy = (
    key: string,
    vars?: Record<string, string | number | null | undefined>
  ) => resolveFeedback(key, vars, feedbackCatalogRef.current);

  const reloadFeedbackCatalog = async () => {
    try {
      const rows = await fetchUiFeedbackMessagesFromSupabase();
      if (rows === null) return;
      setFeedbackCatalog(mergeFeedbackCatalog(DEFAULT_FEEDBACK_CATALOG, rows));
    } catch (e) {
      console.warn('reloadFeedbackCatalog failed:', e);
    }
  };

  const reloadSiteBranding = async () => {
    try {
      const row = await fetchCmsSiteBrandingFromSupabase();
      if (row === null) return;
      setSiteBranding(mapSiteBrandingRow(row));
    } catch (e) {
      console.warn('reloadSiteBranding failed:', e);
    }
  };

  useEffect(() => {
    applySiteBrandingToDocument(siteBranding);
  }, [siteBranding]);

  const switchUser = (_userOrId: string | UserProfile) => {
    showToast('Sign in required', 'Account switching without a password is disabled. Use email and password.', 'error');
  };

  const completeAuthenticatedLogin = (profile: UserProfile) => {
    if (!profile?.id) {
      showToast('Sign in failed', 'Missing authenticated profile.', 'error');
      return;
    }
    // Prefer persisted onboarding flags from the profile payload (DB), never invent them locally
    const activeId = profile.id;
    const oldId = currentUserIdRef.current;

    const finishLogin = (token: string | null) => {
      if (token) accessTokenRef.current = token;
      isLoggedInRef.current = true;
      currentUserIdRef.current = activeId;
      preferredStatusRef.current = 'online';
      setCurrentUserId(activeId);
      setIsLoggedIn(true);
      localStorage.setItem('livecall_logged_in', 'true');
      localStorage.setItem('livecall_current_user_id', activeId);

      const activeProfile: UserProfile = {
        ...profile,
        id: activeId,
        onlineStatus: 'online',
        isOnboarded: Boolean(profile.isOnboarded),
      };
      setUsers((prev) => {
        const cleanEmail = activeProfile.email ? activeProfile.email.toLowerCase().trim() : null;
        const remaining = prev.filter((u) => {
          if (u.id === activeId) return false;
          if (activeProfile.authId && (u.id === activeProfile.authId || u.authId === activeProfile.authId)) return false;
          if (cleanEmail && u.email && u.email.toLowerCase().trim() === cleanEmail) return false;
          return true;
        });
        const next = [activeProfile, ...remaining];
        usersRef.current = next;
        return next;
      });

      updateUserStatusInSupabase(activeId, 'online').catch(() => {});
      authFetch('/api/supabase/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'online', forceOnline: true }),
      }).catch(() => {});
      authFetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'online', clearCalls: true }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json().catch(() => null);
          if (data?.success && data.presence) {
            applyPresenceMap(data.presence, data.status || 'online');
          }
        })
        .catch(() => {});
      signalSend({ type: 'presence:update', userId: activeId, status: 'online' });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && token) {
        wsRef.current.send(JSON.stringify({ type: 'auth', accessToken: token, prevUserId: oldId }));
      } else {
        // Kick WS / Realtime connect once login flags + token are ready
        setTimeout(() => wsConnectRef.current(), 0);
      }
    };

    void getAccessToken()
      .then((token) => finishLogin(token))
      .catch(() => finishLogin(accessTokenRef.current));
  };

  const switchRolePersona = (_role: UserRole) => {
    showToast('Sign in required', 'Persona switching is disabled. Sign in with the correct account.', 'error');
  };

  const loginUser = (_identifier: string): boolean => {
    showToast('Sign in required', 'Use email and password to log in.', 'error');
    return false;
  };
  const logoutUser = (opts?: { reason?: 'manual' | 'other_device' }) => {
    const prevId = currentUserId;
    const prevAuthId = currentUser?.authId || supabaseAuthUserIdRef.current || '';
    const cachedToken = accessTokenRef.current;

    if (activeCall) {
      endCall();
    }

    // Mark local session offline immediately (stops heartbeats from pushing "online")
    isLoggedInRef.current = false;
    currentUserIdRef.current = '';
    preferredStatusRef.current = 'offline';
    wsAuthenticatedRef.current = false;
    pendingCallReceiverRef.current = null;

    setUsers((prev) =>
      prev.map((u) =>
        u.id === prevId || (prevAuthId && (u.id === prevAuthId || u.authId === prevAuthId))
          ? { ...u, onlineStatus: 'offline' as const }
          : u
      )
    );
    setIsLoggedIn(false);
    localStorage.setItem('livecall_logged_in', 'false');
    localStorage.removeItem('livecall_current_user_id');
    clearStoredActiveSessionId();

    // Notify peers via Realtime or native WS
    try {
      signalSend({
        type: 'presence:update',
        userId: prevId,
        status: 'offline',
      });
    } catch {
      /* ignore */
    }
    try {
      realtimeRef.current?.disconnect();
    } catch {
      /* ignore */
    }

    try {
      localStorage.setItem('livecall_presence_trigger', `${prevId}_offline_${Date.now()}`);
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('livecall_presence_sync_channel');
        bc.postMessage({ type: 'presence_updated', userId: prevId, status: 'offline' });
        bc.close();
      }
    } catch {
      /* ignore */
    }

    // Persist offline to DB BEFORE clearing Supabase auth (token race was leaving hosts "online")
    void (async () => {
      const token = cachedToken || (await getAccessToken());
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const offlineBody = JSON.stringify({
        userId: prevId,
        status: 'offline',
        accessToken: token || undefined,
      });

      const persistOffline = async (url: string) => {
        const absolute = apiUrl(url);
        if (!token) return;
        try {
          await fetch(absolute, {
            method: 'POST',
            headers,
            body: offlineBody,
            keepalive: true,
          });
          return;
        } catch {
          /* fall through to beacon */
        }
        try {
          if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([offlineBody], { type: 'application/json' });
            navigator.sendBeacon(absolute, blob);
          }
        } catch {
          /* ignore — best effort */
        }
      };

      // Direct client write while session may still be valid
      if (prevId) {
        try {
          await updateUserStatusInSupabase(prevId, 'offline');
        } catch {
          /* ignore */
        }
      }
      if (prevAuthId && prevAuthId !== prevId) {
        try {
          await updateUserStatusInSupabase(prevAuthId, 'offline');
        } catch {
          /* ignore */
        }
      }

      await Promise.all([
        persistOffline('/api/supabase/update-status'),
        persistOffline('/api/presence'),
      ]);

      // Close socket after offline was requested so server close handler also writes offline
      try {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      } catch {
        /* ignore */
      }

      accessTokenRef.current = null;
      await signOutSupabase().catch(() => { });
    })();

    if (opts?.reason === 'other_device') {
      showToast(
        'Signed out',
        'Your account was signed in on another device. Only one login is allowed at a time.',
        'warning'
      );
    } else {
      showToastKey('auth.logged_out');
    }
    sessionKickInFlightRef.current = false;
  };
  logoutUserRef.current = logoutUser;

  // Single-device login: Realtime + API 409 both force-logout the previous device
  useEffect(() => {
    if (!isLoggedIn || !currentUserId || !isSupabaseConfigured()) return;

    const kickIfReplaced = () => {
      if (shouldIgnoreSessionKick()) return;
      if (sessionKickInFlightRef.current || !isLoggedInRef.current) return;
      // Never tear down an in-progress incoming/outgoing ring due to a false session race
      const call = activeCallRef.current;
      if (call && (call.status === 'ringing' || call.status === 'active')) {
        sessionKickPendingRef.current = true;
        console.warn('[single-session] deferring kick until call ends');
        return;
      }
      sessionKickPendingRef.current = false;
      sessionKickInFlightRef.current = true;
      logoutUserRef.current({ reason: 'other_device' });
    };

    const onSessionReplaced = () => kickIfReplaced();
    window.addEventListener(SESSION_REPLACED_EVENT, onSessionReplaced);

    const channel = supabase
      .channel(`single_session_${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${currentUserId}`,
        },
        (payload) => {
          if (shouldIgnoreSessionKick()) return;
          const nextId = (payload.new as { active_session_id?: string | null } | null)?.active_session_id;
          const mine = getStoredActiveSessionId();
          if (nextId && mine && String(nextId).trim() !== mine) {
            kickIfReplaced();
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener(SESSION_REPLACED_EVENT, onSessionReplaced);
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [isLoggedIn, currentUserId]);

  const registerUser = (userData: Partial<UserProfile>): UserProfile => {
    const cleanEmail = userData.email ? userData.email.toLowerCase().trim() : null;

    // Collapse duplicate registration attempts for the same email (local + prior stubs)
    const existingByEmail =
      cleanEmail
        ? usersRef.current.find((u) => u.email && u.email.toLowerCase().trim() === cleanEmail)
        : undefined;
    const existingById =
      userData.id
        ? usersRef.current.find((u) => u.id === userData.id || u.authId === userData.id)
        : undefined;
    const existing = existingByEmail || existingById;

    const newId =
      (existing?.id && isValidUuid(existing.id) && existing.id) ||
      (userData.id && isValidUuid(userData.id) && userData.id) ||
      generateValidUuid();
    const isFemale = userData.gender === 'female' || existing?.gender === 'female';
    const role: UserRole =
      userData.role || existing?.role || (isFemale ? 'female_creator' : 'male_user');

    const newUser: UserProfile = {
      ...(existing || {}),
      id: newId,
      authId: userData.authId || existing?.authId || newId,
      name: userData.name || existing?.name || 'New Member',
      email: cleanEmail || existing?.email || 'user@example.com',
      gender: userData.gender || existing?.gender || (role === 'female_creator' || role === 'female_user' ? 'female' : 'male'),
      genderLocked: true, // Permanent Gender Lock
      role: role,
      age: userData.age || existing?.age || 21,
      dob: userData.dob || existing?.dob || '2003-01-01',
      nationality: userData.nationality || existing?.nationality || 'United States',
      countryCode: userData.countryCode || existing?.countryCode || 'US',
      spokenLanguages: userData.spokenLanguages || existing?.spokenLanguages || ['English'],
      bio: userData.bio || existing?.bio || 'Excited to make friends and chat!',
      interests: userData.interests || existing?.interests || ['Music', 'Travel'],
      interestedIn: userData.interestedIn || existing?.interestedIn || (isFemale ? ['male'] : ['female']),
      tags: userData.tags || existing?.tags || [],
      avatarUrl:
        userData.avatarUrl ||
        existing?.avatarUrl ||
        (isFemale
          ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400'
          : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400'),
      gallery: userData.gallery || existing?.gallery || [],
      galleryVideos: userData.galleryVideos || existing?.galleryVideos || [],
      introVideoUrl: userData.introVideoUrl || existing?.introVideoUrl || undefined,
      isVerified: userData.isVerified || existing?.isVerified || false,
      isOnboarded: userData.isOnboarded ?? existing?.isOnboarded ?? false,
      agreedToTerms: userData.agreedToTerms ?? existing?.agreedToTerms ?? true,
      agreedToAdultTerms: userData.agreedToAdultTerms ?? existing?.agreedToAdultTerms ?? !isFemale,
      agreedToHostTerms: userData.agreedToHostTerms ?? existing?.agreedToHostTerms ?? isFemale,
      kycStatus: userData.kycStatus || existing?.kycStatus || 'unsubmitted',
      onlineStatus: 'online',
      createdAt: existing?.createdAt || new Date().toISOString().split('T')[0],
      coinBalance: existing?.coinBalance ?? (isFemale ? 0 : 50),
      hourlyCoinRate: isFemale
        ? userData.hourlyCoinRate || existing?.hourlyCoinRate || systemSettings.coinBurnRatePerMin
        : 0,
      earningsCoins: existing?.earningsCoins || 0,
      totalLifetimeEarnedUSD: existing?.totalLifetimeEarnedUSD || 0,
      emailVerified: userData.emailVerified ?? existing?.emailVerified ?? true,
    };

    setUsers((prev) => {
      const remaining = prev.filter((u) => {
        if (u.id === newId) return false;
        if (newUser.authId && (u.authId === newUser.authId || u.id === newUser.authId)) return false;
        if (cleanEmail && u.email && u.email.toLowerCase().trim() === cleanEmail) return false;
        return true;
      });
      const next = [newUser, ...remaining];
      usersRef.current = next;
      return next;
    });
    setCurrentUserId(newId);
    setIsLoggedIn(true);
    localStorage.setItem('livecall_logged_in', 'true');
    localStorage.setItem('livecall_current_user_id', newId);

    // Sync new registered user immediately to server
    authFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    }).catch((e) => console.warn('User server sync warning:', e));

    if (isSupabaseConfigured()) {
      upsertProfileToSupabase(newUser).then((success) => {
        if (success) {
          console.log(`Registered user ${newUser.name} successfully upserted to Supabase.`);
        }
      }).catch((e) =>
        console.warn('User registration Supabase sync warning:', e)
      );
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      void getAccessToken().then((accessToken) => {
        wsRef.current?.send(JSON.stringify({ type: 'auth', accessToken }));
      });
    }

    showToast(
      'Registration Complete',
      `Welcome ${newUser.name}! Your gender (${(newUser.gender || 'male').toUpperCase()}) is permanently locked to protect the coin economy.`,
      'success'
    );
    return newUser;
  };

  const updateUserProfile = async (
    userId: string,
    updates: Partial<UserProfile>,
    options?: { silentSuccess?: boolean }
  ): Promise<boolean> => {
    let genderLockAttempted = false;

    const sanitizedUpdates: Partial<UserProfile> = { ...updates };
    if (
      sanitizedUpdates.avatarUrl !== undefined &&
      (sanitizedUpdates.avatarUrl.startsWith('blob:') || sanitizedUpdates.avatarUrl.startsWith('data:'))
    ) {
      delete sanitizedUpdates.avatarUrl;
    }
    if (sanitizedUpdates.gallery) {
      sanitizedUpdates.gallery = sanitizedUpdates.gallery.filter((url) => {
        const u = String(url || '').trim();
        if (!u || u.startsWith('blob:') || u.startsWith('data:') || u.startsWith('__mc_gv1__:')) {
          return false;
        }
        return (
          u.startsWith('http://') ||
          u.startsWith('https://') ||
          u.startsWith('/api/storage/media')
        );
      });
    }
    if (sanitizedUpdates.galleryVideos) {
      sanitizedUpdates.galleryVideos = sanitizedUpdates.galleryVideos
        .map((v) => {
          if (!v) return null;
          const storageKey = String(v.storageKey || '').trim() || undefined;
          let url = String(v.url || '').trim();
          if (url.startsWith('blob:') || url.startsWith('data:')) url = '';
          if (!url && storageKey) {
            url = `/api/storage/media?key=${encodeURIComponent(storageKey)}`;
          }
          if (!url && !storageKey) return null;
          return {
            ...v,
            url: url || `/api/storage/media?key=${encodeURIComponent(storageKey!)}`,
            storageKey,
            sizeBytes: Number(v.sizeBytes) > 0 ? Number(v.sizeBytes) : 0,
          };
        })
        .filter(Boolean) as typeof sanitizedUpdates.galleryVideos;
    }

    const targetBefore = usersRef.current.find(
      (u) => u.id === userId || u.authId === userId
    );
    if (targetBefore?.genderLocked && sanitizedUpdates.gender && sanitizedUpdates.gender !== targetBefore.gender) {
      genderLockAttempted = true;
      delete sanitizedUpdates.gender;
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      if (genderLockAttempted) {
        showToast('Gender Lock Active', 'Gender cannot be modified after registration.', 'warning');
      }
      return false;
    }

    const mediaSnapshot = {
      gallery: targetBefore?.gallery,
      galleryVideos: targetBefore?.galleryVideos,
      avatarUrl: targetBefore?.avatarUrl,
    };
    const touchingMedia =
      sanitizedUpdates.gallery !== undefined ||
      sanitizedUpdates.galleryVideos !== undefined ||
      sanitizedUpdates.avatarUrl !== undefined;

    const editingSelf = Boolean(
      userId === currentUserIdRef.current ||
      targetBefore?.id === currentUserIdRef.current ||
      (targetBefore?.authId && targetBefore.authId === currentUserIdRef.current)
    );
    if (editingSelf) {
      rememberPendingSelfProfile(userId, sanitizedUpdates);
    }

    setUsers((prev) => {
      const targetUser = prev.find((u) => u.id === userId);
      const targetEmail = targetUser?.email ? targetUser.email.toLowerCase().trim() : null;

      const next = prev.map((u) => {
        const isMatch = u.id === userId || (targetEmail && u.email && u.email.toLowerCase().trim() === targetEmail);
        if (!isMatch) return u;
        return { ...u, ...sanitizedUpdates };
      });
      usersRef.current = next;
      return next;
    });

    if (genderLockAttempted) {
      showToast('Gender Lock Active', 'Gender cannot be modified after registration.', 'warning');
    }

    const saveGen = ++profileSaveGenRef.current;
    // Include email only when the caller is actually updating it. Attaching email on
    // every gallery/media save can trip unique(email) conflicts and is unnecessary
    // once the server resolves the profile from the auth session.
    const payload: Partial<UserProfile> = { ...sanitizedUpdates };
    const silentSuccess = Boolean(options?.silentSuccess);
    const task = profileSaveChainRef.current.then(async () => {
      const saved = await persistUserProfileUpdate(userId, payload);
      if (saveGen !== profileSaveGenRef.current) return saved;
      if (!saved) {
        if (touchingMedia && targetBefore) {
          const revertPatch: Partial<UserProfile> = {};
          if (sanitizedUpdates.gallery !== undefined) {
            revertPatch.gallery = mediaSnapshot.gallery || [];
          }
          if (sanitizedUpdates.galleryVideos !== undefined) {
            revertPatch.galleryVideos = mediaSnapshot.galleryVideos || [];
          }
          if (sanitizedUpdates.avatarUrl !== undefined) {
            revertPatch.avatarUrl = mediaSnapshot.avatarUrl;
          }
          setUsers((prev) => {
            const next = prev.map((u) => {
              const isMatch =
                u.id === userId ||
                u.id === targetBefore.id ||
                (targetBefore.email &&
                  u.email &&
                  u.email.toLowerCase().trim() === targetBefore.email.toLowerCase().trim());
              if (!isMatch) return u;
              return { ...u, ...revertPatch };
            });
            usersRef.current = next;
            return next;
          });
          if (editingSelf && pendingSelfProfileRef.current) {
            const cleared = { ...pendingSelfProfileRef.current.fields };
            if (revertPatch.gallery !== undefined) delete cleared.gallery;
            if (revertPatch.galleryVideos !== undefined) delete cleared.galleryVideos;
            if (revertPatch.avatarUrl !== undefined) delete cleared.avatarUrl;
            pendingSelfProfileRef.current =
              Object.keys(cleared).length === 0
                ? null
                : { userId: pendingSelfProfileRef.current.userId, fields: cleared };
          }
        }
        // When silentSuccess is set, the caller owns both success and failure toasts.
        if (!silentSuccess) {
          showToast(
            'Profile Save Failed',
            touchingMedia
              ? 'Upload may have reached storage, but your profile was not updated. Please try again.'
              : 'Your changes are still on screen. Click Save again.',
            'error'
          );
        }
        return false;
      }
      if (!silentSuccess) {
        showToastKey('profile.profile_updated');
      }
      return true;
    });
    profileSaveChainRef.current = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  };

  // Change User Password
  const changeUserPassword = (
    userId: string,
    currentPassword: string,
    newPassword: string
  ): { success: boolean; message: string } => {
    const policyError = getPasswordPolicyError(newPassword);
    if (policyError) {
      showToast('Password Error', policyError, 'error');
      return { success: false, message: policyError };
    }

    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) {
      const msg = 'User account not found.';
      showToast('User Not Found', msg, 'error');
      return { success: false, message: msg };
    }

    let updatedObj: UserProfile | null = null;
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          const updated = {
            ...u,
            hasPasswordSet: true,
          };
          updatedObj = updated;
          return updated;
        }
        return u;
      })
    );

    // Call Supabase Auth & server password update
    updateUserPassword({
      userId,
      email: targetUser.email,
      newPassword,
    }).catch((e) => console.warn('Supabase Auth password update warning:', e));

    if (updatedObj) {
      authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedObj),
      }).catch((e) => console.warn('Password update server sync notice:', e));

      if (isSupabaseConfigured()) {
        upsertProfileToSupabase(updatedObj).catch((e) =>
          console.warn('Password update Supabase sync notice:', e)
        );
      }
    }


    showToast('Password Updated! 🔒', 'Your account password has been updated successfully.', 'success');
    return { success: true, message: 'Password updated successfully!' };
  };

  // Buy Coins — server checkout intent only (never mutate coin_balance from the client)
  const buyCoinPackage = (packageId: string) => {
    const pkg = coinPackages.find((p) => p.id === packageId);
    if (!pkg) return;

    void (async () => {
      try {
        const res = await authFetch('/api/v1/finance/funding/checkout-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageId: pkg.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          showToast(
            'Checkout unavailable',
            data?.error?.message || data?.error || 'Could not start coin purchase. Try again later.',
            'error'
          );
          return;
        }
        showToast(
          'Checkout started',
          'Complete payment to credit coins. Balance updates only after server confirmation.',
          'info'
        );
      } catch {
        showToast('Purchase failed', 'Could not reach the funding API.', 'error');
      }
    })();
  };

  // Call System & Coin Burn Ticker
  const startCall = (receiverId: string): boolean => {
    // Team Leaders cannot make calls
    if (currentUser.role === 'team_leader' || currentUser.role === 'agency_manager') {
      showToast(
        'Agency Role Restriction',
        'Agencies cannot initiate calls. Your account is dedicated to managing female host teams and earning agency commission.',
        'warning'
      );
      return false;
    }

    const receiver = users.find((u) => u.id === receiverId);
    if (!receiver) {
      showToast('Call Error', 'User not found', 'error');
      return false;
    }

    // Team Leaders cannot receive calls
    if (receiver.role === 'team_leader' || receiver.role === 'agency_manager') {
      showToast(
        'Unavailable for Calls',
        'Agencies cannot receive live calls. Agencies only manage agency hosts.',
        'warning'
      );
      return false;
    }

    // Check if user is offline or busy
    if (receiver.onlineStatus === 'offline') {
      showToastKey('calls.user_offline', { vars: { name: receiver.name } });
      return false;
    }
    if (receiver.onlineStatus === 'busy' || receiver.onlineStatus === 'in_call') {
      showToastKey('calls.user_busy', { vars: { name: receiver.name } });
      return false;
    }

    // Minimum balance check (Friend rate vs Standard rate using unified rate helper)
    const minRequired = getEffectiveCallRate(receiverId, currentUser.id);

    // Universal pre-call balance guard: any caller must have enough coins for at least 1 minute
    if (currentUser.coinBalance < minRequired) {
      showToast(
        'Insufficient Coins! 🪙',
        `You need at least ${minRequired} coins for 1 minute of video call. Please refill your wallet.`,
        'error'
      );
      return false;
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const initiatePayload = {
      type: 'call:initiate',
      callId,
      callerId: currentUser.id,
      receiverId,
      toUserId: receiverId,
      // Alias targets so Realtime hits whichever id the peer subscribed with
      receiverAuthId: receiver.authId || undefined,
      toAuthId: receiver.authId || undefined,
      callerAuthId: currentUser.authId || supabaseAuthUserIdRef.current || undefined,
      callerName: currentUser.name,
      receiverName: receiver.name,
    };

    const markBusyLocal = () => {
      // Only mark caller busy locally while ringing — callee flips busy when Accept UI opens
      setUsers((prev) =>
        prev.map((u) =>
          u.id === currentUser.id || u.authId === currentUser.id
            ? { ...u, onlineStatus: 'busy' as const }
            : u
        )
      );
      billedMinutesRef.current.clear();
      burnInFlightRef.current.clear();
      insufficientEndToastShownRef.current = false;
      billingCapSecondsRef.current = null;
      setActiveCall({
        id: callId,
        callerId: currentUser.id,
        receiverId,
        startTime: Date.now(),
        durationSeconds: 0,
        coinsSpent: 0,
        coinsEarned: 0,
        giftsSent: [],
        status: 'ringing',
        mediaConnected: false,
      });
    };

    const persistBusy = async (): Promise<{ ok: boolean; detail?: string }> => {
      try {
        const res = await authFetch('/api/calls/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId,
            callerId: currentUser.id,
            receiverId,
            status: 'ringing',
            startTime: new Date().toISOString(),
            callerName: currentUser.name,
            receiverName: receiver.name,
            hostName: receiver.name,
          }),
        });
        if (res.ok) return { ok: true };
        const json = await res.json().catch(() => null);
        const detail =
          (typeof json?.error === 'object' && (json.error.detail || json.error.message)) ||
          (typeof json?.error === 'string' && json.error) ||
          `HTTP ${res.status}`;
        return { ok: false, detail: String(detail) };
      } catch (e: any) {
        return { ok: false, detail: e?.message || 'Network error' };
      }
    };

    // Vercel has no /ws — Realtime may be slow/flaky. DB sync + callee /api/calls/incoming
    // poll is enough to place a ring; do not hard-block on isSignalOpen().
    const useRealtimeMode = shouldUseRealtimeSignaling();
    const canPlaceViaDb = useRealtimeMode && isSupabaseConfigured();

    const placeOutgoingRing = () => {
      void (async () => {
        // Persist ringing FIRST so callee postgres_changes / ring poll can recover
        // even when Realtime broadcast is dropped.
        markBusyLocal();
        // LiveKit membership requires call_logs row — never proceed without successful sync
        const synced = await persistBusy();
        if (!synced.ok) {
          clearRingTimeout();
          activeCallRef.current = null;
          setActiveCall(null);
          showToast(
            'Call Failed',
            synced.detail
              ? `Could not save the call on the server (${synced.detail}).`
              : 'Could not save the call on the server. Please try again.',
            'error'
          );
          return;
        }
        let sent = false;
        if (realtimeRef.current?.isConnected()) {
          sent = (await realtimeRef.current.send(initiatePayload)) === true;
        } else if (!useRealtimeMode) {
          sent = (await signalSendAsync(initiatePayload)) === true;
        } else {
          try {
            wsConnectRef.current();
          } catch {
            /* ignore */
          }
        }
        showToast(
          'Calling... 📞',
          sent
            ? `Ringing ${receiver.name}. Waiting for call acceptance...`
            : `Ringing ${receiver.name} (secure channel)…`,
          'info'
        );
        // Auto-miss if host never accepts (Realtime/Vercel has no server ring reaper)
        clearRingTimeout();
        const ringMs = Math.max(15, Number(systemSettings.callRingTimeoutSeconds) || 30) * 1000;
        ringTimeoutRef.current = setTimeout(() => {
          const call = activeCallRef.current;
          if (call && call.id === callId && call.status === 'ringing') {
            ringTimedOutRef.current = true;
            showToastKey('calls.call_missed', { type: 'info' });
            endCallRef.current();
          }
        }, ringMs);
        // DB poll fallback: host accept writes call_logs.status=active even if Realtime signal drops
        if (isSupabaseConfigured()) {
          ringPollRef.current = setInterval(() => {
            const call = activeCallRef.current;
            if (!call || call.id !== callId || call.status !== 'ringing') {
              if (ringPollRef.current != null) {
                clearInterval(ringPollRef.current);
                ringPollRef.current = null;
              }
              return;
            }
            void (async () => {
              try {
                const { data, error } = await supabase
                  .from('call_logs')
                  .select('status, started_at, start_time')
                  .eq('id', callId)
                  .maybeSingle();
                if (error || !data) return;
                const row = data as {
                  status?: string | null;
                  started_at?: string | null;
                  start_time?: string | null;
                };
                const st = String(row.status || '').toLowerCase();
                if (st === 'active' || st === 'accepted' || st === 'in_call' || st === 'connecting') {
                  clearRingTimeout();
                  const ts = row.started_at || row.start_time;
                  const startMs = ts ? new Date(ts).getTime() : Date.now();
                  activateCallLocally(Number.isFinite(startMs) ? startMs : Date.now());
                  showToastKey('calls.call_connected');
                } else if (
                  // Only peer/explicit ring outcomes — not "completed"/"ended"
                  // (those can race from presence cleanup and falsely hang up at ~2s).
                  st === 'missed' ||
                  st === 'declined' ||
                  st === 'cancelled' ||
                  st === 'canceled' ||
                  st === 'rejected' ||
                  st === 'failed'
                ) {
                  clearRingTimeout();
                  endCallRef.current();
                }
              } catch (e) {
                console.warn('[call] ring status poll failed', e);
              }
            })();
          }, 1000);
        }
      })();
    };

    if (isSignalOpen() || canPlaceViaDb) {
      placeOutgoingRing();
      return true;
    }

    // Local Express /ws mode only: wait briefly for socket, then fail clearly
    pendingCallReceiverRef.current = receiverId;
    wsConnectRef.current();
    showToast(
      'Connecting...',
      'Securing the call channel. Your call will start automatically in a moment.',
      'info'
    );
    window.setTimeout(() => {
      if (pendingCallReceiverRef.current !== receiverId) return;
      if (isSignalOpen() || (shouldUseRealtimeSignaling() && isSupabaseConfigured())) {
        pendingCallReceiverRef.current = null;
        startCall(receiverId);
        return;
      }
      pendingCallReceiverRef.current = null;
      showToast(
        'Call Failed',
        'Could not reach the signaling server. Please refresh the page and try again.',
        'error'
      );
    }, 5000);
    return true;
  };

  const acceptCall = () => {
    if (!activeCall) return;
    clearRingTimeout();
    const callSnapshot = activeCall;
    const startTime = Date.now();
    const callerUser = users.find((u) => u.id === callSnapshot.callerId);
    const receiverUser = users.find((u) => u.id === callSnapshot.receiverId);

    const acceptPayload = {
      type: 'call:accepted',
      callId: callSnapshot.id,
      userId: currentUser.id,
      callerId: callSnapshot.callerId,
      receiverId: callSnapshot.receiverId,
      toUserId: callSnapshot.callerId,
      toAuthId: callerUser?.authId || undefined,
      callerAuthId: callerUser?.authId || undefined,
      receiverAuthId: currentUser.authId || supabaseAuthUserIdRef.current || undefined,
      startTime,
    };

    void (async () => {
      // Persist active BEFORE LiveKit token — membership requires call_logs row
      let synced = false;
      try {
        const syncRes = await authFetch('/api/calls/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId: callSnapshot.id,
            callerId: callSnapshot.callerId,
            receiverId: callSnapshot.receiverId,
            status: 'active',
            startTime: new Date(startTime).toISOString(),
            callerName: callerUser?.name,
            receiverName: receiverUser?.name || currentUser.name,
            hostName: receiverUser?.name || currentUser.name,
          }),
        });
        synced = syncRes.ok;
        if (!synced) {
          const errBody = await syncRes.json().catch(() => null);
          console.warn('[acceptCall] sync failed', syncRes.status, errBody);
        }
      } catch (e) {
        console.warn('[acceptCall] sync exception', e);
      }

      if (!synced) {
        showToast(
          'Accept failed',
          'Could not register this call on the server. Please try accepting again.',
          'error'
        );
        return;
      }

      // Flip local UI to active → VideoCallStudio connects LiveKit (burn waits for mediaConnected)
      billedMinutesRef.current.clear();
      burnInFlightRef.current.clear();
      insufficientEndToastShownRef.current = false;
      billingCapSecondsRef.current = null;
      setActiveCall((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: 'active',
          startTime,
          billedMinutes: 0,
          coinsSpent: 0,
          coinsEarned: 0,
          mediaConnected: false,
          durationSeconds: 0,
        };
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === callSnapshot.callerId || u.id === callSnapshot.receiverId
            ? { ...u, onlineStatus: 'busy' as const }
            : u
        )
      );

      let sent = await signalSendAsync(acceptPayload);
      if (!sent) {
        await new Promise((r) => setTimeout(r, 400));
        sent = await signalSendAsync(acceptPayload);
      }
      if (!sent) {
        showToast(
          'Signal weak',
          'Call accepted — waiting for caller via call log sync. Stay on this screen.',
          'warning'
        );
      }

      const ratePerMin = getEffectiveCallRate(callSnapshot.receiverId, callSnapshot.callerId);
      const isFriendCall = isFriend(callSnapshot.receiverId) || isFriend(callSnapshot.callerId);
      showToast(
        'Call Connected! 📹',
        `Connecting LiveKit with ${callerUser?.name || 'caller'}. ${
          isFriendCall ? '✨ Friend Rate: ' + ratePerMin + ' 🪙/min' : '🪙 Rate: ' + ratePerMin + ' 🪙/min'
        }.`,
        'success'
      );
    })();
  };

  const rejectCall = () => {
    if (!activeCall) return;
    clearRingTimeout();
    const rejectedCall = activeCall;
    const isCaller = isSelfId(rejectedCall.callerId);
    const outcome = isCaller ? 'missed' : 'declined';
    const reason = isCaller ? 'Caller hangup' : 'Receiver reject';
    const endNow = Date.now();
    const peerId = isCaller ? rejectedCall.receiverId : rejectedCall.callerId;
    const peerUser = usersRef.current.find(
      (u) => u.id === peerId || u.authId === peerId
    );
    const callerUser = usersRef.current.find(
      (u) => u.id === rejectedCall.callerId || u.authId === rejectedCall.callerId
    );
    const receiverUser = usersRef.current.find(
      (u) => u.id === rejectedCall.receiverId || u.authId === rejectedCall.receiverId
    );

    // Persist end to DB first so peer poll closes UI even if Realtime is down
    void syncCallEndAndPresence(
      {
        callId: rejectedCall.id,
        callerId: rejectedCall.callerId,
        receiverId: rejectedCall.receiverId,
        status: outcome,
        outcome,
        endedBy: currentUser.id,
        reason,
        durationSeconds: 0,
        coinsSpent: 0,
        coinsEarned: 0,
      },
      [rejectedCall.callerId, rejectedCall.receiverId]
    );

    void signalSendAsync({
      type: 'call:ended',
      callId: rejectedCall.id,
      userId: currentUser.id,
      callerId: rejectedCall.callerId,
      receiverId: rejectedCall.receiverId,
      toUserId: peerId,
      toAuthId: peerUser?.authId || undefined,
      callerAuthId: callerUser?.authId || undefined,
      receiverAuthId: receiverUser?.authId || supabaseAuthUserIdRef.current || undefined,
      outcome,
      reason,
      status: outcome,
    });

    const caller = users.find((u) => u.id === rejectedCall.callerId);
    const receiver = users.find((u) => u.id === rejectedCall.receiverId);
    const isFriendCall = isFriend(rejectedCall.receiverId) || isFriend(rejectedCall.callerId);

    if (caller && receiver) {
      const newLog: CallLogItem = {
        id: rejectedCall.id,
        callerId: caller.id,
        callerName: caller.name,
        callerAvatar: caller.avatarUrl,
        callerCountry: caller.nationality,
        receiverId: receiver.id,
        receiverName: receiver.name,
        receiverAvatar: receiver.avatarUrl,
        startTime: rejectedCall.startTime || endNow,
        endTime: endNow,
        durationSeconds: 0,
        coinsSpent: 0,
        coinsEarned: 0,
        timestamp: 'Just now',
        wasFriendCall: isFriendCall,
        status: outcome,
      };
      setCallLogs((prev) => {
        const withoutDup = prev.filter((l) => l.id !== newLog.id);
        return [newLog, ...withoutDup];
      });
    }

    setActiveCall(null);

    showToast(
      outcome === 'declined' ? 'Call Declined 🚫' : 'Call Cancelled',
      outcome === 'declined' ? 'The call was declined.' : 'You cancelled the call before it was answered.',
      'info'
    );
  };

  const endCall = () => {
    if (!activeCall) return;
    const wasRingTimeout = ringTimedOutRef.current;
    clearRingTimeout();
    const endedCall = activeCall;
    const wasRinging = endedCall.status === 'ringing';
    const isCaller = isSelfId(endedCall.callerId);
    const endNow = Date.now();

    // Ringing hangup should classify like cancel/decline (not completed)
    const ringingOutcome = wasRinging ? (isCaller ? 'missed' : 'declined') : null;
    const reason = wasRinging
      ? isCaller
        ? wasRingTimeout
          ? 'Ring timeout'
          : 'Caller hangup'
        : 'Receiver reject'
      : undefined;

    const peerId = isCaller ? endedCall.receiverId : endedCall.callerId;
    const peerUser = usersRef.current.find((u) => u.id === peerId || u.authId === peerId);
    const callerParty = usersRef.current.find(
      (u) => u.id === endedCall.callerId || u.authId === endedCall.callerId
    );
    const receiverParty = usersRef.current.find(
      (u) => u.id === endedCall.receiverId || u.authId === endedCall.receiverId
    );
    const endStatus = ringingOutcome || 'completed';

    // Build sync payload early — peer must see terminal status in call_logs ASAP
    let syncPayload: Record<string, unknown> = {
      callId: endedCall.id,
      callerId: endedCall.callerId,
      receiverId: endedCall.receiverId,
      status: endStatus,
      outcome: endStatus,
      endedBy: currentUser.id,
      reason,
      durationSeconds: wasRinging ? 0 : endedCall.durationSeconds,
      coinsSpent: wasRinging ? 0 : endedCall.coinsSpent,
      coinsEarned: wasRinging ? 0 : endedCall.coinsEarned,
      startTime: endedCall.startTime || endNow,
      endTime: endNow,
    };

    void signalSendAsync({
      type: 'call:ended',
      callId: endedCall.id,
      userId: currentUser.id,
      callerId: endedCall.callerId,
      receiverId: endedCall.receiverId,
      toUserId: peerId,
      toAuthId: peerUser?.authId || undefined,
      callerAuthId: callerParty?.authId || undefined,
      receiverAuthId: receiverParty?.authId || supabaseAuthUserIdRef.current || undefined,
      outcome: endStatus,
      reason,
      status: endStatus,
    });

    if (!wasRinging && endedCall.durationSeconds > 0) {
      recordVideoCallDuration(endedCall.durationSeconds);
    }

    const caller = users.find((u) => u.id === endedCall.callerId);
    const receiver = users.find((u) => u.id === endedCall.receiverId);
    const isFriendCall = isFriend(endedCall.receiverId) || isFriend(endedCall.callerId);
    const logStatus = endStatus;

    if (caller && receiver) {
      const tlId = receiver.teamLeaderId || receiver.createdById || null;
      const tlSharePct = systemSettings.teamLeaderSharePercent ?? 10;
      const estimatedTlEarned =
        !wasRinging && tlId && endedCall.coinsSpent > 0
          ? Math.max(0, Math.round(endedCall.coinsSpent * (tlSharePct / 100)))
          : 0;

      const newLog: CallLogItem = {
        id: endedCall.id,
        callerId: caller.id,
        callerName: caller.name,
        callerAvatar: caller.avatarUrl,
        callerCountry: caller.nationality,
        receiverId: receiver.id,
        receiverName: receiver.name,
        receiverAvatar: receiver.avatarUrl,
        startTime: endedCall.startTime || endNow,
        endTime: endNow,
        durationSeconds: wasRinging ? 0 : endedCall.durationSeconds,
        coinsSpent: wasRinging ? 0 : endedCall.coinsSpent,
        coinsEarned: wasRinging ? 0 : endedCall.coinsEarned,
        teamLeaderId: tlId || undefined,
        teamLeaderEarnedCoins: estimatedTlEarned,
        timestamp: 'Just now',
        wasFriendCall: isFriendCall,
        status: logStatus,
      };
      setCallLogs((prev) => {
        const withoutDup = prev.filter((l) => l.id !== newLog.id);
        return [newLog, ...withoutDup];
      });

      syncPayload = {
        ...syncPayload,
        teamLeaderEarnedCoins: estimatedTlEarned,
        teamLeaderId: tlId,
        wasFriendCall: isFriendCall,
        callerName: caller.name,
        receiverName: receiver.name,
      };
    }

    // Persist end immediately so peer poll/Realtime closes their UI, then clear local call
    void syncCallEndAndPresence(syncPayload, [endedCall.callerId, endedCall.receiverId]);

    setAdminActiveCalls((prev) =>
      prev.filter(
        (c) =>
          c.id !== endedCall.id &&
          c.hostId !== endedCall.receiverId &&
          c.callerId !== endedCall.callerId
      )
    );
    billedMinutesRef.current.clear();
    burnInFlightRef.current.clear();
    billingCapSecondsRef.current = null;
    // Keep insufficientEndToastShownRef so remote call:ended does not double-toast
    setActiveCall(null);

    // Skip generic end toast when insufficient path already notified the initiator
    if (insufficientEndToastShownRef.current && !wasRinging) {
      return;
    }

    showToast(
      wasRinging
        ? ringingOutcome === 'declined'
          ? 'Call Declined 🚫'
          : wasRingTimeout
            ? 'Call Missed'
            : 'Call Cancelled'
        : 'Call Ended',
      wasRinging
        ? ringingOutcome === 'declined'
          ? 'The call was declined.'
          : wasRingTimeout
            ? 'No answer — ring timed out. Saved to call logs.'
            : 'You cancelled the call before it was answered.'
        : `Session duration: ${endedCall.durationSeconds}s. Total coins processed: ${endedCall.coinsSpent} 🪙. Logged to creator call history.`,
      'info'
    );
  };

  // Keep endCallRef fresh for the billing interval (avoids stale closures)
  endCallRef.current = endCall;

  /** LiveKit peer present — enables coin burn. Idempotent per call. Does not reset the visible clock. */
  const markCallMediaConnected = useCallback((callId: string) => {
    const id = String(callId || '').trim();
    if (!id) return;
    setActiveCall((prev) => {
      if (!prev || prev.id !== id || prev.status !== 'active') return prev;
      if (prev.mediaConnected) return prev;
      return {
        ...prev,
        mediaConnected: true,
        startTime: prev.startTime || Date.now(),
      };
    });
  }, []);

  const showInsufficientEndToastOnce = useCallback(
    (title: string, message: string, type: 'error' | 'warning' = 'error') => {
      if (insufficientEndToastShownRef.current) return;
      insufficientEndToastShownRef.current = true;
      showToast(title, message, type);
    },
    [showToast]
  );

  // Apply authoritative burn balances from server response / WS broadcast
  const applyBurnBalances = useCallback((payload: {
    callId?: string;
    callerId?: string;
    receiverId?: string;
    tlId?: string | null;
    newCallerBalance?: number;
    newHostEarnings?: number;
    newTlEarnings?: number;
    callCoinsSpent?: number;
    callCoinsEarned?: number;
    billingMinute?: number;
    coinsBurned?: number;
    hostCoinsEarned?: number;
    duplicate?: boolean;
  }) => {
    const {
      callId,
      callerId,
      receiverId,
      tlId,
      newCallerBalance,
      newHostEarnings,
      newTlEarnings,
      callCoinsSpent,
      callCoinsEarned,
      billingMinute,
      hostCoinsEarned,
    } = payload;

    if (typeof newCallerBalance === 'number' || typeof newHostEarnings === 'number' || typeof newTlEarnings === 'number') {
      setUsers((prev) => {
        const next = prev.map((u) => {
          if (callerId && u.id === callerId && typeof newCallerBalance === 'number') {
            return { ...u, coinBalance: newCallerBalance };
          }
          if (receiverId && u.id === receiverId && typeof newHostEarnings === 'number') {
            return {
              ...u,
              earningsCoins: newHostEarnings,
              totalLifetimeEarnedUSD: coinsToUsd(newHostEarnings, getCoinUsdPeg(systemSettings)),
            };
          }
          if (tlId && u.id === tlId && typeof newTlEarnings === 'number') {
            return {
              ...u,
              earningsCoins: newTlEarnings,
              totalLifetimeEarnedUSD: coinsToUsd(newTlEarnings, getCoinUsdPeg(systemSettings)),
            };
          }
          return u;
        });
        usersRef.current = next;
        return next;
      });
    }

    if (billingMinute && billingMinute > 0) {
      billedMinutesRef.current.add(billingMinute);
    }

    setActiveCall((prev) => {
      if (!prev) return null;
      if (callId && prev.id !== callId) return prev;
      let nextEarned = prev.coinsEarned || 0;
      if (typeof callCoinsEarned === 'number') {
        nextEarned = Math.max(nextEarned, callCoinsEarned);
      } else if (typeof hostCoinsEarned === 'number' && hostCoinsEarned > 0 && !payload.duplicate) {
        // Fallback when fanout only sends per-minute host credit
        nextEarned = nextEarned + hostCoinsEarned;
      }
      const next = {
        ...prev,
        billedMinutes: Math.max(prev.billedMinutes || 0, billingMinute || 0),
        coinsSpent:
          typeof callCoinsSpent === 'number'
            ? Math.max(prev.coinsSpent || 0, callCoinsSpent)
            : prev.coinsSpent,
        coinsEarned: nextEarned,
      };
      activeCallRef.current = next;
      return next;
    });
  }, [systemSettings.coinUsdPeg, systemSettings.femalePayoutRatioUSD]);

  applyBurnBalancesRef.current = applyBurnBalances;

  applyWalletBalanceRef.current = (payload) => {
    const { userId, authId, email, coinBalance, earningsCoins } = payload;
    if (coinBalance === undefined && earningsCoins === undefined) return;
    const cleanEmail = email ? String(email).toLowerCase().trim() : null;
    setUsers((prev) => {
      let matched = false;
      const next = prev.map((u) => {
        const isMatch =
          (userId && (u.id === userId || u.authId === userId)) ||
          (authId && (u.id === authId || u.authId === authId)) ||
          (cleanEmail && u.email && u.email.toLowerCase().trim() === cleanEmail);
        if (!isMatch) return u;
        matched = true;
        return {
          ...u,
          coinBalance: coinBalance !== undefined ? Number(coinBalance) : u.coinBalance,
          earningsCoins: earningsCoins !== undefined ? Number(earningsCoins) : u.earningsCoins,
        };
      });
      if (!matched) return prev;
      usersRef.current = next;
      return next;
    });
  };

  // Visible call clock — ticks every second as soon as the call is active.
  // Not gated on LiveKit mediaConnected (that flag only gates coin burn).
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'active') return;
    const callId = activeCall.id;
    const iAmCaller = currentUser.id === activeCall.callerId;

    const timer = window.setInterval(() => {
      const prev = activeCallRef.current;
      if (!prev || prev.id !== callId || prev.status !== 'active') return;

      const next = (Number(prev.durationSeconds) || 0) + 1;

      if (iAmCaller && prev.mediaConnected) {
        const cap = billingCapSecondsRef.current;
        if (cap != null && cap > 0 && next >= cap) {
          setActiveCall((p) =>
            p && p.id === callId && p.status === 'active' ? { ...p, durationSeconds: cap } : p
          );
          if (!insufficientEndToastShownRef.current) {
            insufficientEndToastShownRef.current = true;
            showToastRef.current?.(
              'Call Auto-Terminated',
              'Coin time finished. Please recharge to continue calling.',
              'error'
            );
          }
          endCallRef.current();
          return;
        }

        const expectedMinute = Math.floor(next / 60) + 1;
        const billedMax = Math.max(
          prev.billedMinutes || 0,
          ...Array.from(billedMinutesRef.current),
          0
        );
        if (expectedMinute > billedMax && expectedMinute > 1) {
          const rateNeeded = getEffectiveCallRate(prev.receiverId, prev.callerId);
          const callerRow = usersRef.current.find((u) => u.id === prev.callerId);
          const localBalance = Number(callerRow?.coinBalance);
          if (Number.isFinite(localBalance) && localBalance < rateNeeded) {
            if (!insufficientEndToastShownRef.current) {
              insufficientEndToastShownRef.current = true;
              showToastRef.current?.(
                'Call Auto-Terminated',
                `Need ${rateNeeded} coins for the next minute. Please recharge.`,
                'error'
              );
            }
            endCallRef.current();
            return;
          }
          requestBurnRef.current(expectedMinute);
        }
      }

      setActiveCall((p) => {
        if (!p || p.id !== callId || p.status !== 'active') return p;
        return { ...p, durationSeconds: next };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeCall?.id, activeCall?.status, activeCall?.callerId, currentUser.id]);

  // Active call billing — CALLER ONLY, after LiveKit peer is present.
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'active') {
      if (!activeCall) {
        billedMinutesRef.current.clear();
        burnInFlightRef.current.clear();
        insufficientEndToastShownRef.current = false;
        billingCapSecondsRef.current = null;
        requestBurnRef.current = () => {};
      }
      return;
    }

    if (!activeCall.mediaConnected || currentUser.id !== activeCall.callerId) {
      requestBurnRef.current = () => {};
      return;
    }

    const callId = activeCall.id;
    const tickCheckSeconds = 60;
    const rateAtStart = getEffectiveCallRate(activeCall.receiverId, activeCall.callerId);

    // Lock max call length from balance at connect: floor(coins/rate)*60
    if (billingCapSecondsRef.current == null) {
      const callerRow = usersRef.current.find((u) => u.id === activeCall.callerId);
      const bal = Number(callerRow?.coinBalance);
      const fullMinutes = Number.isFinite(bal) && rateAtStart > 0 ? Math.floor(bal / rateAtStart) : 0;
      billingCapSecondsRef.current = Math.max(0, fullMinutes) * tickCheckSeconds;
      if (billingCapSecondsRef.current < tickCheckSeconds) {
        showInsufficientEndToastOnce(
          'Call Auto-Terminated',
          `Need ${rateAtStart} coins for 1 minute. Please recharge.`
        );
        endCallRef.current();
        return;
      }
    }

    const endForInsufficient = (message: string) => {
      showInsufficientEndToastOnce('Call Auto-Terminated', message);
      endCallRef.current();
    };

    const requestBurn = async (billingMinute: number) => {
      if (billedMinutesRef.current.has(billingMinute) || burnInFlightRef.current.has(billingMinute)) {
        return;
      }
      burnInFlightRef.current.add(billingMinute);

      try {
        const sessionRes = await supabase.auth.getSession();
        const accessToken = sessionRes.data.session?.access_token;
        if (!accessToken) {
          burnInFlightRef.current.delete(billingMinute);
          endForInsufficient('Authentication required for call billing.');
          return;
        }

        const rateNeeded = getEffectiveCallRate(activeCall.receiverId, activeCall.callerId);
        const callerRow = usersRef.current.find((u) => u.id === activeCall.callerId);
        const localBalance = Number(callerRow?.coinBalance);
        if (Number.isFinite(localBalance) && localBalance < rateNeeded) {
          burnInFlightRef.current.delete(billingMinute);
          endForInsufficient(
            `Need ${rateNeeded} coins for the next minute. Please recharge.`
          );
          return;
        }

        // Ensure call_logs row is active before burn (Vercel has no in-memory activeCalls)
        await authFetch('/api/calls/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            callId,
            callerId: activeCall.callerId,
            receiverId: activeCall.receiverId,
            status: 'active',
            startTime: new Date(activeCall.startTime || Date.now()).toISOString(),
          }),
        }).catch(() => {});

        const postBurn = () =>
          authFetch('/api/calls/burn', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ callId, billingMinute }),
          });

        let res = await postBurn();
        let json = await res.json().catch(() => ({}));
        let code = json?.error?.code || json?.status || json?.code;

        // One retry if sync race left call not active / not found yet
        if (
          !res.ok &&
          (code === 'CALL_NOT_ACTIVE' || code === 'CALL_NOT_FOUND' || res.status === 404 || res.status === 409)
        ) {
          await new Promise((r) => setTimeout(r, 500));
          await authFetch('/api/calls/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              callId,
              callerId: activeCall.callerId,
              receiverId: activeCall.receiverId,
              status: 'active',
              startTime: new Date(activeCall.startTime || Date.now()).toISOString(),
            }),
          }).catch(() => {});
          res = await postBurn();
          json = await res.json().catch(() => ({}));
          code = json?.error?.code || json?.status || json?.code;
        }

        if (
          code === 'INSUFFICIENT_BALANCE' ||
          res.status === 402 ||
          (res.status === 400 && String(code || '').includes('INSUFFICIENT'))
        ) {
          // Do not mark minute as billed — unpaid minute must not increment coinsSpent
          burnInFlightRef.current.delete(billingMinute);
          endForInsufficient('Insufficient coin balance for the next minute. Please recharge.');
          return;
        }

        if (!res.ok || !json?.success) {
          burnInFlightRef.current.delete(billingMinute);
          console.warn('[billing] burn failed:', json?.error || res.statusText);
          // Do not leave the call running unpaid — end after failed billing
          endForInsufficient('Billing failed. Call ended. Please try again or recharge.');
          return;
        }

        const data = json.data || {};
        billedMinutesRef.current.add(billingMinute);
        burnInFlightRef.current.delete(billingMinute);

        applyBurnBalances({
          callId,
          callerId: activeCall.callerId,
          receiverId: activeCall.receiverId,
          tlId: data.tlId,
          newCallerBalance: data.newCallerBalance,
          newHostEarnings: data.newHostEarnings,
          newTlEarnings: data.newTlEarnings,
          callCoinsSpent: data.callCoinsSpent,
          callCoinsEarned: data.callCoinsEarned,
          billingMinute: data.billedMinutes || billingMinute,
          coinsBurned: data.coinsBurned,
          hostCoinsEarned: data.hostCoinsEarned,
          duplicate: data.duplicate,
        });

        // Paid minute runs the full 60s; hard cap / next-minute pre-check ends the call.
      } catch (err) {
        burnInFlightRef.current.delete(billingMinute);
        console.warn('[billing] burn request error:', err);
        endForInsufficient('Billing error. Call ended. Please try again.');
      }
    };

    requestBurnRef.current = (minute: number) => {
      void requestBurn(minute);
    };

    // Bill minute 1 immediately when LiveKit peer is connected
    if (!billedMinutesRef.current.has(1)) {
      void requestBurn(1);
    }

    return () => {
      requestBurnRef.current = () => {};
    };
  }, [
    activeCall?.id,
    activeCall?.status,
    activeCall?.mediaConnected,
    activeCall?.callerId,
    activeCall?.receiverId,
    currentUser.id,
    applyBurnBalances,
    showInsufficientEndToastOnce,
  ]);

  // Real-time synchronization of current activeCall with adminActiveCalls
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'active') {
      return;
    }

    const host = users.find((u) => u.id === activeCall.receiverId) ||
      users.find((u) => u.id === activeCall.callerId && (u.gender === 'female' || u.role === 'female_creator')) ||
      users[1];

    const caller = users.find((u) => u.id === activeCall.callerId) ||
      users.find((u) => u.id === activeCall.receiverId && (u.gender === 'male' || u.role === 'male_user')) ||
      users[0];

    const currentBurnRate = getEffectiveCallRate(host?.id, caller?.id);

    setAdminActiveCalls((prev) => {
      const existingIdx = prev.findIndex((c) => c.id === activeCall.id);
      const callData: AdminActiveCall = {
        id: activeCall.id,
        hostId: host.id,
        hostName: host.name,
        hostAvatar: host.avatarUrl,
        hostCountry: host.nationality || 'Spain',
        hostCountryCode: host.countryCode || 'ES',
        hostHourlyRate: host.hourlyCoinRate || currentBurnRate,
        hostRating: 4.98,
        hostAge: host.age || 24,
        hostEarningsCoins: host.earningsCoins,
        callerId: caller.id,
        callerName: caller.name,
        callerAvatar: caller.avatarUrl,
        callerCountry: caller.nationality || 'United States',
        callerCountryCode: caller.countryCode || 'US',
        callerCoinBalance: caller.coinBalance,
        startTime: activeCall.startTime,
        durationSeconds: activeCall.durationSeconds,
        coinsSpent: activeCall.coinsSpent,
        coinsEarned: activeCall.coinsEarned,
        status: 'active',
        burnRatePerMin: currentBurnRate,
        videoQuality: systemSettings.livekitCaptureResolution === '4k' ? '4K Ultra HD' : systemSettings.livekitCaptureResolution === '1080p' ? '1080p FHD' : systemSettings.livekitCaptureResolution === '480p' ? '480p SD' : '720p HD',
        fps: 60,
        bitrateKbps: 2450,
        latencyMs: 36,
        packetLoss: 0.01,
        safetyScore: 100.0,
        safetyFlag: 'clean',
        aiShieldActive: false,
        warningMessage: activeCall.warningMessage,
      };

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...callData };
        return updated;
      } else {
        return [callData, ...prev];
      }
    });
  }, [activeCall, users, systemSettings, friends]);

  // Send Gift in Call
  const sendGiftInCall = (giftId: string): boolean => {
    if (!activeCall) return false;
    const gift = virtualGifts.find((g) => g.id === giftId);
    if (!gift) return false;

    if (currentUser.coinBalance < gift.coinCost) {
      showToastKey('wallet.gift_insufficient', {
        vars: { gift: gift.name, amount: gift.coinCost },
      });
      return false;
    }

    // Deduct coins from caller, credit female receiver (if eligible)
    const receiverUser = users.find((u) => u.id === activeCall.receiverId);
    const tlId = receiverUser?.teamLeaderId || receiverUser?.createdById || null;
    // Strict: only verified host roles earn (not mere TL linkage)
    const canReceiverEarn =
      receiverUser?.role === 'female_creator' || receiverUser?.role === 'female_host';
    const giftSplit = computeGiftCoinSplit({
      giftCost: gift.coinCost,
      hostSharePercent:
        systemSettings.giftFemaleHostSharePercent ?? DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
      tlSharePercent:
        systemSettings.giftTeamLeaderSharePercent ?? DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
      hasTeamLeader: Boolean(tlId),
      hostEligible: canReceiverEarn,
    });
    const addedEarnedCoins = giftSplit.hostCoins;
    const addedTlCoins = giftSplit.tlCoins;

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === currentUser.id) {
          return { ...u, coinBalance: Math.max(0, u.coinBalance - gift.coinCost) };
        }
        if (u.id === activeCall.receiverId) {
          const newCoins = (u.earningsCoins || 0) + addedEarnedCoins;
          return {
            ...u,
            earningsCoins: newCoins,
            totalLifetimeEarnedUSD: coinsToUsd(newCoins, getCoinUsdPeg(systemSettings)),
            totalGiftsReceivedCount: (u.totalGiftsReceivedCount || 0) + 1,
          };
        }
        if (addedTlCoins > 0 && tlId && u.id === tlId) {
          const newTlCoins = (u.earningsCoins || 0) + addedTlCoins;
          return {
            ...u,
            earningsCoins: newTlCoins,
            totalLifetimeEarnedUSD: coinsToUsd(newTlCoins, getCoinUsdPeg(systemSettings)),
          };
        }
        return u;
      })
    );

    // Sync gift via atomic server RPC (prices/shares server-derived; never send coinCost)
    const giftIdempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `gift_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    authFetch('/api/gifts/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiverId: activeCall.receiverId,
        giftId: gift.id,
        callId: activeCall.id,
        clientTempId: giftIdempotencyKey,
        idempotencyKey: giftIdempotencyKey,
      }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success && typeof json.senderBalance === 'number') {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === currentUser.id ? { ...u, coinBalance: Number(json.senderBalance) } : u
            )
          );
        } else if (!res.ok) {
          console.warn('[sendGiftInCall] server gift failed', json?.error || res.status);
        }
      })
      .catch(() => {});

    // Update active call state
    setActiveCall((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        coinsSpent: prev.coinsSpent + gift.coinCost,
        coinsEarned: prev.coinsEarned + addedEarnedCoins,
        giftsSent: [
          ...prev.giftsSent,
          { giftId: gift.id, giftName: gift.name, cost: gift.coinCost, timestamp: Date.now() },
        ],
      };
    });

    recordGiftSentInteraction();

    // Prefer MegaGiftOverlay FX + chat bubble over a sticky toast during calls
    return true;
  };

  // Peer / multi-device: upsert optimistic in-call preview (LiveKit data or WS). Durable id reconciles later.
  const ingestInCallChatPreview = (payload: {
    clientTempId: string;
    text: string;
    senderId: string;
    receiverId: string;
    messageType?: string;
  }) => {
    const tempId = String(payload.clientTempId || '').trim().slice(0, 80);
    const senderId = String(payload.senderId || '');
    const receiverId = String(payload.receiverId || '');
    const text = String(payload.text || '').trim();
    if (!tempId || !senderId || !receiverId || !text) return;

    setChatMessages((prev) => {
      if (prev.some((m) => m.id === tempId || m.clientTempId === tempId)) return prev;
      // Durable already arrived (Realtime/WS) — attach clientTempId for overlay reconcile, don't add temp
      const durableIdx = prev.findIndex(
        (m) =>
          !m.id.startsWith('temp_') &&
          m.senderId === senderId &&
          m.receiverId === receiverId &&
          m.text === text
      );
      if (durableIdx >= 0) {
        const existing = prev[durableIdx];
        if (existing.clientTempId === tempId) return prev;
        const next = [...prev];
        next[durableIdx] = { ...existing, clientTempId: existing.clientTempId || tempId };
        return next;
      }
      const msgType = payload.messageType === 'gift' ? 'gift' : 'text';
      const nowIso = new Date().toISOString();
      return [
        ...prev,
        {
          id: tempId,
          clientTempId: tempId,
          senderId,
          receiverId,
          text,
          originalLanguage: 'English',
          type: msgType as ChatMessage['type'],
          isRead: currentUserIdRef.current === senderId,
          createdAt: nowIso,
          timestamp: nowIso,
        },
      ];
    });
  };

  /** Fire-and-forget WS preview to peer (server relays without DB). */
  const notifyInCallChatPreview = (payload: {
    clientTempId: string;
    text: string;
    receiverId: string;
    messageType?: string;
  }) => {
    if (!currentUser?.id || !payload.receiverId || !payload.clientTempId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN && wsAuthenticatedRef.current) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'chat:incall_preview',
            clientTempId: payload.clientTempId,
            text: payload.text,
            receiverId: payload.receiverId,
            senderId: currentUser.id,
            messageType: payload.messageType === 'gift' ? 'gift' : 'text',
          })
        );
      } catch (e) {
        console.warn('[notifyInCallChatPreview] WS send failed:', e);
      }
    }
  };

  // Send Chat Message — Express → Supabase → Realtime (optimistic temp id reconciled)
  const sendMessage = async (
    receiverId: string,
    text: string,
    _targetLang: string = 'English',
    mediaUrl?: string,
    type: 'text' | 'gift' | 'system' | 'friend_request' | 'image' = mediaUrl ? 'image' : 'text',
    sharedClientTempId?: string
  ): Promise<{ ok: boolean; clientTempId?: string }> => {
    if (!currentUser?.id || !receiverId) return { ok: false };

    if (blockedUserIds.includes(receiverId) || blockedByUserIds.includes(receiverId)) {
      showToast('Blocked', 'You cannot message this user.', 'error');
      return { ok: false };
    }

    const trimmed = (text || '').trim();
    const durableMedia =
      mediaUrl && !mediaUrl.startsWith('blob:') && !mediaUrl.startsWith('data:') ? mediaUrl : undefined;

    if (!trimmed && !durableMedia) {
      showToast('Empty message', 'Add text or wait for the image upload to finish.', 'warning');
      return { ok: false };
    }

    // Local-only system/rating types are not inserted into messages CHECK constraint via API
    if (type === 'system') {
      const localMsg: ChatMessage = {
        id: 'temp_sys_' + Date.now(),
        senderId: currentUser.id,
        receiverId,
        text: trimmed,
        originalLanguage: currentUser.spokenLanguages?.[0] || 'English',
        type: 'system',
        isRead: true,
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, localMsg]);
      return { ok: true, clientTempId: localMsg.id };
    }

    const clientTempId =
      (typeof sharedClientTempId === 'string' && sharedClientTempId.startsWith('temp_')
        ? sharedClientTempId.trim().slice(0, 80)
        : '') || `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimisticType: ChatMessage['type'] =
      type === 'image' || durableMedia ? 'image' : type === 'gift' || type === 'friend_request' ? type : 'text';

    const optimistic: ChatMessage = {
      id: clientTempId,
      clientTempId,
      senderId: currentUser.id,
      receiverId,
      text: trimmed || (durableMedia ? '📷 Photo' : ''),
      originalLanguage: currentUser.spokenLanguages?.[0] || 'English',
      mediaUrl: durableMedia,
      type: optimisticType,
      isRead: true,
      createdAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => {
      if (prev.some((m) => m.id === clientTempId || m.clientTempId === clientTempId)) return prev;
      return [...prev, optimistic];
    });

    if (receiverId !== currentUser.id) {
      recordChatFriendInteraction(receiverId);
    }
    if (type === 'gift') {
      recordGiftSentInteraction();
    }

    try {
      const res = await authFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId,
          text: trimmed || undefined,
          mediaUrl: durableMedia,
          mediaType: durableMedia ? 'image' : undefined,
          type: optimisticType === 'image' || optimisticType === 'text' || optimisticType === 'gift' || optimisticType === 'friend_request'
            ? optimisticType
            : 'text',
          clientTempId,
          originalLanguage: currentUser.spokenLanguages?.[0] || 'English',
        }),
      });

      const json = await res.json().catch(() => null);
      // Express: data.message; legacy CJS: top-level message
      const serverMsg = (json?.data?.message || json?.message) as ChatMessage | undefined;
      if (!res.ok || !json?.success || !serverMsg?.id) {
        const msg =
          (typeof json?.error === 'object' && json?.error?.message) ||
          (typeof json?.error === 'string' && json.error) ||
          'Failed to send message';
        setChatMessages((prev) => prev.filter((m) => m.id !== clientTempId && m.clientTempId !== clientTempId));
        showToast('Message failed', msg, 'error');
        return { ok: false, clientTempId };
      }
      const durable: ChatMessage = {
        ...serverMsg,
        isRead: Boolean(serverMsg.isRead),
        createdAt: serverMsg.createdAt || serverMsg.timestamp,
        timestamp: serverMsg.createdAt || serverMsg.timestamp,
        clientTempId,
      };
      setChatMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== clientTempId && m.id !== serverMsg.id);
        return [...withoutTemp, durable];
      });
      // Push to peer inbox for badge (Realtime/Vercel; postgres_changes is backup)
      if (receiverId && receiverId !== currentUser.id) {
        void signalSendAsync({
          type: 'chat:message',
          toUserId: receiverId,
          receiverId,
          message: { ...durable, isRead: false },
        });
      }
      return { ok: true, clientTempId };
    } catch (err: any) {
      console.warn('[sendMessage] failed:', err);
      setChatMessages((prev) => prev.filter((m) => m.id !== clientTempId && m.clientTempId !== clientTempId));
      showToast('Message failed', err?.message || 'Network error sending message', 'error');
      return { ok: false, clientTempId };
    }
  };

  /** Cursor-based older history for a 1:1 thread (max 40–50 per page). */
  const loadOlderMessages = async (
    otherUserId: string,
    cursor?: string | null
  ): Promise<{ nextCursor: string | null; loaded: number }> => {
    const me = currentUser?.id;
    const other = String(otherUserId || '').trim();
    if (!me || !other) return { nextCursor: null, loaded: 0 };
    try {
      const page = await loadConversationHistoryPage(me, other, {
        cursor: cursor || null,
        limit: 40,
      });
      if (!page?.messages?.length) return { nextCursor: null, loaded: 0 };
      setChatMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const incoming = page.messages.filter((m) => m.id && !seen.has(m.id));
        if (!incoming.length) return prev;
        // Prepend older messages (chronological merge)
        return [...incoming, ...prev];
      });
      return { nextCursor: page.nextCursor, loaded: page.messages.length };
    } catch (e) {
      console.warn('[loadOlderMessages]', e);
      return { nextCursor: null, loaded: 0 };
    }
  };

  // Clear Chat History — soft-hide for acting user (message_conversation_clears)
  const clearChatHistory = async (otherUserId: string): Promise<boolean> => {
    if (!otherUserId || !currentUser?.id) return false;

    try {
      const res = await authFetch(`/api/messages/conversation/${encodeURIComponent(otherUserId)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Clear failed', json?.error?.message || 'Could not clear conversation', 'error');
        return false;
      }

      setChatMessages((prev) =>
        prev.filter(
          (m) =>
            !(
              (m.senderId === currentUser.id && m.receiverId === otherUserId) ||
              (m.senderId === otherUserId && m.receiverId === currentUser.id)
            )
        )
      );
      showToast('Chat Cleared', 'Conversation history has been cleared for you.', 'info');
      return true;
    } catch (err: any) {
      showToast('Clear failed', err?.message || 'Network error', 'error');
      return false;
    }
  };

  const refreshCreatorReviews = async (creatorId?: string) => {
    const targetId = creatorId || currentUser?.id;
    if (!targetId || targetId === 'guest_user') {
      setCreatorReviews([]);
      return;
    }
    try {
      const res = await authFetch(`/api/v1/reviews/creator/${encodeURIComponent(targetId)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        console.warn('refreshCreatorReviews failed:', json?.error?.message);
        return;
      }
      const list = Array.isArray(json.data?.reviews) ? json.data.reviews : [];
      setCreatorReviews(
        list.map((r: any) => ({
          id: String(r.id),
          creatorId: String(r.creatorId),
          callerId: String(r.callerId),
          callerName: r.callerName || 'Caller',
          callerAvatar: r.callerAvatar || '',
          callLogId: r.callLogId,
          stars: Number(r.stars) || 5,
          communication: r.communication,
          friendliness: r.friendliness,
          clarity: r.clarity,
          energy: r.energy,
          comment: r.comment,
          tags: Array.isArray(r.tags) ? r.tags : [],
          createdAt: r.createdAt || '',
          callDurationSeconds: r.callDurationSeconds,
        }))
      );
    } catch (err) {
      console.warn('refreshCreatorReviews exception:', err);
    }
  };

  // Submit Creator Review (Express → creator_reviews)
  const submitCreatorReview = async (
    reviewData: Omit<CreatorReview, 'id' | 'createdAt'> & { ratingRequestMessageId?: string }
  ): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to submit a rating.', 'warning');
      return false;
    }
    if (currentUser.id !== reviewData.callerId) {
      showToast('Rating failed', 'Only the caller can submit this rating.', 'error');
      return false;
    }

    try {
      const res = await authFetch('/api/v1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId: reviewData.creatorId,
          callLogId: reviewData.callLogId,
          ratingRequestMessageId: reviewData.ratingRequestMessageId,
          stars: reviewData.stars,
          communication: reviewData.communication,
          friendliness: reviewData.friendliness,
          clarity: reviewData.clarity,
          energy: reviewData.energy,
          comment: reviewData.comment,
          tags: reviewData.tags,
          callDurationSeconds: reviewData.callDurationSeconds,
          callerName: reviewData.callerName,
          callerAvatar: reviewData.callerAvatar,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Rating failed', json?.error?.message || 'Could not save rating.', 'error');
        return false;
      }

      const saved = json.data?.review;
      if (saved) {
        setCreatorReviews((prev) => {
          const mapped: CreatorReview = {
            id: String(saved.id),
            creatorId: String(saved.creatorId),
            callerId: String(saved.callerId),
            callerName: saved.callerName || reviewData.callerName,
            callerAvatar: saved.callerAvatar || reviewData.callerAvatar,
            callLogId: saved.callLogId,
            stars: Number(saved.stars) || reviewData.stars,
            communication: saved.communication,
            friendliness: saved.friendliness,
            clarity: saved.clarity,
            energy: saved.energy,
            comment: saved.comment,
            tags: Array.isArray(saved.tags) ? saved.tags : reviewData.tags,
            createdAt: saved.createdAt || new Date().toISOString(),
            callDurationSeconds: saved.callDurationSeconds,
          };
          return [mapped, ...prev.filter((r) => r.id !== mapped.id)];
        });
      }

      // Update matching in-chat rating message locally (Realtime UPDATE also syncs)
      setChatMessages((prev) =>
        prev.map((msg) => {
          if (
            msg.type === 'call_rating' &&
            msg.ratingInfo &&
            ((reviewData.ratingRequestMessageId && msg.id === reviewData.ratingRequestMessageId) ||
              (msg.ratingInfo.callLogId &&
                reviewData.callLogId &&
                msg.ratingInfo.callLogId === reviewData.callLogId) ||
              (msg.ratingInfo.creatorId === reviewData.creatorId &&
                msg.ratingInfo.callerId === reviewData.callerId &&
                !msg.ratingInfo.isSubmitted))
          ) {
            return {
              ...msg,
              ratingInfo: {
                ...msg.ratingInfo,
                stars: reviewData.stars,
                communication: reviewData.communication,
                friendliness: reviewData.friendliness,
                clarity: reviewData.clarity,
                energy: reviewData.energy,
                comment: reviewData.comment,
                tags: reviewData.tags,
                isSubmitted: true,
              },
            };
          }
          return msg;
        })
      );

      if (json.data?.creatorRating) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === reviewData.creatorId
              ? {
                  ...u,
                  ratingScore: json.data.creatorRating.ratingScore,
                  totalReviewsCount: json.data.creatorRating.totalReviewsCount,
                }
              : u
          )
        );
      }

      setPendingRatingCall(null);
      showToast(
        'Rating submitted',
        `Thanks for rating ${reviewData.creatorName || 'the host'} (${reviewData.stars}★).`,
        'success'
      );
      return true;
    } catch (err: any) {
      console.warn('submitCreatorReview error:', err);
      showToast('Rating failed', err?.message || 'Network error saving rating.', 'error');
      return false;
    }
  };

  // Send Rating Request (durable call_rating message via Express)
  const sendRatingRequest = async (
    creatorId: string,
    callerId: string,
    callLogId?: string
  ): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to ask for a rating.', 'warning');
      return false;
    }
    if (currentUser.id !== creatorId) {
      showToast('Request failed', 'Only the host can ask for a rating.', 'error');
      return false;
    }

    try {
      const res = await authFetch('/api/v1/reviews/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerId,
          ...(callLogId ? { callLogId } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast(
          'Request failed',
          json?.error?.message || 'Could not send rating request.',
          'error'
        );
        return false;
      }

      const message = json.data?.message;
      if (message?.id) {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message as ChatMessage];
        });
      }

      const caller = users.find((u) => u.id === callerId);
      if (json.data?.alreadyRequested) {
        showToast(
          'Already requested',
          'An open rating request is already waiting for this caller.',
          'info'
        );
      } else {
        showToast(
          'Rating request sent',
          `Asked ${caller?.name || 'caller'} for feedback.`,
          'success'
        );
      }
      return true;
    } catch (err: any) {
      console.warn('sendRatingRequest error:', err);
      showToast('Request failed', err?.message || 'Network error sending request.', 'error');
      return false;
    }
  };

  // Mark chat messages from a user as read (DB is_read via Express)
  const markChatAsRead = (otherUserId: string) => {
    if (!otherUserId || !currentUser?.id) return;

    const idsToMark = chatMessages
      .filter(
        (m) =>
          m.senderId === otherUserId &&
          m.receiverId === currentUser.id &&
          m.isRead !== true &&
          !readMessageIds.includes(m.id)
      )
      .map((m) => m.id);

    if (idsToMark.length === 0) return;

    // Optimistic local mirror
    setReadMessageIds((prev) => Array.from(new Set([...prev, ...idsToMark])));
    setChatMessages((prev) =>
      prev.map((m) =>
        idsToMark.includes(m.id) ? { ...m, isRead: true } : m
      )
    );

    authFetch('/api/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otherUserId }),
    }).catch((err) => console.warn('[markChatAsRead] API note:', err));
  };

  // Mark all unread messages as read (per-sender API calls)
  const markAllChatsAsRead = () => {
    const unread = chatMessages.filter(
      (m) => m.receiverId === currentUser.id && m.isRead !== true
    );
    const allReceivedIds = unread.map((m) => m.id);
    const senderIds = Array.from(new Set(unread.map((m) => m.senderId)));

    setReadMessageIds((prev) => Array.from(new Set([...prev, ...allReceivedIds])));
    setChatMessages((prev) =>
      prev.map((m) =>
        m.receiverId === currentUser.id ? { ...m, isRead: true } : m
      )
    );

    for (const otherUserId of senderIds) {
      authFetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId }),
      }).catch(() => {});
    }

    showToast('Chats Marked as Read', 'All new message indicators have been cleared.', 'info');
  };

  // Payout Request — disabled (Phase 7: period-end settlement batches only)
  const submitPayoutRequest = (_amountCoins: number, _payoutMethod: string, _accountDetails: string): boolean => {
    showToast(
      'Period-End Settlements Only',
      'Manual withdrawals are disabled. Host salaries and Agency commissions pay out through settlement batches at period close.',
      'warning'
    );
    return false;
  };

  // Load LiveKit status from server env on mount (never accept secrets from the browser).
  useEffect(() => {
    authFetch('/api/livekit/config')
      .then((res) => res.json())
      .then((data) => {
        if (!data) return;
        setSystemSettings((prev) => ({
          ...prev,
          livekitApiKey: data.configured ? '••••••••' : '',
          livekitApiSecret: data.configured ? '••••••••' : '',
          livekitWsUrl: data.wsUrl || prev.livekitWsUrl || '',
        }));
      })
      .catch(() => { });
  }, []);

  // Admin Actions
  const updateSystemSettings = (newSettings: Partial<SystemSettings>) => {
    setSystemSettings((prev) => {
      const mergedPrices = newSettings.quickMatchGiftPrices
        ? { ...(prev.quickMatchGiftPrices || INITIAL_SYSTEM_SETTINGS.quickMatchGiftPrices), ...newSettings.quickMatchGiftPrices }
        : prev.quickMatchGiftPrices;

      // Fixed Peg: when peg changes, keep legacy dual-FX fields in sync in client state.
      const pegPatch: Partial<SystemSettings> = {};
      if (newSettings.coinUsdPeg !== undefined) {
        const peg = Number(newSettings.coinUsdPeg);
        if (Number.isFinite(peg) && peg > 0) {
          pegPatch.coinUsdPeg = peg;
          pegPatch.femalePayoutRatioUSD = peg;
          pegPatch.coinToUSDRatio = peg;
        }
      }

      const updated: SystemSettings = {
        ...prev,
        ...newSettings,
        ...pegPatch,
        quickMatchGiftPrices: mergedPrices,
      };

      try {
        localStorage.setItem('livecall_settings', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save livecall_settings:', e);
      }

      return updated;
    });

    if (isSupabaseConfigured()) {
      updateSystemConfigsInSupabase(newSettings).catch((e) => console.warn('Supabase system settings update error:', e));
      if (
        newSettings.allowedCountryCodes !== undefined ||
        newSettings.allowedLanguages !== undefined ||
        newSettings.allowedZodiacSigns !== undefined ||
        newSettings.allowedInterests !== undefined
      ) {
        pushAllTaxonomiesAndSettingsToSupabase(newSettings).catch((e) =>
          console.warn('Taxonomies DB push exception:', e)
        );
      }
    }
    showToast('System Settings Saved ⚙️', 'Economy parameters, taxonomies, and platform settings saved live.', 'success');
  };

  /** Refresh LiveKit status from server env (secrets are never accepted from the browser). */
  const updateLiveKitConfig = async (_config?: {
    apiKey?: string;
    apiSecret?: string;
    wsUrl?: string;
  }): Promise<boolean> => {
    try {
      const res = await authFetch('/api/livekit/config');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        setSystemSettings((prev) => ({
          ...prev,
          livekitApiKey: data.configured ? '••••••••' : '',
          livekitApiSecret: data.configured ? '••••••••' : '',
          livekitWsUrl: data.wsUrl || prev.livekitWsUrl || '',
        }));
        if (data.configured) {
          showToast(
            'LiveKit Env Active 🔑',
            data.message || 'LiveKit credentials are loaded from server environment variables.',
            'success'
          );
        } else {
          showToast(
            'LiveKit Not Configured',
            data.message || 'Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in Vercel env and Redeploy.',
            'warning'
          );
        }
        return Boolean(data.configured);
      }
      showToast('LiveKit Status Error', data?.error?.message || data?.error || 'Could not read LiveKit config', 'error');
      return false;
    } catch {
      showToast('Connection Error', 'Could not reach server for LiveKit status.', 'error');
      return false;
    }
  };

  const saveCoinPackage = (pkg: Partial<CoinPackage> & { id?: string }) => {
    const normalizeNullableNumber = (value: unknown): number | null => {
      if (value == null || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const discountPriceUSD = normalizeNullableNumber(pkg.discountPriceUSD);
    const approxRaw = normalizeNullableNumber(pkg.approxCallMinutes);
    const approxCallMinutes = approxRaw == null ? null : Math.floor(approxRaw);
    const savingLabel = pkg.savingLabel ? String(pkg.savingLabel).trim() || null : null;

    if (pkg.id) {
      const merged = {
        ...pkg,
        discountPriceUSD,
        approxCallMinutes,
        savingLabel,
      };
      const updated = coinPackages.map((p) => (p.id === pkg.id ? ({ ...p, ...merged } as CoinPackage) : p));
      setCoinPackages(updated);
      localStorage.setItem('livecall_packages', JSON.stringify(updated));
      if (isSupabaseConfigured()) {
        upsertCoinPackageToSupabase(updated.find((p) => p.id === pkg.id)!).catch(() => { });
      }
      showToast('Package Updated', `Updated coin SKU: ${pkg.title}`, 'success');
    } else {
      const newPkg: CoinPackage = {
        id: 'pkg_' + Date.now(),
        title: pkg.title || 'New Package',
        coins: pkg.coins || 100,
        bonusCoins: pkg.bonusCoins || 0,
        priceUSD: pkg.priceUSD || 4.99,
        discountPriceUSD,
        approxCallMinutes,
        savingLabel,
        badgeTag: pkg.badgeTag,
        popular: Boolean(pkg.popular),
        orderNum: pkg.orderNum,
      };
      const updated = [...coinPackages, newPkg];
      setCoinPackages(updated);
      localStorage.setItem('livecall_packages', JSON.stringify(updated));
      if (isSupabaseConfigured()) {
        upsertCoinPackageToSupabase(newPkg).catch(() => { });
      }
      showToast('New Package Added', `Created coin SKU: ${newPkg.title}`, 'success');
    }
  };

  const deleteCoinPackage = (packageId: string) => {
    const updated = coinPackages.filter((p) => p.id !== packageId);
    setCoinPackages(updated);
    localStorage.setItem('livecall_packages', JSON.stringify(updated));
    if (isSupabaseConfigured()) {
      deleteCoinPackageFromSupabase(packageId).catch(() => { });
    }
    showToast('Package Deleted', 'Coin bundle removed from store', 'info');
  };

  const saveCurrencyConfigs = (configs: CurrencyItem[]) => {
    const normalized = (configs || []).map((c, idx) => ({
      code: String(c.code || '').toUpperCase(),
      name: c.name || c.code,
      symbol: c.symbol || c.code,
      rateFromUsd: Number(c.rateFromUsd) > 0 ? Number(c.rateFromUsd) : 1,
      enabled: c.enabled !== false,
      orderNum: c.orderNum != null ? Number(c.orderNum) : idx,
    }));
    setCurrencyConfigs(normalized.length > 0 ? normalized : DEFAULT_CURRENCIES.map((c) => ({ ...c })));
    if (isSupabaseConfigured()) {
      upsertCurrencyConfigsToSupabase(normalized).catch(() => { });
    }
  };

  const saveVirtualGift = (gift: Partial<VirtualGift> & { id?: string }) => {
    if (gift.id) {
      setVirtualGifts((prev) => {
        const next = prev.map((g) => (g.id === gift.id ? ({ ...g, ...gift } as VirtualGift) : g));
        localStorage.setItem('livecall_virtual_gifts', JSON.stringify(next));
        if (isSupabaseConfigured()) {
          updateSystemConfigsInSupabase({ virtualGifts: next }).catch(() => { });
        }
        return next;
      });
      showToast('Virtual Gift Updated 🎁', `Updated ${gift.name || 'gift'} price to ${gift.coinCost} coins`, 'success');
    } else {
      const newGift: VirtualGift = {
        id: 'g_' + Date.now(),
        name: gift.name || 'New Gift',
        coinCost: gift.coinCost || 50,
        icon: gift.icon || '🎁',
        animationType: gift.animationType || 'heart',
        color: gift.color || 'from-pink-500 to-rose-600',
        isActive: gift.isActive !== false,
        category: gift.category || 'General',
      };
      setVirtualGifts((prev) => {
        const next = [...prev, newGift];
        localStorage.setItem('livecall_virtual_gifts', JSON.stringify(next));
        if (isSupabaseConfigured()) {
          updateSystemConfigsInSupabase({ virtualGifts: next }).catch(() => { });
        }
        return next;
      });
      showToast('New Gift Added 🎁', `Created virtual gift SKU: ${newGift.name}`, 'success');
    }
  };

  const deleteVirtualGift = (giftId: string) => {
    setVirtualGifts((prev) => {
      const next = prev.filter((g) => g.id !== giftId);
      localStorage.setItem('livecall_virtual_gifts', JSON.stringify(next));
      if (isSupabaseConfigured()) {
        updateSystemConfigsInSupabase({ virtualGifts: next }).catch(() => { });
      }
      return next;
    });
    showToast('Gift Removed', 'Virtual gift removed from store', 'info');
  };

  const resetVirtualGifts = () => {
    setVirtualGifts(VIRTUAL_GIFTS);
    localStorage.setItem('livecall_virtual_gifts', JSON.stringify(VIRTUAL_GIFTS));
    if (isSupabaseConfigured()) {
      updateSystemConfigsInSupabase({ virtualGifts: VIRTUAL_GIFTS }).catch(() => { });
    }
    showToast('Gifts Reset 🎁', 'Virtual gifts restored to default catalog.', 'info');
  };

  const adminApprovePayout = (_requestId: string, _note?: string) => {
    showToast(
      'Legacy Queue Read-Only',
      'Approving manual payout_requests is disabled to prevent double-pay. Use Financial Module → settlement batches.',
      'warning'
    );
  };

  const adminRejectPayout = (_requestId: string, _note?: string) => {
    showToast(
      'Legacy Queue Read-Only',
      'Manual payout status changes are disabled. Historical payout_requests are view-only; cash-out is via settlements.',
      'warning'
    );
  };

  const adminUpdateUser = (userId: string, updates: Partial<UserProfile>) => {
    const targetUser = usersRef.current.find((u) => u.id === userId) || users.find((u) => u.id === userId);
    if (!targetUser) return;

    const merged: UserProfile = { ...targetUser, ...updates };

    setUsers((prev) => {
      const next = prev.map((u) => (u.id === userId ? merged : u));
      usersRef.current = next;
      return next;
    });

    // 1. Instant WebSocket broadcast to sync serverUsers in-memory immediately
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'user:update',
          userId,
          userProfile: merged,
        })
      );
    }

    // 2. Direct column update in Supabase PostgreSQL by user ID
    if (isSupabaseConfigured()) {
      updateUserProfileInSupabase(userId, updates).catch((e) =>
        console.warn('Admin direct Supabase update error:', e)
      );
      upsertProfileToSupabase(merged).catch((e) =>
        console.warn('Admin user update Supabase sync notice:', e)
      );
    }

    // 3. Sync to node server & broadcast
    authFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    }).catch((e) => console.warn('Admin user update sync notice:', e));

    showToast('User Updated 🛠️', `Admin changes saved for: ${updates.name || userId}`, 'success');
  };

  const adminDeleteUser = async (userId: string): Promise<boolean> => {
    const target = users.find((u) => u.id === userId) || usersRef.current.find((u) => u.id === userId);

    try {
      const res = await authFetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const errMsg =
          (typeof data?.error === 'string' && data.error) ||
          data?.error?.message ||
          'Server rejected the deletion.';
        showToast('Delete Failed', errMsg, 'error');
        return false;
      }

      deletedUserIdsRef.current.add(userId);

      setUsers((prev) => {
        const next = prev.filter((u) => u.id !== userId);
        usersRef.current = next;
        return next;
      });

      const r2Count = data?.data?.r2DeletedCount;
      const warnCount = Array.isArray(data?.data?.warnings) ? data.data.warnings.length : 0;
      const authDeleted = data?.data?.authDeleted !== false;
      if (!authDeleted) {
        showToast(
          'User Deleted (Auth warning)',
          `Profile removed for ${target?.name || userId}, but Auth login may still work. Retry delete or run orphan Auth cleanup.`,
          'warning'
        );
        // Profile is gone — still treat as success so delete modal can close
        return true;
      }
      showToast(
        'User Deleted',
        `Permanently removed ${target?.name || userId}${
          typeof r2Count === 'number' ? ` (${r2Count} media objects purged)` : ''
        }${warnCount ? ` — ${warnCount} warning(s)` : ''}. Auth login disabled.`,
        warnCount ? 'info' : 'success'
      );
      return true;
    } catch (e: any) {
      showToast('Delete Failed', e?.message || 'Network error during user delete.', 'error');
      return false;
    }
  };

  const toggleVerifyUser = (userId: string) => {
    let targetName = '';
    let nextVerified = false;
    let updatedProfile: UserProfile | null = null;
    setUsers((prev) => {
      const next = prev.map((u) => {
        if (u.id === userId) {
          nextVerified = !u.isVerified;
          targetName = u.name;
          const merged = { ...u, isVerified: nextVerified };
          updatedProfile = merged;
          return merged;
        }
        return u;
      });
      usersRef.current = next;
      return next;
    });

    if (updatedProfile) {
      if (isSupabaseConfigured()) {
        updateUserProfileInSupabase(userId, { isVerified: nextVerified }).catch(() => {});
        upsertProfileToSupabase(updatedProfile).catch(() => {});
      }
      authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile),
      }).catch(() => {});
    }
    if (targetName) {
      showToast('Verification Status Changed', `${targetName} is now ${nextVerified ? 'VERIFIED ✓' : 'UNVERIFIED'}`, 'info');
    }
  };

  const toggleUserStatus = (userId: string, newStatus: 'online' | 'busy' | 'offline' | 'in_call') => {
    const requested: 'online' | 'busy' | 'offline' =
      newStatus === 'in_call' || newStatus === 'busy' ? 'busy' : newStatus === 'offline' ? 'offline' : 'online';

    // Only the signed-in user may change their own preference via this control
    const isSelf =
      userId === currentUserIdRef.current ||
      userId === currentUser?.id ||
      (currentUser?.authId && userId === currentUser.authId);

    if (isSelf) {
      preferredStatusRef.current = requested;
      // Explicit Online/Offline from profile menu clears a stale local call lock
      if (requested !== 'busy' && activeCallRef.current) {
        activeCallRef.current = null;
        setActiveCall(null);
      }
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, onlineStatus: requested } : u))
    );

    try {
      localStorage.setItem('livecall_presence_trigger', `${userId}_${requested}_${Date.now()}`);
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('livecall_presence_sync_channel');
        bc.postMessage({ type: 'presence_updated', userId, status: requested });
        bc.close();
      }
    } catch {
      /* ignore */
    }

    void (async () => {
      try {
        const inLiveCall =
          !!activeCallRef.current && activeCallRef.current.status !== 'ended';
        const res = await authFetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: requested,
            // Clear zombie call_logs when going Online/Offline (not while a live call UI is open)
            clearCalls:
              !inLiveCall && (requested === 'online' || requested === 'offline'),
          }),
        });
        const data = await res.json().catch(() => null);
        if (data?.presence) {
          applyPresenceMap(data.presence, data.status || requested);
        } else if (data?.status) {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === userId ? { ...u, onlineStatus: data.status } : u
            )
          );
        } else if (!res.ok) {
          // Fallback path
          await updateUserStatusInSupabase(userId, requested);
        }
      } catch (e) {
        console.warn('Presence API notice:', e);
        updateUserStatusInSupabase(userId, requested).catch(() => {});
      }
    })();

    signalSend({ type: 'presence:update', userId, status: requested });
  };

  /** @deprecated Client-only grants disabled — use POST /api/v1/finance/funding/admin-credit (ManualCoinModal). */
  const manualGrantCoins = (_userId: string, _amount: number, _reason: string = 'Manual Admin Credit') => {
    console.warn(
      '[manualGrantCoins] Blocked: use Financial Module POST /api/v1/finance/funding/admin-credit (PURCHASE ledger required).'
    );
    showToast(
      'Client grant blocked',
      'Coin credits must post via Financial Module API (wallet_ledger PURCHASE). Use Admin → Manual Coin Credit.',
      'error'
    );
  };

  const createTeamLeader = async (
    leaderData: Partial<UserProfile> & { password?: string }
  ): Promise<UserProfile | null> => {
    const name = String(leaderData.name || '').trim();
    const email = String(leaderData.email || '')
      .trim()
      .toLowerCase();
    const password = String((leaderData as any).password || '');

    if (!name) {
      showToast('Validation Error', 'Agency name is required.', 'error');
      return null;
    }
    if (!email || !email.includes('@')) {
      showToast('Validation Error', 'A valid login email is required so the agency can sign in.', 'error');
      return null;
    }
    const pwError = getPasswordPolicyError(password);
    if (pwError) {
      showToast('Password Policy', pwError, 'error');
      return null;
    }

    try {
      const res = await authFetch('/api/admin/create-team-leader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          agencyName: leaderData.agencyName || 'Aurora Talent Management',
          commissionPercent: leaderData.commissionPercent ?? 15,
          spokenLanguages: leaderData.spokenLanguages || ['English'],
          nationality: leaderData.nationality || 'United States',
          countryCode: leaderData.countryCode || 'US',
          bio: leaderData.bio || 'Talent Management & Creator Agency Director',
          avatarUrl:
            leaderData.avatarUrl ||
            'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.user?.id) {
        const msg =
          data?.error?.message ||
          data?.message ||
          `Failed to create agency (HTTP ${res.status}).`;
        showToast('Agency Not Created', msg, 'error');
        return null;
      }

      const created = data.user as UserProfile;
      const newLeader: UserProfile = {
        id: created.id,
        authId: created.authId || created.id,
        name: created.name || name,
        email: created.email || email,
        gender: 'female',
        genderLocked: true,
        role: 'team_leader',
        age: created.age || 28,
        dob: leaderData.dob || '1998-05-12',
        nationality: created.nationality || leaderData.nationality || 'United States',
        countryCode: created.countryCode || leaderData.countryCode || 'US',
        spokenLanguages: created.spokenLanguages || leaderData.spokenLanguages || ['English'],
        bio: created.bio || leaderData.bio || 'Talent Management & Creator Agency Director',
        interests: created.interests || ['Talent Growth', 'Creator Mentorship'],
        tags: created.tags || ['Agency', 'VIP Agency'],
        avatarUrl:
          created.avatarUrl ||
          leaderData.avatarUrl ||
          'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
        gallery:
          created.gallery && created.gallery.length > 0
            ? created.gallery
            : [
                created.avatarUrl ||
                  leaderData.avatarUrl ||
                  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
              ],
        isVerified: true,
        isOnboarded: true,
        coinBalance: Number(created.coinBalance) || 0,
        hourlyCoinRate: Number(created.hourlyCoinRate) || 10,
        earningsCoins: Number(created.earningsCoins) || 0,
        totalLifetimeEarnedUSD: 0,
        onlineStatus: created.onlineStatus || 'offline',
        hasPasswordSet: true,
        agencyName: created.agencyName || leaderData.agencyName || 'Aurora Talent Management',
        commissionPercent: Number(created.commissionPercent ?? leaderData.commissionPercent ?? 15),
        teamLeaderNote: leaderData.teamLeaderNote || '',
        createdAt: created.createdAt || new Date().toISOString(),
      };

      setUsers((prev) => {
        const next = [newLeader, ...prev.filter((u) => u.id !== newLeader.id && u.email?.toLowerCase() !== email)];
        usersRef.current = next;
        return next;
      });

      showToast(
        'Agency Created',
        `Saved to Supabase Auth + profiles. ${newLeader.name} can sign in with ${newLeader.email}.`,
        'success'
      );
      return newLeader;
    } catch (e: any) {
      showToast('Agency Error', e?.message || 'Network error creating agency.', 'error');
      return null;
    }
  };

  const refreshTeamLeaderCreators = async (): Promise<UserProfile[]> => {
    try {
      const res = await authFetch('/api/teamleader/creators');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !Array.isArray(data.creators)) {
        return [];
      }
      const creators = data.creators as UserProfile[];
      setUsers((prev) => {
        const byId = new Map(prev.map((u) => [u.id, u]));
        for (const c of creators) {
          const existing = byId.get(c.id);
          byId.set(
            c.id,
            existing ? { ...existing, ...c, onlineStatus: existing.onlineStatus || c.onlineStatus } : c
          );
        }
        const next = Array.from(byId.values());
        usersRef.current = next;
        return next;
      });
      return creators;
    } catch (e) {
      console.warn('refreshTeamLeaderCreators failed:', e);
      return [];
    }
  };

  const createCreatorByTeamLeader = async (
    creatorData: Partial<UserProfile>,
    leaderId?: string
  ): Promise<UserProfile | null> => {
    const activeLeaderId = leaderId || currentUser.id;
    const leader = users.find((u) => u.id === activeLeaderId);

    const name = String(creatorData.name || '').trim();
    if (!name) {
      showToast('Validation Error', 'Creator name is required.', 'error');
      return null;
    }

    const email = String(creatorData.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Validation Error', 'A valid email address is required.', 'error');
      return null;
    }
    const disposableSuffixes = ['@livecall.app', '@minglecall.local', '@example.com', '@test.local'];
    if (disposableSuffixes.some((s) => email.endsWith(s))) {
      showToast('Validation Error', 'Placeholder emails are not allowed. Use a real email.', 'error');
      return null;
    }

    const password = String((creatorData as any).password || '');
    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      showToast('Password Requirements', passwordError, 'error');
      return null;
    }

    const newId = creatorData.id && isValidUuid(creatorData.id) ? creatorData.id : generateValidUuid();
    const creatorAvatar =
      creatorData.avatarUrl ||
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400';

    const optimisticCreator: UserProfile = {
      id: newId,
      authId: creatorData.authId || newId,
      name,
      email,
      gender: 'female',
      genderLocked: true,
      role: 'female_creator',
      age: creatorData.age || 23,
      dob: creatorData.dob || '2003-06-15',
      nationality: creatorData.nationality || 'Spain',
      countryCode: creatorData.countryCode || 'ES',
      spokenLanguages: creatorData.spokenLanguages || ['English', 'Spanish'],
      bio: creatorData.bio || 'Live video creator and conversationalist!',
      interests: creatorData.interests || ['Music', 'Travel', 'Fashion'],
      interestedIn: ['male'],
      tags: creatorData.tags || ['Talent Agency', 'HD Video', 'Friendly'],
      avatarUrl: creatorAvatar,
      gallery: creatorData.gallery && creatorData.gallery.length > 0 ? creatorData.gallery : [creatorAvatar],
      isVerified: true,
      isOnboarded: true,
      coinBalance: 0,
      hourlyCoinRate: creatorData.hourlyCoinRate || 10,
      coinEarnOverrideRate: null,
      teamLeaderId: activeLeaderId,
      createdById: activeLeaderId,
      agencyName: leader?.agencyName || currentUser.agencyName || undefined,
      earningsCoins: 0,
      totalLifetimeEarnedUSD: 0,
      totalCallsHosted: 0,
      totalCallMinutes: 0,
      onlineStatus: 'online',
      hasPasswordSet: true,
      createdAt: new Date().toISOString(),
    };

    setUsers((prev) => {
      const next = [
        ...prev.filter((u) => u.id !== optimisticCreator.id && u.email !== optimisticCreator.email),
        optimisticCreator,
      ];
      usersRef.current = next;
      return next;
    });

    try {
      // Persist only via Team Leader API — do NOT call /api/users (role overwrite risk).
      const res = await authFetch('/api/teamleader/creators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...optimisticCreator, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.creator) {
        setUsers((prev) => {
          const next = prev.filter((u) => u.id !== optimisticCreator.id);
          usersRef.current = next;
          return next;
        });
        const serverError =
          (typeof data?.error === 'string' && data.error) ||
          (typeof data?.error?.message === 'string' && data.error.message) ||
          (typeof data?.message === 'string' && data.message) ||
          `Could not create creator on the server${res.status ? ` (${res.status})` : ''}.`;
        showToast('Create Failed', serverError, 'error');
        return null;
      }

      const serverCreator = data.creator as UserProfile;
      setUsers((prev) => {
        let next = prev.map((u) =>
          u.id === optimisticCreator.id || u.id === serverCreator.id ? { ...u, ...serverCreator } : u
        );
        if (!next.some((u) => u.id === serverCreator.id)) next = [...next, serverCreator];
        if (serverCreator.id !== optimisticCreator.id) {
          next = next.filter((u) => u.id !== optimisticCreator.id);
        }
        usersRef.current = next;
        return next;
      });

      showToast(
        'Creator Host Created',
        `Registered female host ${serverCreator.name}. Coin earning uses the system-defined rate until an admin sets an override.`,
        'success'
      );
      return serverCreator;
    } catch (e: any) {
      setUsers((prev) => {
        const next = prev.filter((u) => u.id !== optimisticCreator.id);
        usersRef.current = next;
        return next;
      });
      showToast('Create Failed', e?.message || 'Network error creating creator.', 'error');
      return null;
    }
  };

  const updateCreatorCoinEarnOverride = (creatorId: string, overrideRate: number | null) => {
    if (currentUser.role !== 'admin') {
      showToast('Permission Denied', 'Only administrators can override female creator earning rates.', 'error');
      return;
    }

    const target = usersRef.current.find((u) => u.id === creatorId) || users.find((u) => u.id === creatorId);
    if (!target || (target.role !== 'female_creator' && target.role !== 'female_host')) {
      showToast('Invalid Target', 'Earning override is only available for female creators.', 'error');
      return;
    }

    const normalizedRate =
      overrideRate === null || overrideRate === undefined || Number(overrideRate) <= 0
        ? null
        : Math.max(1, Math.round(Number(overrideRate)));

    let targetName = target.name;
    setUsers((prev) => {
      const next = prev.map((u) => {
        if (u.id === creatorId) {
          targetName = u.name;
          const updated = { ...u, coinEarnOverrideRate: normalizedRate };
          if (isSupabaseConfigured()) {
            upsertProfileToSupabase(updated).catch(() => { });
          }
          authFetch('/api/admin/override-earning-rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creatorId, rate: normalizedRate }),
          }).catch(() => { });
          authFetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
          }).catch(() => { });
          return updated;
        }
        return u;
      });
      usersRef.current = next;
      return next;
    });

    if (normalizedRate === null) {
      showToast(
        'Override Cleared',
        `${targetName || 'Creator'} now uses the system-defined coin earning rate.`,
        'success'
      );
    } else {
      showToast(
        'Earning Override Set ⚡',
        `${targetName || 'Creator'} will now earn ${normalizedRate} 🪙/min on live video calls (admin override).`,
        'success'
      );
    }
  };

  const banCreatorByTeamLeader = async (creatorId: string, days: number, reason: string): Promise<boolean> => {
    const banDays = Number(days) || 7;
    const banReason = reason || 'Suspended by Agency';
    const targetBefore = usersRef.current.find((u) => u.id === creatorId) || users.find((u) => u.id === creatorId);
    const targetName = targetBefore?.name || 'Female Host';

    try {
      const res = await authFetch('/api/teamleader/ban-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId,
          days: banDays,
          reason: banReason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showToast('Ban Failed', typeof data?.error === 'string' ? data.error : 'Server rejected the suspension.', 'error');
        return false;
      }

      const bannedUntil =
        data.bannedUntil || new Date(Date.now() + banDays * 24 * 60 * 60 * 1000).toISOString();
      const serverUser = data.user as UserProfile | undefined;

      setUsers((prev) => {
        const next = prev.map((u) => {
          if (u.id !== creatorId) return u;
          return {
            ...u,
            ...(serverUser || {}),
            isBanned: true,
            banReason: data.banReason || banReason,
            bannedUntil,
            bannedById: currentUser.id,
            bannedByRole: 'team_leader' as const,
            onlineStatus: 'offline' as const,
          };
        });
        usersRef.current = next;
        return next;
      });

      await refreshTeamLeaderCreators();

      showToast(
        'Host Suspended',
        `${targetName} has been suspended for ${banDays} days until ${new Date(bannedUntil).toLocaleDateString()}. Login blocked.`,
        'warning'
      );
      return true;
    } catch (e: any) {
      showToast('Ban Error', e.message || 'Failed to suspend creator', 'error');
      return false;
    }
  };

  const unbanCreatorByTeamLeader = async (creatorId: string): Promise<boolean> => {
    const targetBefore = usersRef.current.find((u) => u.id === creatorId) || users.find((u) => u.id === creatorId);
    const targetName = targetBefore?.name || 'Host';

    try {
      const res = await authFetch('/api/teamleader/unban-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showToast('Unban Failed', typeof data?.error === 'string' ? data.error : 'Server rejected the unban.', 'error');
        return false;
      }

      const serverUser = data.user as UserProfile | undefined;
      setUsers((prev) => {
        const next = prev.map((u) => {
          if (u.id !== creatorId) return u;
          return {
            ...u,
            ...(serverUser || {}),
            isBanned: false,
            banReason: undefined,
            bannedUntil: undefined,
            bannedById: undefined,
            bannedByRole: undefined,
          };
        });
        usersRef.current = next;
        return next;
      });

      await refreshTeamLeaderCreators();
      showToast('Suspension Lifted', `${targetName} has been unbanned and can now log in and host calls.`, 'success');
      return true;
    } catch (e: any) {
      showToast('Unban Error', e.message || 'Failed to unban creator', 'error');
      return false;
    }
  };

  const deleteCreatorByTeamLeader = async (creatorId: string): Promise<boolean> => {
    const targetBefore = usersRef.current.find((u) => u.id === creatorId) || users.find((u) => u.id === creatorId);
    const targetName = targetBefore?.name || 'Host';

    try {
      const res = await authFetch('/api/teamleader/delete-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showToast('Delete Failed', typeof data?.error === 'string' ? data.error : 'Server rejected the deletion.', 'error');
        return false;
      }

      setUsers((prev) => {
        const next = prev.filter((u) => u.id !== creatorId);
        usersRef.current = next;
        return next;
      });
      deletedUserIdsRef.current.add(creatorId);

      await refreshTeamLeaderCreators();
      showToast('Host Deleted', `Permanently removed ${targetName} from your agency and the database.`, 'info');
      return true;
    } catch (e: any) {
      showToast('Delete Error', e.message || 'Failed to delete creator', 'error');
      return false;
    }
  };

  const refreshFeedPosts = async () => {
    try {
      const res = await authFetch('/api/v1/feed?limit=50');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return;
      const posts = Array.isArray(json.data?.posts)
        ? json.data.posts
        : Array.isArray(json.posts)
          ? json.posts
          : [];
      setFeedPosts(
        posts.map((p: any) => ({
          id: String(p.id),
          creatorId: String(p.creatorId || p.creator_id || ''),
          creatorName: p.creatorName || p.creator_name || 'Creator',
          creatorAvatar: p.creatorAvatar || p.creator_avatar || '',
          creatorCountry: p.creatorCountry || p.creator_country || '',
          mediaUrl: p.mediaUrl || p.media_url,
          mediaType: (p.mediaType || p.media_type) === 'video' ? 'video' : 'image',
          caption: p.caption || '',
          likes: Number(p.likes || 0),
          commentsCount: Number(p.commentsCount || p.comments_count || 0),
          isLiked: Boolean(p.isLiked),
          createdAt: p.createdAt || p.created_at
            ? new Date(p.createdAt || p.created_at).toLocaleDateString()
            : 'Just now',
        }))
      );
    } catch (err) {
      console.warn('refreshFeedPosts failed:', err);
    }
  };

  const fetchUserMoments = async (userId: string): Promise<FeedPost[]> => {
    if (!userId) return [];
    try {
      const res = await authFetch(`/api/v1/feed/user/${encodeURIComponent(userId)}?limit=50`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return [];
      const posts = Array.isArray(json.data?.posts)
        ? json.data.posts
        : Array.isArray(json.posts)
          ? json.posts
          : [];
      return posts.map((p: any) => ({
        id: String(p.id),
        creatorId: String(p.creatorId || p.creator_id || ''),
        creatorName: p.creatorName || p.creator_name || 'Creator',
        creatorAvatar: p.creatorAvatar || p.creator_avatar || '',
        creatorCountry: p.creatorCountry || p.creator_country || '',
        mediaUrl: p.mediaUrl || p.media_url,
        mediaType: ((p.mediaType || p.media_type) === 'video' ? 'video' : 'image') as 'image' | 'video',
        caption: p.caption || '',
        likes: Number(p.likes || 0),
        commentsCount: Number(p.commentsCount || p.comments_count || 0),
        isLiked: Boolean(p.isLiked),
        createdAt: p.createdAt || p.created_at
          ? new Date(p.createdAt || p.created_at).toLocaleDateString()
          : 'Just now',
      }));
    } catch (err) {
      console.warn('fetchUserMoments failed:', err);
      return [];
    }
  };

  const likePost = async (
    postId: string
  ): Promise<{ liked: boolean; likes: number } | null> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to like moments.', 'warning');
      return null;
    }
    try {
      const res = await authFetch(`/api/v1/feed/${encodeURIComponent(postId)}/like`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Like failed', json?.error?.message || 'Could not update like.', 'error');
        return null;
      }
      const liked = Boolean(json.data?.liked);
      const likes = Number(json.data?.likes || 0);
      setFeedPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, isLiked: liked, likes } : p))
      );
      if (liked) recordMomentInteraction();
      return { liked, likes };
    } catch (err: any) {
      showToast('Like failed', err?.message || 'Network error', 'error');
      return null;
    }
  };

  const likeUserMoment = async (
    _userId: string,
    momentId: string
  ): Promise<{ liked: boolean; likes: number } | null> => {
    return likePost(momentId);
  };

  const tipMomentCreator = async (
    creatorId: string,
    coinAmount: number = 20,
    postId?: string
  ): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to tip.', 'warning');
      return false;
    }
    if (!postId) {
      showToast('Tip failed', 'Missing moment post id.', 'error');
      return false;
    }
    if (creatorId === currentUser.id) {
      showToast('Tip failed', 'You cannot tip your own moment.', 'error');
      return false;
    }

    try {
      const res = await authFetch(`/api/v1/feed/${encodeURIComponent(postId)}/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins: coinAmount }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Tip failed', json?.error?.message || 'Could not send tip.', 'error');
        return false;
      }

      const senderBalance = Number(json.data?.senderBalance);
      const hostEarnings = Number(json.data?.hostEarnings);
      const tipCoins = Number(json.data?.tipCoins || coinAmount);
      const tlId = json.data?.tlId ? String(json.data.tlId) : null;
      const tlEarnings =
        json.data?.tlEarnings != null ? Number(json.data.tlEarnings) : null;

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === currentUser.id && Number.isFinite(senderBalance)) {
            return { ...u, coinBalance: senderBalance };
          }
          if (u.id === creatorId && Number.isFinite(hostEarnings)) {
            return {
              ...u,
              earningsCoins: hostEarnings,
              totalLifetimeEarnedUSD: coinsToUsd(hostEarnings, getCoinUsdPeg(systemSettings)),
              totalGiftsReceivedCount: (u.totalGiftsReceivedCount || 0) + 1,
            };
          }
          if (tlId && u.id === tlId && tlEarnings != null && Number.isFinite(tlEarnings)) {
            return {
              ...u,
              earningsCoins: tlEarnings,
              totalLifetimeEarnedUSD: coinsToUsd(tlEarnings, getCoinUsdPeg(systemSettings)),
            };
          }
          return u;
        })
      );

      const creatorUser = users.find((u) => u.id === creatorId);
      showToast(
        'Tip sent',
        `You tipped ${tipCoins} coins to ${creatorUser?.name || 'the creator'}.`,
        'success'
      );
      return true;
    } catch (err: any) {
      showToast('Tip failed', err?.message || 'Network error', 'error');
      return false;
    }
  };

  const addFeedPost = async (
    post: Omit<FeedPost, 'id' | 'createdAt' | 'likes' | 'commentsCount'>
  ): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to post a moment.', 'warning');
      return false;
    }
    try {
      const res = await authFetch('/api/v1/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrl: post.mediaUrl,
          mediaType: post.mediaType || 'image',
          caption: post.caption || '',
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Publish failed', json?.error?.message || 'Could not publish moment.', 'error');
        return false;
      }
      const saved = json.data?.post;
      if (!saved?.id) {
        showToast('Publish failed', 'Server did not return the new post.', 'error');
        return false;
      }
      const mapped: FeedPost = {
        id: String(saved.id),
        creatorId: String(saved.creatorId),
        creatorName: saved.creatorName || currentUser.name,
        creatorAvatar: saved.creatorAvatar || currentUser.avatarUrl,
        creatorCountry:
          saved.creatorCountry ||
          `${currentUser.countryCode} ${currentUser.nationality}`,
        mediaUrl: saved.mediaUrl,
        mediaType: saved.mediaType === 'video' ? 'video' : 'image',
        caption: saved.caption || '',
        likes: Number(saved.likes || 0),
        commentsCount: Number(saved.commentsCount || 0),
        isLiked: false,
        createdAt: saved.createdAt
          ? new Date(saved.createdAt).toLocaleDateString()
          : 'Just now',
      };
      setFeedPosts((prev) => [mapped, ...prev.filter((p) => p.id !== mapped.id)]);
      recordMomentInteraction();
      showToast('Moment published', 'Your post is live in the Moments feed.', 'success');
      return true;
    } catch (err: any) {
      showToast('Publish failed', err?.message || 'Network error', 'error');
      return false;
    }
  };

  const deleteFeedPost = async (postId: string): Promise<boolean> => {
    if (!postId) return false;
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to delete a moment.', 'warning');
      return false;
    }
    try {
      const res = await authFetch(`/api/v1/feed/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Delete failed', json?.error?.message || 'Could not delete moment.', 'error');
        return false;
      }
      setFeedPosts((prev) => prev.filter((p) => p.id !== postId));
      showToast('Moment removed', 'Your moment was deleted.', 'info');
      return true;
    } catch (err: any) {
      showToast('Delete failed', err?.message || 'Network error', 'error');
      return false;
    }
  };

  const toggleFavorite = async (userId: string): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to manage favorites.', 'warning');
      return false;
    }
    try {
      const res = await authFetch('/api/v1/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const msg = json?.error?.message || 'Could not update favorite.';
        showToast('Favorite failed', msg, 'error');
        return false;
      }
      const favorited = Boolean(json.data?.favorited);
      setFavorites((prev) => {
        const next = favorited
          ? prev.includes(userId)
            ? prev
            : [...prev, userId]
          : prev.filter((id) => id !== userId);
        return next;
      });
      showToast(
        favorited ? 'Added to Favorites ⭐' : 'Removed from Favorites',
        favorited ? 'User added to your priority list.' : 'User removed from your favorites list.',
        'info'
      );
      return true;
    } catch (err: any) {
      console.warn('toggleFavorite error:', err);
      showToast('Favorite failed', err?.message || 'Network error updating favorite.', 'error');
      return false;
    }
  };

  const upsertLocalMatchRecord = (match: {
    id?: string;
    otherUserId: string;
    status: 'pending' | 'matched' | 'rejected' | 'unmatched';
    initiatedBy: string;
  }) => {
    setUserMatchRecords((prev) => {
      const filtered = prev.filter((m) => m.otherUserId !== match.otherUserId);
      return [
        {
          id: match.id || `local_${match.otherUserId}`,
          otherUserId: match.otherUserId,
          status: match.status,
          initiatedBy: match.initiatedBy,
        },
        ...filtered,
      ];
    });
  };

  const likeUser = async (
    targetUserId: string,
    options?: { superLike?: boolean }
  ): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to like profiles.', 'warning');
      return false;
    }
    try {
      const res = await authFetch('/api/v1/matches/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId,
          superLike: Boolean(options?.superLike),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Like failed', json?.error?.message || 'Could not save like.', 'error');
        return false;
      }
      const match = json.data?.match;
      if (match?.otherUserId) {
        upsertLocalMatchRecord({
          id: match.id,
          otherUserId: match.otherUserId,
          status: match.status,
          initiatedBy: match.initiatedBy,
        });
      }
      if (match?.status === 'matched') {
        showToast('It\'s a Match! 🎉', 'You both liked each other.', 'success');
      } else {
        showToast(
          options?.superLike ? 'Super Like sent 🌟' : 'Liked ❤️',
          'Waiting for them to like you back.',
          'success'
        );
      }
      return true;
    } catch (err: any) {
      console.warn('likeUser error:', err);
      showToast('Like failed', err?.message || 'Network error saving like.', 'error');
      return false;
    }
  };

  const passUser = async (targetUserId: string): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to pass profiles.', 'warning');
      return false;
    }
    try {
      const res = await authFetch('/api/v1/matches/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Pass failed', json?.error?.message || 'Could not save pass.', 'error');
        return false;
      }
      const match = json.data?.match;
      if (match?.otherUserId) {
        upsertLocalMatchRecord({
          id: match.id,
          otherUserId: match.otherUserId,
          status: match.status,
          initiatedBy: match.initiatedBy || currentUser.id,
        });
      }
      return true;
    } catch (err: any) {
      console.warn('passUser error:', err);
      showToast('Pass failed', err?.message || 'Network error saving pass.', 'error');
      return false;
    }
  };

  const isFriend = (userId: string): boolean => {
    if (!userId || !currentUserId) return false;
    if (userId === currentUserId || (currentUser && userId === currentUser.id)) return false;

    // Must have an active accepted request between current user and target user
    const req = friendRequests.find(
      (r) =>
        r.status === 'accepted' &&
        ((r.senderId === currentUserId && r.receiverId === userId) ||
          (r.senderId === userId && r.receiverId === currentUserId) ||
          (currentUser && r.senderId === currentUser.id && r.receiverId === userId) ||
          (currentUser && r.senderId === userId && r.receiverId === currentUser.id))
    );

    return Boolean(req);
  };

  const addFriend = (userId: string) => {
    const isFemale = currentUser.gender === 'female' || currentUser.role === 'female_creator' || currentUser.role === 'female_host';
    if (isFemale) {
      void sendFriendRequest(currentUser.id, userId);
    } else {
      showToast(
        'Friend Request Info 🌸',
        'In this platform, Female Creators send Friend Requests to loyal callers. Start a chat or video call to connect with the creator!',
        'info'
      );
    }
  };

  const applyFriendsServerPayload = (data: any) => {
    if (Array.isArray(data?.requests)) {
      setFriendRequests(data.requests as FriendRequest[]);
    }
    if (Array.isArray(data?.friendIds)) {
      setFriends(data.friendIds.map(String));
    }
  };

  const sendFriendRequest = async (
    _femaleId: string,
    targetUserId: string,
    callLogId?: string
  ): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to send friend requests.', 'warning');
      return false;
    }

    const isFemale =
      currentUser.gender === 'female' ||
      currentUser.role === 'female_creator' ||
      currentUser.role === 'female_host' ||
      currentUser.role === 'female_user';
    if (!isFemale) {
      showToast(
        'Action Restricted',
        'Only female hosts can initiate Friend Requests to callers.',
        'warning'
      );
      return false;
    }

    const targetUser = users.find((u) => u.id === targetUserId);
    if (!targetUser) {
      showToast('User not found', 'Could not find that user.', 'error');
      return false;
    }

    if (isFriend(targetUser.id)) {
      showToastKey('social.already_friends', { vars: { name: targetUser.name } });
      return false;
    }

    const existing = friendRequests.find(
      (r) => r.senderId === currentUser.id && r.receiverId === targetUser.id && r.status === 'pending'
    );
    if (existing) {
      showToastKey('social.friend_pending', { vars: { name: targetUser.name } });
      return false;
    }

    const friendBurnRate = systemSettings.coinBurnRateFriendPerMin ?? 80;

    try {
      const res = await authFetch('/api/v1/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetUser.id, callLogId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Friend request failed', json?.error?.message || 'Could not send friend request.', 'error');
        return false;
      }

      applyFriendsServerPayload(json.data);
      const newRequest = json.data?.request as FriendRequest | undefined;

      if (newRequest) {
        // Notify peer on Realtime (Vercel) or native WS — must use incoming type for badge toast
        void signalSendAsync({
          type: 'friend_request:incoming',
          toUserId: targetUser.id,
          receiverId: targetUser.id,
          request: {
            ...newRequest,
            senderName: currentUser.name,
            senderAvatar: currentUser.avatarUrl,
            receiverName: targetUser.name,
            receiverAvatar: targetUser.avatarUrl,
          },
        });
      }

      showToast(
        'Friend Request Sent! 🌸',
        `Sent friend request to ${targetUser.name}. When accepted, friend call rates (${friendBurnRate} 🪙/min) will apply!`,
        'success'
      );
      return true;
    } catch (err: any) {
      console.warn('sendFriendRequest error:', err);
      showToast('Friend request failed', err?.message || 'Network error sending friend request.', 'error');
      return false;
    }
  };

  const acceptFriendRequest = async (requestId: string): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to accept friend requests.', 'warning');
      return false;
    }
    const targetReq = friendRequests.find((r) => r.id === requestId);
    const friendBurnRate = systemSettings.coinBurnRateFriendPerMin ?? 80;

    try {
      const res = await authFetch('/api/v1/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Accept failed', json?.error?.message || 'Could not accept friend request.', 'error');
        return false;
      }

      applyFriendsServerPayload(json.data);
      const accepted = (json.data?.request as FriendRequest | undefined) || targetReq;

      if (accepted) {
        const peerId =
          accepted.senderId === currentUser.id ? accepted.receiverId : accepted.senderId;
        void signalSendAsync({
          type: 'friend_request:accepted',
          toUserId: peerId,
          requestId,
          senderId: accepted.senderId,
          receiverId: accepted.receiverId,
        });
      }

      const otherName =
        accepted?.senderId === currentUser.id ? accepted?.receiverName : accepted?.senderName;
      showToast(
        'Friend Request Accepted! 👥',
        `You are now Friends with ${otherName || 'this user'}! Special Friend Rate (${friendBurnRate} 🪙/min) is active for 1-on-1 video calls.`,
        'success'
      );
      return true;
    } catch (err: any) {
      console.warn('acceptFriendRequest error:', err);
      showToast('Accept failed', err?.message || 'Network error accepting friend request.', 'error');
      return false;
    }
  };

  const declineFriendRequest = async (requestId: string): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to decline friend requests.', 'warning');
      return false;
    }
    const targetReq = friendRequests.find((r) => r.id === requestId);
    const standardBurnRate = systemSettings.coinBurnRatePerMin ?? 120;

    try {
      const res = await authFetch('/api/v1/friends/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Decline failed', json?.error?.message || 'Could not decline friend request.', 'error');
        return false;
      }

      applyFriendsServerPayload(json.data);
      const declined = (json.data?.request as FriendRequest | undefined) || targetReq;

      if (declined) {
        const peerId =
          declined.senderId === currentUser.id ? declined.receiverId : declined.senderId;
        void signalSendAsync({
          type: 'friend_request:declined',
          toUserId: peerId,
          requestId,
          senderId: declined.senderId,
          receiverId: declined.receiverId,
        });
      }

      showToast(
        'Request Declined',
        `Friend request declined. Standard coin burn rate (${standardBurnRate} 🪙/min) remains active.`,
        'info'
      );
      return true;
    } catch (err: any) {
      console.warn('declineFriendRequest error:', err);
      showToast('Decline failed', err?.message || 'Network error declining friend request.', 'error');
      return false;
    }
  };

  const removeFriend = async (userId: string): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to manage friends.', 'warning');
      return false;
    }

    try {
      const res = await authFetch('/api/v1/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Remove failed', json?.error?.message || 'Could not remove friend.', 'error');
        return false;
      }

      applyFriendsServerPayload(json.data);

      void signalSendAsync({
        type: 'friend_request:removed',
        toUserId: userId,
        userA: currentUser.id,
        userB: userId,
      });

      const targetUser = users.find((u) => u.id === userId);
      const targetName = targetUser ? targetUser.name : 'User';
      showToast(
        'Removed from Friends 👥',
        `${targetName} removed from your Friends list. Standard call rate (${systemSettings.coinBurnRatePerMin ?? 120} 🪙/min) is now active.`,
        'info'
      );
      return true;
    } catch (err: any) {
      console.warn('removeFriend error:', err);
      showToast('Remove failed', err?.message || 'Network error removing friend.', 'error');
      return false;
    }
  };

  const toggleFriend = (userId: string) => {
    if (isFriend(userId)) {
      void removeFriend(userId);
    } else {
      addFriend(userId);
    }
  };

  const blockUser = async (
    userId: string,
    reason: string = 'Inappropriate Behavior'
  ): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to block users.', 'warning');
      return false;
    }
    if (blockedUserIds.includes(userId)) {
      return true;
    }

    try {
      const res = await authFetch('/api/v1/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, reason }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Block failed', json?.error?.message || 'Could not block user.', 'error');
        return false;
      }

      if (Array.isArray(json.data?.blockedUserIds)) {
        setBlockedUserIds(json.data.blockedUserIds.map(String));
      } else {
        setBlockedUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      }
      if (Array.isArray(json.data?.blockedByUserIds)) {
        setBlockedByUserIds(json.data.blockedByUserIds.map(String));
      }

      setFavorites((prev) => prev.filter((id) => id !== userId));
      setFriends((prev) => prev.filter((id) => id !== userId));
      setFriendRequests((prev) =>
        prev.map((r) =>
          (r.senderId === userId && r.receiverId === currentUser.id) ||
          (r.senderId === currentUser.id && r.receiverId === userId)
            ? { ...r, status: 'declined' as const }
            : r
        )
      );

      showToastKey('social.user_blocked', { vars: { detail: reason } });
      return true;
    } catch (err: any) {
      console.warn('blockUser error:', err);
      showToast('Block failed', err?.message || 'Network error blocking user.', 'error');
      return false;
    }
  };

  const unblockUser = async (userId: string): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to unblock users.', 'warning');
      return false;
    }
    if (!blockedUserIds.includes(userId)) {
      return true;
    }

    try {
      const res = await authFetch(`/api/v1/blocks/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Unblock failed', json?.error?.message || 'Could not unblock user.', 'error');
        return false;
      }

      if (Array.isArray(json.data?.blockedUserIds)) {
        setBlockedUserIds(json.data.blockedUserIds.map(String));
      } else {
        setBlockedUserIds((prev) => prev.filter((id) => id !== userId));
      }
      if (Array.isArray(json.data?.blockedByUserIds)) {
        setBlockedByUserIds(json.data.blockedByUserIds.map(String));
      }

      showToast('User Unblocked 🔓', 'User has been unblocked successfully.', 'success');
      return true;
    } catch (err: any) {
      console.warn('unblockUser error:', err);
      showToast('Unblock failed', err?.message || 'Network error unblocking user.', 'error');
      return false;
    }
  };

  const openBlockReportModal = (userId: string, action: 'report' | 'block' = 'report') => {
    if (!userId || userId === currentUser?.id) return;
    setBlockReportModal({ userId, action });
  };

  const closeBlockReportModal = () => setBlockReportModal(null);

  const reportUser = async (
    userId: string,
    reason: string,
    details?: string
  ): Promise<boolean> => {
    if (!currentUser?.id || currentUser.id === 'guest_user') {
      showToast('Sign in required', 'Please sign in to report users.', 'warning');
      return false;
    }
    if (!userId || userId === currentUser.id) {
      showToast('Report failed', 'You cannot report yourself.', 'error');
      return false;
    }
    try {
      const res = await authFetch('/api/v1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedUserId: userId,
          reason,
          ...(details ? { details } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast('Report failed', json?.error?.message || 'Could not submit report.', 'error');
        return false;
      }
      if (json?.data?.alreadyReported) {
        showToast(
          'Already reported',
          'You already have a pending report for this user with the same reason.',
          'info'
        );
      } else {
        showToast(
          'Report submitted',
          'Report submitted — our safety team will review.',
          'info'
        );
      }
      return true;
    } catch (err: any) {
      console.warn('reportUser error:', err);
      showToast('Report failed', err?.message || 'Network error submitting report.', 'error');
      return false;
    }
  };

  const contributeToGoal = async (creatorId: string, coins: number): Promise<boolean> => {
    if (!isLoggedIn || !currentUserId) {
      showToast('Sign in required', 'Please sign in to contribute to a goal.', 'warning');
      return false;
    }
    if (currentUser.coinBalance < coins) {
      showToast('Insufficient Coins 🪙', 'Please top up your wallet to contribute to this goal.', 'error');
      return false;
    }

    try {
      const res = await authFetch('/api/v1/goals/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId, coins }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        const msg =
          data?.error?.message || data?.error || data?.message || 'Contribution failed';
        showToast('Contribution failed', String(msg), 'error');
        return false;
      }

      const payload = data?.data || {};
      const senderBalance =
        typeof payload.senderBalance === 'number' ? payload.senderBalance : null;
      const hostEarnings =
        typeof payload.hostEarnings === 'number' ? payload.hostEarnings : null;
      const goal = payload.goal;

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === currentUser.id && senderBalance != null) {
            return { ...u, coinBalance: senderBalance };
          }
          if (u.id === creatorId && hostEarnings != null) {
            return { ...u, earningsCoins: hostEarnings };
          }
          return u;
        })
      );

      if (goal && creatorId) {
        setCreatorGoals((prev) => ({
          ...prev,
          [creatorId]: {
            title: goal.title || prev[creatorId]?.title || 'Creator Target Goal',
            currentCoins: Number(goal.currentCoins) || 0,
            targetCoins: Number(goal.targetCoins) || prev[creatorId]?.targetCoins || 10000,
          },
        }));
      }

      showToastKey('wallet.goal_contribution', { vars: { amount: coins } });
      return true;
    } catch (err: any) {
      showToast('Contribution failed', err?.message || 'Network error', 'error');
      return false;
    }
  };

  // ============================================================================
  // DAILY REWARDS & GAMIFIED ACTIVITY QUESTS ENGINE (server-authoritative claims)
  // ============================================================================
  const openDailyRewardsModal = () => setIsDailyRewardsModalOpen(true);
  const closeDailyRewardsModal = () => setIsDailyRewardsModalOpen(false);

  /** Local calendar day YYYY-MM-DD — preferred reward day (server accepts within ±1 of UTC). */
  const getLocalRewardDayString = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const applyServerCoinBalance = (coinBalance: number | null | undefined) => {
    if (coinBalance == null || !Number.isFinite(Number(coinBalance)) || !currentUser?.id) return;
    const bal = Number(coinBalance);
    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? { ...u, coinBalance: bal } : u))
    );
  };

  const postRewardProgress = async (payload: Record<string, unknown>) => {
    try {
      const res = await authFetch('/api/rewards/progress', {
        method: 'POST',
        body: JSON.stringify({ ...payload, rewardDay: getLocalRewardDayString() }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.success && json?.data?.record) {
        setDailyRewardRecord(json.data.record as DailyRewardRecord);
      }
    } catch (err) {
      console.warn('[AppContext] reward progress error:', err);
    }
  };

  // Sync reward record from server (rollover + create handled server-side)
  useEffect(() => {
    if (!currentUser?.id || currentUser.id === 'guest_user') return;
    let isMounted = true;

    async function initDailyRewards() {
      try {
        const res = await authFetch('/api/rewards/get', {
          method: 'POST',
          body: JSON.stringify({ rewardDay: getLocalRewardDayString() }),
        });
        const json = await res.json().catch(() => ({}));
        if (!isMounted) return;
        if (json?.success && json?.data?.record) {
          setDailyRewardRecord(json.data.record as DailyRewardRecord);
          return;
        }
        // Fallback read-only fetch if API unavailable
        if (isSupabaseConfigured()) {
          const dbRec = await fetchUserDailyRewardsFromSupabase(currentUser.id);
          if (isMounted && dbRec) setDailyRewardRecord(dbRec);
        }
      } catch (err) {
        console.warn('[AppContext] Daily rewards sync error:', err);
      }
    }

    initDailyRewards();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  // Determine if there are unclaimed streak, missions, or master chest rewards
  const todayDateStr = getLocalRewardDayString();
  const isStreakUnclaimed = Boolean(
    dailyRewardRecord &&
    dailyRewardRecord.streakClaimedDate !== todayDateStr
  );
  const activeMissionsCfg = systemSettings.dailyMissionsConfig || {
    chatFriends: { target: 3, reward: 25, enabled: true },
    quickMatches: { target: 10, reward: 30, enabled: true },
    videoCall: { target: 60, reward: 35, enabled: true },
    momentInteract: { target: 3, reward: 15, enabled: true },
    sendGift: { target: 1, reward: 20, enabled: true },
    masterChest: { target: 4, reward: 50, enabled: true },
  };

  const hasUnclaimedMissions = Boolean(
    dailyRewardRecord && (
      (!dailyRewardRecord.taskChatClaimed && (dailyRewardRecord.taskChatFriends?.length || 0) >= (activeMissionsCfg.chatFriends?.target || 3)) ||
      (!dailyRewardRecord.taskQuickMatchClaimed && (dailyRewardRecord.taskQuickMatches || 0) >= (activeMissionsCfg.quickMatches?.target || 10)) ||
      (!dailyRewardRecord.taskVideoCallClaimed && (dailyRewardRecord.taskVideoCallSeconds || 0) >= (activeMissionsCfg.videoCall?.target || 60)) ||
      (!dailyRewardRecord.taskMomentClaimed && (dailyRewardRecord.taskMomentInteractions || 0) >= (activeMissionsCfg.momentInteract?.target || 3)) ||
      (!dailyRewardRecord.taskGiftClaimed && (dailyRewardRecord.taskGiftCount || 0) >= (activeMissionsCfg.sendGift?.target || 1))
    )
  );

  const completedClaimedCount = dailyRewardRecord
    ? [
        dailyRewardRecord.taskChatClaimed,
        dailyRewardRecord.taskQuickMatchClaimed,
        dailyRewardRecord.taskVideoCallClaimed,
        dailyRewardRecord.taskMomentClaimed,
        dailyRewardRecord.taskGiftClaimed,
      ].filter(Boolean).length
    : 0;

  const hasUnclaimedMasterChest = Boolean(
    dailyRewardRecord &&
    !dailyRewardRecord.masterChestClaimed &&
    completedClaimedCount >= (activeMissionsCfg.masterChest?.target || 4)
  );

  const hasUnclaimedDailyRewards = isStreakUnclaimed || hasUnclaimedMissions || hasUnclaimedMasterChest;

  // Activity tracking — progress only (no claim flags / coins)
  const recordChatFriendInteraction = (receiverId: string) => {
    if (!currentUser?.id || !receiverId || receiverId === currentUser.id) return;
    setDailyRewardRecord((prev) => {
      if (!prev || prev.taskChatClaimed) return prev;
      const existing = prev.taskChatFriends || [];
      if (existing.includes(receiverId)) return prev;
      return { ...prev, taskChatFriends: [...existing, receiverId] };
    });
    postRewardProgress({ type: 'chat_friend', receiverId });
  };

  const recordQuickMatchInteraction = () => {
    if (!currentUser?.id) return;
    setDailyRewardRecord((prev) => {
      if (!prev || prev.taskQuickMatchClaimed) return prev;
      return { ...prev, taskQuickMatches: (prev.taskQuickMatches || 0) + 1 };
    });
    postRewardProgress({ type: 'quick_match' });
  };

  const recordVideoCallDuration = (seconds: number) => {
    if (!currentUser?.id || seconds <= 0) return;
    setDailyRewardRecord((prev) => {
      if (!prev || prev.taskVideoCallClaimed) return prev;
      return { ...prev, taskVideoCallSeconds: (prev.taskVideoCallSeconds || 0) + seconds };
    });
    postRewardProgress({ type: 'video_call', seconds });
  };

  const recordMomentInteraction = () => {
    if (!currentUser?.id) return;
    setDailyRewardRecord((prev) => {
      if (!prev || prev.taskMomentClaimed) return prev;
      return { ...prev, taskMomentInteractions: (prev.taskMomentInteractions || 0) + 1 };
    });
    postRewardProgress({ type: 'moment' });
  };

  const recordGiftSentInteraction = () => {
    if (!currentUser?.id) return;
    setDailyRewardRecord((prev) => {
      if (!prev || prev.taskGiftClaimed) return prev;
      return { ...prev, taskGiftCount: (prev.taskGiftCount || 0) + 1 };
    });
    postRewardProgress({ type: 'gift' });
  };

  // Claim Daily Streak — server only
  const claimDailyStreak = async (): Promise<boolean> => {
    if (!currentUser?.id || !dailyRewardRecord) return false;
    try {
      const res = await authFetch('/api/rewards/claim-streak', {
        method: 'POST',
        body: JSON.stringify({ rewardDay: getLocalRewardDayString() }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.data?.record) setDailyRewardRecord(json.data.record as DailyRewardRecord);
      if (json?.data?.coinBalance != null) applyServerCoinBalance(json.data.coinBalance);

      if (!json?.success) {
        const code = json?.error?.code || '';
        if (code === 'ALREADY_CLAIMED' || res.status === 409) {
          showToast('Already Claimed', 'You have already claimed today’s streak reward!', 'info');
        } else {
          showToast('Claim Failed', json?.error?.message || 'Could not claim streak reward.', 'error');
        }
        return false;
      }

      const coins = Number(json.data?.coinsAwarded || 0);
      if (coins <= 0 && json.data?.alreadyClaimed) {
        showToast('Already Claimed', 'You have already claimed today’s streak reward!', 'info');
        return false;
      }

      showToast(
        'Daily Check-in Claimed! 🔥',
        `+${coins} Free Coins added to your wallet! (Day ${json.data?.record?.streakCount || dailyRewardRecord.streakCount} Streak)`,
        'success'
      );
      return true;
    } catch (err) {
      console.warn('[AppContext] claimDailyStreak error:', err);
      showToast('Claim Failed', 'Network error claiming streak reward.', 'error');
      return false;
    }
  };

  // Claim Daily Mission — server only
  const claimDailyMission = async (missionKey: string): Promise<boolean> => {
    if (!currentUser?.id || !dailyRewardRecord) return false;
    try {
      const res = await authFetch('/api/rewards/claim-mission', {
        method: 'POST',
        body: JSON.stringify({ missionKey, rewardDay: getLocalRewardDayString() }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.data?.record) setDailyRewardRecord(json.data.record as DailyRewardRecord);
      if (json?.data?.coinBalance != null) applyServerCoinBalance(json.data.coinBalance);

      if (!json?.success) {
        const code = json?.error?.code || '';
        if (code === 'ALREADY_CLAIMED' || res.status === 409) {
          showToast('Already Claimed', 'This mission reward was already claimed.', 'info');
        } else if (code === 'INCOMPLETE' || code === 'LOCKED') {
          showToast('Quest Incomplete', json?.error?.message || 'Finish the mission first.', 'info');
        } else {
          showToast('Claim Failed', json?.error?.message || 'Could not claim mission reward.', 'error');
        }
        return false;
      }

      const coins = Number(json.data?.coinsAwarded || 0);
      if (coins <= 0 && json.data?.alreadyClaimed) {
        showToast('Already Claimed', 'This mission reward was already claimed.', 'info');
        return false;
      }

      showToastKey('wallet.quest_completed', { vars: { amount: coins } });
      return true;
    } catch (err) {
      console.warn('[AppContext] claimDailyMission error:', err);
      showToast('Claim Failed', 'Network error claiming mission reward.', 'error');
      return false;
    }
  };

  // Claim Daily Master Chest — server only
  const claimDailyMasterChest = async (): Promise<boolean> => {
    if (!currentUser?.id || !dailyRewardRecord || dailyRewardRecord.masterChestClaimed) return false;
    try {
      const res = await authFetch('/api/rewards/claim-master-chest', {
        method: 'POST',
        body: JSON.stringify({ rewardDay: getLocalRewardDayString() }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.data?.record) setDailyRewardRecord(json.data.record as DailyRewardRecord);
      if (json?.data?.coinBalance != null) applyServerCoinBalance(json.data.coinBalance);

      if (!json?.success) {
        const code = json?.error?.code || '';
        if (code === 'ALREADY_CLAIMED' || res.status === 409) {
          showToast('Already Claimed', 'Master chest already claimed today.', 'info');
        } else if (code === 'LOCKED') {
          showToast('Master Chest Locked', json?.error?.message || 'Complete more missions first!', 'info');
        } else {
          showToast('Claim Failed', json?.error?.message || 'Could not claim master chest.', 'error');
        }
        return false;
      }

      const coins = Number(json.data?.coinsAwarded || 0);
      if (coins <= 0 && json.data?.alreadyClaimed) {
        showToast('Already Claimed', 'Master chest already claimed today.', 'info');
        return false;
      }

      showToastKey('wallet.master_chest', { vars: { amount: coins } });
      return true;
    } catch (err) {
      console.warn('[AppContext] claimDailyMasterChest error:', err);
      showToast('Claim Failed', 'Network error claiming master chest.', 'error');
      return false;
    }
  };

  // Legacy bonus alias
  const claimDailyBonus = () => {
    if (!isStreakUnclaimed) {
      openDailyRewardsModal();
    } else {
      claimDailyStreak();
    }
  };

  const connectCallerToHost = useCallback((callerProfile: UserProfile, hostId: string) => {
    if (!callerProfile?.id || !hostId) return;

    setConnectedCallersByHost((prev) => {
      const existing = prev[hostId] || [];
      if (existing.some((u) => u.id === callerProfile.id)) return prev;
      const next = { ...prev, [hostId]: [callerProfile, ...existing] };
      try {
        localStorage.setItem(
          'livecall_quick_match_caller_connected_sync',
          JSON.stringify({
            type: 'connect',
            hostId,
            callerProfile,
            timestamp: Date.now(),
          })
        );
      } catch {}
      return next;
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'quick_match:caller_connect',
          callerId: callerProfile.id,
          hostId,
          callerProfile,
        })
      );
    }
  }, []);

  const disconnectCallerFromHost = useCallback((callerId: string, hostId?: string) => {
    if (!callerId) return;

    setConnectedCallersByHost((prev) => {
      const next: Record<string, UserProfile[]> = {};
      for (const [hId, callers] of Object.entries(prev)) {
        if (hostId && hId !== hostId) {
          next[hId] = callers;
        } else {
          next[hId] = callers.filter((c) => c.id !== callerId);
        }
      }
      try {
        localStorage.setItem(
          'livecall_quick_match_caller_connected_sync',
          JSON.stringify({
            type: 'disconnect',
            hostId,
            callerId,
            timestamp: Date.now(),
          })
        );
      } catch {}
      return next;
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'quick_match:caller_disconnect',
          callerId,
          hostId,
        })
      );
    }
  }, []);

  const setCallerQuickMatchBrowsing = useCallback((isBrowsing: boolean) => {
    if (!currentUser?.id) return;
    if (isBrowsing) {
      setActiveQuickMatchCallerIds((prev) => {
        const next = Array.from(new Set([...prev, currentUser.id]));
        try {
          localStorage.setItem('livecall_quick_match_callers_sync', JSON.stringify(next));
        } catch {}
        return next;
      });
    } else {
      setActiveQuickMatchCallerIds((prev) => {
        const next = prev.filter((id) => id !== currentUser.id);
        try {
          localStorage.setItem('livecall_quick_match_callers_sync', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'quick_match:caller_active',
          userId: currentUser.id,
          isBrowsing,
        })
      );
    }
  }, [currentUser?.id]);

  const isHostLive = (userId: string): boolean => {
    return liveHostIds.includes(userId);
  };

  const toggleGoLiveQuickMatch = (targetUserId?: string, forceState?: boolean): boolean => {
    const userToToggle = targetUserId ? users.find((u) => u.id === targetUserId) : currentUser;
    if (!userToToggle) return false;

    // Rule: Only female creators and regular females can go live as hosts
    const isFemale =
      userToToggle.gender === 'female' ||
      userToToggle.role === 'female_creator' ||
      userToToggle.role === 'female_host';

    if (!isFemale) {
      showToast(
        'Go Live Restricted',
        'Only female creators and female members can broadcast live in Quick Match. Male users can discover & match with live female hosts!',
        'warning'
      );
      return false;
    }

    const currentlyLive = liveHostIds.includes(userToToggle.id);
    const shouldBeLive = forceState !== undefined ? forceState : !currentlyLive;

    if (!shouldBeLive) {
      if (currentlyLive) {
        const updated = liveHostIds.filter((id) => id !== userToToggle.id);
        setLiveHostIds(updated);
        showToast(
          'Broadcast Ended',
          `${userToToggle.name} is no longer live in Quick Match.`,
          'info'
        );
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'quick_match:set_live', userId: userToToggle.id, isLive: false }));
      }
      return false;
    } else {
      if (!currentlyLive) {
        const updated = [...liveHostIds, userToToggle.id];
        setLiveHostIds(updated);
        showToast(
          '🔴 YOU ARE NOW LIVE!',
          `Live in Quick Match pool! Callers will discover your stream and can like/match with you.`,
          'success'
        );
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'quick_match:set_live', userId: userToToggle.id, isLive: true }));
      }
      return true;
    }
  };

  // Quick Match Successful Matches History — hydrated from Supabase via Express (not localStorage-as-DB)
  const [quickMatches, setQuickMatches] = useState<QuickMatchItem[]>([]);

  // Hydrate favorites, match records, blocks, friends when session user is ready
  useEffect(() => {
    if (!currentUser?.id || currentUser.id === 'guest_user' || !isLoggedIn) {
      setFavorites([]);
      setUserMatchRecords([]);
      setBlockedByUserIds([]);
      setQuickMatches([]);
      setFriendRequests([]);
      setFriends([]);
      return;
    }

    let cancelled = false;

    async function hydrateSocialFromServer() {
      try {
        const [favRes, matchRes, blockRes, friendsRes] = await Promise.all([
          authFetch('/api/v1/favorites/me'),
          authFetch('/api/v1/matches/me'),
          authFetch('/api/v1/matches/blocks'),
          authFetch('/api/v1/friends/requests'),
        ]);

        if (cancelled) return;

        if (favRes.ok) {
          const favJson = await favRes.json().catch(() => null);
          if (favJson?.success && Array.isArray(favJson.data?.favoriteUserIds)) {
            setFavorites(favJson.data.favoriteUserIds.map(String));
          }
        } else {
          console.warn('Favorites hydrate failed:', favRes.status);
        }

        if (matchRes.ok) {
          const matchJson = await matchRes.json().catch(() => null);
          if (matchJson?.success && Array.isArray(matchJson.data?.matches)) {
            const records = matchJson.data.matches.map((m: any) => ({
              id: String(m.id),
              otherUserId: String(m.otherUserId),
              status: m.status as 'pending' | 'matched' | 'rejected' | 'unmatched',
              initiatedBy: String(m.initiatedBy || ''),
            }));
            setUserMatchRecords(records);

            const currentUsersList = usersRef.current || users;
            const formattedMatches: QuickMatchItem[] = matchJson.data.matches
              .filter((m: any) => m.status === 'matched')
              .map((m: any) => {
                const otherUserId = String(m.otherUserId);
                const otherUser = currentUsersList.find((u) => u.id === otherUserId);
                const loc = otherUser ? getUserEffectiveLocation(otherUser) : null;
                return {
                  id: String(m.id),
                  matchedUserId: otherUserId,
                  matchedUserName: otherUser?.name || 'Member',
                  matchedUserAvatar: otherUser?.avatarUrl || '',
                  matchedUserGender: otherUser?.gender || 'male',
                  matchedUserAge: otherUser?.age,
                  matchedUserCountryCode: otherUser?.countryCode,
                  matchedUserCity: loc?.displayCity || otherUser?.locationCity || 'Online Member',
                  matchedAt: m.matchedAt || m.createdAt || new Date().toISOString(),
                  giftsExchangedCoins: 0,
                };
              });
            setQuickMatches(formattedMatches);
          }
        } else {
          console.warn('Matches hydrate failed:', matchRes.status);
        }

        if (blockRes.ok) {
          const blockJson = await blockRes.json().catch(() => null);
          if (blockJson?.success) {
            if (Array.isArray(blockJson.data?.blockedUserIds)) {
              setBlockedUserIds(blockJson.data.blockedUserIds.map(String));
            }
            if (Array.isArray(blockJson.data?.blockedByUserIds)) {
              setBlockedByUserIds(blockJson.data.blockedByUserIds.map(String));
            }
          }
        } else {
          console.warn('Blocks hydrate failed:', blockRes.status);
        }

        if (friendsRes.ok) {
          const friendsJson = await friendsRes.json().catch(() => null);
          if (friendsJson?.success) {
            if (Array.isArray(friendsJson.data?.requests)) {
              setFriendRequests(friendsJson.data.requests as FriendRequest[]);
            }
            if (Array.isArray(friendsJson.data?.friendIds)) {
              setFriends(friendsJson.data.friendIds.map(String));
            }
          }
        } else {
          console.warn('Friends hydrate failed:', friendsRes.status);
        }
      } catch (err) {
        console.warn('Social hydrate error:', err);
      }
    }

    void hydrateSocialFromServer();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, isLoggedIn]);

  const recordQuickMatch = async (
    matchedUser: UserProfile,
    giftsCoins = 0
  ): Promise<boolean> => {
    if (!currentUser?.id || !matchedUser?.id) return false;
    const currentUid = currentUser.id;

    try {
      const res = await authFetch('/api/v1/matches/quick-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: matchedUser.id,
          giftsCoins,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast(
          'Match save failed',
          json?.error?.message || 'Could not persist Quick Match.',
          'error'
        );
        return false;
      }

      // Daily mission counter only for real Quick Match connections (not swipe likes)
      recordQuickMatchInteraction();

      const loc = getUserEffectiveLocation(matchedUser);
      const matchItem: QuickMatchItem = {
        id: json.data?.match?.id || `qm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        matchedUserId: matchedUser.id,
        matchedUserName: matchedUser.name,
        matchedUserAvatar: matchedUser.avatarUrl,
        matchedUserGender: matchedUser.gender,
        matchedUserAge: matchedUser.age,
        matchedUserCountryCode: matchedUser.countryCode,
        matchedUserCity: loc.displayCity,
        matchedAt: json.data?.match?.matchedAt || new Date().toISOString(),
        giftsExchangedCoins: giftsCoins,
      };

      setQuickMatches((prev) => {
        const filtered = prev.filter((m) => m.matchedUserId !== matchedUser.id);
        return [matchItem, ...filtered].slice(0, 50);
      });

      upsertLocalMatchRecord({
        id: matchItem.id,
        otherUserId: matchedUser.id,
        status: 'matched',
        initiatedBy: currentUid,
      });

      // Broadcast AFTER durable DB write (event does not replace DB)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'match:created',
            senderId: currentUid,
            receiverId: matchedUser.id,
            matchItem,
          })
        );
      }

      return true;
    } catch (err: any) {
      console.warn('recordQuickMatch error:', err);
      showToast('Match save failed', err?.message || 'Network error saving Quick Match.', 'error');
      return false;
    }
  };

  const sendQuickMatchGift = async (
    targetUserId: string,
    giftKey: string,
    giftCost: number,
    giftName: string
  ): Promise<boolean> => {
    const sender = users.find((u) => u.id === currentUser.id) || currentUser;
    if (sender.coinBalance < giftCost) {
      showToast(
        'Insufficient Coins! 🪙',
        `Sending ${giftName} requires ${giftCost} coins. Please refill your wallet.`,
        'error'
      );
      return false;
    }

    const receiver = users.find((u) => u.id === targetUserId);
    if (!receiver) {
      showToast('Recipient Not Found', 'Could not locate recipient user.', 'error');
      return false;
    }

    // Prefer authoritative /api/gifts/send when catalog id can be resolved
    const keyToCatalogId: Record<string, string> = {
      rose: 'g_rose',
      heart: 'g_heart',
      rocket: 'g_rocket',
      tiara: 'g_crown',
      diamond: 'g_ring',
      cheers: 'g_heart',
    };
    const mappedId = keyToCatalogId[giftKey];
    const catalogGift =
      (mappedId && virtualGifts.find((g) => g.id === mappedId && g.isActive !== false)) ||
      virtualGifts.find((g) => g.id === `g_${giftKey}` && g.isActive !== false) ||
      virtualGifts.find((g) => g.animationType === giftKey && g.isActive !== false) ||
      virtualGifts.find((g) => g.coinCost === giftCost && g.isActive !== false);

    if (catalogGift) {
      try {
        const giftIdempotencyKey =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `qm_gift_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const res = await authFetch('/api/gifts/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiverId: targetUserId,
            giftId: catalogGift.id,
            clientTempId: giftIdempotencyKey,
            idempotencyKey: giftIdempotencyKey,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          showToast(
            'Gift failed',
            typeof json?.error === 'string'
              ? json.error
              : json?.error?.message || 'Could not send gift.',
            'error'
          );
          return false;
        }
        const bal =
          typeof json.senderBalance === 'number'
            ? json.senderBalance
            : typeof json.senderCoinBalance === 'number'
              ? json.senderCoinBalance
              : null;
        if (typeof bal === 'number') {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === currentUser.id ? { ...u, coinBalance: bal } : u
            )
          );
        } else {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === currentUser.id
                ? { ...u, coinBalance: Math.max(0, u.coinBalance - catalogGift.coinCost) }
                : u
            )
          );
        }
        setQuickMatches((prev) =>
          prev.map((m) =>
            m.matchedUserId === targetUserId
              ? { ...m, giftsExchangedCoins: (m.giftsExchangedCoins || 0) + catalogGift.coinCost }
              : m
          )
        );
        recordGiftSentInteraction();
        showToast(
          'Quick Gift Sent! ✨',
          `Sent ${giftName} (${catalogGift.coinCost} 🪙) to ${receiver.name}!`,
          'success'
        );
        return true;
      } catch (err: any) {
        console.warn('sendQuickMatchGift API error:', err);
        showToast('Gift failed', err?.message || 'Network error sending gift.', 'error');
        return false;
      }
    }

    // TODO: Quick Match gift keys without catalog mapping still need server pricing;
    // do not mint coins client-side — refuse unmapped gifts.
    showToast(
      'Gift unavailable',
      `${giftName} is not wired to the gift catalog yet.`,
      'warning'
    );
    return false;
  };

  // Home & Policies CMS Handlers
  const openPolicyModal = (policyIdOrSlug: string) => {
    const found = policyDocuments.find((p) => p.id === policyIdOrSlug || p.slug === policyIdOrSlug);
    if (found) {
      setActivePolicyDoc(found);
    } else {
      setActivePolicyDoc(policyDocuments[0] || null);
    }
  };

  const closePolicyModal = () => {
    setActivePolicyDoc(null);
  };

  const saveHomeBanner = async (
    banner: Partial<HomeBanner> & { id?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const payload: HomeBanner = banner.id
      ? ({
          ...(homeBanners.find((b) => b.id === banner.id) || {}),
          ...banner,
        } as HomeBanner)
      : {
          id: 'banner_' + Date.now(),
          title: banner.title || 'New Live Promo',
          subtitle: banner.subtitle || 'Discover exciting video matches today.',
          tagText: banner.tagText || 'FEATURED',
          tagColor: banner.tagColor || 'bg-indigo-600 text-white',
          imageUrl:
            banner.imageUrl ||
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1200',
          ctaText: banner.ctaText || 'Explore Now',
          actionType: banner.actionType || 'tab',
          actionTarget: banner.actionTarget || 'discovery',
          active: banner.active ?? true,
          order: banner.order ?? homeBanners.length + 1,
          bgGradient: banner.bgGradient || 'from-indigo-950/90 via-purple-950/70 to-slate-900/90',
        };

    try {
      const res = await authFetch('/api/admin/cms/banners', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const error = data.error || 'Failed to save banner';
        showToast('Banner Save Failed', error, 'error');
        return { success: false, error };
      }
      const saved = data.data as HomeBanner;
      setHomeBanners((prev) => {
        const exists = prev.some((b) => b.id === saved.id);
        return exists ? prev.map((b) => (b.id === saved.id ? saved : b)) : [...prev, saved];
      });
      showToast('Banner Saved 🖼️', `Saved promo banner: ${saved.title}`, 'success');
      return { success: true };
    } catch (err: any) {
      console.error('saveHomeBanner error:', err);
      showToast('Banner Save Failed', 'Could not reach the server.', 'error');
      return { success: false, error: 'Could not reach the server.' };
    }
  };

  const deleteHomeBanner = async (bannerId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch(`/api/admin/cms/banners/${encodeURIComponent(bannerId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const error = data.error || 'Failed to delete banner';
        showToast('Delete Failed', error, 'error');
        return { success: false, error };
      }
      setHomeBanners((prev) => prev.filter((b) => b.id !== bannerId));
      showToast('Banner Deleted', 'Promo banner removed from Home page', 'info');
      return { success: true };
    } catch (err: any) {
      console.error('deleteHomeBanner error:', err);
      showToast('Delete Failed', 'Could not reach the server.', 'error');
      return { success: false, error: 'Could not reach the server.' };
    }
  };

  const toggleBannerActive = async (bannerId: string): Promise<{ success: boolean; error?: string }> => {
    const target = homeBanners.find((b) => b.id === bannerId);
    if (!target) return { success: false, error: 'Banner not found' };
    const nextActive = !target.active;
    try {
      const res = await authFetch(`/api/admin/cms/banners/${encodeURIComponent(bannerId)}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const error = data.error || 'Failed to update banner';
        showToast('Update Failed', error, 'error');
        return { success: false, error };
      }
      setHomeBanners((prev) => prev.map((b) => (b.id === bannerId ? { ...b, active: nextActive } : b)));
      return { success: true };
    } catch (err: any) {
      console.error('toggleBannerActive error:', err);
      showToast('Update Failed', 'Could not reach the server.', 'error');
      return { success: false, error: 'Could not reach the server.' };
    }
  };

  const savePolicyDocument = async (
    policy: Partial<PolicyDocument> & { id?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const payload: PolicyDocument = policy.id
      ? ({
          ...(policyDocuments.find((p) => p.id === policy.id) || {}),
          ...policy,
          lastUpdated: new Date().toISOString(),
        } as PolicyDocument)
      : {
          id: 'policy_' + Date.now(),
          slug: (policy.title || 'policy').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          title: policy.title || 'Platform Policy',
          category: policy.category || 'safety',
          icon: policy.icon || 'ShieldCheck',
          summary: policy.summary || 'Platform safety and regulatory guidelines.',
          content: policy.content || '### Policy Details\n\nPolicy compliance guidelines and terms.',
          lastUpdated: new Date().toISOString(),
          order: policy.order ?? policyDocuments.length + 1,
          isFeaturedOnHome: policy.isFeaturedOnHome ?? true,
          externalUrl: policy.externalUrl,
        };

    try {
      const res = await authFetch('/api/admin/cms/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const error = data.error || 'Failed to save policy';
        showToast('Policy Save Failed', error, 'error');
        return { success: false, error };
      }
      const saved = data.data as PolicyDocument;
      setPolicyDocuments((prev) => {
        const exists = prev.some((p) => p.id === saved.id);
        return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
      });
      showToast('Policy Saved 📜', `Saved policy: ${saved.title}`, 'success');
      return { success: true };
    } catch (err: any) {
      console.error('savePolicyDocument error:', err);
      showToast('Policy Save Failed', 'Could not reach the server.', 'error');
      return { success: false, error: 'Could not reach the server.' };
    }
  };

  const deletePolicyDocument = async (policyId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch(`/api/admin/cms/policies/${encodeURIComponent(policyId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const error = data.error || 'Failed to delete policy';
        showToast('Delete Failed', error, 'error');
        return { success: false, error };
      }
      setPolicyDocuments((prev) => prev.filter((p) => p.id !== policyId));
      showToast('Policy Deleted', 'Policy document removed', 'info');
      return { success: true };
    } catch (err: any) {
      console.error('deletePolicyDocument error:', err);
      showToast('Delete Failed', 'Could not reach the server.', 'error');
      return { success: false, error: 'Could not reach the server.' };
    }
  };

  const saveHomeQuickLink = async (
    link: Partial<HomeQuickLink> & { id?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const payload: HomeQuickLink = link.id
      ? ({ ...(homeQuickLinks.find((l) => l.id === link.id) || {}), ...link } as HomeQuickLink)
      : {
          id: 'link_' + Date.now(),
          title: link.title || 'Quick Action',
          subtitle: link.subtitle || 'Explore feature',
          icon: link.icon || 'Zap',
          badge: link.badge,
          actionType: link.actionType || 'tab',
          actionTarget: link.actionTarget || 'discovery',
          colorGradient: link.colorGradient || 'from-indigo-500 to-purple-600',
          order: link.order ?? homeQuickLinks.length + 1,
          active: link.active ?? true,
        };

    try {
      const res = await authFetch('/api/admin/cms/quick-links', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const error = data.error || 'Failed to save quick link';
        showToast('Shortcut Save Failed', error, 'error');
        return { success: false, error };
      }
      const saved = data.data as HomeQuickLink;
      setHomeQuickLinks((prev) => {
        const exists = prev.some((l) => l.id === saved.id);
        return exists ? prev.map((l) => (l.id === saved.id ? saved : l)) : [...prev, saved];
      });
      showToast('Shortcut Saved', `Saved shortcut: ${saved.title}`, 'success');
      return { success: true };
    } catch (err: any) {
      console.error('saveHomeQuickLink error:', err);
      showToast('Shortcut Save Failed', 'Could not reach the server.', 'error');
      return { success: false, error: 'Could not reach the server.' };
    }
  };

  const deleteHomeQuickLink = async (linkId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch(`/api/admin/cms/quick-links/${encodeURIComponent(linkId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const error = data.error || 'Failed to delete quick link';
        showToast('Delete Failed', error, 'error');
        return { success: false, error };
      }
      setHomeQuickLinks((prev) => prev.filter((l) => l.id !== linkId));
      showToast('Shortcut Removed', 'Quick shortcut removed from Home page', 'info');
      return { success: true };
    } catch (err: any) {
      console.error('deleteHomeQuickLink error:', err);
      showToast('Delete Failed', 'Could not reach the server.', 'error');
      return { success: false, error: 'Could not reach the server.' };
    }
  };

  const seedHomeCmsDefaults = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch('/api/admin/cms/seed-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          banners: INITIAL_HOME_BANNERS,
          policies: INITIAL_POLICY_DOCUMENTS,
          quickLinks: INITIAL_HOME_QUICK_LINKS,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const error = data.error || 'Failed to seed starter CMS content';
        showToast('Seed Failed', error, 'error');
        return { success: false, error };
      }
      if (data.data?.banners) setHomeBanners(data.data.banners);
      if (data.data?.policies) setPolicyDocuments(data.data.policies);
      if (data.data?.quickLinks) setHomeQuickLinks(data.data.quickLinks);
      localStorage.removeItem('livecall_home_banners');
      localStorage.removeItem('livecall_policy_documents');
      localStorage.removeItem('livecall_home_quick_links');
      showToast('Starter CMS Loaded', 'Honest default banners, policies, and shortcuts saved to the database.', 'success');
      return { success: true };
    } catch (err: any) {
      console.error('seedHomeCmsDefaults error:', err);
      showToast('Seed Failed', 'Could not reach the server.', 'error');
      return { success: false, error: 'Could not reach the server.' };
    }
  };

  const saveAppNavSlice = async (payload: {
    audienceRole: string;
    bar: string;
    slot?: string | null;
    items: AppNavItem[];
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch('/api/admin/cms/nav-items/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const error = data.error || 'Failed to save navigation';
        showToast('Navigation Save Failed', error, 'error');
        return { success: false, error };
      }
      const saved = (Array.isArray(data.data) ? data.data : []).map((row: any) =>
        row?.audienceRole ? row : mapNavRow(row)
      ) as AppNavItem[];
      setAppNavItems((prev) => {
        const rest = prev.filter((item) => {
          if (item.audienceRole !== payload.audienceRole || item.bar !== payload.bar) return true;
          if (payload.slot && item.slot !== payload.slot) return true;
          return false;
        });
        return [...rest, ...saved];
      });
      showToast('Navigation Saved', 'Navigation bar updated.', 'success');
      return { success: true };
    } catch (err: any) {
      console.error('saveAppNavSlice error:', err);
      showToast('Navigation Save Failed', 'Could not reach the server.', 'error');
      return { success: false, error: 'Could not reach the server.' };
    }
  };

  // =========================================================================
  // SILENT ADMIN VIDEO CALL MONITORING & QA COMPLIANCE CONTROLLERS
  // =========================================================================

  const adminTerminateCall = async (callId: string, reason?: string): Promise<boolean> => {
    try {
      const targetCall = adminActiveCalls.find((c) => c.id === callId);
      const terminationReason = reason || 'Safety & Compliance Violation: Call terminated by Platform Administration.';

      // Dispatch to server endpoint for WebRTC / WebSocket broadcast
      try {
        await authFetch('/api/admin/terminate-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId,
            reason: terminationReason,
            adminId: currentUser.id,
          }),
        });

        await authFetch('/api/calls/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId,
            callerId: targetCall?.callerId,
            receiverId: targetCall?.hostId,
            status: 'ended',
          }),
        });
      } catch (err) {
        console.warn('Backend terminate-call sync error:', err);
      }

      // If the current active user in UI was in this call, terminate local session
      if (activeCall && (activeCall.id === callId || (targetCall && (activeCall.callerId === targetCall.callerId || activeCall.receiverId === targetCall.hostId)))) {
        setActiveCall(null);
      }

      // Remove from active surveillance calls
      setAdminActiveCalls((prev) => prev.filter((c) => c.id !== callId));

      // Reset user statuses back to online
      if (targetCall) {
        setUsers((prev) =>
          prev.map((u) => {
            if (u.id === targetCall.hostId || u.id === targetCall.callerId) {
              return { ...u, onlineStatus: 'online' };
            }
            return u;
          })
        );

        if (isSupabaseConfigured()) {
          updateUserStatusInSupabase(targetCall.hostId, 'online').catch(() => {});
          updateUserStatusInSupabase(targetCall.callerId, 'online').catch(() => {});
        }

        // Record official audit log in incident evidence
        const newEvidence: IncidentEvidence = {
          id: 'inc_' + Date.now(),
          callId: targetCall.id,
          hostName: targetCall.hostName,
          callerName: targetCall.callerName,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionTaken: 'Emergency Termination (Killswitch Triggered)',
          adminNote: `Session forcefully halted. Reason: "${terminationReason}"`,
        };
        setIncidentEvidenceLogs((prev) => [newEvidence, ...prev]);
      }

      showToast(
        'Call Terminated (Admin Killswitch) 🚨',
        `Live video call ${callId} has been successfully disconnected and participants notified.`,
        'success'
      );
      return true;
    } catch (err: any) {
      showToast('Termination Failed', err.message || 'Could not terminate call session.', 'error');
      return false;
    }
  };

  const adminIssueCallWarning = async (callId: string, warningText: string): Promise<boolean> => {
    try {
      const targetCall = adminActiveCalls.find((c) => c.id === callId);
      const text = warningText.trim() || 'Automated Safety Advisory: Please maintain respectful conduct.';

      try {
        await authFetch('/api/admin/issue-warning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId,
            warningText: text,
          }),
        });
      } catch (err) {
        console.warn('Backend warning dispatch error:', err);
      }

      if (targetCall) {
        const newEvidence: IncidentEvidence = {
          id: 'inc_' + Date.now(),
          callId: targetCall.id,
          hostName: targetCall.hostName,
          callerName: targetCall.callerName,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionTaken: 'Safety Advisory Warning Dispatched',
          adminNote: `Dispatched warning to room: "${text}" without revealing admin spectator presence.`,
        };
        setIncidentEvidenceLogs((prev) => [newEvidence, ...prev]);
      }

      showToast(
        'Safety Advisory Dispatched ⚠️',
        `Discreet compliance warning delivered to participants: "${text}".`,
        'info'
      );
      return true;
    } catch (err: any) {
      showToast('Warning Failed', err.message || 'Could not send safety warning.', 'error');
      return false;
    }
  };

  const adminCaptureEvidence = (callId: string, note?: string, snapshotUrl?: string) => {
    const targetCall = adminActiveCalls.find((c) => c.id === callId);
    if (!targetCall) return;

    const newEvidence: IncidentEvidence = {
      id: 'inc_' + Date.now(),
      callId: targetCall.id,
      hostName: targetCall.hostName,
      callerName: targetCall.callerName,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionTaken: 'Evidence Snapshot Captured',
      snapshotUrl: snapshotUrl || targetCall.hostAvatar,
      adminNote: note || `Stream snapshot & QA telemetry saved at ${targetCall.durationSeconds}s runtime. Safety score: ${targetCall.safetyScore ?? 99}%.`,
    };

    setIncidentEvidenceLogs((prev) => [newEvidence, ...prev]);
    showToast(
      'Evidence Snapshot Captured 📸',
      `Telemetry timestamp & video frame saved to QA audit report for ${targetCall.hostName} & ${targetCall.callerName}.`,
      'success'
    );
  };

  // Female Creator Performance Metrics & Intelligence
  const [creatorMetricsMap, setCreatorMetricsMap] = useState<Record<string, CreatorMetrics>>({});

  // Hydrate creator metrics from REST on login (WS also pushes creator_metrics:all)
  useEffect(() => {
    if (!isLoggedIn || !currentUserId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch('/api/creator/metrics');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.success && data.metrics && typeof data.metrics === 'object') {
          setCreatorMetricsMap(data.metrics as Record<string, CreatorMetrics>);
        } else if (data?.success && data.metric && currentUserId) {
          setCreatorMetricsMap((prev) => ({
            ...prev,
            [currentUserId]: data.metric as CreatorMetrics,
          }));
        }
      } catch {
        // WS may still deliver metrics
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, currentUserId]);

  // Optional nudge: female creators ping server accrual every 45s while tab visible
  useEffect(() => {
    if (!isLoggedIn || !currentUser || currentUser.gender !== 'female') return;
    const creatorId = currentUser.id;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        try {
          const res = await authFetch('/api/creator/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (!res.ok) return;
          const data = await res.json().catch(() => null);
          if (data?.success && data.metrics) {
            setCreatorMetricsMap((prev) => ({
              ...prev,
              [creatorId]: data.metrics as CreatorMetrics,
            }));
          }
        } catch {
          // Presence-driven server accrual remains authoritative
        }
      })();
    };
    const timer = setInterval(tick, 45000);
    return () => clearInterval(timer);
  }, [isLoggedIn, currentUser?.id, currentUser?.gender]);

  const myCreatorMetrics = useMemo<CreatorMetrics | null>(() => {
    if (!currentUser || currentUser.gender !== 'female') return null;
    return creatorMetricsMap[currentUser.id] || {
      creatorId: currentUser.id,
      creatorName: currentUser.name,
      creatorAvatar: currentUser.avatarUrl,
      agencyLeaderId: currentUser.teamLeaderId || null,
      agencyName: currentUser.agencyName || null,
      activeOnlineSeconds: 0,
      activeOnlineHours: 0,
      coinsEarnedFromCalls: currentUser.earningsCoins || 0,
      coinsEarnedFromGifts: 0,
      totalTargetCoins: currentUser.earningsCoins || 0,
      currentStreakDays: 1,
      streakBoostUntil: null,
      lastActiveDate: new Date().toISOString().split('T')[0],
      firstCallBonusClaimedDate: undefined,
      totalCallsOffered: currentUser.totalCallsHosted || 0,
      totalCallsAnswered: currentUser.totalCallsHosted || 0,
      totalCallsDeclined: 0,
      totalCallsMissed: 0,
      responseHealthScore: 100,
      performanceTier: 'bronze' as CreatorTier,
      isReadyNowActive: false,
      readyNowToggledAt: null,
      targetPeriodStart: new Date().toISOString().split('T')[0],
      targetPeriodEnd: null,
      bonusEarnedCoins: 0,
      bonusEarnedUSD: 0,
      updatedAt: new Date().toISOString(),
    };
  }, [currentUser, creatorMetricsMap]);

  const toggleReadyNow = async (creatorIdOrActive?: string | boolean): Promise<boolean> => {
    if (!currentUser?.id) return false;
    const nextActive =
      typeof creatorIdOrActive === 'boolean'
        ? creatorIdOrActive
        : !(creatorMetricsMap[currentUser.id]?.isReadyNowActive);

    try {
      const res = await authFetch('/api/creator/ready-now-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isReadyNow: nextActive }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast('Ready Now Failed', data?.error || 'Could not update Ready Now status.', 'error');
        return false;
      }
      if (data.metrics) {
        setCreatorMetricsMap((prev) => ({
          ...prev,
          [currentUser.id]: data.metrics as CreatorMetrics,
        }));
      }
      showToast(
        nextActive ? 'Ready Now Surge Active! ⚡' : 'Ready Now Deactivated',
        nextActive ? '+100 pts discovery rank surge applied.' : 'Returned to standard discovery ranking.',
        'info'
      );
      return true;
    } catch {
      showToast('Ready Now Failed', 'Network error updating Ready Now.', 'error');
      return false;
    }
  };

  const sendCreatorHeartbeat = async (): Promise<void> => {
    if (!currentUser || currentUser.gender !== 'female') return;
    try {
      const res = await authFetch('/api/creator/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.success && data.metrics) {
        setCreatorMetricsMap((prev) => ({
          ...prev,
          [currentUser.id]: data.metrics as CreatorMetrics,
        }));
      }
    } catch {
      // Presence-driven server accrual remains authoritative
    }
  };

  const claimDailyFirstCallBonus = async (): Promise<boolean> => {
    if (!currentUser || currentUser.gender !== 'female') return false;

    try {
      const res = await authFetch('/api/creator/first-call-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast('Bonus Claim Failed', data?.error || 'Could not claim bonus.', 'error');
        return false;
      }
      if (data?.alreadyClaimed) {
        showToast('Already Claimed', data.message || 'You have already claimed today\'s first call speed bonus.', 'info');
        return false;
      }
      if (!data?.success) {
        showToast('Bonus Claim Failed', data?.message || data?.error || 'Could not claim bonus.', 'error');
        return false;
      }

      if (data.metrics) {
        setCreatorMetricsMap((prev) => ({
          ...prev,
          [currentUser.id]: data.metrics as CreatorMetrics,
        }));
      }

      const bonusCoins = Number(data.bonusCoins ?? systemSettings.dailyFirstCallBonusCoins ?? 100);
      const bonusUSD = Number(data.bonusUSD ?? systemSettings.dailyFirstCallBonusUSD ?? 1);

      if (currentUser?.id) {
        setUsers((prev) =>
          prev.map((u) => {
            if (u.id === currentUser.id) {
              return {
                ...u,
                earningsCoins: (u.earningsCoins || 0) + bonusCoins,
                totalLifetimeEarnedUSD: (u.totalLifetimeEarnedUSD || 0) + bonusUSD,
              };
            }
            return u;
          })
        );
      }

      showToast(
        'First Call Speed Bonus Claimed! ⚡',
        `+${bonusCoins} 🪙 (+$${bonusUSD.toFixed(2)} USD) added to your earnings!`,
        'success'
      );
      return true;
    } catch {
      showToast('Bonus Claim Failed', 'Network error claiming bonus.', 'error');
      return false;
    }
  };

  return (
    <AppContext.Provider
      value={{
        users,
        currentUser,
        isLoggedIn,
        systemSettings,
        creatorMetricsMap,
        myCreatorMetrics,
        toggleReadyNow,
        sendCreatorHeartbeat,
        claimDailyFirstCallBonus,
        coinPackages,
        currencyConfigs,
        virtualGifts,
        saveVirtualGift,
        deleteVirtualGift,
        resetVirtualGifts,
        payoutRequests,
        activeCall,
        chatMessages,
        unreadMessagesCount,
        pendingFriendRequestsCount,
        missedCallsCount,
        markCallLogsSeen,
        readMessageIds,
        markChatAsRead,
        markAllChatsAsRead,
        feedPosts,
        callLogs,
        friendRequests,
        favorites,
        friends,
        blockedUserIds,
        blockedByUserIds,
        userMatchRecords,
        creatorGoals,
        dailyBonusClaimed,
        dailyRewardRecord,
        isDailyRewardsModalOpen,
        openDailyRewardsModal,
        closeDailyRewardsModal,
        blockReportModal,
        openBlockReportModal,
        closeBlockReportModal,
        claimDailyStreak,
        claimDailyMission,
        claimDailyMasterChest,
        hasUnclaimedDailyRewards,
        recordChatFriendInteraction,
        recordQuickMatchInteraction,
        recordVideoCallDuration,
        recordMomentInteraction,
        recordGiftSentInteraction,
        toast,
        homeBanners,
        policyDocuments,
        homeQuickLinks,
        appNavItems,
        activePolicyDoc,
        openPolicyModal,
        closePolicyModal,
        saveHomeBanner,
        deleteHomeBanner,
        toggleBannerActive,
        savePolicyDocument,
        deletePolicyDocument,
        saveHomeQuickLink,
        deleteHomeQuickLink,
        seedHomeCmsDefaults,
        saveAppNavSlice,
        feedbackCatalog,
        reloadFeedbackCatalog,
        resolveFeedback: resolveFeedbackCopy,
        showToastKey,
        siteBranding,
        reloadSiteBranding,
        showToast,
        hideToast,
        switchUser,
        completeAuthenticatedLogin,
        switchRolePersona,
        loginUser,
        logoutUser,
        registerUser,
        updateUserProfile,
        changeUserPassword,
        buyCoinPackage,
        claimDailyBonus,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        markCallMediaConnected,
        sendGiftInCall,
        getEffectiveCallRate,
        sendMessage,
        loadOlderMessages,
        ingestInCallChatPreview,
        notifyInCallChatPreview,
        clearChatHistory,
        toggleFavorite,
        likeUser,
        passUser,
        toggleFriend,
        addFriend,
        removeFriend,
        isFriend,
        sendFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        blockUser,
        unblockUser,
        reportUser,
        contributeToGoal,
        submitPayoutRequest,
        liveHostIds,
        activeQuickMatchCallerIds,
        connectedCallersByHost,
        connectCallerToHost,
        disconnectCallerFromHost,
        setCallerQuickMatchBrowsing,
        toggleGoLiveQuickMatch,
        isHostLive,
        quickMatches,
        recordQuickMatch,
        sendQuickMatchGift,
        updateSystemSettings,
        updateLiveKitConfig,
        saveCoinPackage,
        deleteCoinPackage,
        saveCurrencyConfigs,
        adminApprovePayout,
        adminRejectPayout,
        adminUpdateUser,
        adminDeleteUser,
        toggleVerifyUser,
        toggleUserStatus,
        manualGrantCoins,
        syncAllProfilesToSupabase,
        syncUsersFromSupabase,
        purgeAllMockData,
        resetMockDataGranular,
        likePost,
        likeUserMoment,
        tipMomentCreator,
        addFeedPost,
        deleteFeedPost,
        refreshFeedPosts,
        fetchUserMoments,
        createTeamLeader,
        createCreatorByTeamLeader,
        updateCreatorCoinEarnOverride,
        banCreatorByTeamLeader,
        unbanCreatorByTeamLeader,
        deleteCreatorByTeamLeader,
        refreshTeamLeaderCreators,
        creatorReviews,
        refreshCreatorReviews,
        submitCreatorReview,
        sendRatingRequest,
        pendingRatingCall,
        setPendingRatingCall,
        adminActiveCalls,
        incidentEvidenceLogs,
        refreshAdminActiveCalls,
        adminTerminateCall,
        adminIssueCallWarning,
        adminCaptureEvidence,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
