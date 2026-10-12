import { SystemSettings, CoinPackage, VirtualGift, HomeBanner, PolicyDocument, HomeQuickLink, UserProfile, CreatorReview } from '../types';
export { INITIAL_APP_NAV_ITEMS } from '../../shared/appNav';
export type { AppNavItem, NavAudienceRole, NavBarId, NavSlot } from '../../shared/appNav';

export const INITIAL_CREATOR_REVIEWS: CreatorReview[] = [];

export const DEFAULT_ADMIN_USER: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'System Admin',
  email: 'admin@livecall.app',
  gender: 'male',
  genderLocked: true,
  role: 'admin',
  age: 30,
  dob: '1994-01-01',
  bio: 'Platform Root Administrator & Moderator',
  avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
  gallery: ['https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400'],
  nationality: 'United States',
  countryCode: 'US',
  spokenLanguages: ['English'],
  tags: ['Admin', 'Security', 'Compliance'],
  interests: ['System Architecture', 'Live Stream Quality', 'Security'],
  coinBalance: 0,
  hourlyCoinRate: 10,
  earningsCoins: 0,
  totalLifetimeEarnedUSD: 0,
  onlineStatus: 'online',
  isVerified: true,
  createdAt: new Date().toISOString(),
};

export const DEFAULT_TEAM_LEADER_USER: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  name: 'Elena Rostova',
  email: 'teamleader@livecall.app',
  gender: 'female',
  genderLocked: true,
  role: 'team_leader',
  age: 29,
  dob: '1997-04-15',
  bio: 'Director at Aurora Talent Guild & Creator Management Agency',
  avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
  gallery: ['https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400'],
  nationality: 'United States',
  countryCode: 'US',
  spokenLanguages: ['English', 'Spanish'],
  tags: ['Agency', 'Talent Manager', 'VIP Agency'],
  interests: ['Talent Growth', 'Creator Mentorship', 'Live Video Economy'],
  coinBalance: 5000,
  hourlyCoinRate: 12,
  earningsCoins: 12450,
  totalLifetimeEarnedUSD: 3420,
  onlineStatus: 'online',
  isVerified: true,
  agencyName: 'Aurora Talent Management',
  commissionPercent: 15,
  createdAt: new Date().toISOString(),
};

