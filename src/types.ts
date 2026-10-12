import type { DiscoveryCardLayout } from '../shared/discoveryCardLayout';

export type UserGender = 'male' | 'female' | 'other';
export type UserRole = 'male_user' | 'female_user' | 'female_creator' | 'female_host' | 'other_user' | 'admin' | 'team_leader' | 'agency_manager';
export type OnlineStatus = 'online' | 'busy' | 'offline' | 'in_call';

/**
 * Derives the user-facing role label.
 * Backend roles remain female_user / female_creator; frontend shows both as "Female".
 * Use getFemaleRoleMark() for admin-only subtype badges (Creator vs User).
 */
export function getUserRoleLabel(user?: { role?: string; gender?: string; teamLeaderId?: string | null } | null): string {
  if (!user) return 'Male User';
  const role = user.role;
  const gender = user.gender;

  if (role === 'admin') return 'Admin';
  if (role === 'team_leader' || role === 'agency_manager') return 'Agency';
  if (role === 'other_user' || gender === 'other') return 'Other User';

  if (
    gender === 'female' ||
    role === 'female_user' ||
    role === 'female_creator' ||
    role === 'female_host'
  ) {
    return 'Female';
  }

  return 'Male User';
}

/** Admin subtype mark for female accounts (backend: female_creator vs female_user). */
export function getFemaleRoleMark(
  user?: { role?: string; gender?: string; teamLeaderId?: string | null } | null
): 'creator' | 'user' | null {
  if (!user) return null;
  const role = user.role;
  const gender = user.gender;
  const isFemale =
    gender === 'female' ||
    role === 'female_user' ||
    role === 'female_creator' ||
    role === 'female_host';
  if (!isFemale) return null;
  if (role === 'female_creator' || role === 'female_host' || Boolean(user.teamLeaderId)) {
    return 'creator';
  }
  return 'user';
}

/** True when receiver is eligible for call host share (female_creator path). */
export function isFemaleCreatorRole(role?: string | null): boolean {
  return role === 'female_creator' || role === 'female_host';
}

export interface CreatorMoment {
  id: string;
  mediaUrl: string;
  caption: string;
  likes: number;
  commentsCount: number;
  createdAt: string;
  mediaType?: 'image' | 'video';
  isLiked?: boolean;
}

/** One entry in profiles.gallery_videos (JSON). sizeBytes used for per-user quota. */
export interface GalleryVideoItem {
  url: string;
  storageKey?: string;
  sizeBytes: number;
  contentType?: string;
  createdAt?: string;
}

export interface UserProfile {
  id: string;
  authId?: string;
  name: string;
  email: string;
  phone?: string;
  gender: UserGender;
  genderLocked: boolean;
  age: number;
  dob: string;
  nationality: string;
  countryCode: string; // e.g. 'US', 'ES', 'BR', 'JP'
  spokenLanguages: string[];
  bio: string;
  extendedBio?: string;
  locationCity?: string;
  zodiac?: string;
  responseRate?: string;
  interests: string[];
  interestedIn?: string[]; // e.g. ['female', 'everyone']
  tags?: string[]; // Creator tags/categories e.g. ['Singer', 'Gamer', 'Model', 'Dancer', 'Traveler']
  avatarUrl: string;
  gallery: string[];
  /** Profile gallery videos (multiple). Total sizeBytes capped by systemSettings.profileVideoQuotaMb. */
  galleryVideos?: GalleryVideoItem[];
  introVideoUrl?: string; // Cloudflare R2 uploaded video introduction
  verificationVideoUrl?: string;
  isVerified: boolean;
  onlineStatus: OnlineStatus;
  role: UserRole;
  createdAt: string;

  // Onboarding & Flow State
  isOnboarded?: boolean;
  onboardingStep?: number;
  agreedToTerms?: boolean;
  agreedToAdultTerms?: boolean; // Male Consumer 18+ Adult Agreement
  agreedToHostTerms?: boolean; // Female Host Code of Conduct & Commission Agreement