export const INITIAL_SYSTEM_SETTINGS: SystemSettings = {
  coinBurnRatePerMin: 120, // Standard Coin Burn Rate - Non-Friends (Coins / Minute)
  coinBurnRateFriendPerMin: 80, // Friend Discounted Burn Rate - Friends (Coins / Minute)
  femaleHostSharePercent: 30, // Live call burn host base share % (true-up at period end)
  femaleHostTargetSharePercent: 40, // Effective host share % after period-end true-up if bronze+ met
  teamLeaderSharePercent: 10, // Team Leader Share (%) of coin burn
  giftFemaleHostSharePercent: 70, // Female Host Share for Virtual Gifts (%) (70% of gift coin value to host)
  giftTeamLeaderSharePercent: 10, // Team Leader Share for Virtual Gifts (%) (10% override commission to TL)
  enableVirtualGifts: true, // Master switch for Virtual Gifts
  coinUsdPeg: 0.003, // Fixed Peg: $ USD per coin (1000 coins = $3)
  femalePayoutRatioUSD: 0.003, // LEGACY synced to coinUsdPeg
  minPayoutThresholdUSD: 50, // Minimum Withdrawal Threshold ($ USD)
  femaleEarningRatePerMin: 36, // LEGACY derived display only (not used by burn)
  coinToUSDRatio: 0.003, // LEGACY synced to coinUsdPeg
  enableRegularFemaleCoinEarning: false, // Coin earning disabled for regular female users by default; reserved for Team Leader created female hosts
  profileVideoQuotaMb: 100, // Per-user total MB for all profile gallery videos
  r2MaxVideoSizeMb: 100, // Max single video file MB
  aiNudityShieldEnabled: true,
  screenRecordingProtection: true,
  freeDailyLoginCoins: 20,
  showDevPersonaBar: false,
  videoQualityProfile: 'high_720p',
  livekitCaptureResolution: '720p',
  // ~2200 kbps @ 720p30 — clear talking-head without mobile encoder backlog
  livekitMaxBitrateKbps: 2200,
  livekitMaxFramerate: 30,
  livekitSimulcastEnabled: true,
  livekitAdaptiveStream: true,
  livekitDynacast: true,
  livekitVideoCodec: 'h264',
  // Quick Match Defaults
  quickMatchFreeEnabled: true,
  quickMatchTimerSeconds: 5,
  quickMatchGiftPrices: {
    rose: 10,
    heart: 25,
    cheers: 50,
    tiara: 100,
    diamond: 200,
    rocket: 500,
  },
  quickMatchGiftSplitFemaleCreator: 60,
  quickMatchGiftSplitTL: 10,
  quickMatchGiftSplitPlatform: 30,
  quickMatchAutoFallbackOnlineCreators: true,
  flagSizes: {
    xs: 14,
    sm: 18,
    card: 18,
    md: 22,
    lg: 27,
    admin: 27,
    xl: 36,
    '2xl': 48,
  },
  discoveryCardLayout: undefined, // Resolved via DEFAULT_DISCOVERY_CARD_LAYOUT / parseDiscoveryCardLayout
  dailyStreakRewards: [10, 15, 20, 25, 35, 50, 100],
  dailyMissionsConfig: {
    chatFriends: { target: 3, reward: 25, enabled: true },
    quickMatches: { target: 10, reward: 30, enabled: true },
    videoCall: { target: 60, reward: 35, enabled: true },
    momentInteract: { target: 3, reward: 15, enabled: true },
    sendGift: { target: 1, reward: 20, enabled: true },
    masterChest: { target: 4, reward: 50, enabled: true },
  },
  creatorTargetCycle: 'weekly',
  creatorTargetBronzeHours: 20,
  creatorTargetBronzeCoins: 5000,
  creatorTargetBronzeBonusUSD: 15,
  creatorTargetSilverHours: 40,
  creatorTargetSilverCoins: 20000,
  creatorTargetSilverBonusUSD: 50,
  creatorTargetGoldHours: 60,
  creatorTargetGoldCoins: 60000,
  creatorTargetGoldBonusUSD: 150,
  peakHoursStart: '18:00',
  peakHoursEnd: '00:00',
  peakHoursEnabled: true,
  callRingTimeoutSeconds: 30,
  dailyFirstCallBonusCoins: 100,
  dailyFirstCallBonusUSD: 1.00,
  dailyFirstCallMinDurationSec: 30,
  streakTargetDays: 7,
  streakBoostDurationDays: 3,
  minDailyActiveHoursForStreak: 2,
};

export const DEFAULT_FLAG_SIZES = {
  xs: 14,     // 21px x 14px
  sm: 18,     // 27px x 18px (Discovery Grid, Swipe Deck, Country Selector)
  card: 18,   // 27px x 18px
  md: 22,     // 33px x 22px
  lg: 27,     // 40px x 27px (Admin Taxonomy Manager)
  admin: 27,  // 40px x 27px
  xl: 36,     // 54px x 36px
  '2xl': 48,  // 72px x 48px
};

export const INITIAL_COIN_PACKAGES: CoinPackage[] = [
  { id: 'pkg_starter', title: 'Starter Pack', coins: 100, bonusCoins: 0, priceUSD: 4.99 },
  { id: 'pkg_popular', title: 'Popular Bundle', coins: 500, bonusCoins: 100, priceUSD: 19.99, badgeTag: 'MOST POPULAR', popular: true },
  { id: 'pkg_super', title: 'VIP Super Chest', coins: 1500, bonusCoins: 450, priceUSD: 49.99, badgeTag: 'BEST VALUE' },
  { id: 'pkg_whale', title: 'Whale Vault', coins: 5000, bonusCoins: 2000, priceUSD: 149.99, badgeTag: '70% BONUS' },
];