  // KYC Verification (Only required at payout request, NOT at registration)
  kycStatus?: 'unsubmitted' | 'pending' | 'verified' | 'rejected';
  kycDocuments?: {
    idType?: string;
    idFrontUrl?: string;
    idBackUrl?: string;
    submittedAt?: string;
  };

  // Security & Authentication (Raw passwords never stored in state)
  hasPasswordSet?: boolean;
  emailVerified?: boolean;
  password?: string;
  country?: string;
  username?: string;

  // Moderation & Suspension (Team Leader / Admin N-Days Ban & Deletion)
  isBanned?: boolean;
  banReason?: string;
  bannedUntil?: string; // ISO timestamp for temporary ban expiration (null if unbanned)
  bannedById?: string; // ID of Team Leader or Admin who issued the ban
  bannedByRole?: string; // 'team_leader' | 'admin'

  // Recent Moments / Feed
  moments?: CreatorMoment[];

  // Male Specific
  coinBalance: number;

  // Female Specific
  hourlyCoinRate: number; // e.g. 10 coins/min
  earningsCoins: number; // current accumulated coins value
  totalLifetimeEarnedUSD: number;
  payoutMethod?: {
    type: 'bank' | 'paypal' | 'crypto' | 'local';
    details: string;
  };

  // Location & Geolocation Configuration
  allowMockLocation?: boolean; // Admin permission switch for female host
  isUsingMockLocation?: boolean; // Whether mock location is active
  mockLocationCity?: string;
  mockLocationCountry?: string;
  mockLocationCountryCode?: string;
  exactLocation?: {
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
    countryCode?: string;
    accuracyMeters?: number;
    detectedAt?: string;
    isMock?: boolean;
  };

  // Stats
  totalCallsHosted?: number;
  totalCallMinutes?: number;
  totalGiftsReceivedCount?: number;
  ratingScore?: number; // e.g. 4.95
  totalReviewsCount?: number;
  acceptanceRatePercent?: number; // e.g. 96.5
  hoursOnlineThisMonth?: number;
  profileViewsThisMonth?: number;
  newFollowersThisMonth?: number;

  // Team Leader & Agency Hierarchy
  teamLeaderId?: string; // ID of the Team Leader who manages/created this user
  createdById?: string; // ID of the user (Admin or Team Leader) who created this profile
  coinEarnOverrideRate?: number | null; // Admin-only per-minute coin earning override; null/undefined = use system host share %
  teamLeaderNote?: string; // Team Leader internal notes
  agencyName?: string; // Agency / Guild / Team Name (for Team Leaders)
  commissionPercent?: number; // Team Leader commission % (e.g. 10%)
}

/** Call spending statement (not a payment-gateway purchase invoice). */
export interface TransactionReceipt {
  id: string;
  statementNumber: string;
  userId: string;
  userName: string;
  description: string;
  hostName?: string;
  coinsDebited: number;
  amountUSD: number;
  status: 'completed' | 'missed' | 'declined' | 'rejected' | 'failed' | 'unknown';
  createdAt: string;
  callLogId?: string;
  durationMinutes: number;
  source: 'call_log';
}

export interface WalletLedgerEntry {
  id: string;
  userId: string;
  type: 'credit' | 'debit';
  category: 'call_spend' | 'gift_spend' | 'chat_message' | 'moment_unlock' | 'topup_purchase' | 'daily_bonus' | 'host_earning' | 'payout_withdrawal';
  title: string;
  description?: string;
  coins: number;
  balanceAfter: number;
  counterpartName?: string;
  counterpartAvatar?: string;
  timestamp: string;
  referenceId?: string;
}

export interface AutoRechargeConfig {
  enabled: boolean;
  triggerThresholdCoins: number; // e.g. when coins drop below 50
  rechargePackageCoins: number; // e.g. auto buy 500 coins package ($4.99)
  preferredPaymentMethod: string;
  lastTriggeredAt?: string;
}

export interface CoinPackage {
  id: string;
  title: string;
  coins: number;
  bonusCoins: number;
  /** Regular / list price (USD). */
  priceUSD: number;
  /** What the user pays; null/undefined = no discount (pay priceUSD). */
  discountPriceUSD?: number | null;
  /** Optional override for approx call minutes; null = compute from total coins / burn rate. */
  approxCallMinutes?: number | null;
  /** Optional display override for the saving badge; null = compute from price − discount. */
  savingLabel?: string | null;
  badgeTag?: string; // 'Best Value', '70% OFF', 'Popular'
  popular?: boolean;
  orderNum?: number;
}

export interface VirtualGift {
  id: string;
  name: string;
  coinCost: number;
  icon: string;
  animationType: 'rose' | 'heart' | 'ring' | 'car' | 'yacht' | 'rocket' | 'crown' | 'fire' | 'diamond' | 'custom';
  color: string;
  gradient?: string;
  isActive?: boolean;
  category?: string;
}

export interface CallSession {
  id: string;
  callerId: string;
  receiverId: string;
  startTime: number;
  endTime?: number;
  durationSeconds: number;
  billedMinutes?: number;
  coinsSpent: number;
  coinsEarned: number;
  giftsSent: { giftId: string; giftName: string; cost: number; timestamp: number }[];
  status: 'ringing' | 'connecting' | 'active' | 'ended' | 'rejected';
  warningMessage?: string;
  /** True only after LiveKit room connected with a remote participant — gates coin burn. */
  mediaConnected?: boolean;
}

export interface AdminActiveCall {
  id: string;
  hostId: string;        // Female host ID
  hostName: string;
  hostAvatar: string;
  hostCountry: string;
  hostCountryCode?: string;
  hostHourlyRate: number;
  hostRating?: number;
  hostAge?: number;
  hostEarningsCoins: number;

  callerId: string;      // Male caller ID
  callerName: string;
  callerAvatar: string;
  callerCountry: string;
  callerCountryCode?: string;
  callerCoinBalance: number;

  startTime: number;
  durationSeconds: number;
  billedMinutes?: number;
  coinsSpent: number;
  coinsEarned: number;
  status: 'active' | 'ringing';
  burnRatePerMin: number;

  // Video & Stream Telemetry
  videoQuality?: '1080p FHD' | '720p HD' | '4K Ultra HD' | '480p SD';
  fps?: number;
  bitrateKbps?: number;
  latencyMs?: number;
  packetLoss?: number;
  safetyScore?: number; // 0-100% clean
  safetyFlag?: 'clean' | 'suspicious' | 'under_review';
  aiShieldActive?: boolean;

  // Live Audio Telemetry
  hostAudioLevel?: number;   // 0 - 100
  callerAudioLevel?: number; // 0 - 100
  warningMessage?: string;
}

export interface IncidentEvidence {
  id: string;
  callId: string;
  hostName: string;
  callerName: string;
  timestamp: string;
  snapshotUrl?: string;
  actionTaken: string;
  adminNote?: string;
}

/** Legacy mid-period withdrawal request. Prefer settlement_batches for new period-end cash-outs. */
export interface PayoutRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amountCoins: number;
  amountUSD: number;
  payoutMethod: string;
  /** Client display field; DB column is payout_details (JSONB). */
  accountDetails: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requestDate: string;
  processedDate?: string;
  /** Client display field; DB column is admin_notes. */
  adminNote?: string;
  teamLeaderId?: string;
  teamLeaderName?: string;
}

export interface CallLogItem {
  id: string;
  callerId: string;       // Male caller ID
  callerName: string;
  callerAvatar: string;
  callerCountry?: string;
  receiverId: string;     // Female receiver ID
  receiverName: string;
  receiverAvatar: string;
  hostId?: string;
  hostName?: string;
  hostAvatar?: string;
  startTime: number;
  endTime?: number;
  durationSeconds: number;
  coinsSpent: number;
  coinsEarned: number;
  teamLeaderEarnedCoins?: number;
  teamLeaderId?: string;
  timestamp: string;
  wasFriendCall: boolean;
  isAudioOnly?: boolean;
  isRoulette?: boolean;
  status?: 'completed' | 'missed' | 'declined' | 'rejected' | 'failed' | string;
}