export const VIRTUAL_GIFTS: VirtualGift[] = [
  { id: 'g_rose', name: 'Red Rose', coinCost: 10, icon: '🌹', animationType: 'rose', color: 'from-pink-500 to-rose-600', isActive: true, category: 'Romantic' },
  { id: 'g_heart', name: 'Love Box', coinCost: 50, icon: '💖', animationType: 'heart', color: 'from-red-500 to-pink-500', isActive: true, category: 'Romantic' },
  { id: 'g_ring', name: 'Diamond Ring', coinCost: 200, icon: '💍', animationType: 'ring', color: 'from-blue-400 to-cyan-500', isActive: true, category: 'Luxury' },
  { id: 'g_crown', name: 'Royal Crown', coinCost: 500, icon: '👑', animationType: 'crown', color: 'from-amber-400 to-yellow-500', isActive: true, category: 'Luxury' },
  { id: 'g_car', name: 'Sports Car', coinCost: 1000, icon: '🏎️', animationType: 'car', color: 'from-amber-400 to-orange-500', isActive: true, category: 'Luxury' },
  { id: 'g_yacht', name: 'Luxury Yacht', coinCost: 2500, icon: '🛥️', animationType: 'yacht', color: 'from-indigo-500 to-purple-600', isActive: true, category: 'Luxury' },
  { id: 'g_rocket', name: 'Cosmic Rocket', coinCost: 5000, icon: '🚀', animationType: 'rocket', color: 'from-purple-600 to-pink-600', isActive: true, category: 'Legendary' },
];

export const INITIAL_HOME_BANNERS: HomeBanner[] = [
  {
    id: 'banner_live_dating',
    title: 'Experience Genuine 1-on-1 Video Moments',
    subtitle: 'Connect with creators and matches around the globe in HD video calls.',
    tagText: '🔥 TRENDING NOW',
    tagColor: 'bg-rose-500 text-white',
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1200',
    ctaText: 'Explore Matches',
    actionType: 'tab',
    actionTarget: 'discovery',
    active: true,
    order: 1,
    bgGradient: 'from-purple-900/90 via-pink-900/60 to-slate-900/90',
  },
  {
    id: 'banner_quick_roulette',
    title: 'Instant Video Roulette Matching',
    subtitle: 'Skip endless texting. Jump into a live match and meet someone new in seconds.',
    tagText: '⚡ QUICK RADAR',
    tagColor: 'bg-amber-400 text-slate-950',
    imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=1200',
    ctaText: 'Start Match',
    actionType: 'modal',
    actionTarget: 'match',
    active: true,
    order: 2,
    bgGradient: 'from-amber-950/90 via-rose-950/60 to-slate-900/90',
  },
  {
    id: 'banner_coin_store',
    title: 'Top Up Your Coin Balance',
    subtitle: 'Unlock longer video calls and send gifts with coin packages built for every budget.',
    tagText: '💰 COIN STORE',
    tagColor: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950',
    imageUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=1200',
    ctaText: 'Open Coin Store',
    actionType: 'modal',
    actionTarget: 'store',
    active: true,
    order: 3,
    bgGradient: 'from-amber-900/90 via-purple-950/70 to-slate-900/90',
  },
  {
    id: 'banner_creator_earnings',
    title: 'Earn As a Verified Host',
    subtitle: 'Get paid for completed video calls. Request payouts through supported methods after verification.',
    tagText: '💰 CREATOR REWARDS',
    tagColor: 'bg-emerald-500 text-slate-950',
    imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=1200',
    ctaText: 'Creator Dashboard',
    actionType: 'tab',
    actionTarget: 'earnings',
    active: true,
    order: 4,
    bgGradient: 'from-emerald-950/90 via-teal-950/60 to-slate-900/90',
  },
  {
    id: 'banner_safety_first',
    title: 'Your Privacy & Safety Matters',
    subtitle: 'Zero tolerance for harassment. Use Block & Report anytime — our team reviews safety reports.',
    tagText: '🛡️ SAFETY CENTER',
    tagColor: 'bg-indigo-500 text-white',
    imageUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=1200',
    ctaText: 'Read Safety Policy',
    actionType: 'policy',
    actionTarget: 'policy_safety',
    active: true,
    order: 5,
    bgGradient: 'from-indigo-950/90 via-slate-900/80 to-slate-950/90',
  },
];