export interface FriendRequest {
  id: string;
  senderId: string;      // Female creator sending request
  senderName: string;
  senderAvatar: string;
  receiverId: string;    // Male user receiving request
  receiverName: string;
  receiverAvatar: string;
  status: 'pending' | 'accepted' | 'declined' | 'removed';
  timestamp: string;
  callLogId?: string;
}

export interface CreatorReview {
  id: string;
  creatorId: string;
  creatorName?: string;
  creatorAvatar?: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  callerCountry?: string;
  callLogId?: string;
  stars: number; // 1 to 5
  communication?: number; // 1 to 5
  friendliness?: number; // 1 to 5
  clarity?: number; // 1 to 5
  energy?: number; // 1 to 5
  comment?: string;
  tags?: string[];
  createdAt: string;
  callDurationSeconds?: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  originalLanguage: string;
  translatedText?: string;
  targetLanguage?: string;
  mediaUrl?: string;
  type: 'text' | 'image' | 'voice' | 'gift' | 'friend_request' | 'system' | 'call_rating';
  giftInfo?: { name: string; coins: number; icon: string };
  friendRequestInfo?: FriendRequest;
  ratingInfo?: {
    callLogId?: string;
    creatorId: string;
    creatorName: string;
    creatorAvatar: string;
    callerId: string;
    stars?: number;
    communication?: number;
    friendliness?: number;
    clarity?: number;
    energy?: number;
    comment?: string;
    tags?: string[];
    isSubmitted?: boolean;
    callDurationSeconds?: number;
  };
  /** Authoritative unread flag from messages.is_read (receiver-side). */
  isRead?: boolean;
  /** ISO timestamptz from DB; preferred for ordering. */
  createdAt?: string;
  /** Display/compat timestamp (ISO or locale string). */
  timestamp: string;
  /** Optimistic client temp id before server UUID reconcile. */
  clientTempId?: string;
  /** Local-only send failure marker. */
  sendFailed?: boolean;
}

export interface FeedPost {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  creatorCountry: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  caption: string;
  likes: number;
  commentsCount: number;
  createdAt: string;
  isLiked?: boolean;
}

export interface SystemSettings {
  coinBurnRatePerMin: number; // Standard Coin Burn Rate - Non-Friends (Coins / Minute), e.g. 120
  coinBurnRateFriendPerMin: number; // Friend Discounted Burn Rate - Friends (Coins / Minute), e.g. 80
  /** Live weekly host share % on call burns (Economy B). Always used mid-period. */
  femaleHostSharePercent: number;
  /** Target host share % applied at period END via true-up if bronze+ met (Economy B / Phase 3). */
  femaleHostTargetSharePercent: number;
  teamLeaderSharePercent: number; // Team Leader Share for 1-on-1 Calls (%), e.g. 10 for 10%
  giftFemaleHostSharePercent: number; // Female Host Share for Virtual Gifts (%), e.g. 70 for 70%
  giftTeamLeaderSharePercent: number; // Team Leader Share for Virtual Gifts (%), e.g. 10 for 10%
  enableVirtualGifts?: boolean; // Master toggle for virtual gifts system
  femalePayoutRatioUSD: number; // LEGACY synced to coinUsdPeg — prefer coinUsdPeg
  minPayoutThresholdUSD: number; // Minimum Withdrawal Threshold ($ USD), e.g. 50
  /** @deprecated Derived display only (burn × host%). Not used by burn path. */
  femaleEarningRatePerMin?: number;
  coinToUSDRatio: number; // LEGACY synced to coinUsdPeg — prefer coinUsdPeg
  /** Fixed Peg: USD per coin for host/TL/platform (canonical Phase 1). e.g. 0.003 = $3 / 1000 coins */
  coinUsdPeg: number;
  enableRegularFemaleCoinEarning?: boolean; // When false, only Team Leader created female hosts can earn coins; regular female users have all coin earning options hidden
  aiNudityShieldEnabled: boolean;
  screenRecordingProtection: boolean;
  freeDailyLoginCoins: number;
  showDevPersonaBar?: boolean; // Developer Persona Switcher top bar visibility
  videoQualityProfile?: 'auto' | 'hd_1080p' | 'high_720p' | 'standard_480p' | 'ultra_4k'; // WebRTC video quality setting
  livekitApiKey?: string;
  livekitApiSecret?: string;
  livekitWsUrl?: string;
  // LiveKit Advanced Quality & Encoding Configuration
  livekitCaptureResolution?: '1080p' | '720p' | '480p' | '4k';
  livekitMaxBitrateKbps?: number; // e.g. 3000 kbps for 1080p
  livekitMaxFramerate?: number; // clamped client-side to 24–30 (admin 60 → 30)
  livekitSimulcastEnabled?: boolean;
  livekitAdaptiveStream?: boolean;
  livekitDynacast?: boolean;
  livekitVideoCodec?: 'vp8' | 'h264' | 'vp9' | 'av1';
  livekitExplicitlySet?: boolean; // Set when admin explicitly overrides default
  allowedCountryCodes?: string[]; // Admin configurable enabled country ISO codes
  allowedLanguages?: string[]; // Admin configurable enabled language codes/names (e.g. ['en', 'es', ...])
  allowedZodiacSigns?: string[]; // Admin configurable enabled zodiac keys (e.g. ['aries', 'taurus', ...])
  allowedInterests?: string[]; // Admin configurable enabled interest keys/names (e.g. ['travel', 'gaming', ...])
  flagSizes?: Partial<FlagSizesConfig>; // Dynamic SVG flag height settings (width automatically computed 1.5x)
  /** Admin-designed discovery grid card layout (bounded slots + sizes). Parsed via shared/discoveryCardLayout. */
  discoveryCardLayout?: DiscoveryCardLayout;
  // Quick Match Configuration
  quickMatchFreeEnabled?: boolean; // Quick Match is free to discover & match (default true)
  quickMatchTimerSeconds?: number; // Decision timer duration in seconds (default 5, configurable 5-15)
  quickMatchGiftPrices?: {
    rose: number; // default 10
    heart: number; // default 25
    cheers: number; // default 50
    tiara: number; // default 100
    diamond: number; // default 200
    rocket: number; // default 500
  };
  quickMatchGiftSplitFemaleCreator?: number; // Female Creator % split for Quick Match Gifts (default 60%)
  quickMatchGiftSplitTL?: number; // Team Leader % split for Quick Match Gifts (default 10%)
  quickMatchGiftSplitPlatform?: number; // Platform % split for Quick Match Gifts (default 30%)
  quickMatchAutoFallbackOnlineCreators?: boolean; // Fallback to online creators matching interestedIn when live host pool is empty
  dailyStreakRewards?: number[]; // 7-day progressive streak coins: e.g. [10, 15, 20, 25, 35, 50, 100]
  dailyMissionsConfig?: {
    chatFriends?: { target: number; reward: number; enabled?: boolean };
    quickMatches?: { target: number; reward: number; enabled?: boolean };
    videoCall?: { target: number; reward: number; enabled?: boolean };
    momentInteract?: { target: number; reward: number; enabled?: boolean };
    sendGift?: { target: number; reward: number; enabled?: boolean };
    masterChest?: { target: number; reward: number; enabled?: boolean };
  };
  // Female Creator Target Engine & Algorithmic Boost Configuration
  creatorTargetCycle?: 'weekly' | 'monthly' | 'biweekly' | string;
  creatorTargetBronzeHours?: number;
  creatorTargetBronzeCoins?: number;
  creatorTargetBronzeBonusUSD?: number;
  creatorTargetSilverHours?: number;
  creatorTargetSilverCoins?: number;
  creatorTargetSilverBonusUSD?: number;
  creatorTargetGoldHours?: number;
  creatorTargetGoldCoins?: number;
  creatorTargetGoldBonusUSD?: number;
  /** UTC HH:mm when Financial Module period close may run (default 00:00). */
  periodCloseUtcTime?: string;
  /** When true, period-end settlement batches are the intended cash-out path. */
  settlementEnabled?: boolean;
  peakHoursStart?: string;
  peakHoursEnd?: string;
  peakHoursEnabled?: boolean;
  callRingTimeoutSeconds?: number;
  dailyFirstCallBonusCoins?: number;
  dailyFirstCallBonusUSD?: number;
  dailyFirstCallMinDurationSec?: number;
  streakTargetDays?: number;
  streakBoostDurationDays?: number;
  minDailyActiveHoursForStreak?: number;
  // Algorithmic Rotational Priority Matrix Weights
  algoWeightOnlineAvailable?: number;
  algoWeightBusyInCall?: number;
  algoWeightGoldTier?: number;
  algoWeightSilverTier?: number;
  algoWeightBronzeTier?: number;
  algoWeightReadyNowSurge?: number;
  algoWeightResponseHealthMax?: number;
  algoWeightStreakBoost?: number;
  algoWeightDiversityJitterMax?: number;
  algoWeightVerified?: number;
  algoWeightHighRating?: number;
  /** Per-user total MB quota for all profile gallery videos combined (admin-set; default 30). */
  profileVideoQuotaMb?: number;
  /** Max size of a single video file in MB (R2 policy). */
  r2MaxVideoSizeMb?: number;
}