export const INITIAL_POLICY_DOCUMENTS: PolicyDocument[] = [
  {
    id: 'policy_safety',
    slug: 'community-safety',
    title: 'Community Safety & Anti-Harassment Policy',
    category: 'safety',
    icon: 'ShieldCheck',
    summary: 'Community rules against hate speech, harassment, non-consensual behavior, and inappropriate content.',
    lastUpdated: 'September 2026',
    order: 1,
    isFeaturedOnHome: true,
    content: `
### 1. Zero Tolerance for Harassment & Bullying
Minglecall is dedicated to maintaining a respectful, welcoming, and safe space for all users. We enforce a zero-tolerance policy regarding:
* Bullying, verbal intimidation, blackmail, or stalking.
* Discrimination based on race, ethnicity, religion, disability, gender, or sexual orientation.
* Requesting unauthorized off-platform payments, personal financial data, or home addresses.

### 2. Content Moderation
* We review reports and may suspend or permanently ban accounts that violate these rules.
* Severe violations may result in permanent account termination.

### 3. Reporting & Blocking
* Every profile, chat, and active call features a **Block & Report** option.
* Our moderation team reviews reports as quickly as capacity allows.
    `.trim(),
  },
  {
    id: 'policy_privacy',
    slug: 'privacy-data-protection',
    title: 'Privacy Policy & Data Protection',
    category: 'privacy',
    icon: 'Lock',
    summary: 'How personal data, video sessions, and account credentials are handled on the platform.',
    lastUpdated: 'September 2026',
    order: 2,
    isFeaturedOnHome: true,
    content: `
### 1. Data Collection & Minimization
We collect only the minimum necessary data required to operate matchmaking, messaging, calls, and payouts. We do not sell your personal data to marketing advertisers.

### 2. Video Stream Security
* 1-on-1 video call streams use encrypted WebRTC transport (DTLS/SRTP).
* Live video is not recorded or stored on our servers unless required for a specific safety investigation.

### 3. Screenshots & Screen Recording
* We cannot guarantee that other participants will never capture their screen. Treat every call as potentially visible to the other person and report misuse.
    `.trim(),
  },
  {
    id: 'policy_terms',
    slug: 'terms-of-service',
    title: 'Terms of Service & 18+ Age Verification',
    category: 'terms',
    icon: 'FileText',
    summary: 'Contractual terms governing user accounts, eligibility requirements, and platform guidelines.',
    lastUpdated: 'September 2026',
    order: 3,
    isFeaturedOnHome: true,
    content: `
### 1. 18+ Age Requirement
You must be at least eighteen (18) years of age or the age of legal majority in your jurisdiction to create an account, purchase coins, or participate in video calls. Minors are strictly prohibited.

### 2. User Accounts & Verification
* Users agree to provide truthful information. Impersonation is grounds for termination.
* Hosts requesting payouts may be asked to complete identity verification before funds are released.

### 3. Account Termination
We reserve the right to suspend or terminate any account that violates safety policies or engages in fraudulent activity.
    `.trim(),
  },
  {
    id: 'policy_coins',
    slug: 'coins-gifts-refunds',
    title: 'Coin Economy, Virtual Gifts & Refund Policy',
    category: 'coins',
    icon: 'Coins',
    summary: 'Guidelines for purchasing coins, gifting virtual items, burn rates, and refund terms.',
    lastUpdated: 'September 2026',
    order: 4,
    isFeaturedOnHome: true,
    content: `
### 1. Coin Purchasing & Virtual Assets
* Coins are virtual utility tokens used within the platform to initiate video calls and send virtual gifts.
* Coins have no cash value outside the platform for standard consumer users and cannot be transferred to secondary exchanges.

### 2. Call Burn Rates
* Call rates are shown in-app before and during a call and may vary by host, friendship status, or promotions.

### 3. Refund Policy
* Consumed coins used during completed video calls or delivered virtual gifts are generally non-refundable.
* If a technical disruption causes an abnormal disconnection near the start of a call, unused coins may be restored at our discretion.
    `.trim(),
  },
  {
    id: 'policy_creators',
    slug: 'creator-earnings-payouts',
    title: 'Creator Earnings & Payout Guidelines',
    category: 'creators',
    icon: 'Sparkles',
    summary: 'How verified hosts earn coins, track balances, and request payouts.',
    lastUpdated: 'September 2026',
    order: 5,
    isFeaturedOnHome: true,
    content: `
### 1. Revenue Share
* Verified hosts earn coins from completed eligible calls and shared gift revenue as configured in admin settings.
* Earnings are tracked in the **Earnings Dashboard**.

### 2. Payout Methods & Thresholds
* Conversion rates and minimum payout thresholds are shown in the payout request flow.
* Supported payout methods depend on your region and verification status.
* Payout requests are reviewed by administration; processing times vary and are not guaranteed as same-day.
    `.trim(),
  },
  {
    id: 'policy_moderation',
    slug: 'moderation-guidelines',
    title: 'Moderation & Dispute Resolution',
    category: 'moderation',
    icon: 'UserCheck',
    summary: 'How safety reports, account holds, and appeals are handled.',
    lastUpdated: 'September 2026',
    order: 6,
    isFeaturedOnHome: false,
    content: `
### 1. Moderation Process
We review user reports and may take action including warnings, temporary holds, or permanent bans.

### 2. Appeals Process
If your account or payout was paused and you believe it was in error, contact support through the in-app support options or admin channels available to your role.
    `.trim(),
  },
];

export const INITIAL_HOME_QUICK_LINKS: HomeQuickLink[] = [
  {
    id: 'link_quick_match',
    title: 'Quick Match',
    subtitle: 'Instant Video Radar',
    icon: 'Zap',
    badge: 'HOT',
    actionType: 'modal',
    actionTarget: 'match',
    colorGradient: 'from-amber-500 to-rose-500',
    order: 1,
    active: true,
  },
  {
    id: 'link_swipe_deck',
    title: 'Swipe Deck',
    subtitle: 'Browse Cards',
    icon: 'Layers',
    badge: 'NEW',
    actionType: 'tab',
    actionTarget: 'swipe',
    colorGradient: 'from-pink-500 to-purple-600',
    order: 2,
    active: true,
  },
  {
    id: 'link_discovery',
    title: 'Discover',
    subtitle: 'Browse Creators',
    icon: 'Globe',
    badge: 'LIVE',
    actionType: 'tab',
    actionTarget: 'discovery',
    colorGradient: 'from-yellow-400 to-amber-600',
    order: 3,
    active: true,
  },
  {
    id: 'link_coin_store',
    title: 'Get Coins',
    subtitle: 'Refill Balance',
    icon: 'Coins',
    badge: 'STORE',
    actionType: 'modal',
    actionTarget: 'store',
    colorGradient: 'from-emerald-400 to-teal-600',
    order: 4,
    active: true,
  },
  {
    id: 'link_moments_feed',
    title: 'Moments Feed',
    subtitle: 'Creator Stories',
    icon: 'Sparkles',
    badge: 'FEED',
    actionType: 'tab',
    actionTarget: 'moments',
    colorGradient: 'from-blue-500 to-indigo-600',
    order: 5,
    active: true,
  },
  {
    id: 'link_safety_policy',
    title: 'Safety Center',
    subtitle: 'Policies & Reporting',
    icon: 'ShieldCheck',
    badge: 'INFO',
    actionType: 'policy',
    actionTarget: 'policy_safety',
    colorGradient: 'from-indigo-500 to-cyan-600',
    order: 6,
    active: true,
  },
];