export type CreatorTier = 'bronze' | 'silver' | 'gold';

export interface CreatorMetrics {
  creatorId: string;
  creatorName?: string;
  creatorAvatar?: string;
  agencyLeaderId?: string | null;
  agencyName?: string | null;
  activeOnlineSeconds: number;
  activeOnlineHours: number;
  coinsEarnedFromCalls: number;
  coinsEarnedFromGifts: number;
  totalTargetCoins: number;
  currentStreakDays: number;
  streakBoostUntil?: string | null;
  lastActiveDate?: string;
  firstCallBonusClaimedDate?: string;
  totalCallsOffered: number;
  totalCallsAnswered: number;
  totalCallsDeclined: number;
  totalCallsMissed: number;
  responseHealthScore: number; // 0 - 100%
  performanceTier: CreatorTier;
  isReadyNowActive: boolean;
  readyNowToggledAt?: string | null;
  targetPeriodStart?: string;
  targetPeriodEnd?: string | null;
  bonusEarnedCoins: number;
  bonusEarnedUSD: number;
  updatedAt?: string;
}

export interface DailyMissionItem {
  key: 'chat_friends' | 'quick_matches' | 'video_call' | 'moment_interact' | 'send_gift';
  title: string;
  description: string;
  target: number;
  current: number;
  rewardCoins: number;
  claimed: boolean;
  icon: string;
  actionTab?: string;
  actionText?: string;
  enabled?: boolean;
}

export interface DailyRewardRecord {
  userId: string;
  lastLoginDate: string;
  streakCount: number;
  streakClaimedDate: string | null;
  tasksDate: string;
  taskChatFriends: string[];
  taskChatClaimed: boolean;
  taskQuickMatches: number;
  taskQuickMatchClaimed: boolean;
  taskVideoCallSeconds: number;
  taskVideoCallClaimed: boolean;
  taskMomentInteractions: number;
  taskMomentClaimed: boolean;
  taskGiftCount: number;
  taskGiftClaimed: boolean;
  masterChestClaimed: boolean;
  totalCoinsEarned: number;
  createdAt?: string;
  updatedAt?: string;
}

export type FlagSizeVariant = 'xs' | 'sm' | 'card' | 'md' | 'lg' | 'admin' | 'xl' | '2xl';

export interface FlagSizesConfig {
  xs: number; // height in px (default: 14 -> width 21)
  sm: number; // height in px (default: 18 -> width 27)
  card: number; // height in px (default: 18 -> width 27)
  md: number; // height in px (default: 22 -> width 33)
  lg: number; // height in px (default: 27 -> width 40)
  admin: number; // height in px (default: 27 -> width 40)
  xl: number; // height in px (default: 36 -> width 54)
  '2xl': number; // height in px (default: 48 -> width 72)
}

export type ZodiacElement = 'fire' | 'earth' | 'air' | 'water';

export interface ZodiacItem {
  key: string; // e.g. 'aries'
  name: string; // e.g. 'Aries'
  symbol: string; // e.g. '♈'
  dateRange: string; // e.g. 'Mar 21 - Apr 19'
  element: ZodiacElement;
  traits?: string[];
  enabled?: boolean;
}

export interface LanguageItem {
  code: string; // e.g. 'en', 'es'
  name: string; // e.g. 'English', 'Spanish'
  nativeName: string; // e.g. 'English', 'Español'
  popular?: boolean;
  region?: string;
  enabled?: boolean;
}

export type InterestCategory = 'lifestyle' | 'sports' | 'art' | 'music' | 'tech' | 'entertainment' | 'food' | 'wellness' | 'social';

export interface InterestItem {
  id: string; // e.g. 'travel'
  name: string; // e.g. 'Travel & Adventure'
  category: InterestCategory;
  iconName?: string;
  color?: string;
  popular?: boolean;
  enabled?: boolean;
}

export interface QuickMatchItem {
  id: string;
  matchedUserId: string;
  matchedUserName: string;
  matchedUserAvatar: string;
  matchedUserGender?: string;
  matchedUserAge?: number;
  matchedUserCountryCode?: string;
  matchedUserCity?: string;
  matchedAt: string;
  giftsExchangedCoins?: number;
}

export interface HomeBanner {
  id: string;
  title: string;
  subtitle: string;
  tagText: string;
  tagColor?: string;
  imageUrl: string;
  ctaText: string;
  actionType: 'tab' | 'modal' | 'external' | 'policy';
  actionTarget: string; // e.g. 'discovery', 'swipe', 'moments', 'store', 'match', or policy id / url
  active: boolean;
  order: number;
  bgGradient?: string;
}

export interface PolicyDocument {
  id: string;
  slug: string;
  title: string;
  category: 'safety' | 'privacy' | 'terms' | 'coins' | 'creators' | 'moderation';
  icon: string;
  summary: string;
  content: string;
  lastUpdated: string;
  externalUrl?: string;
  order: number;
  isFeaturedOnHome: boolean;
}

export interface HomeQuickLink {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  badge?: string;
  actionType: 'tab' | 'modal' | 'external' | 'policy';
  actionTarget: string;
  colorGradient: string;
  order: number;
  active: boolean;
}

export interface InfraSystemConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicUrl: string;
  dbMaxPoolSize: number;
  dbIdleTimeoutSeconds: number;
  dbStatementTimeoutMs: number;
  dbQueryCachingEnabled: boolean;
  r2MaxImageSizeMb: number;
  r2MaxVideoSizeMb: number;
  /** Per-user total MB for all profile gallery videos combined. */
  r2ProfileVideoQuotaMb: number;
  r2AllowedMimeTypes: string[];
  r2CdnCacheTtlSeconds: number;
  autoModerationSensitivity: 'low' | 'medium' | 'high' | 'strict';
  nsfwFilterEnabled: boolean;
  bannedKeywords: string[];
  abuseReportAutoSuspendThreshold: number;
  featureRealtimeChatEnabled: boolean;
  featureR2DirectUploadEnabled: boolean;
  featureVideoCallingEnabled: boolean;
  featureGeoDiscoveryEnabled: boolean;
  featureMaintenanceMode: boolean;
  supabaseConfigured?: boolean;
  r2Configured?: boolean;
}

export interface ResetDataOptions {
  // 1. Users & Accounts
  /** @deprecated Gender-wide demo purges removed — ignored by reset engine */
  mockFemaleCreators?: boolean;
  /** @deprecated Gender-wide demo purges removed — ignored by reset engine */
  mockMaleCallers?: boolean;
  adminAccount?: boolean;
  /** When true: delete ALL non-admin users (clearAllUsers). Requires ALLOW_FACTORY_RESET. */
  customUsers?: boolean;
  teamLeaderAgencies?: boolean;

  // 2. User Profiles & Media
  profilesMedia?: boolean;
  // When true, server will delete ALL objects under `uploads/` (not just selected media prefixes)
  r2PurgeAllUploads?: boolean;

  // 3. Coins & Wallet Balances
  userCoins?: boolean;
  creatorEarnings?: boolean;
  /** Purge wallet_ledger rows (also implied server-side by callLogs / coins / clearAllUsers). */
  walletLedger?: boolean;

  // 4. Transactions & Store
  payoutRequests?: boolean;
  coinPackages?: boolean;
  virtualGiftsCatalog?: boolean;

  // 5. Chats & Social
  chatMessages?: boolean;
  friendRequests?: boolean;
  friendsList?: boolean;
  favoritesList?: boolean;
  blockedList?: boolean;

  // 6. Matches & Activity Calls
  callLogs?: boolean;
  liveHostsPool?: boolean;
  surveillanceLogs?: boolean;
  quickMatchQueues?: boolean;

  // 7. Feed & Community
  feedPosts?: boolean;
  creatorGoals?: boolean;
  creatorAnalytics?: boolean;
  creatorReviews?: boolean;
  dailyRewardsAndQuests?: boolean;

  // 8. CMS & Settings
  homeBanners?: boolean;
  policyDocuments?: boolean;
  quickLinks?: boolean;
  systemSettings?: boolean;
  taxonomiesAndFlags?: boolean;

  // Sync targets
  syncWithSupabase?: boolean;
  syncWithServer?: boolean;

  // 13. Client storage & auth purge (localStorage, sessionStorage, cookies + Supabase sign-out)
  clientStoragePurge?: boolean;
}

export interface ResetResult {
  success: boolean;
  categoriesCleared: string[];
  summary: string;
  error?: string;
}

export interface AuthOtpState {
  email: string;
  role: UserRole;
  name: string;
  otpSent: boolean;
  otpCode: string;
  resendCountdown: number;
  isVerifying: boolean;
  error?: string;
}

export interface OnboardingFormData {
  dob: string;
  age: number;
  gender: UserGender;
  nationality: string;
  countryCode: string;
  zodiac?: string;
  spokenLanguages: string[];
  bio: string;
  interests: string[];
  interestedIn: string[];
  tags: string[]; // For creators
  hourlyCoinRate: number; // For creators
  avatarUrl: string;
  gallery: string[];
  introVideoUrl?: string;
  agreedToTerms: boolean;
  agreedToAdultTerms: boolean;
  agreedToHostTerms: boolean;
}

export interface ServerDiagnosticInfo {
  nodeVersion: string;
  platform: string;
  uptimeSeconds: number;
  memoryMb: number;
  isEnvWritable: boolean;
  isLocked: boolean;
  services: {
    database: boolean;
    livekit: boolean;
    r2Storage: boolean;
    smtp: boolean;
  };
  envValues: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    supabaseServiceRoleKey?: string;
    livekitUrl?: string;
    livekitApiKey?: string;
    livekitApiSecret?: string;
    r2AccountId?: string;
    r2AccessKeyId?: string;
    r2SecretAccessKey?: string;
    r2BucketName?: string;
    r2PublicUrl?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    smtpFrom?: string;
    smtpSecure?: boolean;
    resendApiKey?: string;
  };
}

export interface SetupConfigPayload {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  r2AccountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2BucketName?: string;
  r2PublicUrl?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  smtpSecure?: boolean;
  resendApiKey?: string;
  adminPassword?: string;
  coinBurnRatePerMin?: number;
  coinBurnRateFriendPerMin?: number;
  femaleHostSharePercent?: number;
  teamLeaderSharePercent?: number;
  lockInstaller?: boolean;
}
