var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/r2Storage.ts
var import_client_s3, import_s3_request_presigner, CATEGORY_MAX_BYTES;
var init_r2Storage = __esm({
  "server/r2Storage.ts"() {
    import_client_s3 = require("@aws-sdk/client-s3");
    import_s3_request_presigner = require("@aws-sdk/s3-request-presigner");
    try {
      require("dotenv").config();
    } catch {
    }
    CATEGORY_MAX_BYTES = {
      avatar: 5 * 1024 * 1024,
      gallery: 10 * 1024 * 1024,
      gallery_video: 100 * 1024 * 1024,
      moment: 10 * 1024 * 1024,
      chat_media: 10 * 1024 * 1024,
      verification: 15 * 1024 * 1024,
      intro_video: 50 * 1024 * 1024
    };
  }
});

// shared/appNav.ts
function navItem(audienceRole, bar, slot, actionTarget, order, overrides = {}) {
  const dest = DEST_BY_TARGET.get(actionTarget);
  if (!dest) throw new Error(`Missing nav destination ${actionTarget}`);
  const id = bar === "brand" ? "brand_global" : `nav_${audienceRole}_${bar}_${slot}_${actionTarget}`;
  return {
    id,
    audienceRole,
    bar,
    slot,
    label: overrides.label ?? dest.label,
    icon: overrides.icon ?? dest.icon,
    actionType: dest.actionType,
    actionTarget,
    badge: overrides.badge ?? dest.badge,
    meta: overrides.meta ?? null,
    order,
    active: overrides.active ?? true,
    parentId: null
  };
}
function subheaderFor(role) {
  return SUBHEADER.map(
    (entry, index) => navItem(role, "subheader", "default", entry.target, index + 1, {
      label: entry.label,
      icon: entry.icon,
      meta: { group: entry.group }
    })
  );
}
function personaFor(role) {
  const earningsLabel = role === "female_host" || role === "team_leader" ? "Earnings & Analytics" : role === "female_user" ? "Activity & Performance" : "Spending & Analytics";
  const rows = [
    navItem(role, "persona_menu", "default", "status_online", 1, { label: "Available" }),
    navItem(role, "persona_menu", "default", "status_busy", 2, { label: "Busy" }),
    navItem(role, "persona_menu", "default", "status_offline", 3, { label: "Offline" }),
    navItem(role, "persona_menu", "default", "profile", 4, { label: "Profile" }),
    navItem(role, "persona_menu", "default", "earnings", 5, { label: earningsLabel, icon: role === "male_user" || role === "admin" ? "TrendingUp" : "DollarSign" }),
    navItem(role, "persona_menu", "default", "social_circle", 6, { label: "Friends & Social Circle", icon: "Users" }),
    navItem(role, "persona_menu", "default", "install_pwa", 7, { label: "Install LiveCall PWA App", icon: "Download" }),
    navItem(role, "persona_menu", "default", "logout", 8, { label: "Log Out", icon: "LogOut" })
  ];
  if (role === "male_user" || role === "admin") {
    rows.splice(3, 0, navItem(role, "persona_menu", "default", "store", 0, { label: "Top Up", icon: "Coins", badge: "coin_balance" }));
  }
  return rows.map((row, index) => ({ ...row, order: index + 1 }));
}
function mobileFor(role) {
  const targets = ["home", "discovery", "match", "chat", "profile"];
  if (role === "female_user" || role === "female_host" || role === "admin" || role === "team_leader") {
    targets.push("call_logs");
  }
  if (role === "team_leader") targets.push("team_leader");
  if (role === "admin") targets.push("admin");
  return targets.map((target, index) => {
    const label = target === "home" ? "Home" : target === "discovery" ? "Discover" : target === "match" ? "Match" : target === "chat" ? "Chat" : target === "profile" ? "Profile" : target === "call_logs" ? "Logs" : target === "team_leader" ? "Agency" : "Admin";
    const icon = target === "discovery" ? "Compass" : target === "match" ? "Flame" : target === "home" ? "Home" : void 0;
    return navItem(role, "mobile_bottom", "default", target, index + 1, { label, icon });
  });
}
function mainHeaderFor(role) {
  const left = [
    navItem(role, "main_header", "left", "home", 1, { label: "Home", icon: "Home" })
  ];
  if (role === "admin") {
    left.push(navItem(role, "main_header", "left", "admin", 2, { label: "Admin", icon: "Settings" }));
  }
  const right = [
    navItem(role, "main_header", "right", "daily_rewards", 1, { label: "Rewards", icon: "Gift", badge: "unclaimed_rewards" })
  ];
  if (role === "male_user" || role === "admin") {
    right.push(navItem(role, "main_header", "right", "store", 2, { label: "Buy", icon: "Coins", badge: "coin_balance" }));
  }
  if (role === "team_leader") {
    right.push(navItem(role, "main_header", "right", "team_leader", 2, { label: "Agency", icon: "Crown" }));
  }
  return [...left, ...right];
}
function buildDefaultAppNavItems() {
  const brand = {
    id: "brand_global",
    audienceRole: "*",
    bar: "brand",
    slot: "default",
    label: "Minglecall",
    icon: "Sparkles",
    actionType: "tab",
    actionTarget: "home",
    badge: "none",
    meta: {
      markText: "M",
      wordmarkPrimary: "Mingle",
      wordmarkAccent: "call",
      imageUrl: "",
      showMark: true,
      showWordmark: true
    },
    order: 0,
    active: true,
    parentId: null
  };
  const guest = [
    navItem("guest", "logged_out_header", "default", "auth_login", 1, { label: "Sign In", icon: "LogIn" }),
    navItem("guest", "logged_out_header", "default", "auth_register", 2, { label: "Join free", icon: "UserPlus" })
  ];
  const signedIn = NAV_SIGNED_IN_ROLES.flatMap((role) => [
    ...mainHeaderFor(role),
    ...subheaderFor(role),
    ...mobileFor(role),
    ...personaFor(role)
  ]);
  return [brand, ...guest, ...signedIn];
}
var NAV_SIGNED_IN_ROLES, NAV_DESTINATIONS, DEST_BY_TARGET, SUBHEADER, INITIAL_APP_NAV_ITEMS;
var init_appNav = __esm({
  "shared/appNav.ts"() {
    NAV_SIGNED_IN_ROLES = [
      "admin",
      "team_leader",
      "male_user",
      "female_user",
      "female_host"
    ];
    NAV_DESTINATIONS = [
      { id: "home", label: "Home", icon: "Home", actionType: "tab", actionTarget: "home", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu", "brand"] },
      { id: "discovery", label: "Discover", icon: "LayoutGrid", actionType: "tab", actionTarget: "discovery", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "swipe", label: "Swipe", icon: "Layers", actionType: "tab", actionTarget: "swipe", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "moments", label: "Moments", icon: "Image", actionType: "tab", actionTarget: "moments", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "profile", label: "Profile", icon: "User", actionType: "tab", actionTarget: "profile", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "call_logs", label: "Calls", icon: "PhoneCall", actionType: "tab", actionTarget: "call_logs", badge: "missed_calls", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "earnings", label: "Earnings", icon: "DollarSign", actionType: "tab", actionTarget: "earnings", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "team_leader", label: "Agency", icon: "Crown", actionType: "tab", actionTarget: "team_leader", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "admin", label: "Admin", icon: "Settings", actionType: "tab", actionTarget: "admin", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "match", label: "Match", icon: "Zap", actionType: "overlay", actionTarget: "match", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "chat", label: "Chat", icon: "MessageCircle", actionType: "overlay", actionTarget: "chat", badge: "unread_messages", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "social_circle", label: "Circle", icon: "Users", actionType: "overlay", actionTarget: "social_circle", badge: "none", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "friend_requests", label: "Friends", icon: "UserPlus", actionType: "overlay", actionTarget: "friend_requests", badge: "friend_requests", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "daily_rewards", label: "Rewards", icon: "Gift", actionType: "modal", actionTarget: "daily_rewards", badge: "unclaimed_rewards", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "store", label: "Coins", icon: "Coins", actionType: "modal", actionTarget: "store", badge: "coin_balance", bars: ["main_header", "subheader", "mobile_bottom", "persona_menu"] },
      { id: "auth_login", label: "Sign In", icon: "LogIn", actionType: "auth", actionTarget: "auth_login", badge: "none", bars: ["logged_out_header", "main_header"] },
      { id: "auth_register", label: "Join free", icon: "UserPlus", actionType: "auth", actionTarget: "auth_register", badge: "none", bars: ["logged_out_header", "main_header"] },
      { id: "logout", label: "Log Out", icon: "LogOut", actionType: "system", actionTarget: "logout", badge: "none", bars: ["persona_menu", "mobile_bottom", "main_header"] },
      { id: "status_online", label: "Available", icon: "Circle", actionType: "system", actionTarget: "status_online", badge: "none", bars: ["persona_menu"] },
      { id: "status_busy", label: "Busy", icon: "Circle", actionType: "system", actionTarget: "status_busy", badge: "none", bars: ["persona_menu"] },
      { id: "status_offline", label: "Offline", icon: "Circle", actionType: "system", actionTarget: "status_offline", badge: "none", bars: ["persona_menu"] },
      { id: "install_pwa", label: "Install app", icon: "Download", actionType: "system", actionTarget: "install_pwa", badge: "none", bars: ["persona_menu", "main_header"] },
      { id: "exit", label: "Exit", icon: "LogOut", actionType: "system", actionTarget: "exit", badge: "none", bars: ["mobile_bottom"] },
      { id: "none", label: "More", icon: "Menu", actionType: "system", actionTarget: "none", badge: "none", bars: ["main_header", "subheader", "mobile_bottom"] }
    ];
    DEST_BY_TARGET = new Map(NAV_DESTINATIONS.map((d) => [d.actionTarget, d]));
    SUBHEADER = [
      { target: "discovery", label: "Discover", icon: "LayoutGrid", group: "primary" },
      { target: "swipe", label: "Swipe", icon: "Layers", group: "primary" },
      { target: "moments", label: "Moments", icon: "Image", group: "primary" },
      { target: "match", label: "Match", icon: "Zap", group: "primary" },
      { target: "chat", label: "Chat", icon: "MessageCircle", group: "primary" },
      { target: "call_logs", label: "Calls", icon: "PhoneCall", group: "secondary" },
      { target: "friend_requests", label: "Friends", icon: "UserPlus", group: "secondary" },
      { target: "social_circle", label: "Circle", icon: "Users", group: "secondary" }
    ];
    INITIAL_APP_NAV_ITEMS = buildDefaultAppNavItems();
  }
});

// src/constants/appDefaults.ts
var DEFAULT_ADMIN_USER, DEFAULT_TEAM_LEADER_USER, INITIAL_POLICY_DOCUMENTS;
var init_appDefaults = __esm({
  "src/constants/appDefaults.ts"() {
    init_appNav();
    DEFAULT_ADMIN_USER = {
      id: "00000000-0000-0000-0000-000000000001",
      name: "System Admin",
      email: "admin@livecall.app",
      gender: "male",
      genderLocked: true,
      role: "admin",
      age: 30,
      dob: "1994-01-01",
      bio: "Platform Root Administrator & Moderator",
      avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400",
      gallery: ["https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400"],
      nationality: "United States",
      countryCode: "US",
      spokenLanguages: ["English"],
      tags: ["Admin", "Security", "Compliance"],
      interests: ["System Architecture", "Live Stream Quality", "Security"],
      coinBalance: 0,
      hourlyCoinRate: 10,
      earningsCoins: 0,
      totalLifetimeEarnedUSD: 0,
      onlineStatus: "online",
      isVerified: true,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    DEFAULT_TEAM_LEADER_USER = {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Elena Rostova",
      email: "teamleader@livecall.app",
      gender: "female",
      genderLocked: true,
      role: "team_leader",
      age: 29,
      dob: "1997-04-15",
      bio: "Director at Aurora Talent Guild & Creator Management Agency",
      avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400",
      gallery: ["https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400"],
      nationality: "United States",
      countryCode: "US",
      spokenLanguages: ["English", "Spanish"],
      tags: ["Agency", "Talent Manager", "VIP Agency"],
      interests: ["Talent Growth", "Creator Mentorship", "Live Video Economy"],
      coinBalance: 5e3,
      hourlyCoinRate: 12,
      earningsCoins: 12450,
      totalLifetimeEarnedUSD: 3420,
      onlineStatus: "online",
      isVerified: true,
      agencyName: "Aurora Talent Management",
      commissionPercent: 15,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    INITIAL_POLICY_DOCUMENTS = [
      {
        id: "policy_safety",
        slug: "community-safety",
        title: "Community Safety & Anti-Harassment Policy",
        category: "safety",
        icon: "ShieldCheck",
        summary: "Community rules against hate speech, harassment, non-consensual behavior, and inappropriate content.",
        lastUpdated: "September 2026",
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
    `.trim()
      },
      {
        id: "policy_privacy",
        slug: "privacy-data-protection",
        title: "Privacy Policy & Data Protection",
        category: "privacy",
        icon: "Lock",
        summary: "How personal data, video sessions, and account credentials are handled on the platform.",
        lastUpdated: "September 2026",
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
    `.trim()
      },
      {
        id: "policy_terms",
        slug: "terms-of-service",
        title: "Terms of Service & 18+ Age Verification",
        category: "terms",
        icon: "FileText",
        summary: "Contractual terms governing user accounts, eligibility requirements, and platform guidelines.",
        lastUpdated: "September 2026",
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
    `.trim()
      },
      {
        id: "policy_coins",
        slug: "coins-gifts-refunds",
        title: "Coin Economy, Virtual Gifts & Refund Policy",
        category: "coins",
        icon: "Coins",
        summary: "Guidelines for purchasing coins, gifting virtual items, burn rates, and refund terms.",
        lastUpdated: "September 2026",
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
    `.trim()
      },
      {
        id: "policy_creators",
        slug: "creator-earnings-payouts",
        title: "Creator Earnings & Payout Guidelines",
        category: "creators",
        icon: "Sparkles",
        summary: "How verified hosts earn coins, track balances, and request payouts.",
        lastUpdated: "September 2026",
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
    `.trim()
      },
      {
        id: "policy_moderation",
        slug: "moderation-guidelines",
        title: "Moderation & Dispute Resolution",
        category: "moderation",
        icon: "UserCheck",
        summary: "How safety reports, account holds, and appeals are handled.",
        lastUpdated: "September 2026",
        order: 6,
        isFeaturedOnHome: false,
        content: `
### 1. Moderation Process
We review user reports and may take action including warnings, temporary holds, or permanent bans.

### 2. Appeals Process
If your account or payout was paused and you believe it was in error, contact support through the in-app support options or admin channels available to your role.
    `.trim()
      }
    ];
  }
});

// server/supabaseAdmin.ts
function decodeJwtRole(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}
function isSupabaseAdminConfigured() {
  return Boolean(
    supabaseUrl && supabaseServiceKey && !supabaseUrl.includes("placeholder-project") && !supabaseUrl.includes("your-project-ref")
  );
}
function isSupabaseServiceRoleConfigured() {
  return isSupabaseAdminConfigured() && decodeJwtRole(supabaseServiceKey) === "service_role";
}
function getSupabaseAdmin() {
  if (!isSupabaseAdminConfigured()) return null;
  if (!isSupabaseServiceRoleConfigured()) {
    console.error(
      "[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY is missing or not a service_role JWT. Admin mutations will fail under RLS."
    );
  }
  if (!supabaseAdmin) {
    try {
      supabaseAdmin = (0, import_supabase_js.createClient)(supabaseUrl, supabaseServiceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        db: { schema: "public" },
        global: { headers: { "X-Client-Info": "minglecall-express-admin" } }
      });
      console.log("[Supabase Admin] Initialized server-side Supabase client connected to:", supabaseUrl);
    } catch (err) {
      console.error("[Supabase Admin] Failed to initialize Supabase client:", err);
    }
  }
  return supabaseAdmin;
}
var import_supabase_js, import_dotenv, import_bcryptjs, supabaseUrl, supabaseServiceKey, supabaseAdmin;
var init_supabaseAdmin = __esm({
  "server/supabaseAdmin.ts"() {
    import_supabase_js = require("@supabase/supabase-js");
    import_dotenv = __toESM(require("dotenv"), 1);
    import_bcryptjs = __toESM(require("bcryptjs"), 1);
    init_r2Storage();
    init_appDefaults();
    import_dotenv.default.config();
    supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    supabaseAdmin = null;
  }
});

// api/_lib/financeBundleEntry.ts
var financeBundleEntry_exports = {};
__export(financeBundleEntry_exports, {
  DEFAULT_COIN_TO_USD_RATIO: () => DEFAULT_COIN_TO_USD_RATIO,
  DEFAULT_COIN_USD_PEG: () => DEFAULT_COIN_USD_PEG,
  DEFAULT_FEMALE_PAYOUT_RATIO_USD: () => DEFAULT_FEMALE_PAYOUT_RATIO_USD,
  DEFAULT_TARGET_THRESHOLDS: () => DEFAULT_TARGET_THRESHOLDS,
  EMPTY_HOST_EARNINGS_BREAKDOWN: () => EMPTY_HOST_EARNINGS_BREAKDOWN,
  HOST_SALARY_FINANCIAL_ENTRY_TYPES: () => HOST_SALARY_FINANCIAL_ENTRY_TYPES,
  HOST_SALARY_LINE_COMPONENTS: () => HOST_SALARY_LINE_COMPONENTS,
  HOST_SALARY_WALLET_TYPES: () => HOST_SALARY_WALLET_TYPES,
  NON_SALARY_REWARD_WALLET_TYPES: () => NON_SALARY_REWARD_WALLET_TYPES,
  PAYABLE_MODEL_NOTES: () => PAYABLE_MODEL_NOTES,
  PAYABLE_SOURCE_OF_TRUTH: () => PAYABLE_SOURCE_OF_TRUTH,
  PAYOUT_PERIOD_END_ONLY: () => PAYOUT_PERIOD_END_ONLY,
  PayoutPolicyError: () => PayoutPolicyError,
  SETTLEMENT_STATUS_TRANSITIONS: () => SETTLEMENT_STATUS_TRANSITIONS,
  acknowledgePayeeSalary: () => acknowledgePayeeSalary,
  agencyMarkHostPaid: () => agencyMarkHostPaid,
  aggregateHostCallBurnForTrueUp: () => aggregateHostCallBurnForTrueUp,
  aggregateWalletLedgerEarnings: () => aggregateWalletLedgerEarnings,
  appendFinancialLedgerEntries: () => appendFinancialLedgerEntries,
  appendFinancialLedgerEntry: () => appendFinancialLedgerEntry,
  appendGiftEarnLedger: () => appendGiftEarnLedger,
  appendReversalEntry: () => appendReversalEntry,
  appendSettlementNote: () => appendSettlementNote,
  applyCreatorEarnCoins: () => applyCreatorEarnCoins,
  assertManualPayoutAllowed: () => assertManualPayoutAllowed,
  assertManualPayoutAllowedSync: () => assertManualPayoutAllowedSync,
  buildEarningsLedger: () => buildEarningsLedger,
  buildEarningsOverview: () => buildEarningsOverview,
  buildSalaryEstimatePreview: () => buildSalaryEstimatePreview,
  buildSalaryPeriodPdf: () => buildSalaryPeriodPdf,
  buildSalaryPeriodXlsx: () => buildSalaryPeriodXlsx,
  buildSettlementBatches: () => buildSettlementBatches,
  canTransitionSettlementStatus: () => canTransitionSettlementStatus,
  cancelSettlementBatch: () => cancelSettlementBatch,
  categoryFromSettlementComponent: () => categoryFromSettlementComponent,
  checkManualPayoutAllowed: () => checkManualPayoutAllowed,
  closeDuePeriods: () => closeDuePeriods,
  closePeriod: () => closePeriod,
  coinsToUsd: () => coinsToUsd,
  coinsToUsdWithCachedRatio: () => coinsToUsdWithCachedRatio,
  coinsToUsdWithLiveRatio: () => coinsToUsdWithLiveRatio,
  coinsToUsdWithSnapshot: () => coinsToUsdWithSnapshot,
  completeCoinPurchase: () => completeCoinPurchase,
  computeCloseScheduledAt: () => computeCloseScheduledAt,
  computePerformanceTier: () => computePerformanceTier,
  computePerformanceTierFromCache: () => computePerformanceTierFromCache,
  computePerformanceTierFromConfig: () => computePerformanceTierFromConfig,
  createCheckoutIntent: () => createCheckoutIntent,
  createSettlementBatchesForPeriod: () => createSettlementBatchesForPeriod,
  defaultFinanceSystemConfig: () => defaultFinanceSystemConfig,
  ensureOpenPeriod: () => ensureOpenPeriod,
  evaluateManualPayoutPolicy: () => evaluateManualPayoutPolicy,
  failCheckoutIntent: () => failCheckoutIntent,
  findDueOpenPeriods: () => findDueOpenPeriods,
  findRetryableFailedPeriods: () => findRetryableFailedPeriods,
  formatPegExample: () => formatPegExample,
  freezeFinanceConfigSnapshot: () => freezeFinanceConfigSnapshot,
  getCachedCoinUsdPeg: () => getCachedCoinUsdPeg,
  getCachedFinanceConfig: () => getCachedFinanceConfig,
  getCoinUsdPeg: () => getCoinUsdPeg,
  getCurrentPeriodBounds: () => getCurrentPeriodBounds,
  getNextCloseAt: () => getNextCloseAt2,
  getTargetThresholds: () => getTargetThresholds,
  getUserPeriodAccrual: () => getUserPeriodAccrual,
  groupLiveLedgerRowsByCall: () => groupLiveLedgerRowsByCall,
  groupWalletLedgerByCall: () => groupWalletLedgerByCall,
  invalidateFinanceConfigCache: () => invalidateFinanceConfigCache,
  isGiftWalletMetadata: () => isGiftWalletMetadata,
  isHostSalaryFinancialEntryType: () => isHostSalaryFinancialEntryType,
  isNonSalaryRewardType: () => isNonSalaryRewardType,
  labelEarningsMoneyCategory: () => labelEarningsMoneyCategory,
  labelSettlementComponent: () => labelSettlementComponent,
  listSalaryPeriods: () => listSalaryPeriods,
  loadFinanceSystemConfig: () => loadFinanceSystemConfig,
  loadGiftSharePercents: () => loadGiftSharePercents,
  loadSalaryPayoutDetailsByUserIds: () => loadSalaryPayoutDetailsByUserIds,
  loadSalaryPeriodDetail: () => loadSalaryPeriodDetail,
  markBatchAdminPaid: () => markBatchAdminPaid,
  markBatchTlConfirmed: () => markBatchTlConfirmed,
  markPeriodAdminPaid: () => markPeriodAdminPaid,
  normalizeCycleType: () => normalizeCycleType,
  normalizeFxRatio: () => normalizeFxRatio,
  normalizePayeeSalaryStatus: () => normalizePayeeSalaryStatus,
  planHostShareTrueUps: () => planHostShareTrueUps,
  postHostShareTrueUpWallet: () => postHostShareTrueUpWallet,
  reconcileBatch: () => reconcileBatch,
  recordBatchCreatedEvent: () => recordBatchCreatedEvent,
  refreshFinanceConfigInBackground: () => refreshFinanceConfigInBackground,
  resolveCatalogGiftById: () => resolveCatalogGiftById,
  resolveEarningsScopeAccess: () => resolveEarningsScopeAccess,
  resolveSessionCallId: () => resolveSessionCallId,
  resolveTargetThresholds: () => resolveTargetThresholds,
  summarizeHostSettlementLines: () => summarizeHostSettlementLines,
  targetBonusUsdForTier: () => targetBonusUsdForTier,
  updateFinanceSystemConfig: () => updateFinanceSystemConfig,
  usdToCoins: () => usdToCoins
});
module.exports = __toCommonJS(financeBundleEntry_exports);

// server/finance/config.ts
init_supabaseAdmin();

// shared/finance/periodBounds.ts
var HH_MM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function normalizeCycleType(raw) {
  const v = String(raw || "weekly").trim().toLowerCase();
  return v === "monthly" ? "monthly" : "weekly";
}
function parseUtcCloseTime(raw) {
  const s = String(raw ?? "00:00").trim();
  if (!HH_MM_RE.test(s)) {
    return { hours: 0, minutes: 0, hhmm: "00:00" };
  }
  const [h, m] = s.split(":").map((x) => Number(x));
  return { hours: h, minutes: m, hhmm: s };
}
function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
function startOfUtcWeekMonday(at) {
  const day = at.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = startOfUtcDay(at);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}
function startOfUtcMonth(at) {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0));
}
function addUtcMonths(at, months) {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds(), at.getUTCMilliseconds()));
}
function getCurrentPeriodBounds(cycleType, at = /* @__PURE__ */ new Date()) {
  const cycle = normalizeCycleType(cycleType);
  if (cycle === "monthly") {
    const periodStart2 = startOfUtcMonth(at);
    const periodEnd2 = addUtcMonths(periodStart2, 1);
    return { cycleType: "monthly", periodStart: periodStart2, periodEnd: periodEnd2 };
  }
  const periodStart = startOfUtcWeekMonday(at);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 7);
  return { cycleType: "weekly", periodStart, periodEnd };
}
function computeCloseScheduledAt(periodEnd, periodCloseUtcTime) {
  const { hours, minutes } = parseUtcCloseTime(periodCloseUtcTime);
  return new Date(
    Date.UTC(
      periodEnd.getUTCFullYear(),
      periodEnd.getUTCMonth(),
      periodEnd.getUTCDate(),
      hours,
      minutes,
      0,
      0
    )
  );
}
function getNextCloseAt(cycleType, periodCloseUtcTime, at = /* @__PURE__ */ new Date()) {
  const { periodEnd } = getCurrentPeriodBounds(cycleType, at);
  const closeAt = computeCloseScheduledAt(periodEnd, periodCloseUtcTime);
  return closeAt;
}
function toIso(d) {
  return d.toISOString();
}

// shared/finance/targetBonus.ts
var DEFAULT_TARGET_THRESHOLDS = {
  bronzeHours: 20,
  bronzeCoins: 5e3,
  bronzeBonusUsd: 15,
  silverHours: 40,
  silverCoins: 2e4,
  silverBonusUsd: 50,
  goldHours: 60,
  goldCoins: 6e4,
  goldBonusUsd: 150
};
function num(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function resolveTargetThresholds(raw) {
  const r = raw || {};
  return {
    bronzeHours: num(r.creator_target_bronze_hours ?? r.creatorTargetBronzeHours, DEFAULT_TARGET_THRESHOLDS.bronzeHours),
    bronzeCoins: num(r.creator_target_bronze_coins ?? r.creatorTargetBronzeCoins, DEFAULT_TARGET_THRESHOLDS.bronzeCoins),
    bronzeBonusUsd: num(r.creator_target_bronze_bonus_usd ?? r.creatorTargetBronzeBonusUSD, DEFAULT_TARGET_THRESHOLDS.bronzeBonusUsd),
    silverHours: num(r.creator_target_silver_hours ?? r.creatorTargetSilverHours, DEFAULT_TARGET_THRESHOLDS.silverHours),
    silverCoins: num(r.creator_target_silver_coins ?? r.creatorTargetSilverCoins, DEFAULT_TARGET_THRESHOLDS.silverCoins),
    silverBonusUsd: num(r.creator_target_silver_bonus_usd ?? r.creatorTargetSilverBonusUSD, DEFAULT_TARGET_THRESHOLDS.silverBonusUsd),
    goldHours: num(r.creator_target_gold_hours ?? r.creatorTargetGoldHours, DEFAULT_TARGET_THRESHOLDS.goldHours),
    goldCoins: num(r.creator_target_gold_coins ?? r.creatorTargetGoldCoins, DEFAULT_TARGET_THRESHOLDS.goldCoins),
    goldBonusUsd: num(r.creator_target_gold_bonus_usd ?? r.creatorTargetGoldBonusUSD, DEFAULT_TARGET_THRESHOLDS.goldBonusUsd)
  };
}
function computePerformanceTier(hours, totalCoins, thresholds = DEFAULT_TARGET_THRESHOLDS) {
  const h = Number(hours) || 0;
  const c = Number(totalCoins) || 0;
  if (h >= thresholds.goldHours && c >= thresholds.goldCoins) return "gold";
  if (h >= thresholds.silverHours && c >= thresholds.silverCoins) return "silver";
  return "bronze";
}
function targetBonusUsdForTier(tier, thresholds = DEFAULT_TARGET_THRESHOLDS) {
  if (tier === "gold") return thresholds.goldBonusUsd;
  if (tier === "silver") return thresholds.silverBonusUsd;
  return thresholds.bronzeBonusUsd;
}

// shared/finance/fx.ts
var DEFAULT_COIN_USD_PEG = 3e-3;
var DEFAULT_FEMALE_PAYOUT_RATIO_USD = DEFAULT_COIN_USD_PEG;
var DEFAULT_COIN_TO_USD_RATIO = DEFAULT_COIN_USD_PEG;
function normalizeFxRatio(raw, fallback = DEFAULT_COIN_USD_PEG) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
function getCoinUsdPeg(source) {
  if (source == null || typeof source !== "object") return DEFAULT_COIN_USD_PEG;
  const s = source;
  const preferred = s.coin_usd_peg ?? s.coinUsdPeg;
  if (preferred !== void 0 && preferred !== null) {
    return normalizeFxRatio(preferred, DEFAULT_COIN_USD_PEG);
  }
  const legacy = s.female_payout_ratio_usd ?? s.femalePayoutRatioUSD ?? s.coin_to_usd_ratio ?? s.coinToUSDRatio;
  return normalizeFxRatio(legacy, DEFAULT_COIN_USD_PEG);
}
function coinsToUsd(coins, peg = DEFAULT_COIN_USD_PEG) {
  const ratio = normalizeFxRatio(peg);
  const c = Number(coins);
  if (!Number.isFinite(c)) return 0;
  return Math.round(c * ratio * 1e4) / 1e4;
}
function usdToCoins(usd, peg = DEFAULT_COIN_USD_PEG) {
  const ratio = normalizeFxRatio(peg);
  const u = Number(usd);
  if (!Number.isFinite(u) || ratio <= 0) return 0;
  return Math.floor(u / ratio);
}
function formatPegExample(peg = DEFAULT_COIN_USD_PEG, coins = 1e3) {
  const usd = coinsToUsd(coins, peg);
  return `${coins.toLocaleString()} coins = $${usd.toFixed(2)}`;
}

// shared/finance/economyBurn.ts
var DEFAULT_COIN_BURN_RATE_PER_MIN = 120;
var DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN = 80;
var DEFAULT_FEMALE_HOST_SHARE_PERCENT = 30;
var DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT = 40;
var DEFAULT_TEAM_LEADER_SHARE_PERCENT = 10;
function normalizePositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}
function normalizeSharePercent(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(100, Math.round(n));
}
function resolveEconomyBurnRates(source) {
  const s = source && typeof source === "object" ? source : {};
  return {
    coinBurnRatePerMin: normalizePositiveInt(
      s.coin_burn_rate_per_min ?? s.coinBurnRatePerMin,
      DEFAULT_COIN_BURN_RATE_PER_MIN
    ),
    coinBurnRateFriendPerMin: normalizePositiveInt(
      s.coin_burn_rate_friend_per_min ?? s.coinBurnRateFriendPerMin,
      DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN
    ),
    femaleHostSharePercent: normalizeSharePercent(
      s.female_host_share_percent ?? s.femaleHostSharePercent,
      DEFAULT_FEMALE_HOST_SHARE_PERCENT
    ),
    femaleHostTargetSharePercent: normalizeSharePercent(
      s.female_host_target_share_percent ?? s.femaleHostTargetSharePercent,
      DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT
    ),
    teamLeaderSharePercent: normalizeSharePercent(
      s.team_leader_share_percent ?? s.teamLeaderSharePercent,
      DEFAULT_TEAM_LEADER_SHARE_PERCENT
    )
  };
}
function hasMetCreatorPeriodTarget(hours, totalCoins, thresholds = DEFAULT_TARGET_THRESHOLDS) {
  const h = Number(hours) || 0;
  const c = Number(totalCoins) || 0;
  return h >= thresholds.bronzeHours && c >= thresholds.bronzeCoins;
}

// server/finance/config.ts
var CACHE_TTL_MS = 6e4;
var cached = null;
function defaultFinanceSystemConfig() {
  const peg = DEFAULT_COIN_USD_PEG;
  return {
    creatorTargetCycle: "weekly",
    periodCloseUtcTime: "00:00",
    settlementEnabled: true,
    coinUsdPeg: peg,
    femalePayoutRatioUsd: peg,
    coinToUsdRatio: peg,
    burn: {
      coinBurnRatePerMin: DEFAULT_COIN_BURN_RATE_PER_MIN,
      coinBurnRateFriendPerMin: DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
      femaleHostSharePercent: DEFAULT_FEMALE_HOST_SHARE_PERCENT,
      femaleHostTargetSharePercent: DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
      teamLeaderSharePercent: DEFAULT_TEAM_LEADER_SHARE_PERCENT
    },
    thresholds: { ...DEFAULT_TARGET_THRESHOLDS },
    raw: {}
  };
}
function mapRow(row) {
  const r = row || {};
  const close = parseUtcCloseTime(r.period_close_utc_time ?? r.periodCloseUtcTime);
  const settlementRaw = r.settlement_enabled ?? r.settlementEnabled;
  const settlementEnabled = settlementRaw === void 0 || settlementRaw === null ? true : Boolean(settlementRaw);
  const peg = getCoinUsdPeg(r);
  return {
    creatorTargetCycle: normalizeCycleType(r.creator_target_cycle ?? r.creatorTargetCycle),
    periodCloseUtcTime: close.hhmm,
    settlementEnabled,
    coinUsdPeg: peg,
    femalePayoutRatioUsd: peg,
    coinToUsdRatio: peg,
    burn: resolveEconomyBurnRates(r),
    thresholds: resolveTargetThresholds(r),
    raw: r
  };
}
function getCachedFinanceConfig() {
  return cached?.value ?? defaultFinanceSystemConfig();
}
function invalidateFinanceConfigCache() {
  cached = null;
}
async function loadFinanceSystemConfig(opts) {
  const now = Date.now();
  if (!opts?.force && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }
  if (!isSupabaseAdminConfigured()) {
    const fallback = defaultFinanceSystemConfig();
    cached = { value: fallback, fetchedAt: now };
    return fallback;
  }
  try {
    const client = getSupabaseAdmin();
    if (!client) {
      const fallback = defaultFinanceSystemConfig();
      cached = { value: fallback, fetchedAt: now };
      return fallback;
    }
    const { data, error } = await client.from("system_configs").select(
      [
        "creator_target_cycle",
        "period_close_utc_time",
        "settlement_enabled",
        "coin_usd_peg",
        "female_payout_ratio_usd",
        "coin_to_usd_ratio",
        "coin_burn_rate_per_min",
        "coin_burn_rate_friend_per_min",
        "female_host_share_percent",
        "female_host_target_share_percent",
        "team_leader_share_percent",
        "gift_female_host_share_percent",
        "gift_team_leader_share_percent",
        "creator_target_bronze_hours",
        "creator_target_bronze_coins",
        "creator_target_bronze_bonus_usd",
        "creator_target_silver_hours",
        "creator_target_silver_coins",
        "creator_target_silver_bonus_usd",
        "creator_target_gold_hours",
        "creator_target_gold_coins",
        "creator_target_gold_bonus_usd"
      ].join(", ")
    ).eq("id", "default").maybeSingle();
    if (error) {
      console.warn("[finance/config] load failed:", error.message);
      const fallback = cached?.value ?? defaultFinanceSystemConfig();
      cached = { value: fallback, fetchedAt: now };
      return fallback;
    }
    const value = mapRow(data || {});
    cached = { value, fetchedAt: now };
    return value;
  } catch (err) {
    console.warn("[finance/config] load exception:", err?.message || err);
    const fallback = cached?.value ?? defaultFinanceSystemConfig();
    cached = { value: fallback, fetchedAt: now };
    return fallback;
  }
}
function refreshFinanceConfigInBackground() {
  void loadFinanceSystemConfig({ force: true });
}
async function updateFinanceSystemConfig(patch) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: "Supabase admin client unavailable" };
  const payload = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  if (patch.creatorTargetCycle !== void 0) {
    payload.creator_target_cycle = normalizeCycleType(patch.creatorTargetCycle);
  }
  if (patch.periodCloseUtcTime !== void 0) {
    const raw = String(patch.periodCloseUtcTime).trim();
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
      return { success: false, error: "period_close_utc_time must be HH:mm UTC (00:00\u201323:59)" };
    }
    payload.period_close_utc_time = parseUtcCloseTime(raw).hhmm;
  }
  if (patch.settlementEnabled !== void 0) {
    payload.settlement_enabled = Boolean(patch.settlementEnabled);
  }
  if (Object.keys(payload).length <= 1) {
    return { success: false, error: "No finance config fields to update" };
  }
  const { error } = await client.from("system_configs").update(payload).eq("id", "default");
  if (error) return { success: false, error: error.message };
  invalidateFinanceConfigCache();
  const config = await loadFinanceSystemConfig({ force: true });
  return { success: true, config };
}

// shared/finance/economyGift.ts
var DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT = 70;
var DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT = 10;
function resolveEconomyGiftShares(source) {
  const s = source && typeof source === "object" ? source : {};
  return {
    giftFemaleHostSharePercent: normalizeSharePercent(
      s.gift_female_host_share_percent ?? s.giftFemaleHostSharePercent,
      DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT
    ),
    giftTeamLeaderSharePercent: normalizeSharePercent(
      s.gift_team_leader_share_percent ?? s.giftTeamLeaderSharePercent,
      DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT
    )
  };
}

// server/finance/payableModel.ts
var PAYABLE_SOURCE_OF_TRUTH = "settlement_line_items";
var PAYABLE_MODEL_NOTES = [
  "Cash obligations exist only as settlement_batches / settlement_line_items after period close.",
  "financial_ledger is the immutable journal of those obligations and related accruals.",
  "profiles.earnings_coins is informational/operational \u2014 not the payout queue.",
  "Host-facing salary status is settlement_line_items.host_salary_status (pending|paid)."
].join(" ");

// server/finance/configSnapshot.ts
function freezeFinanceConfigSnapshot(config, opts) {
  const burn = config.burn;
  const raw = config.raw || {};
  const num2 = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const snap = {
    period_close_utc_time: config.periodCloseUtcTime,
    creator_target_cycle: config.creatorTargetCycle,
    coin_usd_peg: config.coinUsdPeg,
    // Legacy mirrors — same peg
    female_payout_ratio_usd: config.coinUsdPeg,
    coin_to_usd_ratio: config.coinUsdPeg,
    // Call burn rates (Phase 2 / 5)
    coin_burn_rate_per_min: num2(
      burn?.coinBurnRatePerMin ?? raw.coin_burn_rate_per_min ?? raw.coinBurnRatePerMin,
      DEFAULT_COIN_BURN_RATE_PER_MIN
    ),
    coin_burn_rate_friend_per_min: num2(
      burn?.coinBurnRateFriendPerMin ?? raw.coin_burn_rate_friend_per_min ?? raw.coinBurnRateFriendPerMin,
      DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN
    ),
    // Call shares — base + target (NOT gift defaults)
    female_host_share_percent: num2(
      burn?.femaleHostSharePercent ?? raw.female_host_share_percent ?? raw.femaleHostSharePercent,
      DEFAULT_FEMALE_HOST_SHARE_PERCENT
    ),
    female_host_target_share_percent: num2(
      burn?.femaleHostTargetSharePercent ?? raw.female_host_target_share_percent ?? raw.femaleHostTargetSharePercent,
      DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT
    ),
    team_leader_share_percent: num2(
      burn?.teamLeaderSharePercent ?? raw.team_leader_share_percent ?? raw.teamLeaderSharePercent,
      DEFAULT_TEAM_LEADER_SHARE_PERCENT
    ),
    // Gift shares (Phase 3) — separate from call
    gift_female_host_share_percent: num2(
      raw.gift_female_host_share_percent ?? raw.giftFemaleHostSharePercent,
      DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT
    ),
    gift_team_leader_share_percent: num2(
      raw.gift_team_leader_share_percent ?? raw.giftTeamLeaderSharePercent,
      DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT
    ),
    creator_target_bronze_hours: config.thresholds.bronzeHours,
    creator_target_bronze_coins: config.thresholds.bronzeCoins,
    creator_target_bronze_bonus_usd: config.thresholds.bronzeBonusUsd,
    creator_target_silver_hours: config.thresholds.silverHours,
    creator_target_silver_coins: config.thresholds.silverCoins,
    creator_target_silver_bonus_usd: config.thresholds.silverBonusUsd,
    creator_target_gold_hours: config.thresholds.goldHours,
    creator_target_gold_coins: config.thresholds.goldCoins,
    creator_target_gold_bonus_usd: config.thresholds.goldBonusUsd,
    payable_source_of_truth: PAYABLE_SOURCE_OF_TRUTH
  };
  if (opts?.includeFrozenAt !== false) {
    snap.frozen_at = (/* @__PURE__ */ new Date()).toISOString();
  }
  return snap;
}

// server/finance/period.ts
init_supabaseAdmin();
function rowToPeriod(row) {
  return {
    id: row.id,
    cycleType: normalizeCycleType(row.cycle_type),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    closeScheduledAt: row.close_scheduled_at,
    closedAt: row.closed_at ?? null,
    status: row.status,
    configSnapshot: row.config_snapshot || {},
    closeError: row.close_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
async function getNextCloseAt2(opts) {
  const config = opts?.config ?? await loadFinanceSystemConfig();
  const at = opts?.at ?? /* @__PURE__ */ new Date();
  return getNextCloseAt(config.creatorTargetCycle, config.periodCloseUtcTime, at);
}
async function ensureOpenPeriod(opts) {
  const at = opts?.at ?? /* @__PURE__ */ new Date();
  const config = opts?.config ?? await loadFinanceSystemConfig();
  const cycleType = normalizeCycleType(opts?.cycleType ?? config.creatorTargetCycle);
  const bounds = getCurrentPeriodBounds(cycleType, at);
  const closeScheduledAt = computeCloseScheduledAt(bounds.periodEnd, config.periodCloseUtcTime);
  if (!isSupabaseAdminConfigured()) {
    return {
      success: false,
      period: null,
      bounds,
      created: false,
      error: "Supabase admin not configured"
    };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return {
      success: false,
      period: null,
      bounds,
      created: false,
      error: "Supabase admin client unavailable"
    };
  }
  const periodStartIso = toIso(bounds.periodStart);
  const periodEndIso = toIso(bounds.periodEnd);
  const closeIso = toIso(closeScheduledAt);
  const { data: existing, error: selectError } = await client.from("settlement_periods").select("*").eq("cycle_type", cycleType).eq("period_start", periodStartIso).maybeSingle();
  if (selectError) {
    return {
      success: false,
      period: null,
      bounds,
      created: false,
      error: selectError.message
    };
  }
  if (existing) {
    if (existing.status === "open" && existing.close_scheduled_at !== closeIso) {
      const { data: updated, error: updateError } = await client.from("settlement_periods").update({
        close_scheduled_at: closeIso,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", existing.id).eq("status", "open").select("*").maybeSingle();
      if (!updateError && updated) {
        return { success: true, period: rowToPeriod(updated), bounds, created: false };
      }
    }
    return { success: true, period: rowToPeriod(existing), bounds, created: false };
  }
  const insertPayload = {
    cycle_type: cycleType,
    period_start: periodStartIso,
    period_end: periodEndIso,
    close_scheduled_at: closeIso,
    status: "open",
    // Seed with full economy snapshot (peg, burns, call/gift shares, targets).
    // Close re-freezes with frozen_at.
    config_snapshot: freezeFinanceConfigSnapshot(config, { includeFrozenAt: false })
  };
  const { data: inserted, error: insertError } = await client.from("settlement_periods").insert(insertPayload).select("*").maybeSingle();
  if (insertError) {
    if (String(insertError.code) === "23505" || /duplicate/i.test(insertError.message)) {
      const { data: raced } = await client.from("settlement_periods").select("*").eq("cycle_type", cycleType).eq("period_start", periodStartIso).maybeSingle();
      if (raced) {
        return { success: true, period: rowToPeriod(raced), bounds, created: false };
      }
    }
    return {
      success: false,
      period: null,
      bounds,
      created: false,
      error: insertError.message
    };
  }
  return {
    success: true,
    period: inserted ? rowToPeriod(inserted) : null,
    bounds,
    created: true
  };
}

// server/finance/fx.ts
async function coinsToUsdWithLiveRatio(coins) {
  const config = await loadFinanceSystemConfig();
  return coinsToUsd(coins, config.coinUsdPeg);
}
function coinsToUsdWithCachedRatio(coins) {
  return coinsToUsd(coins, getCachedFinanceConfig().coinUsdPeg);
}
function coinsToUsdWithSnapshot(coins, peg) {
  return coinsToUsd(coins, peg);
}
function getCachedCoinUsdPeg() {
  return getCoinUsdPeg(getCachedFinanceConfig());
}

// server/finance/targetBonus.ts
function computePerformanceTierFromCache(hours, totalCoins) {
  refreshFinanceConfigInBackground();
  const thresholds = getCachedFinanceConfig().thresholds;
  return computePerformanceTier(hours, totalCoins, thresholds);
}
async function computePerformanceTierFromConfig(hours, totalCoins, thresholds) {
  const t = thresholds ?? (await loadFinanceSystemConfig()).thresholds;
  return computePerformanceTier(hours, totalCoins, t);
}
async function getTargetThresholds() {
  return (await loadFinanceSystemConfig()).thresholds;
}

// server/finance/accrualQuery.ts
init_supabaseAdmin();
function emptyUser(userId) {
  return {
    userId,
    hostEarnCoins: 0,
    tlEarnCoins: 0,
    giftHostEarnCoins: 0,
    giftTlEarnCoins: 0,
    callHostEarnCoins: 0,
    callTlEarnCoins: 0,
    targetShareTrueUpCoins: 0
  };
}
function isGiftMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata;
  const kind = String(m.kind || m.source || m.category || "").toLowerCase();
  return kind === "gift" || kind === "virtual_gift" || m.is_gift === true;
}
async function aggregateWalletLedgerEarnings(opts) {
  const byUser = /* @__PURE__ */ new Map();
  const totals = {
    callDebitCoins: 0,
    giftDebitCoins: 0,
    hostEarnCoins: 0,
    tlEarnCoins: 0,
    giftHostEarnCoins: 0,
    giftTlEarnCoins: 0,
    targetShareTrueUpCoins: 0,
    platformRetainedCoins: 0
  };
  if (!opts.client && !isSupabaseAdminConfigured()) {
    return { success: false, byUser, totals, error: "Supabase admin not configured" };
  }
  const client = opts.client ?? getSupabaseAdmin();
  if (!client) {
    return { success: false, byUser, totals, error: "Supabase admin client unavailable" };
  }
  const startIso = typeof opts.periodStart === "string" ? opts.periodStart : toIso(opts.periodStart);
  const endIso = typeof opts.periodEnd === "string" ? opts.periodEnd : toIso(opts.periodEnd);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 1e3, 100), 5e3);
  const includeDebits = opts.userIds == null || opts.userIds.length === 0;
  let offset = 0;
  for (; ; ) {
    let q = client.from("wallet_ledger").select("user_id, transaction_type, amount, metadata, created_at").in(
      "transaction_type",
      includeDebits ? [
        "CALL_DEBIT",
        "GIFT_DEBIT",
        "HOST_EARN",
        "TL_EARN",
        "TARGET_SHARE_TRUEUP"
      ] : ["HOST_EARN", "TL_EARN", "TARGET_SHARE_TRUEUP"]
    ).gte("created_at", startIso).lt("created_at", endIso).order("created_at", { ascending: true }).range(offset, offset + pageSize - 1);
    if (opts.userIds && opts.userIds.length > 0) {
      q = q.in("user_id", opts.userIds);
    }
    const { data, error } = await q;
    if (error) {
      return { success: false, byUser, totals, error: error.message };
    }
    const rows = data || [];
    for (const row of rows) {
      const userId = String(row.user_id || "");
      if (!userId) continue;
      const amount = Number(row.amount) || 0;
      if (amount === 0) continue;
      const entry = byUser.get(userId) || emptyUser(userId);
      const gift = isGiftMetadata(row.metadata);
      if (row.transaction_type === "CALL_DEBIT" || row.transaction_type === "GIFT_DEBIT") {
        const abs = Math.abs(amount);
        totals.callDebitCoins += abs;
        if (row.transaction_type === "GIFT_DEBIT") {
          totals.giftDebitCoins += abs;
        }
      } else if (row.transaction_type === "HOST_EARN") {
        entry.hostEarnCoins += amount;
        totals.hostEarnCoins += amount;
        if (gift) {
          entry.giftHostEarnCoins += amount;
          totals.giftHostEarnCoins += amount;
        }
        entry.callHostEarnCoins = Math.max(0, entry.hostEarnCoins - entry.giftHostEarnCoins);
        entry.callTlEarnCoins = Math.max(0, entry.tlEarnCoins - entry.giftTlEarnCoins);
        byUser.set(userId, entry);
      } else if (row.transaction_type === "TARGET_SHARE_TRUEUP") {
        entry.targetShareTrueUpCoins += Math.max(0, amount);
        totals.targetShareTrueUpCoins += Math.max(0, amount);
        byUser.set(userId, entry);
      } else if (row.transaction_type === "TL_EARN") {
        entry.tlEarnCoins += amount;
        totals.tlEarnCoins += amount;
        if (gift) {
          entry.giftTlEarnCoins += amount;
          totals.giftTlEarnCoins += amount;
        }
        entry.callHostEarnCoins = Math.max(0, entry.hostEarnCoins - entry.giftHostEarnCoins);
        entry.callTlEarnCoins = Math.max(0, entry.tlEarnCoins - entry.giftTlEarnCoins);
        byUser.set(userId, entry);
      }
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  totals.platformRetainedCoins = Math.max(
    0,
    totals.callDebitCoins - totals.hostEarnCoins - totals.targetShareTrueUpCoins - totals.tlEarnCoins
  );
  return { success: true, byUser, totals };
}
async function getUserPeriodAccrual(userId, periodStart, periodEnd) {
  const res = await aggregateWalletLedgerEarnings({
    periodStart,
    periodEnd,
    userIds: [userId]
  });
  if (!res.success) return null;
  return res.byUser.get(userId) || emptyUser(userId);
}

// server/finance/payoutPolicy.ts
var PAYOUT_PERIOD_END_ONLY = "PAYOUT_PERIOD_END_ONLY";
var PayoutPolicyError = class extends Error {
  constructor(message = "Payouts are only available at period end via settlement batches.") {
    super(message);
    this.code = PAYOUT_PERIOD_END_ONLY;
    this.httpStatus = 400;
    this.name = "PayoutPolicyError";
  }
};
function evaluateManualPayoutPolicy(settlementEnabled) {
  return {
    allowed: false,
    code: PAYOUT_PERIOD_END_ONLY,
    message: "Manual mid-period payouts are disabled. Salaries settle at period end via settlement batches only.",
    settlementEnabled
  };
}
function assertManualPayoutAllowedSync() {
  const decision = evaluateManualPayoutPolicy(getCachedFinanceConfig().settlementEnabled);
  if (!decision.allowed) {
    throw new PayoutPolicyError(decision.message);
  }
}
async function assertManualPayoutAllowed() {
  const config = await loadFinanceSystemConfig();
  const decision = evaluateManualPayoutPolicy(config.settlementEnabled);
  if (!decision.allowed) {
    throw new PayoutPolicyError(decision.message);
  }
}
async function checkManualPayoutAllowed() {
  const config = await loadFinanceSystemConfig();
  return evaluateManualPayoutPolicy(config.settlementEnabled);
}

// server/finance/ledger.ts
init_supabaseAdmin();
function rowToEntry(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    periodId: row.period_id ?? null,
    entryType: row.entry_type,
    userId: row.user_id ?? null,
    teamLeaderId: row.team_leader_id ?? null,
    counterpartyRole: row.counterparty_role ?? null,
    amountCoins: Number(row.amount_coins) || 0,
    amountUsd: Number(row.amount_usd) || 0,
    fxRatio: Number(row.fx_ratio) || 0,
    sourceRefType: row.source_ref_type ?? null,
    sourceRefId: row.source_ref_id ?? null,
    metadata: row.metadata || {}
  };
}
async function appendFinancialLedgerEntry(input) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, entry: null, error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, entry: null, error: "Supabase admin client unavailable" };
  }
  const fxRatio = normalizeFxRatio(input.fxRatio);
  const amountCoins = Number(input.amountCoins) || 0;
  const amountUsd = input.amountUsd !== void 0 && Number.isFinite(Number(input.amountUsd)) ? Number(input.amountUsd) : coinsToUsd(amountCoins, fxRatio);
  const payload = {
    period_id: input.periodId ?? null,
    entry_type: input.entryType,
    user_id: input.userId ?? null,
    team_leader_id: input.teamLeaderId ?? null,
    counterparty_role: input.counterpartyRole ?? null,
    amount_coins: amountCoins,
    amount_usd: amountUsd,
    fx_ratio: fxRatio,
    source_ref_type: input.sourceRefType ?? null,
    source_ref_id: input.sourceRefId ?? null,
    metadata: input.metadata ?? {}
  };
  const { data, error } = await client.from("financial_ledger").insert(payload).select("*").maybeSingle();
  if (error) {
    return { success: false, entry: null, error: error.message };
  }
  return { success: true, entry: data ? rowToEntry(data) : null };
}
async function appendFinancialLedgerEntries(inputs) {
  if (!inputs.length) return { success: true, entries: [] };
  if (!isSupabaseAdminConfigured()) {
    return { success: false, entries: [], error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, entries: [], error: "Supabase admin client unavailable" };
  }
  const rows = inputs.map((input) => {
    const fxRatio = normalizeFxRatio(input.fxRatio);
    const amountCoins = Number(input.amountCoins) || 0;
    const amountUsd = input.amountUsd !== void 0 && Number.isFinite(Number(input.amountUsd)) ? Number(input.amountUsd) : coinsToUsd(amountCoins, fxRatio);
    return {
      period_id: input.periodId ?? null,
      entry_type: input.entryType,
      user_id: input.userId ?? null,
      team_leader_id: input.teamLeaderId ?? null,
      counterparty_role: input.counterpartyRole ?? null,
      amount_coins: amountCoins,
      amount_usd: amountUsd,
      fx_ratio: fxRatio,
      source_ref_type: input.sourceRefType ?? null,
      source_ref_id: input.sourceRefId ?? null,
      metadata: input.metadata ?? {}
    };
  });
  const { data, error } = await client.from("financial_ledger").insert(rows).select("*");
  if (error) {
    return { success: false, entries: [], error: error.message };
  }
  return { success: true, entries: (data || []).map(rowToEntry) };
}
async function appendReversalEntry(opts) {
  return appendFinancialLedgerEntry({
    periodId: opts.periodId ?? null,
    entryType: "REVERSAL",
    userId: opts.userId ?? null,
    teamLeaderId: opts.teamLeaderId ?? null,
    counterpartyRole: opts.counterpartyRole ?? null,
    amountCoins: opts.amountCoins,
    amountUsd: opts.amountUsd,
    fxRatio: opts.fxRatio,
    sourceRefType: opts.reversesEntryId ? "financial_ledger" : "manual_reversal",
    sourceRefId: opts.reversesEntryId ?? null,
    metadata: {
      reason: opts.reason || "admin_reversal",
      ...opts.metadata || {}
    }
  });
}

// server/finance/settlement.ts
init_supabaseAdmin();
function pushComponent(lines, payeeUserId, payeeRole, component, coins, usd, breakdown = {}) {
  if (coins <= 0 && usd <= 0) return;
  lines.push({
    payeeUserId,
    payeeRole,
    amountCoins: Math.max(0, Math.round(coins)),
    amountUsd: Math.max(0, usd),
    component,
    breakdown
  });
}
function buildSettlementBatches(opts) {
  const fxRatio = opts.fxRatio;
  const currency = opts.currency || "USD";
  const hostsByTl = /* @__PURE__ */ new Map();
  const directHosts = [];
  const tlRows = /* @__PURE__ */ new Map();
  for (const a of opts.accruals) {
    if (a.role === "team_leader") {
      tlRows.set(a.userId, a);
      continue;
    }
    const tlId = a.teamLeaderId ? String(a.teamLeaderId) : "";
    if (tlId) {
      const list = hostsByTl.get(tlId) || [];
      list.push(a);
      hostsByTl.set(tlId, list);
    } else {
      directHosts.push(a);
    }
  }
  for (const tlId of tlRows.keys()) {
    if (!hostsByTl.has(tlId)) hostsByTl.set(tlId, []);
  }
  const batches = [];
  for (const [tlId, hosts] of hostsByTl.entries()) {
    const lines = [];
    let totalHostSalaryCoins = 0;
    let totalHostSalaryUsd = 0;
    for (const host of hosts) {
      const callCoins = Number(host.callEarningsCoins) || 0;
      const giftCoins = Number(host.giftEarningsCoins) || 0;
      const bonusCoins = Number(host.targetBonusCoins) || 0;
      const trueUpCoins = Number(host.targetShareTrueUpCoins) || 0;
      const bonusUsd = host.targetBonusUsd !== void 0 && Number.isFinite(Number(host.targetBonusUsd)) ? Number(host.targetBonusUsd) : coinsToUsd(bonusCoins, fxRatio);
      pushComponent(lines, host.userId, "host", "call_earnings", callCoins, coinsToUsd(callCoins, fxRatio), {
        ...host.breakdown || {}
      });
      pushComponent(lines, host.userId, "host", "gift_earnings", giftCoins, coinsToUsd(giftCoins, fxRatio));
      pushComponent(
        lines,
        host.userId,
        "host",
        "target_share_trueup",
        trueUpCoins,
        coinsToUsd(trueUpCoins, fxRatio),
        { kind: "target_share_trueup" }
      );
      pushComponent(lines, host.userId, "host", "target_bonus", bonusCoins, bonusUsd, {
        targetBonusUsd: bonusUsd
      });
      totalHostSalaryCoins += callCoins + giftCoins + trueUpCoins + bonusCoins;
      totalHostSalaryUsd += coinsToUsd(callCoins, fxRatio) + coinsToUsd(giftCoins, fxRatio) + coinsToUsd(trueUpCoins, fxRatio) + bonusUsd;
    }
    const tlAccrual = tlRows.get(tlId);
    const tlCommissionCoins = Number(tlAccrual?.tlCommissionCoins) || 0;
    const tlCommissionUsd = coinsToUsd(tlCommissionCoins, fxRatio);
    pushComponent(lines, tlId, "team_leader", "tl_commission", tlCommissionCoins, tlCommissionUsd, {
      ...tlAccrual?.breakdown || {}
    });
    batches.push({
      batchKind: "team_leader_bundle",
      teamLeaderId: tlId,
      payeeUserId: tlId,
      totalHostSalaryUsd: round4(totalHostSalaryUsd),
      totalTlCommissionUsd: round4(tlCommissionUsd),
      totalDueUsd: round4(totalHostSalaryUsd + tlCommissionUsd),
      totalHostSalaryCoins,
      totalTlCommissionCoins: tlCommissionCoins,
      currency,
      lineItems: lines
    });
  }
  for (const host of directHosts) {
    const lines = [];
    const callCoins = Number(host.callEarningsCoins) || 0;
    const giftCoins = Number(host.giftEarningsCoins) || 0;
    const bonusCoins = Number(host.targetBonusCoins) || 0;
    const trueUpCoins = Number(host.targetShareTrueUpCoins) || 0;
    const bonusUsd = host.targetBonusUsd !== void 0 && Number.isFinite(Number(host.targetBonusUsd)) ? Number(host.targetBonusUsd) : coinsToUsd(bonusCoins, fxRatio);
    pushComponent(lines, host.userId, "host", "call_earnings", callCoins, coinsToUsd(callCoins, fxRatio));
    pushComponent(lines, host.userId, "host", "gift_earnings", giftCoins, coinsToUsd(giftCoins, fxRatio));
    pushComponent(
      lines,
      host.userId,
      "host",
      "target_share_trueup",
      trueUpCoins,
      coinsToUsd(trueUpCoins, fxRatio),
      { kind: "target_share_trueup" }
    );
    pushComponent(lines, host.userId, "host", "target_bonus", bonusCoins, bonusUsd);
    const totalCoins = callCoins + giftCoins + trueUpCoins + bonusCoins;
    const totalUsd = coinsToUsd(callCoins, fxRatio) + coinsToUsd(giftCoins, fxRatio) + coinsToUsd(trueUpCoins, fxRatio) + bonusUsd;
    batches.push({
      batchKind: "direct_host",
      teamLeaderId: null,
      payeeUserId: host.userId,
      totalHostSalaryUsd: round4(totalUsd),
      totalTlCommissionUsd: 0,
      totalDueUsd: round4(totalUsd),
      totalHostSalaryCoins: totalCoins,
      totalTlCommissionCoins: 0,
      currency,
      lineItems: lines
    });
  }
  return batches;
}
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}
async function createSettlementBatchesForPeriod(opts) {
  if (!opts.batches.length) return { success: true, batchIds: [] };
  if (!isSupabaseAdminConfigured()) {
    return { success: false, batchIds: [], error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, batchIds: [], error: "Supabase admin client unavailable" };
  }
  const batchIds = [];
  for (const batch of opts.batches) {
    const { data: inserted, error } = await client.from("settlement_batches").insert({
      period_id: opts.periodId,
      batch_kind: batch.batchKind,
      team_leader_id: batch.teamLeaderId,
      payee_user_id: batch.payeeUserId,
      status: "pending_admin_pay",
      total_host_salary_usd: batch.totalHostSalaryUsd,
      total_tl_commission_usd: batch.totalTlCommissionUsd,
      total_due_usd: batch.totalDueUsd,
      total_host_salary_coins: batch.totalHostSalaryCoins,
      total_tl_commission_coins: batch.totalTlCommissionCoins,
      currency: batch.currency
    }).select("id").maybeSingle();
    if (error || !inserted?.id) {
      const isUnique = String(error?.code) === "23505" || /duplicate|unique/i.test(error?.message || "");
      if (isUnique) {
        let existingId = null;
        if (batch.batchKind === "team_leader_bundle" && batch.teamLeaderId) {
          const { data: existing } = await client.from("settlement_batches").select("id").eq("period_id", opts.periodId).eq("batch_kind", "team_leader_bundle").eq("team_leader_id", batch.teamLeaderId).maybeSingle();
          existingId = existing?.id || null;
        } else {
          const { data: existing } = await client.from("settlement_batches").select("id").eq("period_id", opts.periodId).eq("batch_kind", "direct_host").eq("payee_user_id", batch.payeeUserId).maybeSingle();
          existingId = existing?.id || null;
        }
        if (existingId) {
          batchIds.push(existingId);
          continue;
        }
      }
      return {
        success: false,
        batchIds,
        error: error?.message || "Failed to insert settlement_batches row"
      };
    }
    batchIds.push(inserted.id);
    if (batch.lineItems.length) {
      const lines = batch.lineItems.map((li) => ({
        batch_id: inserted.id,
        payee_user_id: li.payeeUserId,
        payee_role: li.payeeRole,
        amount_coins: li.amountCoins,
        amount_usd: li.amountUsd,
        component: li.component,
        breakdown: li.breakdown,
        host_salary_status: "pending"
      }));
      const { error: lineError } = await client.from("settlement_line_items").insert(lines);
      if (lineError) {
        return { success: false, batchIds, error: lineError.message };
      }
    }
  }
  return { success: true, batchIds };
}

// server/finance/hostShareTrueUp.ts
init_supabaseAdmin();

// shared/finance/hostShareTrueUp.ts
function computeHostShareTrueUpCoins(opts) {
  const burn = Math.max(0, Math.round(Number(opts.periodEligibleCallBurn) || 0));
  const already = Math.max(0, Math.round(Number(opts.periodHostCallEarnCoinsAlready) || 0));
  const pct = normalizeSharePercent(
    opts.targetSharePercent,
    DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT
  );
  return Math.max(0, Math.round(burn * pct / 100) - already);
}
function shouldSkipHostShareTrueUp(coinEarnOverrideRate) {
  const n = Number(coinEarnOverrideRate);
  return Number.isFinite(n) && n > 0;
}
function targetShareTrueUpCallId(periodId) {
  return `target_share_trueup:${periodId}`;
}

// server/finance/hostShareTrueUp.ts
function isGiftMetadata2(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata;
  const kind = String(m.kind || m.source || m.category || "").toLowerCase();
  return kind === "gift" || kind === "virtual_gift" || m.is_gift === true;
}
function callMinuteKey(callId, billingMinute) {
  return `${String(callId || "")}:${Number(billingMinute) || 0}`;
}
async function paginateWallet(client, types, startIso, endIso, pageSize, onRow) {
  let offset = 0;
  for (; ; ) {
    const { data, error } = await client.from("wallet_ledger").select("user_id, call_id, transaction_type, amount, billing_minute, metadata").in("transaction_type", types).gte("created_at", startIso).lt("created_at", endIso).order("created_at", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) return error.message;
    const rows = data || [];
    for (const row of rows) onRow(row);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return null;
}
async function aggregateHostCallBurnForTrueUp(opts) {
  const byHost = /* @__PURE__ */ new Map();
  if (!opts.client && !isSupabaseAdminConfigured()) {
    return { success: false, byHost, error: "Supabase admin not configured" };
  }
  const client = opts.client ?? getSupabaseAdmin();
  if (!client) {
    return { success: false, byHost, error: "Supabase admin client unavailable" };
  }
  const startIso = typeof opts.periodStart === "string" ? opts.periodStart : toIso(opts.periodStart);
  const endIso = typeof opts.periodEnd === "string" ? opts.periodEnd : toIso(opts.periodEnd);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 1e3, 100), 5e3);
  const trueUpCallId = targetShareTrueUpCallId(opts.periodId);
  const debitBurnByKey = /* @__PURE__ */ new Map();
  const err1 = await paginateWallet(
    client,
    ["CALL_DEBIT"],
    startIso,
    endIso,
    pageSize,
    (row) => {
      const key = callMinuteKey(row.call_id, row.billing_minute);
      const abs = Math.abs(Number(row.amount) || 0);
      if (abs > 0) debitBurnByKey.set(key, (debitBurnByKey.get(key) || 0) + abs);
    }
  );
  if (err1) return { success: false, byHost, error: err1 };
  const ensure = (hostId) => {
    let e = byHost.get(hostId);
    if (!e) {
      e = {
        hostId,
        periodEligibleCallBurn: 0,
        periodHostCallEarn: 0,
        alreadyTrueUpCoins: 0
      };
      byHost.set(hostId, e);
    }
    return e;
  };
  const err2 = await paginateWallet(
    client,
    ["HOST_EARN", "TARGET_SHARE_TRUEUP"],
    startIso,
    endIso,
    pageSize,
    (row) => {
      const userId = String(row.user_id || "");
      if (!userId) return;
      const t = String(row.transaction_type || "");
      const amount = Number(row.amount) || 0;
      const meta = row.metadata || {};
      if (t === "TARGET_SHARE_TRUEUP") {
        const periodMatch = String(row.call_id || "") === trueUpCallId || String(meta.period_id || "") === opts.periodId;
        if (!periodMatch) return;
        ensure(userId).alreadyTrueUpCoins += Math.max(0, amount);
        return;
      }
      if (t !== "HOST_EARN") return;
      if (isGiftMetadata2(meta)) return;
      const kind = String(meta.kind || "").toLowerCase();
      if (kind === "target_share_trueup" || kind === "share_trueup") return;
      const entry = ensure(userId);
      entry.periodHostCallEarn += Math.max(0, amount);
      const key = callMinuteKey(row.call_id, row.billing_minute);
      let burn = debitBurnByKey.get(key) || 0;
      if (burn <= 0) {
        const fromMeta = Number(meta.ratePerMin ?? meta.coinsBurned ?? meta.coins_burned);
        if (Number.isFinite(fromMeta) && fromMeta > 0) burn = Math.round(fromMeta);
      }
      entry.periodEligibleCallBurn += Math.max(0, burn);
    }
  );
  if (err2) return { success: false, byHost, error: err2 };
  return { success: true, byHost };
}
function planHostShareTrueUps(opts) {
  const rates = resolveEconomyBurnRates(opts.burnConfig || {});
  const targetShare = opts.targetSharePercent > 0 ? opts.targetSharePercent : rates.femaleHostTargetSharePercent;
  const ids = /* @__PURE__ */ new Set([
    ...opts.hostIds,
    ...opts.aggByHost.keys(),
    ...opts.metricsByCreator.keys()
  ]);
  const plans = [];
  for (const hostId of ids) {
    const metrics = opts.metricsByCreator.get(hostId) || { hours: 0, coins: 0 };
    const agg = opts.aggByHost.get(hostId) || {
      hostId,
      periodEligibleCallBurn: 0,
      periodHostCallEarn: 0,
      alreadyTrueUpCoins: 0
    };
    const targetMet = hasMetCreatorPeriodTarget(
      metrics.hours,
      metrics.coins,
      opts.thresholds
    );
    const skippedOverride = shouldSkipHostShareTrueUp(opts.overrideByHost.get(hostId));
    const skippedAlreadyPosted = agg.alreadyTrueUpCoins > 0;
    let trueUpCoins = 0;
    if (targetMet && !skippedOverride && !skippedAlreadyPosted) {
      trueUpCoins = computeHostShareTrueUpCoins({
        periodEligibleCallBurn: agg.periodEligibleCallBurn,
        periodHostCallEarnCoinsAlready: agg.periodHostCallEarn,
        targetSharePercent: targetShare
      });
    }
    plans.push({
      hostId,
      targetMet,
      skippedOverride,
      skippedAlreadyPosted,
      periodEligibleCallBurn: agg.periodEligibleCallBurn,
      periodHostCallEarn: agg.periodHostCallEarn,
      trueUpCoins,
      targetSharePercent: targetShare,
      hours: metrics.hours,
      coins: metrics.coins
    });
  }
  return plans;
}
async function postHostShareTrueUpWallet(opts) {
  const coins = Math.max(0, Math.round(opts.trueUpCoins));
  if (coins <= 0) return { success: true, posted: false };
  const client = opts.client ?? getSupabaseAdmin();
  if (!client) return { success: false, posted: false, error: "No supabase client" };
  const callId = targetShareTrueUpCallId(opts.periodId);
  const { data: existing } = await client.from("wallet_ledger").select("id").eq("user_id", opts.hostId).eq("transaction_type", "TARGET_SHARE_TRUEUP").eq("call_id", callId).eq("billing_minute", 0).maybeSingle();
  if (existing?.id) return { success: true, posted: false };
  const { data: profile, error: pErr } = await client.from("profiles").select("earnings_coins").eq("id", opts.hostId).maybeSingle();
  if (pErr) return { success: false, posted: false, error: pErr.message };
  const current = Number(profile?.earnings_coins) || 0;
  const next = current + coins;
  const { error: upErr } = await client.from("profiles").update({ earnings_coins: next, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", opts.hostId);
  if (upErr) return { success: false, posted: false, error: upErr.message };
  const { error: wErr } = await client.from("wallet_ledger").insert({
    user_id: opts.hostId,
    call_id: callId,
    transaction_type: "TARGET_SHARE_TRUEUP",
    amount: coins,
    balance_after: next,
    billing_minute: 0,
    metadata: {
      kind: "target_share_trueup",
      period_id: opts.periodId,
      ...opts.metadata || {}
    }
  });
  if (wErr) {
    if (String(wErr.code || "") === "23505" || /duplicate/i.test(String(wErr.message || ""))) {
      return { success: true, posted: false };
    }
    await client.from("profiles").update({ earnings_coins: current, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", opts.hostId);
    return { success: false, posted: false, error: wErr.message };
  }
  return { success: true, posted: true };
}

// server/finance/statusTransition.ts
init_supabaseAdmin();
var SETTLEMENT_STATUS_TRANSITIONS = {
  pending_admin_pay: ["admin_paid", "cancelled"],
  admin_paid: ["tl_confirmed", "cancelled"],
  tl_confirmed: [],
  cancelled: []
};
function canTransitionSettlementStatus(from, to) {
  return (SETTLEMENT_STATUS_TRANSITIONS[from] || []).includes(to);
}
function normalizePayeeSalaryStatus(raw) {
  const s = String(raw || "pending").trim();
  if (s === "acknowledged" || s === "paid") return "acknowledged";
  if (s === "admin_paid") return "admin_paid";
  return "pending";
}
async function appendEvent(opts) {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: "Supabase admin client unavailable" };
  const { error } = await client.from("settlement_events").insert({
    batch_id: opts.batchId,
    period_id: opts.periodId ?? null,
    event_type: opts.eventType,
    actor_user_id: opts.actorUserId,
    note: opts.note ?? null,
    payload: opts.payload ?? {}
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
async function setPayeeLinesAdminPaidForRemit(batchId, batchKind) {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: "Supabase admin client unavailable" };
  let q = client.from("settlement_line_items").update({ host_salary_status: "admin_paid" }).eq("batch_id", batchId).in("host_salary_status", ["pending", "paid"]);
  const remitRole = adminRemitLinePayeeRoleFilter(batchKind);
  if (remitRole) {
    q = q.eq("payee_role", remitRole);
  }
  const { error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true };
}
function normalizeReconcileStatus(raw) {
  return String(raw || "unreconciled") === "reconciled" ? "reconciled" : "unreconciled";
}
function adminRemitLinePayeeRoleFilter(batchKind) {
  return batchKind === "team_leader_bundle" ? "team_leader" : null;
}
function reconcileGateOk(reconcileStatus) {
  return normalizeReconcileStatus(reconcileStatus) === "reconciled";
}
function evaluateAgencyMarkHostPaidGate(opts) {
  if (opts.batchKind !== "team_leader_bundle") {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      error: "Only Agency bundles support Agency host mark-paid"
    };
  }
  if (String(opts.teamLeaderId || "") !== opts.actorUserId) {
    return { ok: false, code: "FORBIDDEN", error: "Not your Agency settlement batch" };
  }
  if (!reconcileGateOk(opts.reconcileStatus)) {
    return {
      ok: false,
      code: "RECONCILE_REQUIRED",
      error: "Reconcile this batch before marking host salaries paid"
    };
  }
  if (opts.batchStatus !== "admin_paid" && opts.batchStatus !== "tl_confirmed") {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      error: "Admin must remit the Agency bundle before marking hosts paid"
    };
  }
  if (opts.hostUserId === opts.actorUserId) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      error: "Use acknowledge for your Agency commission, not host mark-paid"
    };
  }
  return { ok: true };
}
function allPayeeLinesAcknowledged(lineStatuses) {
  if (!lineStatuses.length) return false;
  return lineStatuses.every((s) => normalizePayeeSalaryStatus(s) === "acknowledged");
}
async function reconcileBatch(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin client unavailable" };
  }
  const batchId = String(opts.batchId || "").trim();
  const actorUserId = String(opts.actorUserId || "").trim();
  if (!batchId) return { success: false, code: "NOT_FOUND", error: "Batch id required" };
  if (!actorUserId) return { success: false, code: "FORBIDDEN", error: "Unauthorized" };
  const { data: batch, error } = await client.from("settlement_batches").select(
    "id, status, batch_kind, team_leader_id, period_id, reconcile_status, reconciled_at, reconciled_by, reconciled_by_role"
  ).eq("id", batchId).maybeSingle();
  if (error) return { success: false, code: "DB_ERROR", error: error.message };
  if (!batch) return { success: false, code: "NOT_FOUND", error: "Batch not found" };
  if (batch.status === "cancelled") {
    return { success: false, code: "INVALID_TRANSITION", error: "Cancelled batch cannot be reconciled" };
  }
  if (opts.actorRole === "team_leader") {
    if (batch.batch_kind !== "team_leader_bundle") {
      return {
        success: false,
        code: "FORBIDDEN",
        error: "Agency can only reconcile their own bundle batches"
      };
    }
    if (String(batch.team_leader_id || "") !== actorUserId) {
      return { success: false, code: "FORBIDDEN", error: "Not your Agency settlement batch" };
    }
  } else if (opts.actorRole !== "admin") {
    return { success: false, code: "FORBIDDEN", error: "Unauthorized" };
  }
  if (normalizeReconcileStatus(batch.reconcile_status) === "reconciled") {
    return { success: true, alreadyReconciled: true };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const { error: updateError } = await client.from("settlement_batches").update({
    reconcile_status: "reconciled",
    reconciled_at: now,
    reconciled_by: actorUserId,
    reconciled_by_role: opts.actorRole,
    updated_at: now
  }).eq("id", batchId).eq("reconcile_status", "unreconciled");
  if (updateError) return { success: false, code: "DB_ERROR", error: updateError.message };
  const ev = await appendEvent({
    batchId,
    periodId: batch.period_id,
    eventType: "reconciled",
    actorUserId,
    note: opts.note ?? null,
    payload: { reconciledByRole: opts.actorRole }
  });
  if (!ev.success) {
    await client.from("settlement_batches").update({
      reconcile_status: "unreconciled",
      reconciled_at: null,
      reconciled_by: null,
      reconciled_by_role: null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", batchId);
    return { success: false, code: "DB_ERROR", error: ev.error };
  }
  return { success: true };
}
async function agencyMarkHostPaid(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin client unavailable" };
  }
  const batchId = String(opts.batchId || "").trim();
  const hostUserId = String(opts.hostUserId || "").trim();
  const actorUserId = String(opts.actorUserId || "").trim();
  if (!batchId || !hostUserId) {
    return { success: false, code: "NOT_FOUND", error: "Batch and host id required" };
  }
  if (!actorUserId) return { success: false, code: "FORBIDDEN", error: "Unauthorized" };
  const { data: batch, error } = await client.from("settlement_batches").select("id, status, batch_kind, team_leader_id, period_id, reconcile_status").eq("id", batchId).maybeSingle();
  if (error) return { success: false, code: "DB_ERROR", error: error.message };
  if (!batch) return { success: false, code: "NOT_FOUND", error: "Batch not found" };
  const gate = evaluateAgencyMarkHostPaidGate({
    batchKind: String(batch.batch_kind || ""),
    teamLeaderId: batch.team_leader_id,
    actorUserId,
    reconcileStatus: batch.reconcile_status,
    batchStatus: String(batch.status || ""),
    hostUserId
  });
  if (!gate.ok) {
    return { success: false, code: gate.code, error: gate.error };
  }
  const { data: hostLines, error: linesErr } = await client.from("settlement_line_items").select("id, host_salary_status").eq("batch_id", batchId).eq("payee_user_id", hostUserId).eq("payee_role", "host");
  if (linesErr) return { success: false, code: "DB_ERROR", error: linesErr.message };
  if (!hostLines?.length) {
    return { success: false, code: "NOT_FOUND", error: "No host salary lines for this user on the batch" };
  }
  const already = hostLines.every(
    (l) => normalizePayeeSalaryStatus(l.host_salary_status) !== "pending"
  );
  if (already) return { success: true, alreadyPaid: true };
  const { error: updateErr } = await client.from("settlement_line_items").update({ host_salary_status: "admin_paid" }).eq("batch_id", batchId).eq("payee_user_id", hostUserId).eq("payee_role", "host").in("host_salary_status", ["pending", "paid"]);
  if (updateErr) return { success: false, code: "DB_ERROR", error: updateErr.message };
  const ev = await appendEvent({
    batchId,
    periodId: batch.period_id,
    eventType: "agency_marked_host_paid",
    actorUserId,
    note: opts.note ?? null,
    payload: { hostUserId }
  });
  if (!ev.success) return { success: false, code: "DB_ERROR", error: ev.error };
  return { success: true };
}
async function tryPromoteBatchWhenFullyAcknowledged(batchId, actorUserId, periodId) {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: "Supabase admin client unavailable" };
  const { data: lines, error } = await client.from("settlement_line_items").select("id, host_salary_status").eq("batch_id", batchId);
  if (error) return { success: false, error: error.message };
  const list = lines || [];
  if (!list.length) return { success: true, promoted: false };
  const allAcked = allPayeeLinesAcknowledged(list.map((l) => l.host_salary_status));
  if (!allAcked) return { success: true, promoted: false };
  const { data: batch, error: batchErr } = await client.from("settlement_batches").select("id, status").eq("id", batchId).maybeSingle();
  if (batchErr) return { success: false, error: batchErr.message };
  if (!batch) return { success: false, error: "Batch not found" };
  if (batch.status === "tl_confirmed") return { success: true, promoted: false };
  if (batch.status !== "admin_paid") return { success: true, promoted: false };
  const { error: updateError } = await client.from("settlement_batches").update({
    status: "tl_confirmed",
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", batchId).eq("status", "admin_paid");
  if (updateError) return { success: false, error: updateError.message };
  const ev = await appendEvent({
    batchId,
    periodId,
    eventType: "tl_confirmed",
    actorUserId,
    note: "All payees acknowledged",
    payload: { reason: "all_payees_acknowledged" }
  });
  if (!ev.success) {
    await client.from("settlement_batches").update({ status: "admin_paid", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", batchId).eq("status", "tl_confirmed");
    return { success: false, error: ev.error };
  }
  return { success: true, promoted: true };
}
async function markBatchAdminPaid(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin client unavailable" };
  }
  const { data: batch, error } = await client.from("settlement_batches").select("id, status, batch_kind, period_id, reconcile_status").eq("id", opts.batchId).maybeSingle();
  if (error) return { success: false, code: "DB_ERROR", error: error.message };
  if (!batch) return { success: false, code: "NOT_FOUND", error: "Batch not found" };
  const from = batch.status;
  if (from === "admin_paid" || from === "tl_confirmed") {
    return { success: true, alreadyPaid: true };
  }
  if (!canTransitionSettlementStatus(from, "admin_paid")) {
    return {
      success: false,
      code: "INVALID_TRANSITION",
      error: `Cannot transition ${from} \u2192 admin_paid`
    };
  }
  if (!reconcileGateOk(batch.reconcile_status)) {
    return {
      success: false,
      code: "RECONCILE_REQUIRED",
      error: "Reconcile this batch before Admin remittance / Salary Paid"
    };
  }
  const { error: updateError } = await client.from("settlement_batches").update({
    status: "admin_paid",
    payment_reference: opts.paymentReference ?? null,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", opts.batchId).eq("status", from);
  if (updateError) return { success: false, code: "DB_ERROR", error: updateError.message };
  const ev = await appendEvent({
    batchId: opts.batchId,
    periodId: batch.period_id,
    eventType: "admin_marked_paid",
    actorUserId: opts.actorUserId,
    note: opts.note ?? null,
    payload: {
      paymentReference: opts.paymentReference ?? null,
      batchKind: batch.batch_kind,
      remitScope: adminRemitLinePayeeRoleFilter(String(batch.batch_kind)) ? "tl_commission_only" : "all_payee_lines"
    }
  });
  if (!ev.success) {
    await client.from("settlement_batches").update({
      status: from,
      payment_reference: null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", opts.batchId).eq("status", "admin_paid");
    return { success: false, code: "DB_ERROR", error: ev.error };
  }
  const lines = await setPayeeLinesAdminPaidForRemit(opts.batchId, String(batch.batch_kind));
  if (!lines.success) return { success: false, code: "DB_ERROR", error: lines.error };
  return { success: true };
}
async function markPeriodAdminPaid(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin client unavailable" };
  }
  const periodId = String(opts.periodId || "").trim();
  if (!periodId) return { success: false, code: "NOT_FOUND", error: "Period id required" };
  const { data: period, error: periodErr } = await client.from("settlement_periods").select("id, status").eq("id", periodId).maybeSingle();
  if (periodErr) return { success: false, code: "DB_ERROR", error: periodErr.message };
  if (!period) return { success: false, code: "NOT_FOUND", error: "Period not found" };
  const { data: batches, error: batchErr } = await client.from("settlement_batches").select("id, status, reconcile_status").eq("period_id", periodId).neq("status", "cancelled");
  if (batchErr) return { success: false, code: "DB_ERROR", error: batchErr.message };
  const list = batches || [];
  if (!list.length) {
    return { success: false, code: "NOT_FOUND", error: "No settlement batches for this period" };
  }
  let updated = 0;
  let skippedUnreconciled = 0;
  for (const b of list) {
    if (b.status === "admin_paid" || b.status === "tl_confirmed") continue;
    if (normalizeReconcileStatus(b.reconcile_status) !== "reconciled") {
      skippedUnreconciled += 1;
      continue;
    }
    const result = await markBatchAdminPaid({
      batchId: b.id,
      actorUserId: opts.actorUserId,
      note: opts.note,
      paymentReference: opts.paymentReference
    });
    if (!result.success) {
      return { ...result, batchesUpdated: updated, skippedUnreconciled };
    }
    if (!result.alreadyPaid) updated += 1;
  }
  if (updated === 0 && skippedUnreconciled > 0) {
    return {
      success: false,
      code: "RECONCILE_REQUIRED",
      error: `${skippedUnreconciled} batch(es) still need reconcile before remittance`,
      skippedUnreconciled,
      batchesUpdated: 0
    };
  }
  return {
    success: true,
    batchesUpdated: updated,
    alreadyPaid: updated === 0,
    skippedUnreconciled
  };
}
async function acknowledgePayeeSalary(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin client unavailable" };
  }
  const batchId = String(opts.batchId || "").trim();
  const actorUserId = String(opts.actorUserId || "").trim();
  if (!batchId) return { success: false, code: "NOT_FOUND", error: "Batch id required" };
  if (!actorUserId) return { success: false, code: "FORBIDDEN", error: "Unauthorized" };
  const { data: batch, error } = await client.from("settlement_batches").select("id, status, batch_kind, team_leader_id, payee_user_id, period_id").eq("id", batchId).maybeSingle();
  if (error) return { success: false, code: "DB_ERROR", error: error.message };
  if (!batch) return { success: false, code: "NOT_FOUND", error: "Batch not found" };
  if (batch.status !== "admin_paid" && batch.status !== "tl_confirmed") {
    return {
      success: false,
      code: "INVALID_TRANSITION",
      error: "Salary can only be acknowledged after Admin remittance (and Agency host pay for managed hosts)"
    };
  }
  const { data: myLines, error: linesErr } = await client.from("settlement_line_items").select("id, payee_role, host_salary_status").eq("batch_id", batchId).eq("payee_user_id", actorUserId);
  if (linesErr) return { success: false, code: "DB_ERROR", error: linesErr.message };
  if (!myLines?.length) {
    return {
      success: false,
      code: "FORBIDDEN",
      error: "You are not a payee on this settlement batch"
    };
  }
  const already = myLines.every(
    (l) => normalizePayeeSalaryStatus(l.host_salary_status) === "acknowledged"
  );
  if (already) return { success: true, alreadyPaid: true };
  const roles = new Set(myLines.map((l) => String(l.payee_role)));
  const isTl = roles.has("team_leader");
  const isHost = roles.has("host");
  const pendingOnly = myLines.every(
    (l) => normalizePayeeSalaryStatus(l.host_salary_status) === "pending"
  );
  if (pendingOnly) {
    return {
      success: false,
      code: "INVALID_TRANSITION",
      error: "Salary is not marked paid yet \u2014 wait for remittance / Agency payout"
    };
  }
  const { error: updateErr } = await client.from("settlement_line_items").update({ host_salary_status: "acknowledged" }).eq("batch_id", batchId).eq("payee_user_id", actorUserId).eq("host_salary_status", "admin_paid");
  if (updateErr) return { success: false, code: "DB_ERROR", error: updateErr.message };
  const eventType = isTl && !isHost ? "tl_acknowledged" : "host_acknowledged";
  const primaryEvent = isTl ? "tl_acknowledged" : "host_acknowledged";
  const ev = await appendEvent({
    batchId,
    periodId: batch.period_id,
    eventType: primaryEvent,
    actorUserId,
    note: opts.note ?? null,
    payload: {
      payeeRoles: Array.from(roles),
      alsoHostAck: isTl && isHost ? true : void 0,
      eventAlias: eventType
    }
  });
  if (!ev.success) return { success: false, code: "DB_ERROR", error: ev.error };
  if (isTl && isHost) {
    await appendEvent({
      batchId,
      periodId: batch.period_id,
      eventType: "host_acknowledged",
      actorUserId,
      note: opts.note ?? null,
      payload: { reason: "tl_also_host_payee" }
    });
  }
  const promoted = await tryPromoteBatchWhenFullyAcknowledged(
    batchId,
    actorUserId,
    batch.period_id
  );
  if (!promoted.success) return { success: false, code: "DB_ERROR", error: promoted.error };
  return { success: true };
}
async function markBatchTlConfirmed(opts) {
  return acknowledgePayeeSalary({
    batchId: opts.batchId,
    actorUserId: opts.actorUserId,
    note: opts.note
  });
}
async function cancelSettlementBatch(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin client unavailable" };
  }
  const { data: batch, error } = await client.from("settlement_batches").select("id, status, period_id").eq("id", opts.batchId).maybeSingle();
  if (error) return { success: false, code: "DB_ERROR", error: error.message };
  if (!batch) return { success: false, code: "NOT_FOUND", error: "Batch not found" };
  const from = batch.status;
  if (!canTransitionSettlementStatus(from, "cancelled")) {
    return {
      success: false,
      code: "INVALID_TRANSITION",
      error: `Cannot transition ${from} \u2192 cancelled`
    };
  }
  const { error: updateError } = await client.from("settlement_batches").update({
    status: "cancelled",
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", opts.batchId).eq("status", from);
  if (updateError) return { success: false, code: "DB_ERROR", error: updateError.message };
  const ev = await appendEvent({
    batchId: opts.batchId,
    periodId: batch.period_id,
    eventType: "cancelled",
    actorUserId: opts.actorUserId,
    note: opts.note ?? "Cancelled by admin"
  });
  if (!ev.success) {
    await client.from("settlement_batches").update({ status: from, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", opts.batchId).eq("status", "cancelled");
    return { success: false, code: "DB_ERROR", error: ev.error };
  }
  return { success: true };
}
async function appendSettlementNote(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin not configured" };
  }
  const ev = await appendEvent({
    batchId: opts.batchId,
    periodId: opts.periodId ?? null,
    eventType: "note",
    actorUserId: opts.actorUserId,
    note: opts.note
  });
  if (!ev.success) return { success: false, code: "DB_ERROR", error: ev.error };
  return { success: true };
}
async function recordBatchCreatedEvent(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: "NOT_CONFIGURED", error: "Supabase admin not configured" };
  }
  const ev = await appendEvent({
    batchId: opts.batchId,
    periodId: opts.periodId,
    eventType: "created",
    actorUserId: opts.actorUserId,
    payload: opts.payload ?? {}
  });
  if (!ev.success) return { success: false, code: "DB_ERROR", error: ev.error };
  return { success: true };
}

// server/finance/walletLedgerWrite.ts
init_supabaseAdmin();
function sanitizeSourceKey(key) {
  return String(key || "").trim().slice(0, 180).replace(/\s+/g, "_");
}
async function appendGiftEarnLedger(input) {
  if (!input.client && !isSupabaseAdminConfigured()) {
    return { success: false, error: "Supabase admin not configured" };
  }
  const client = input.client ?? getSupabaseAdmin();
  if (!client) return { success: false, error: "Supabase admin client unavailable" };
  const sourceKey = sanitizeSourceKey(input.sourceKey);
  if (!sourceKey) return { success: false, error: "sourceKey required" };
  const baseMeta = {
    kind: "gift",
    source: input.kind,
    ...input.metadata || {}
  };
  const rows = [];
  const giftCost = Math.max(0, Math.round(Number(input.giftCost) || 0));
  const hostCoins = Math.max(0, Math.round(Number(input.hostCoins) || 0));
  const tlCoins = Math.max(0, Math.round(Number(input.tlCoins) || 0));
  if (input.senderUserId && giftCost > 0) {
    rows.push({
      user_id: input.senderUserId,
      call_id: sourceKey,
      transaction_type: "GIFT_DEBIT",
      amount: -giftCost,
      balance_after: Math.max(0, Number(input.senderBalanceAfter) || 0),
      billing_minute: 0,
      metadata: { ...baseMeta, side: "sender" }
    });
  }
  if (input.hostUserId && hostCoins > 0) {
    rows.push({
      user_id: input.hostUserId,
      call_id: sourceKey,
      transaction_type: "HOST_EARN",
      amount: hostCoins,
      balance_after: Math.max(0, Number(input.hostBalanceAfter) || 0),
      billing_minute: 0,
      metadata: { ...baseMeta, side: "host" }
    });
  }
  if (input.tlUserId && tlCoins > 0) {
    rows.push({
      user_id: input.tlUserId,
      call_id: sourceKey,
      transaction_type: "TL_EARN",
      amount: tlCoins,
      balance_after: Math.max(0, Number(input.tlBalanceAfter) || 0),
      billing_minute: 0,
      metadata: { ...baseMeta, side: "team_leader" }
    });
  }
  if (!rows.length) return { success: true };
  const { error } = await client.from("wallet_ledger").insert(rows);
  if (error) {
    const msg = String(error.message || "");
    if (error.code === "23505" || /duplicate|unique/i.test(msg)) {
      return { success: true, duplicate: true };
    }
    return { success: false, error: msg };
  }
  return { success: true };
}
async function loadGiftSharePercents(client) {
  try {
    const c = client ?? getSupabaseAdmin();
    if (!c) {
      return {
        host: DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
        tl: DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT
      };
    }
    const { data } = await c.from("system_configs").select("gift_female_host_share_percent, gift_team_leader_share_percent").eq("id", "default").maybeSingle();
    const shares = resolveEconomyGiftShares(data || {});
    return {
      host: shares.giftFemaleHostSharePercent,
      tl: shares.giftTeamLeaderSharePercent
    };
  } catch {
    return {
      host: DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
      tl: DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT
    };
  }
}
async function resolveCatalogGiftById(giftId, fallbackCatalog, client) {
  const id = String(giftId || "").trim();
  if (!id) return null;
  const pick = (list) => {
    const g = list.find((x) => x.id === id && x.isActive !== false);
    if (!g) return null;
    const cost = Number(g.coinCost);
    if (!Number.isFinite(cost) || cost <= 0) return null;
    return { id: g.id, coinCost: Math.round(cost), name: g.name };
  };
  try {
    const c = client ?? getSupabaseAdmin();
    if (c) {
      const { data } = await c.from("system_configs").select("virtual_gifts_json").eq("id", "default").maybeSingle();
      const raw = data?.virtual_gifts_json;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          const fromDb = pick(parsed);
          if (fromDb) return fromDb;
        }
      }
    }
  } catch (err) {
    console.warn("[resolveCatalogGiftById]", err?.message || err);
  }
  return pick(fallbackCatalog);
}

// server/finance/completeCoinPurchase.ts
init_supabaseAdmin();
function purchasePegFields(amountCoins, amountUsd, peg) {
  const coinUsdPegAtPurchase = peg > 0 ? peg : DEFAULT_COIN_USD_PEG;
  const pegValueUsd = coinsToUsd(amountCoins, coinUsdPegAtPurchase);
  const paid = amountUsd == null ? null : Number(amountUsd);
  const loadMarginUsd = paid != null && Number.isFinite(paid) ? Math.round((paid - pegValueUsd) * 1e6) / 1e6 : null;
  return { coinUsdPegAtPurchase, pegValueUsd, loadMarginUsd };
}
async function loadLiveCoinUsdPeg(client) {
  try {
    const { data } = await client.from("system_configs").select("coin_usd_peg, female_payout_ratio_usd, coin_to_usd_ratio").eq("id", "default").maybeSingle();
    return getCoinUsdPeg(data || {});
  } catch {
    return DEFAULT_COIN_USD_PEG;
  }
}
function buildLedgerMetadata(input, pegFields) {
  return {
    channel: input.channel,
    ...input.actorAdminId ? { actor_admin_id: input.actorAdminId } : {},
    ...input.reason ? { reason: input.reason } : {},
    ...input.provider ? { payment_provider: input.provider } : {},
    ...input.externalRef ? { external_ref: input.externalRef } : {},
    ...input.packageId ? { package_id: input.packageId } : {},
    ...input.amountUsd != null && Number.isFinite(Number(input.amountUsd)) ? { amount_usd: Number(input.amountUsd) } : {},
    coin_usd_peg: pegFields.coinUsdPegAtPurchase,
    peg_value_usd: pegFields.pegValueUsd,
    ...pegFields.loadMarginUsd != null ? { load_margin_usd: pegFields.loadMarginUsd } : {}
  };
}
function resolveAdminClient(client) {
  if (client) return client;
  if (!isSupabaseAdminConfigured()) return null;
  return getSupabaseAdmin();
}
async function createCheckoutIntent(input) {
  const userId = String(input.userId || "").trim();
  const packageId = String(input.packageId || "").trim();
  if (!userId) return { success: false, error: "userId required", code: "INVALID_USER" };
  if (!packageId) return { success: false, error: "packageId required", code: "INVALID_PACKAGE" };
  const client = resolveAdminClient(input.client);
  if (!client) return { success: false, error: "Supabase admin not configured", code: "NO_ADMIN" };
  const { data: profile, error: profileErr } = await client.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (profileErr) return { success: false, error: profileErr.message, code: "PROFILE_LOAD_FAILED" };
  if (!profile) return { success: false, error: "User not found", code: "NOT_FOUND" };
  const { data: pkg, error: pkgErr } = await client.from("coin_packages").select("id, title, coins, bonus_coins, price_usd, discount_price_usd").eq("id", packageId).maybeSingle();
  if (pkgErr) return { success: false, error: pkgErr.message, code: "PACKAGE_LOAD_FAILED" };
  if (!pkg) return { success: false, error: "Coin package not found", code: "PACKAGE_NOT_FOUND" };
  const baseCoins = Math.max(0, Math.round(Number(pkg.coins) || 0));
  const bonusCoins = Math.max(0, Math.round(Number(pkg.bonus_coins) || 0));
  const totalCoins = baseCoins + bonusCoins;
  if (totalCoins <= 0) {
    return { success: false, error: "Package has no coins", code: "INVALID_PACKAGE" };
  }
  const listUsd = Number(pkg.price_usd);
  const discountRaw = pkg.discount_price_usd;
  const discountUsd = discountRaw == null ? NaN : Number(discountRaw);
  const payUsd = Number.isFinite(discountUsd) ? discountUsd : listUsd;
  const amountUsd = Number.isFinite(payUsd) ? payUsd : null;
  const provider = (input.provider ? String(input.provider).trim() : "stub") || "stub";
  const peg = await loadLiveCoinUsdPeg(client);
  const pegFields = purchasePegFields(totalCoins, amountUsd, peg);
  const { data: purchaseRow, error: purchaseErr } = await client.from("coin_purchases").insert({
    user_id: userId,
    channel: "GATEWAY",
    status: "pending",
    amount_coins: totalCoins,
    amount_usd: amountUsd,
    coin_usd_peg_at_purchase: pegFields.coinUsdPegAtPurchase,
    peg_value_usd: pegFields.pegValueUsd,
    load_margin_usd: pegFields.loadMarginUsd,
    package_id: packageId,
    payment_provider: provider,
    external_ref: null,
    reason: `Checkout intent \xB7 ${pkg.title || packageId}`
  }).select("*").single();
  if (purchaseErr) {
    return { success: false, error: purchaseErr.message, code: "INTENT_INSERT_FAILED" };
  }
  const purchaseId = String(purchaseRow.id);
  return {
    success: true,
    purchase: {
      id: purchaseId,
      userId,
      channel: "GATEWAY",
      status: "pending",
      amountCoins: totalCoins,
      amountUsd,
      pegValueUsd: pegFields.pegValueUsd,
      loadMarginUsd: pegFields.loadMarginUsd,
      coinUsdPegAtPurchase: pegFields.coinUsdPegAtPurchase,
      packageId,
      paymentProvider: provider,
      externalRef: null,
      createdAt: purchaseRow.created_at
    },
    package: {
      id: String(pkg.id),
      title: String(pkg.title || packageId),
      coins: baseCoins,
      bonusCoins,
      totalCoins,
      priceUsd: amountUsd ?? 0
    },
    // Extension point: real PSP would return session URL; token identifies the pending intent.
    checkoutToken: `minglecall_checkout_${purchaseId}`
  };
}
async function completeCoinPurchase(input) {
  const channel = input.channel;
  const existingPurchaseId = input.purchaseId ? String(input.purchaseId).trim() : "";
  if (channel !== "ADMIN_MANUAL" && channel !== "GATEWAY") {
    return { success: false, error: "Invalid channel", code: "INVALID_CHANNEL" };
  }
  const client = resolveAdminClient(input.client);
  if (!client) return { success: false, error: "Supabase admin client unavailable", code: "NO_ADMIN" };
  const provider = input.provider ? String(input.provider).trim() : null;
  const externalRef = input.externalRef ? String(input.externalRef).trim() : null;
  if (channel === "GATEWAY" && provider && externalRef) {
    const { data: existing } = await client.from("coin_purchases").select("id, wallet_ledger_id, user_id, amount_coins").eq("channel", "GATEWAY").eq("payment_provider", provider).eq("external_ref", externalRef).eq("status", "completed").maybeSingle();
    if (existing?.id) {
      const { data: profile2 } = await client.from("profiles").select("coin_balance").eq("id", existing.user_id).maybeSingle();
      return {
        success: true,
        duplicate: true,
        purchaseId: existing.id,
        walletLedgerId: existing.wallet_ledger_id ?? void 0,
        coinBalance: Number(profile2?.coin_balance) || 0
      };
    }
  }
  let userId = String(input.userId || "").trim();
  let amountCoins = Math.round(Number(input.amountCoins) || 0);
  let amountUsd = input.amountUsd;
  let packageId = input.packageId ?? null;
  let reason = input.reason ?? null;
  let purchaseId = existingPurchaseId;
  let pendingMode = false;
  if (existingPurchaseId) {
    const { data: pending, error: pendingErr } = await client.from("coin_purchases").select("*").eq("id", existingPurchaseId).maybeSingle();
    if (pendingErr) return { success: false, error: pendingErr.message, code: "PURCHASE_LOAD_FAILED" };
    if (!pending) return { success: false, error: "Purchase intent not found", code: "NOT_FOUND" };
    if (pending.status === "completed" && pending.wallet_ledger_id) {
      const { data: profile2 } = await client.from("profiles").select("coin_balance").eq("id", pending.user_id).maybeSingle();
      return {
        success: true,
        duplicate: true,
        purchaseId: pending.id,
        walletLedgerId: pending.wallet_ledger_id,
        coinBalance: Number(profile2?.coin_balance) || 0
      };
    }
    if (pending.status !== "pending") {
      return {
        success: false,
        error: `Purchase status is ${pending.status}, expected pending`,
        code: "INVALID_STATUS"
      };
    }
    if (String(pending.channel) !== "GATEWAY") {
      return {
        success: false,
        error: "Only GATEWAY pending intents can be completed this way",
        code: "INVALID_CHANNEL"
      };
    }
    pendingMode = true;
    userId = String(pending.user_id);
    amountCoins = Math.round(Number(pending.amount_coins) || 0);
    amountUsd = pending.amount_usd != null ? Number(pending.amount_usd) : amountUsd;
    packageId = pending.package_id ?? packageId;
    reason = reason || pending.reason || "Gateway purchase completed";
  }
  if (!userId) return { success: false, error: "userId required", code: "INVALID_USER" };
  if (!Number.isFinite(amountCoins) || amountCoins <= 0) {
    return { success: false, error: "amountCoins must be a positive integer", code: "INVALID_AMOUNT" };
  }
  const { data: profile, error: profileErr } = await client.from("profiles").select("id, coin_balance").eq("id", userId).maybeSingle();
  if (profileErr) return { success: false, error: profileErr.message, code: "PROFILE_LOAD_FAILED" };
  if (!profile) return { success: false, error: "User not found", code: "NOT_FOUND" };
  const peg = await loadLiveCoinUsdPeg(client);
  const pegFields = purchasePegFields(amountCoins, amountUsd, peg);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const ledgerMeta = buildLedgerMetadata(
    {
      ...input,
      userId,
      amountCoins,
      amountUsd,
      packageId,
      reason,
      provider: provider || input.provider,
      externalRef: externalRef || input.externalRef
    },
    pegFields
  );
  const pegColumnPayload = {
    coin_usd_peg_at_purchase: pegFields.coinUsdPegAtPurchase,
    peg_value_usd: pegFields.pegValueUsd,
    load_margin_usd: pegFields.loadMarginUsd
  };
  if (!pendingMode) {
    const { data: purchaseRow, error: purchaseErr } = await client.from("coin_purchases").insert({
      user_id: userId,
      channel,
      status: "pending",
      amount_coins: amountCoins,
      amount_usd: amountUsd != null ? Number(amountUsd) : null,
      ...pegColumnPayload,
      package_id: packageId,
      payment_provider: provider,
      external_ref: externalRef,
      actor_admin_id: input.actorAdminId ?? null,
      reason
    }).select("id").single();
    if (purchaseErr) {
      if (purchaseErr.code === "23505") {
        return { success: false, error: "Duplicate gateway purchase reference", code: "DUPLICATE" };
      }
      return { success: false, error: purchaseErr.message, code: "PURCHASE_INSERT_FAILED" };
    }
    purchaseId = String(purchaseRow.id);
  }
  const idempotencyKey = (externalRef && provider ? `purchase:${provider}:${externalRef}` : null) || `purchase:${purchaseId}`;
  const { data: rpcRaw, error: rpcErr } = await client.rpc("complete_coin_purchase_atomic", {
    p_user_id: userId,
    p_amount_coins: amountCoins,
    p_idempotency_key: idempotencyKey,
    p_purchase_id: purchaseId,
    p_metadata: ledgerMeta
  });
  if (rpcErr) {
    if (!pendingMode && purchaseId) {
      await client.from("coin_purchases").update({ status: "failed" }).eq("id", purchaseId);
    }
    return { success: false, error: rpcErr.message, code: "PURCHASE_RPC_FAILED" };
  }
  const rpcResult = typeof rpcRaw === "string" ? JSON.parse(rpcRaw) : rpcRaw;
  if (!rpcResult?.success) {
    if (!pendingMode && purchaseId) {
      await client.from("coin_purchases").update({ status: "failed" }).eq("id", purchaseId);
    }
    return {
      success: false,
      error: rpcResult?.error_message || "Purchase credit failed",
      code: rpcResult?.error_code || "PURCHASE_FAILED"
    };
  }
  const walletLedgerId = rpcResult.wallet_ledger_id ? String(rpcResult.wallet_ledger_id) : void 0;
  const newBalance = Number(rpcResult.coin_balance) || 0;
  await client.from("coin_purchases").update({
    status: "completed",
    wallet_ledger_id: walletLedgerId || null,
    completed_at: nowIso,
    payment_provider: provider || void 0,
    external_ref: externalRef || void 0,
    reason: reason || void 0,
    amount_usd: amountUsd != null ? Number(amountUsd) : void 0,
    ...pegColumnPayload
  }).eq("id", purchaseId);
  return {
    success: true,
    purchaseId,
    walletLedgerId,
    coinBalance: newBalance,
    duplicate: Boolean(rpcResult.duplicate)
  };
}
async function failCheckoutIntent(opts) {
  const client = resolveAdminClient(opts.client);
  if (!client) return { success: false, error: "Supabase admin unavailable", code: "NO_ADMIN" };
  const id = String(opts.purchaseId || "").trim();
  if (!id) return { success: false, error: "purchaseId required", code: "INVALID_ID" };
  const { data: row, error } = await client.from("coin_purchases").select("*").eq("id", id).maybeSingle();
  if (error) return { success: false, error: error.message, code: "PURCHASE_LOAD_FAILED" };
  if (!row) return { success: false, error: "Purchase not found", code: "NOT_FOUND" };
  if (row.status === "completed") {
    return { success: false, error: "Cannot fail a completed purchase", code: "ALREADY_COMPLETED" };
  }
  if (row.status === "failed") return { success: true };
  const { error: updErr } = await client.from("coin_purchases").update({
    status: "failed",
    reason: opts.reason || row.reason || "Payment failed",
    payment_provider: opts.provider || row.payment_provider,
    external_ref: opts.externalRef || row.external_ref
  }).eq("id", id).eq("status", "pending");
  if (updErr) return { success: false, error: updErr.message, code: "UPDATE_FAILED" };
  return { success: true };
}

// server/finance/creatorEarnMetrics.ts
function applyCreatorEarnCoins(existing, opts) {
  const callAdd = Math.max(0, Math.round(Number(opts.callCoins) || 0));
  const giftAdd = Math.max(0, Math.round(Number(opts.giftCoins) || 0));
  const base = existing ? { ...existing, creatorId: opts.creatorId } : {
    creatorId: opts.creatorId,
    agencyLeaderId: opts.agencyLeaderId || null,
    activeOnlineSeconds: 0,
    activeOnlineHours: 0,
    coinsEarnedFromCalls: 0,
    coinsEarnedFromGifts: 0,
    totalTargetCoins: 0,
    performanceTier: "bronze"
  };
  const coinsEarnedFromCalls = Number(base.coinsEarnedFromCalls || 0) + callAdd;
  const coinsEarnedFromGifts = Number(base.coinsEarnedFromGifts || 0) + giftAdd;
  const totalTargetCoins = coinsEarnedFromCalls + coinsEarnedFromGifts;
  const hours = Number(base.activeOnlineHours || 0);
  const performanceTier = opts.computeTier(hours, totalTargetCoins);
  return {
    ...base,
    creatorId: opts.creatorId,
    agencyLeaderId: base.agencyLeaderId || opts.agencyLeaderId || null,
    coinsEarnedFromCalls,
    coinsEarnedFromGifts,
    totalTargetCoins,
    performanceTier,
    lastActiveDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// server/finance/closePeriod.ts
init_supabaseAdmin();
function freezeConfigSnapshot(config) {
  return freezeFinanceConfigSnapshot(config, { includeFrozenAt: true });
}
async function sumPeriodPackageLoadMarginUsd(client, periodStart, periodEnd) {
  const startIso = typeof periodStart === "string" ? periodStart : toIso(periodStart);
  const endIso = typeof periodEnd === "string" ? periodEnd : toIso(periodEnd);
  try {
    const { data, error } = await client.from("coin_purchases").select("load_margin_usd").eq("status", "completed").gte("completed_at", startIso).lt("completed_at", endIso);
    if (error) {
      console.warn("[finance/closePeriod] load_margin sum skipped:", error.message);
      return 0;
    }
    let sum = 0;
    for (const row of data || []) {
      const n = Number(row.load_margin_usd);
      if (Number.isFinite(n)) sum += n;
    }
    return Math.round(sum * 1e6) / 1e6;
  } catch (err) {
    console.warn("[finance/closePeriod] load_margin sum exception:", err?.message || err);
    return 0;
  }
}
function thresholdsFromSnapshot(snapshot, fallback) {
  if (!snapshot || typeof snapshot !== "object") return fallback;
  return resolveTargetThresholds(snapshot);
}
function computeHostTargetBonus(opts) {
  const tier = computePerformanceTier(opts.hours, opts.totalCoins, opts.thresholds);
  const metBronze = opts.hours >= opts.thresholds.bronzeHours && opts.totalCoins >= opts.thresholds.bronzeCoins;
  let bonusUsd = 0;
  if (tier === "gold" || tier === "silver") {
    bonusUsd = targetBonusUsdForTier(tier, opts.thresholds);
  } else if (metBronze) {
    bonusUsd = targetBonusUsdForTier("bronze", opts.thresholds);
  }
  return {
    tier,
    bonusUsd,
    bonusCoins: bonusUsd > 0 ? usdToCoins(bonusUsd, opts.fxRatio) : 0
  };
}
async function markPeriodFailed(periodId, closeError) {
  const client = getSupabaseAdmin();
  if (!client) return;
  await client.from("settlement_periods").update({
    status: "failed",
    close_error: closeError.slice(0, 2e3),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", periodId);
}
async function resolveSystemActorUserId(preferred) {
  if (preferred && String(preferred).trim()) return String(preferred).trim();
  const envActor = (process.env.FINANCE_JOB_ACTOR_USER_ID || "").trim();
  if (envActor) return envActor;
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data } = await client.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
  return data?.id ? String(data.id) : null;
}
async function findDueOpenPeriods(at = /* @__PURE__ */ new Date()) {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client.from("settlement_periods").select("*").eq("status", "open").lte("close_scheduled_at", toIso(at)).order("period_start", { ascending: true });
  if (error) {
    console.warn("[finance/closePeriod] findDueOpenPeriods:", error.message);
    return [];
  }
  return data || [];
}
async function findRetryableFailedPeriods(at = /* @__PURE__ */ new Date()) {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client.from("settlement_periods").select("*").eq("status", "failed").lte("close_scheduled_at", toIso(at)).order("period_start", { ascending: true });
  if (error) {
    console.warn("[finance/closePeriod] findRetryableFailedPeriods:", error.message);
    return [];
  }
  return data || [];
}
async function closePeriod(periodId, opts) {
  if (!isSupabaseAdminConfigured()) {
    return {
      success: false,
      periodId,
      status: "failed",
      error: "Supabase admin not configured"
    };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return {
      success: false,
      periodId,
      status: "failed",
      error: "Supabase admin client unavailable"
    };
  }
  const actorUserId = await resolveSystemActorUserId(opts.actorUserId);
  if (!actorUserId) {
    return {
      success: false,
      periodId,
      status: "failed",
      error: "No actor user id (pass actorUserId or set FINANCE_JOB_ACTOR_USER_ID / admin profile)"
    };
  }
  const { data: existing, error: loadError } = await client.from("settlement_periods").select("*").eq("id", periodId).maybeSingle();
  if (loadError || !existing) {
    return {
      success: false,
      periodId,
      status: "failed",
      error: loadError?.message || "Period not found"
    };
  }
  if (existing.status === "closed") {
    return {
      success: true,
      periodId,
      status: "noop",
      idempotent: true,
      message: "Period already closed"
    };
  }
  const claimable = existing.status === "open" || existing.status === "failed" || existing.status === "closing";
  if (!claimable) {
    return {
      success: false,
      periodId,
      status: "skipped",
      error: `Cannot close period in status=${existing.status}`
    };
  }
  const { data: claimed, error: claimError } = await client.from("settlement_periods").update({
    status: "closing",
    close_error: null,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", periodId).in("status", ["open", "failed", "closing"]).select("*").maybeSingle();
  if (claimError || !claimed) {
    const { data: again } = await client.from("settlement_periods").select("status").eq("id", periodId).maybeSingle();
    if (again?.status === "closed") {
      return {
        success: true,
        periodId,
        status: "noop",
        idempotent: true,
        message: "Period closed by concurrent worker"
      };
    }
    return {
      success: false,
      periodId,
      status: "failed",
      error: claimError?.message || "Failed to claim period for closing"
    };
  }
  try {
    const { data: existingBatches, error: batchListError } = await client.from("settlement_batches").select("id").eq("period_id", periodId);
    if (batchListError) throw new Error(batchListError.message);
    let batchIds = (existingBatches || []).map((b) => String(b.id));
    const batchesAlreadyExist = batchIds.length > 0;
    const liveConfig = await loadFinanceSystemConfig({ force: true });
    const priorSnapshot = claimed.config_snapshot && typeof claimed.config_snapshot === "object" ? claimed.config_snapshot : null;
    const priorFrozen = Boolean(priorSnapshot && priorSnapshot.frozen_at);
    let config = liveConfig;
    let snapshot = freezeConfigSnapshot(liveConfig);
    if (batchesAlreadyExist && priorFrozen) {
      snapshot = { ...priorSnapshot };
      const frozenPeg = getCoinUsdPeg(priorSnapshot);
      config = {
        ...liveConfig,
        coinUsdPeg: frozenPeg,
        femalePayoutRatioUsd: frozenPeg,
        coinToUsdRatio: frozenPeg,
        thresholds: thresholdsFromSnapshot(priorSnapshot, liveConfig.thresholds)
      };
    } else {
      await client.from("settlement_periods").update({
        config_snapshot: snapshot,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", periodId);
    }
    const fxRatio = config.coinUsdPeg;
    const periodStart = claimed.period_start;
    const periodEnd = claimed.period_end;
    const { count: accrualLedgerCount, error: ledgerCountError } = await client.from("financial_ledger").select("id", { count: "exact", head: true }).eq("period_id", periodId).eq("entry_type", "SETTLEMENT_ACCRUAL");
    if (ledgerCountError) throw new Error(ledgerCountError.message);
    const { count: platformLedgerCount, error: platformCountError } = await client.from("financial_ledger").select("id", { count: "exact", head: true }).eq("period_id", periodId).eq("entry_type", "PLATFORM_EARN");
    if (platformCountError) throw new Error(platformCountError.message);
    const ledgerAlreadyExists = (accrualLedgerCount || 0) > 0 || (platformLedgerCount || 0) > 0;
    let ledgerEntriesWritten = 0;
    let builtAccruals = [];
    let hostBonusByUser = /* @__PURE__ */ new Map();
    const hostTrueUpByUser = /* @__PURE__ */ new Map();
    let periodBurnTotals = {
      callDebitCoins: 0,
      hostEarnCoins: 0,
      targetShareTrueUpCoins: 0,
      tlEarnCoins: 0,
      platformRetainedCoins: 0
    };
    const { data: metricsRows, error: metricsError } = await client.from("creator_metrics").select("*");
    if (metricsError) throw new Error(metricsError.message);
    const metricsList = metricsRows || [];
    if (!batchesAlreadyExist) {
      const accrual = await aggregateWalletLedgerEarnings({
        periodStart,
        periodEnd,
        client
      });
      if (!accrual.success) throw new Error(accrual.error || "Accrual query failed");
      periodBurnTotals = {
        callDebitCoins: accrual.totals.callDebitCoins,
        hostEarnCoins: accrual.totals.hostEarnCoins,
        targetShareTrueUpCoins: accrual.totals.targetShareTrueUpCoins,
        tlEarnCoins: accrual.totals.tlEarnCoins,
        platformRetainedCoins: accrual.totals.platformRetainedCoins
      };
      const userIds = Array.from(accrual.byUser.keys());
      for (const m of metricsList) {
        if (m.creator_id && !accrual.byUser.has(m.creator_id)) {
          userIds.push(m.creator_id);
        }
      }
      const profileById = /* @__PURE__ */ new Map();
      if (userIds.length) {
        const chunkSize = 200;
        for (let i = 0; i < userIds.length; i += chunkSize) {
          const chunk = userIds.slice(i, i + chunkSize);
          const { data: profiles, error: profileError } = await client.from("profiles").select("id, team_leader_id, created_by_id, role, coin_earn_override_rate").in("id", chunk);
          if (profileError) throw new Error(profileError.message);
          for (const p of profiles || []) {
            profileById.set(String(p.id), {
              teamLeaderId: p.team_leader_id || p.created_by_id || null,
              role: String(p.role || ""),
              coinEarnOverrideRate: p.coin_earn_override_rate != null ? Number(p.coin_earn_override_rate) : null
            });
          }
        }
      }
      const metricsByCreator = /* @__PURE__ */ new Map();
      const metricsHoursCoins = /* @__PURE__ */ new Map();
      for (const m of metricsList) {
        const cid = String(m.creator_id);
        metricsByCreator.set(cid, m);
        metricsHoursCoins.set(cid, {
          hours: Number(m.active_online_hours || 0),
          coins: Number(m.total_target_coins) || Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0)
        });
      }
      const burnRates = resolveEconomyBurnRates(snapshot);
      const trueUpAgg = await aggregateHostCallBurnForTrueUp({
        periodStart,
        periodEnd,
        periodId,
        client
      });
      if (!trueUpAgg.success) throw new Error(trueUpAgg.error || "True-up accrual failed");
      const creatorHostIds = Array.from(
        /* @__PURE__ */ new Set([
          ...Array.from(trueUpAgg.byHost.keys()),
          ...Array.from(metricsByCreator.keys()).filter((id) => {
            const role = profileById.get(id)?.role || "";
            return role === "female_creator" || role === "female_host";
          })
        ])
      ).filter((id) => {
        const role = profileById.get(id)?.role || "";
        if (!role) return true;
        return role === "female_creator" || role === "female_host";
      });
      const overrideByHost = /* @__PURE__ */ new Map();
      for (const id of creatorHostIds) {
        overrideByHost.set(id, profileById.get(id)?.coinEarnOverrideRate);
      }
      const trueUpPlans = planHostShareTrueUps({
        hostIds: creatorHostIds,
        aggByHost: trueUpAgg.byHost,
        metricsByCreator: metricsHoursCoins,
        overrideByHost,
        thresholds: config.thresholds,
        targetSharePercent: burnRates.femaleHostTargetSharePercent,
        burnConfig: snapshot
      });
      let postedTrueUpTotal = 0;
      for (const plan of trueUpPlans) {
        if (plan.skippedAlreadyPosted) {
          const already = trueUpAgg.byHost.get(plan.hostId)?.alreadyTrueUpCoins || 0;
          if (already > 0) hostTrueUpByUser.set(plan.hostId, already);
          continue;
        }
        if (plan.trueUpCoins <= 0) continue;
        const posted = await postHostShareTrueUpWallet({
          hostId: plan.hostId,
          periodId,
          trueUpCoins: plan.trueUpCoins,
          client,
          metadata: {
            period_eligible_call_burn: plan.periodEligibleCallBurn,
            period_host_call_earn: plan.periodHostCallEarn,
            target_share_percent: plan.targetSharePercent,
            hours: plan.hours,
            coins: plan.coins
          }
        });
        if (!posted.success) {
          throw new Error(posted.error || `True-up wallet post failed for ${plan.hostId}`);
        }
        hostTrueUpByUser.set(plan.hostId, plan.trueUpCoins);
        if (posted.posted) postedTrueUpTotal += plan.trueUpCoins;
      }
      if (postedTrueUpTotal > 0) {
        periodBurnTotals.targetShareTrueUpCoins += postedTrueUpTotal;
        periodBurnTotals.platformRetainedCoins = Math.max(
          0,
          periodBurnTotals.callDebitCoins - periodBurnTotals.hostEarnCoins - periodBurnTotals.targetShareTrueUpCoins - periodBurnTotals.tlEarnCoins
        );
      }
      const hostIds = /* @__PURE__ */ new Set();
      const tlCommission = /* @__PURE__ */ new Map();
      for (const [userId, totals] of accrual.byUser.entries()) {
        if (totals.hostEarnCoins > 0 || totals.giftHostEarnCoins > 0) {
          hostIds.add(userId);
        }
        if (totals.tlEarnCoins > 0) {
          tlCommission.set(userId, (tlCommission.get(userId) || 0) + totals.tlEarnCoins);
        }
      }
      for (const id of hostTrueUpByUser.keys()) hostIds.add(id);
      for (const m of metricsList) {
        const cid = String(m.creator_id);
        const hours = Number(m.active_online_hours || 0);
        const coins = Number(m.total_target_coins) || Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0);
        const bonus = computeHostTargetBonus({
          hours,
          totalCoins: coins,
          thresholds: config.thresholds,
          fxRatio
        });
        if (bonus.bonusUsd > 0) {
          hostIds.add(cid);
          hostBonusByUser.set(cid, {
            ...bonus,
            hours,
            coins
          });
        } else if (hours > 0 || coins > 0) {
          hostBonusByUser.set(cid, { ...bonus, hours, coins });
        }
      }
      for (const hostId of hostIds) {
        const totals = accrual.byUser.get(hostId);
        const profile = profileById.get(hostId);
        const metrics = metricsByCreator.get(hostId);
        const teamLeaderId = metrics?.agency_leader_id || profile?.teamLeaderId || null;
        let bonus = hostBonusByUser.get(hostId);
        if (!bonus && metrics) {
          const hours = Number(metrics.active_online_hours || 0);
          const coins = Number(metrics.total_target_coins) || Number(metrics.coins_earned_from_calls || 0) + Number(metrics.coins_earned_from_gifts || 0);
          bonus = {
            ...computeHostTargetBonus({
              hours,
              totalCoins: coins,
              thresholds: config.thresholds,
              fxRatio
            }),
            hours,
            coins
          };
          hostBonusByUser.set(hostId, bonus);
        }
        builtAccruals.push({
          userId: hostId,
          teamLeaderId,
          role: "host",
          callEarningsCoins: totals?.callHostEarnCoins || 0,
          giftEarningsCoins: totals?.giftHostEarnCoins || 0,
          targetShareTrueUpCoins: hostTrueUpByUser.get(hostId) || 0,
          targetBonusCoins: bonus?.bonusCoins || 0,
          targetBonusUsd: bonus?.bonusUsd || 0,
          breakdown: {
            performanceTier: bonus?.tier || "bronze",
            activeOnlineHours: bonus?.hours ?? Number(metrics?.active_online_hours || 0),
            totalTargetCoins: bonus?.coins ?? 0
          }
        });
      }
      for (const [tlId, coins] of tlCommission.entries()) {
        builtAccruals.push({
          userId: tlId,
          role: "team_leader",
          tlCommissionCoins: coins,
          breakdown: { source: "wallet_ledger.TL_EARN" }
        });
      }
      for (const a of builtAccruals) {
        if (a.role === "host" && a.teamLeaderId && !tlCommission.has(a.teamLeaderId)) {
          if (!builtAccruals.some((x) => x.role === "team_leader" && x.userId === a.teamLeaderId)) {
            builtAccruals.push({
              userId: a.teamLeaderId,
              role: "team_leader",
              tlCommissionCoins: 0
            });
          }
        }
      }
      const built = buildSettlementBatches({
        accruals: builtAccruals,
        fxRatio
      }).filter((b) => b.totalDueUsd > 0 || b.lineItems.length > 0);
      const created = await createSettlementBatchesForPeriod({
        periodId,
        batches: built
      });
      if (!created.success) throw new Error(created.error || "Batch create failed");
      batchIds = created.batchIds;
    }
    if (!ledgerAlreadyExists) {
      const ledgerInputs = [];
      if (batchesAlreadyExist && periodBurnTotals.callDebitCoins === 0 && periodBurnTotals.hostEarnCoins === 0) {
        const burnAccrual = await aggregateWalletLedgerEarnings({
          periodStart,
          periodEnd,
          client
        });
        if (!burnAccrual.success) throw new Error(burnAccrual.error || "Burn accrual query failed");
        periodBurnTotals = {
          callDebitCoins: burnAccrual.totals.callDebitCoins,
          hostEarnCoins: burnAccrual.totals.hostEarnCoins,
          targetShareTrueUpCoins: burnAccrual.totals.targetShareTrueUpCoins,
          tlEarnCoins: burnAccrual.totals.tlEarnCoins,
          platformRetainedCoins: burnAccrual.totals.platformRetainedCoins
        };
      }
      {
        const platformCoins = periodBurnTotals.platformRetainedCoins;
        const retainedUsd = coinsToUsd(platformCoins, fxRatio);
        const loadMarginUsd = await sumPeriodPackageLoadMarginUsd(client, periodStart, periodEnd);
        const platformUsd = Math.round((retainedUsd + loadMarginUsd) * 1e4) / 1e4;
        ledgerInputs.push({
          periodId,
          entryType: "PLATFORM_EARN",
          userId: null,
          teamLeaderId: null,
          counterpartyRole: "platform",
          amountCoins: platformCoins,
          amountUsd: platformUsd,
          fxRatio,
          sourceRefType: "settlement_period",
          sourceRefId: periodId,
          metadata: {
            invariant: "CALL_DEBIT+GIFT_DEBIT - HOST_EARN - TARGET_SHARE_TRUEUP - TL_EARN",
            callDebitCoins: periodBurnTotals.callDebitCoins,
            hostEarnCoins: periodBurnTotals.hostEarnCoins,
            targetShareTrueUpCoins: periodBurnTotals.targetShareTrueUpCoins,
            tlEarnCoins: periodBurnTotals.tlEarnCoins,
            platformRetainedCoins: platformCoins,
            platformRetainedUsd: retainedUsd,
            package_load_margin_usd: loadMarginUsd,
            coin_usd_peg: fxRatio,
            // Legacy mirrors in metadata
            coin_to_usd_ratio: fxRatio,
            female_payout_ratio_usd: fxRatio
          }
        });
      }
      if (!batchesAlreadyExist && builtAccruals.length) {
        for (const a of builtAccruals) {
          if (a.role === "host") {
            const call = Number(a.callEarningsCoins) || 0;
            const gift = Number(a.giftEarningsCoins) || 0;
            const trueUp = Number(a.targetShareTrueUpCoins) || 0;
            const hostCoins = call + gift;
            if (hostCoins > 0) {
              ledgerInputs.push({
                periodId,
                entryType: "HOST_EARN",
                userId: a.userId,
                teamLeaderId: a.teamLeaderId || null,
                counterpartyRole: "host",
                amountCoins: hostCoins,
                amountUsd: coinsToUsd(hostCoins, fxRatio),
                fxRatio,
                sourceRefType: "settlement_period",
                sourceRefId: periodId,
                metadata: { call, gift, coin_usd_peg: fxRatio }
              });
            }
            if (trueUp > 0) {
              ledgerInputs.push({
                periodId,
                entryType: "TARGET_SHARE_TRUEUP",
                userId: a.userId,
                teamLeaderId: a.teamLeaderId || null,
                counterpartyRole: "host",
                amountCoins: trueUp,
                amountUsd: coinsToUsd(trueUp, fxRatio),
                fxRatio,
                sourceRefType: "settlement_period",
                sourceRefId: periodId,
                metadata: {
                  kind: "target_share_trueup",
                  coin_usd_peg: fxRatio,
                  ...a.breakdown || {}
                }
              });
            }
            if ((a.targetBonusUsd || 0) > 0) {
              ledgerInputs.push({
                periodId,
                entryType: "TARGET_BONUS",
                userId: a.userId,
                teamLeaderId: a.teamLeaderId || null,
                counterpartyRole: "host",
                amountCoins: a.targetBonusCoins || 0,
                amountUsd: a.targetBonusUsd || 0,
                fxRatio,
                sourceRefType: "settlement_period",
                sourceRefId: periodId,
                metadata: a.breakdown || {}
              });
            }
          } else if (a.role === "team_leader" && (a.tlCommissionCoins || 0) > 0) {
            const tlCoins = Number(a.tlCommissionCoins) || 0;
            ledgerInputs.push({
              periodId,
              entryType: "TL_EARN",
              userId: a.userId,
              teamLeaderId: a.userId,
              counterpartyRole: "team_leader",
              amountCoins: tlCoins,
              amountUsd: coinsToUsd(tlCoins, fxRatio),
              fxRatio,
              sourceRefType: "settlement_period",
              sourceRefId: periodId,
              metadata: { coin_usd_peg: fxRatio }
            });
          }
        }
      } else if (batchesAlreadyExist && batchIds.length) {
        const { data: resumeLines, error: resumeLinesError } = await client.from("settlement_line_items").select(
          "payee_user_id, payee_role, component, amount_coins, amount_usd, batch_id, metadata"
        ).in("batch_id", batchIds);
        if (resumeLinesError) throw new Error(resumeLinesError.message);
        const { data: resumeBatches } = await client.from("settlement_batches").select("id, team_leader_id").in("id", batchIds);
        const tlByBatch = new Map(
          (resumeBatches || []).map((b) => [String(b.id), b.team_leader_id || null])
        );
        const byPayee = /* @__PURE__ */ new Map();
        for (const li of resumeLines || []) {
          const uid = String(li.payee_user_id || "");
          if (!uid) continue;
          const cur = byPayee.get(uid) || {
            call: 0,
            gift: 0,
            trueUp: 0,
            bonusCoins: 0,
            bonusUsd: 0,
            tl: 0,
            teamLeaderId: tlByBatch.get(String(li.batch_id)) || null,
            meta: {}
          };
          const coins = Number(li.amount_coins) || 0;
          const usd = Number(li.amount_usd) || 0;
          const c = String(li.component || "");
          if (c === "call_earnings") cur.call += coins;
          else if (c === "gift_earnings") cur.gift += coins;
          else if (c === "target_share_trueup") cur.trueUp += coins;
          else if (c === "target_bonus") {
            cur.bonusCoins += coins;
            cur.bonusUsd += usd;
          } else if (c === "tl_commission") cur.tl += coins;
          if (li.metadata && typeof li.metadata === "object") {
            cur.meta = { ...cur.meta, ...li.metadata };
          }
          byPayee.set(uid, cur);
        }
        for (const [uid, a] of byPayee.entries()) {
          const hostCoins = a.call + a.gift;
          if (hostCoins > 0) {
            ledgerInputs.push({
              periodId,
              entryType: "HOST_EARN",
              userId: uid,
              teamLeaderId: a.teamLeaderId,
              counterpartyRole: "host",
              amountCoins: hostCoins,
              amountUsd: coinsToUsd(hostCoins, fxRatio),
              fxRatio,
              sourceRefType: "settlement_period",
              sourceRefId: periodId,
              metadata: { call: a.call, gift: a.gift, coin_usd_peg: fxRatio, resumed: true }
            });
          }
          if (a.trueUp > 0) {
            ledgerInputs.push({
              periodId,
              entryType: "TARGET_SHARE_TRUEUP",
              userId: uid,
              teamLeaderId: a.teamLeaderId,
              counterpartyRole: "host",
              amountCoins: a.trueUp,
              amountUsd: coinsToUsd(a.trueUp, fxRatio),
              fxRatio,
              sourceRefType: "settlement_period",
              sourceRefId: periodId,
              metadata: {
                kind: "target_share_trueup",
                coin_usd_peg: fxRatio,
                resumed: true,
                ...a.meta
              }
            });
          }
          if (a.bonusUsd > 0 || a.bonusCoins > 0) {
            ledgerInputs.push({
              periodId,
              entryType: "TARGET_BONUS",
              userId: uid,
              teamLeaderId: a.teamLeaderId,
              counterpartyRole: "host",
              amountCoins: a.bonusCoins,
              amountUsd: a.bonusUsd,
              fxRatio,
              sourceRefType: "settlement_period",
              sourceRefId: periodId,
              metadata: { resumed: true, ...a.meta }
            });
          }
          if (a.tl > 0) {
            ledgerInputs.push({
              periodId,
              entryType: "TL_EARN",
              userId: uid,
              teamLeaderId: uid,
              counterpartyRole: "team_leader",
              amountCoins: a.tl,
              amountUsd: coinsToUsd(a.tl, fxRatio),
              fxRatio,
              sourceRefType: "settlement_period",
              sourceRefId: periodId,
              metadata: { coin_usd_peg: fxRatio, resumed: true }
            });
          }
        }
      }
      const { data: batchRows, error: batchFetchError } = await client.from("settlement_batches").select("id, total_due_usd, total_host_salary_coins, total_tl_commission_coins, payee_user_id, team_leader_id, batch_kind").eq("period_id", periodId);
      if (batchFetchError) throw new Error(batchFetchError.message);
      for (const b of batchRows || []) {
        const coins = Number(b.total_host_salary_coins || 0) + Number(b.total_tl_commission_coins || 0);
        ledgerInputs.push({
          periodId,
          entryType: "SETTLEMENT_ACCRUAL",
          userId: b.payee_user_id,
          teamLeaderId: b.team_leader_id,
          counterpartyRole: b.batch_kind === "team_leader_bundle" ? "team_leader" : "host",
          amountCoins: coins,
          amountUsd: Number(b.total_due_usd) || 0,
          fxRatio,
          sourceRefType: "settlement_batch",
          sourceRefId: b.id,
          metadata: { batchKind: b.batch_kind }
        });
      }
      if (ledgerInputs.length) {
        const written = await appendFinancialLedgerEntries(ledgerInputs);
        if (!written.success) throw new Error(written.error || "Ledger write failed");
        ledgerEntriesWritten = written.entries.length;
      }
    }
    for (const batchId of batchIds) {
      const { count, error: evCountError } = await client.from("settlement_events").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("event_type", "created");
      if (evCountError) throw new Error(evCountError.message);
      if ((count || 0) > 0) continue;
      const ev = await recordBatchCreatedEvent({
        batchId,
        periodId,
        actorUserId,
        payload: { payableSourceOfTruth: PAYABLE_SOURCE_OF_TRUTH }
      });
      if (!ev.success) throw new Error(ev.error || "Failed to record created event");
    }
    const { count: snapCount, error: snapCountError } = await client.from("creator_period_snapshots").select("id", { count: "exact", head: true }).eq("period_id", periodId);
    if (snapCountError) throw new Error(snapCountError.message);
    let snapshotsWritten = snapCount || 0;
    if ((snapCount || 0) === 0 && metricsList.length > 0) {
      const snapRows = metricsList.map((m) => {
        const hours = Number(m.active_online_hours || 0);
        const coins = Number(m.total_target_coins) || Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0);
        const cached2 = hostBonusByUser.get(String(m.creator_id));
        const bonus = cached2 || computeHostTargetBonus({
          hours,
          totalCoins: coins,
          thresholds: config.thresholds,
          fxRatio
        });
        return {
          period_id: periodId,
          creator_id: m.creator_id,
          agency_leader_id: m.agency_leader_id || null,
          active_online_seconds: Number(m.active_online_seconds || 0),
          active_online_hours: hours,
          coins_earned_from_calls: Number(m.coins_earned_from_calls || 0),
          coins_earned_from_gifts: Number(m.coins_earned_from_gifts || 0),
          total_target_coins: Number(m.total_target_coins || coins),
          performance_tier: bonus.tier,
          bonus_earned_coins: bonus.bonusCoins,
          bonus_earned_usd: bonus.bonusUsd,
          current_streak_days: Number(m.current_streak_days || 0),
          response_health_score: Number(m.response_health_score ?? 100),
          metrics_snapshot: m
        };
      });
      const chunkSize = 100;
      for (let i = 0; i < snapRows.length; i += chunkSize) {
        const chunk = snapRows.slice(i, i + chunkSize);
        const { error: snapError } = await client.from("creator_period_snapshots").insert(chunk);
        if (snapError) {
          if (String(snapError.code) !== "23505" && !/duplicate|unique/i.test(snapError.message)) {
            throw new Error(snapError.message);
          }
        } else {
          snapshotsWritten += chunk.length;
        }
      }
    }
    if (metricsList.length > 0) {
      const nextBounds = await ensureOpenPeriod({
        at: new Date(new Date(periodEnd).getTime()),
        config,
        cycleType: claimed.cycle_type
      });
      const nextStart = nextBounds.bounds.periodStart.toISOString().slice(0, 10);
      const nextEndExclusive = nextBounds.bounds.periodEnd;
      const nextEndDate = new Date(nextEndExclusive.getTime() - 1).toISOString().slice(0, 10);
      const resetPayload = {
        active_online_seconds: 0,
        active_online_hours: 0,
        coins_earned_from_calls: 0,
        coins_earned_from_gifts: 0,
        total_target_coins: 0,
        performance_tier: "bronze",
        bonus_earned_coins: 0,
        bonus_earned_usd: 0,
        target_period_start: nextStart,
        target_period_end: nextEndDate,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const creatorsNeedingReset = metricsList.filter((m) => {
        const start = m.target_period_start != null ? String(m.target_period_start).slice(0, 10) : "";
        return start !== nextStart;
      }).map((m) => String(m.creator_id)).filter(Boolean);
      const chunkSize = 100;
      for (let i = 0; i < creatorsNeedingReset.length; i += chunkSize) {
        const chunk = creatorsNeedingReset.slice(i, i + chunkSize);
        const { error: resetError } = await client.from("creator_metrics").update(resetPayload).in("creator_id", chunk);
        if (resetError) throw new Error(resetError.message);
      }
      if (opts.creatorMetricsMap && creatorsNeedingReset.length) {
        for (const creatorId of creatorsNeedingReset) {
          const prev = opts.creatorMetricsMap.get(creatorId);
          if (!prev) continue;
          opts.creatorMetricsMap.set(creatorId, {
            ...prev,
            activeOnlineSeconds: 0,
            activeOnlineHours: 0,
            coinsEarnedFromCalls: 0,
            coinsEarnedFromGifts: 0,
            totalTargetCoins: 0,
            performanceTier: "bronze",
            bonusEarnedCoins: 0,
            bonusEarnedUSD: 0,
            targetPeriodStart: nextStart,
            targetPeriodEnd: nextEndDate,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
        opts.onMetricsReset?.();
      }
    }
    const { error: closeError } = await client.from("settlement_periods").update({
      status: "closed",
      closed_at: (/* @__PURE__ */ new Date()).toISOString(),
      close_error: null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", periodId).eq("status", "closing");
    if (closeError) throw new Error(closeError.message);
    await ensureOpenPeriod({
      at: /* @__PURE__ */ new Date(),
      config,
      cycleType: claimed.cycle_type
    });
    return {
      success: true,
      periodId,
      status: "closed",
      idempotent: batchesAlreadyExist || ledgerAlreadyExists,
      batchIds,
      ledgerEntriesWritten,
      snapshotsWritten,
      message: batchesAlreadyExist ? "Resumed/finalized existing settlement artifacts" : "Period closed and settlement batches created"
    };
  } catch (err) {
    const message = err?.message || String(err);
    console.error("[finance/closePeriod] failed:", periodId, message);
    await markPeriodFailed(periodId, message);
    return {
      success: false,
      periodId,
      status: "failed",
      error: message
    };
  }
}
async function closeDuePeriods(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, results: [], error: "Supabase admin not configured" };
  }
  const at = opts.at ?? /* @__PURE__ */ new Date();
  const actorUserId = await resolveSystemActorUserId(opts.actorUserId);
  if (!actorUserId) {
    return {
      success: false,
      results: [],
      error: "No actor user id for settlement_events (FINANCE_JOB_ACTOR_USER_ID or admin profile)"
    };
  }
  const ensured = await ensureOpenPeriod({ at });
  const due = await findDueOpenPeriods(at);
  const failed = opts.includeFailedRetries === false ? [] : await findRetryableFailedPeriods(at);
  const byId = /* @__PURE__ */ new Map();
  for (const p of [...due, ...failed]) byId.set(p.id, p);
  const results = [];
  for (const period of byId.values()) {
    const result = await closePeriod(period.id, {
      actorUserId,
      at,
      creatorMetricsMap: opts.creatorMetricsMap,
      onMetricsReset: opts.onMetricsReset
    });
    results.push(result);
  }
  const ensuredAfter = await ensureOpenPeriod({ at: /* @__PURE__ */ new Date() });
  const anyHardFail = results.some((r) => r.status === "failed");
  return {
    success: !anyHardFail,
    ensuredOpenPeriodId: ensuredAfter.period?.id || ensured.period?.id || null,
    results
  };
}

// server/finance/salaryPeriodView.ts
init_supabaseAdmin();

// server/finance/salaryPayoutAttach.ts
init_supabaseAdmin();

// shared/payout/types.ts
function isPayoutMethodKey(v) {
  return v === "paypal" || v === "bank_account" || v === "wallet";
}
function isPayoutFieldType(v) {
  return v === "text" || v === "phone" || v === "email" || v === "number" || v === "select";
}

// shared/payout/phoneUi.ts
function isPhoneMetaKey(key) {
  return /_(dial|national|has_chat|chat_apps)$/.test(key);
}
function formatMaskedDetailsLine(masked) {
  const v = masked || {};
  const parts = [];
  for (const [k, val] of Object.entries(v)) {
    if (isPhoneMetaKey(k)) continue;
    if (!String(val || "").trim()) continue;
    parts.push(`${k}: ${val}`);
  }
  return parts.join(" \xB7 ") || "\u2014";
}

// shared/payout/validate.ts
function cleanStr(v, max = 240) {
  return String(v ?? "").trim().slice(0, max);
}
function normalizeFieldDef(raw) {
  const id = cleanStr(raw?.id || raw?.key, 64);
  const key = cleanStr(raw?.key, 64).toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const label = cleanStr(raw?.label, 120);
  const type = isPayoutFieldType(raw?.type) ? raw.type : "text";
  if (!id || !key || !label) return null;
  const options = Array.isArray(raw?.options) ? raw.options.map((o) => cleanStr(o, 80)).filter(Boolean).slice(0, 40) : void 0;
  return {
    id,
    key,
    label,
    type,
    required: Boolean(raw?.required),
    placeholder: cleanStr(raw?.placeholder, 160) || void 0,
    options: type === "select" ? options && options.length ? options : ["Other"] : void 0
  };
}
function mapTemplateRow(row) {
  const fieldsRaw = Array.isArray(row?.fields_json) ? row.fields_json : typeof row?.fields_json === "string" ? (() => {
    try {
      return JSON.parse(row.fields_json);
    } catch {
      return [];
    }
  })() : Array.isArray(row?.fields) ? row.fields : [];
  const fields = fieldsRaw.map(normalizeFieldDef).filter(Boolean);
  const methodKey = isPayoutMethodKey(row?.method_key || row?.methodKey) ? row.method_key || row.methodKey : "paypal";
  return {
    methodKey,
    label: cleanStr(row?.label, 80) || methodKey,
    icon: cleanStr(row?.icon, 40) || "Wallet",
    description: cleanStr(row?.description, 400),
    isEnabled: row?.is_enabled !== false && row?.isEnabled !== false,
    countriesMode: row?.countries_mode === "selected" || row?.countriesMode === "selected" ? "selected" : "all",
    countryCodes: Array.isArray(row?.country_codes) ? row.country_codes.map((c) => cleanStr(c, 8).toUpperCase()).filter(Boolean) : Array.isArray(row?.countryCodes) ? row.countryCodes.map((c) => cleanStr(c, 8).toUpperCase()).filter(Boolean) : [],
    fields,
    sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? 0) || 0,
    updatedAt: row?.updated_at || row?.updatedAt || void 0
  };
}
function maskValue(key, value) {
  const v = String(value || "");
  if (!v) return "";
  const k = key.toLowerCase();
  if (k.includes("email") || v.includes("@")) {
    const [user, domain] = v.split("@");
    if (!domain) return "\u2022\u2022\u2022";
    const u = user.length <= 2 ? `${user[0] || "\u2022"}\u2022` : `${user.slice(0, 2)}\u2022\u2022\u2022`;
    return `${u}@${domain}`;
  }
  if (v.length <= 4) return "\u2022\u2022\u2022\u2022";
  return `\u2022\u2022\u2022\u2022${v.slice(-4)}`;
}
function maskCardValues(values, fields) {
  const out = {};
  const vals = values || {};
  for (const f of fields) {
    const v = vals[f.key];
    if (v == null || v === "") continue;
    if (isPhoneMetaKey(f.key)) continue;
    const sensitive = f.type === "email" || f.type === "phone" || /iban|account|address|routing|swift|email|phone|wallet/i.test(f.key);
    out[f.key] = sensitive ? maskValue(f.key, v) : v;
  }
  return out;
}

// server/finance/salaryPayoutAttach.ts
var METHOD_LABEL = {
  paypal: "PayPal",
  bank_account: "Bank",
  wallet: "Wallet"
};
function detailsLine(details) {
  const parts = [];
  for (const [k, v] of Object.entries(details || {})) {
    if (isPhoneMetaKey(k)) continue;
    if (!String(v || "").trim()) continue;
    parts.push(`${k}: ${v}`);
  }
  return parts.join(" \xB7 ") || "\u2014";
}
function pickPrimaryCard(cards) {
  if (!cards.length) return null;
  const primary = cards.find((c) => c.is_primary === true);
  if (primary) return primary;
  return [...cards].sort(
    (a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
  )[0];
}
async function loadSalaryPayoutDetailsByUserIds(userIds, opts) {
  const out = /* @__PURE__ */ new Map();
  const ids = Array.from(new Set((userIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length || !isSupabaseAdminConfigured()) return out;
  const client = getSupabaseAdmin();
  if (!client) return out;
  const fieldMap = /* @__PURE__ */ new Map();
  const { data: templates } = await client.from("payout_method_templates").select("*");
  for (const row of templates || []) {
    const t = mapTemplateRow(row);
    if (t) fieldMap.set(t.methodKey, t.fields);
  }
  const cardsByUser = /* @__PURE__ */ new Map();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await client.from("user_payout_cards").select("id, user_id, method_key, country_code, values_json, is_primary, updated_at").in("user_id", chunk);
    if (error) {
      console.warn("[finance/salaryPayoutAttach] load cards:", error.message);
      continue;
    }
    for (const row of data || []) {
      const uid = String(row.user_id);
      const list = cardsByUser.get(uid) || [];
      list.push(row);
      cardsByUser.set(uid, list);
    }
  }
  const mask = opts?.mask === true;
  for (const uid of ids) {
    const card = pickPrimaryCard(cardsByUser.get(uid) || []);
    if (!card) continue;
    if (!isPayoutMethodKey(card.method_key)) continue;
    const methodKey = card.method_key;
    const values = card.values_json && typeof card.values_json === "object" && !Array.isArray(card.values_json) ? card.values_json : {};
    const fields = fieldMap.get(methodKey) || [];
    const details = mask ? maskCardValues(
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v == null ? "" : String(v)])
      ),
      fields
    ) : Object.fromEntries(
      Object.entries(values).filter(([k]) => !isPhoneMetaKey(k)).map(([k, v]) => [k, v == null ? "" : String(v)]).filter(([, v]) => String(v).trim())
    );
    const countryCode = String(card.country_code || "").toUpperCase();
    const methodLabel = METHOD_LABEL[methodKey];
    const summaryCore = mask ? formatMaskedDetailsLine(details) : detailsLine(details);
    out.set(uid, {
      methodKey,
      methodLabel,
      countryCode,
      isPrimary: card.is_primary === true,
      details,
      summary: `${methodLabel} (${countryCode || "\u2014"}): ${summaryCore}`
    });
  }
  return out;
}
function attachPayoutToPayee(payee, map) {
  return {
    ...payee,
    payout: map.get(payee.userId) || null
  };
}

// server/finance/salaryPeriodView.ts
function worstAck(statuses) {
  if (statuses.some((s) => s === "pending")) return "pending";
  if (statuses.some((s) => s === "admin_paid")) return "admin_paid";
  return "acknowledged";
}
function aggregatePayeeLines(lines, profile) {
  if (!lines.length) return null;
  const userId = String(lines[0].payee_user_id);
  const role = String(lines[0].payee_role) === "team_leader" ? "team_leader" : "host";
  const components = lines.map((l) => ({
    component: String(l.component || "other"),
    amountCoins: Number(l.amount_coins) || 0,
    amountUsd: Number(l.amount_usd) || 0
  }));
  const amountCoins = components.reduce((s, c) => s + c.amountCoins, 0);
  const amountUsd = components.reduce((s, c) => s + c.amountUsd, 0);
  const ackStatus = worstAck(
    lines.map((l) => normalizePayeeSalaryStatus(l.host_salary_status))
  );
  return {
    userId,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    role,
    amountCoins,
    amountUsd,
    ackStatus,
    batchId: String(lines[0].batch_id),
    components
  };
}
async function loadSalaryPeriodDetail(periodId) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: "Supabase admin client unavailable" };
  const id = String(periodId || "").trim();
  if (!id) return { success: false, error: "Period id required" };
  const { data: period, error: periodErr } = await client.from("settlement_periods").select("*").eq("id", id).maybeSingle();
  if (periodErr) return { success: false, error: periodErr.message };
  if (!period) return { success: false, error: "Period not found" };
  const { data: batches, error: batchErr } = await client.from("settlement_batches").select("*").eq("period_id", id).order("created_at", { ascending: true });
  if (batchErr) return { success: false, error: batchErr.message };
  const batchList = (batches || []).filter((b) => b.status !== "cancelled");
  const batchIds = batchList.map((b) => String(b.id));
  const { data: lines, error: lineErr } = batchIds.length ? await client.from("settlement_line_items").select("*").in("batch_id", batchIds).order("created_at", { ascending: true }) : { data: [], error: null };
  if (lineErr) return { success: false, error: lineErr.message };
  const lineList = lines || [];
  const userIds = Array.from(
    new Set(lineList.map((l) => String(l.payee_user_id)).filter(Boolean))
  );
  const { data: profiles } = userIds.length ? await client.from("profiles").select("id, name, email").in("id", userIds) : { data: [] };
  const profileById = new Map(
    (profiles || []).map((p) => [String(p.id), p])
  );
  const linesByBatch = /* @__PURE__ */ new Map();
  for (const l of lineList) {
    const bid = String(l.batch_id);
    const list = linesByBatch.get(bid) || [];
    list.push(l);
    linesByBatch.set(bid, list);
  }
  const tlSections = [];
  const directHosts = [];
  for (const batch of batchList) {
    const bid = String(batch.id);
    const batchLines = linesByBatch.get(bid) || [];
    if (batch.batch_kind === "team_leader_bundle") {
      const tlId = String(batch.team_leader_id || batch.payee_user_id);
      const byPayee = /* @__PURE__ */ new Map();
      for (const l of batchLines) {
        const uid = String(l.payee_user_id);
        const list = byPayee.get(uid) || [];
        list.push(l);
        byPayee.set(uid, list);
      }
      const tlLines = (byPayee.get(tlId) || []).filter(
        (l) => l.payee_role === "team_leader"
      );
      const tlHostLines = (byPayee.get(tlId) || []).filter(
        (l) => l.payee_role === "host"
      );
      const teamLeader = aggregatePayeeLines(
        tlLines.length ? tlLines : [],
        profileById.get(tlId)
      );
      const tlRow = teamLeader || {
        userId: tlId,
        name: profileById.get(tlId)?.name ?? null,
        email: profileById.get(tlId)?.email ?? null,
        role: "team_leader",
        amountCoins: 0,
        amountUsd: 0,
        ackStatus: "pending",
        batchId: bid,
        components: []
      };
      const hosts = [];
      for (const [uid, pls] of byPayee.entries()) {
        if (uid === tlId) {
          if (tlHostLines.length) {
            const hostSelf = aggregatePayeeLines(tlHostLines, profileById.get(uid));
            if (hostSelf) hosts.push(hostSelf);
          }
          continue;
        }
        const hostLines = pls.filter((l) => l.payee_role === "host");
        const row = aggregatePayeeLines(hostLines, profileById.get(uid));
        if (row) hosts.push(row);
      }
      hosts.sort((a, b) => b.amountUsd - a.amountUsd);
      const payeesForAck = [tlRow, ...hosts].filter(
        (p) => p.components.length > 0 || p.role === "team_leader"
      );
      const uniquePayees = /* @__PURE__ */ new Map();
      for (const l of batchLines) {
        const uid = String(l.payee_user_id);
        const st = normalizePayeeSalaryStatus(l.host_salary_status);
        const prev = uniquePayees.get(uid);
        if (!prev) uniquePayees.set(uid, st);
        else uniquePayees.set(uid, worstAck([prev, st]));
      }
      const ackTotal2 = uniquePayees.size;
      const ackDone = Array.from(uniquePayees.values()).filter(
        (s) => s === "acknowledged"
      ).length;
      const hostsPaidCount = hosts.filter((h) => h.ackStatus !== "pending").length;
      const hostsAckedCount = hosts.filter((h) => h.ackStatus === "acknowledged").length;
      tlSections.push({
        teamLeaderId: tlId,
        teamLeader: tlRow,
        hosts,
        totalHostSalaryUsd: Number(batch.total_host_salary_usd) || 0,
        totalTlCommissionUsd: Number(batch.total_tl_commission_usd) || 0,
        totalDueUsd: Number(batch.total_due_usd) || 0,
        batchId: bid,
        batchStatus: String(batch.status),
        reconcileStatus: batch.reconcile_status === "reconciled" ? "reconciled" : "unreconciled",
        reconciledAt: batch.reconciled_at ?? null,
        reconciledByRole: batch.reconciled_by_role === "admin" || batch.reconciled_by_role === "team_leader" ? batch.reconciled_by_role : null,
        hostsPaidCount,
        hostsAckedCount,
        hostsTotal: hosts.length,
        ackProgress: { acknowledged: ackDone, total: ackTotal2 }
      });
      void payeesForAck;
    } else {
      const byPayee = /* @__PURE__ */ new Map();
      for (const l of batchLines) {
        const uid = String(l.payee_user_id);
        const list = byPayee.get(uid) || [];
        list.push(l);
        byPayee.set(uid, list);
      }
      for (const [uid, pls] of byPayee.entries()) {
        const row = aggregatePayeeLines(pls, profileById.get(uid));
        if (row) directHosts.push(row);
      }
    }
  }
  directHosts.sort((a, b) => b.amountUsd - a.amountUsd);
  const allPayeeIds = Array.from(
    /* @__PURE__ */ new Set([
      ...tlSections.flatMap((s) => [
        s.teamLeaderId,
        ...s.teamLeader ? [s.teamLeader.userId] : [],
        ...s.hosts.map((h) => h.userId)
      ]),
      ...directHosts.map((h) => h.userId)
    ])
  );
  const payoutMap = await loadSalaryPayoutDetailsByUserIds(allPayeeIds, { mask: false });
  for (const section of tlSections) {
    if (section.teamLeader) {
      section.teamLeader = attachPayoutToPayee(section.teamLeader, payoutMap);
    }
    section.hosts = section.hosts.map((h) => attachPayoutToPayee(h, payoutMap));
  }
  for (let i = 0; i < directHosts.length; i++) {
    directHosts[i] = attachPayoutToPayee(directHosts[i], payoutMap);
  }
  let ackAcknowledged = 0;
  let ackTotal = 0;
  const payeeAck = /* @__PURE__ */ new Map();
  for (const l of lineList) {
    const key = `${l.batch_id}:${l.payee_user_id}`;
    const st = normalizePayeeSalaryStatus(l.host_salary_status);
    const prev = payeeAck.get(key);
    if (!prev) payeeAck.set(key, st);
    else payeeAck.set(key, worstAck([prev, st]));
  }
  ackTotal = payeeAck.size;
  ackAcknowledged = Array.from(payeeAck.values()).filter((s) => s === "acknowledged").length;
  const totals = {
    totalDueUsd: batchList.reduce((s, b) => s + (Number(b.total_due_usd) || 0), 0),
    totalHostSalaryUsd: batchList.reduce(
      (s, b) => s + (Number(b.total_host_salary_usd) || 0),
      0
    ),
    totalTlCommissionUsd: batchList.reduce(
      (s, b) => s + (Number(b.total_tl_commission_usd) || 0),
      0
    ),
    outstandingDueUsd: batchList.filter((b) => b.status === "pending_admin_pay").reduce((s, b) => s + (Number(b.total_due_usd) || 0), 0),
    batchCount: batchList.length,
    pendingAdminPayCount: batchList.filter((b) => b.status === "pending_admin_pay").length,
    adminPaidCount: batchList.filter(
      (b) => b.status === "admin_paid" || b.status === "tl_confirmed"
    ).length,
    fullyAckedBatchCount: batchList.filter((b) => b.status === "tl_confirmed").length,
    unreconciledCount: batchList.filter(
      (b) => b.status !== "cancelled" && b.reconcile_status !== "reconciled"
    ).length,
    reconciledCount: batchList.filter(
      (b) => b.status !== "cancelled" && b.reconcile_status === "reconciled"
    ).length
  };
  const canMarkPaid = batchList.some(
    (b) => b.status === "pending_admin_pay" && b.reconcile_status === "reconciled"
  );
  const paymentReferences = Array.from(
    new Set(
      batchList.map((b) => b.payment_reference ? String(b.payment_reference) : "").filter(Boolean)
    )
  );
  return {
    success: true,
    data: {
      period: {
        id: period.id,
        cycleType: period.cycle_type,
        periodStart: period.period_start,
        periodEnd: period.period_end,
        status: period.status,
        closedAt: period.closed_at ?? null,
        configSnapshot: period.config_snapshot || {}
      },
      tlSections,
      directHosts,
      totals,
      ackProgress: { acknowledged: ackAcknowledged, total: ackTotal },
      canMarkPaid,
      paymentReferences
    }
  };
}
async function listSalaryPeriods(opts) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: "Supabase admin client unavailable" };
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 100);
  const { data: periods, error } = await client.from("settlement_periods").select("id, cycle_type, period_start, period_end, status, closed_at").eq("status", "closed").order("period_end", { ascending: false }).limit(limit);
  if (error) return { success: false, error: error.message };
  const out = [];
  for (const p of periods || []) {
    const detail = await loadSalaryPeriodDetail(p.id);
    if (!detail.success || !detail.data) continue;
    const d = detail.data;
    out.push({
      periodId: d.period.id,
      cycleType: d.period.cycleType,
      periodStart: d.period.periodStart,
      periodEnd: d.period.periodEnd,
      status: d.period.status,
      closedAt: d.period.closedAt,
      totalDueUsd: d.totals.totalDueUsd,
      outstandingDueUsd: d.totals.outstandingDueUsd,
      batchCount: d.totals.batchCount,
      pendingAdminPayCount: d.totals.pendingAdminPayCount,
      adminPaidCount: d.totals.adminPaidCount,
      unreconciledCount: d.totals.unreconciledCount,
      reconciledCount: d.totals.reconciledCount,
      ackProgress: d.ackProgress,
      canMarkPaid: d.canMarkPaid
    });
  }
  return { success: true, periods: out };
}

// server/finance/salaryEstimatePreview.ts
init_supabaseAdmin();
function computeHostTargetBonus2(opts) {
  const tier = computePerformanceTier(opts.hours, opts.totalCoins, opts.thresholds);
  const metBronze = opts.hours >= opts.thresholds.bronzeHours && opts.totalCoins >= opts.thresholds.bronzeCoins;
  let bonusUsd = 0;
  if (tier === "gold" || tier === "silver") {
    bonusUsd = targetBonusUsdForTier(tier, opts.thresholds);
  } else if (metBronze) {
    bonusUsd = targetBonusUsdForTier("bronze", opts.thresholds);
  }
  return {
    tier,
    bonusUsd,
    bonusCoins: bonusUsd > 0 ? usdToCoins(bonusUsd, opts.fxRatio) : 0
  };
}
function linesToPayeeRow(batchId, payeeUserId, role, lines, profile) {
  const mine = lines.filter((l) => l.payeeUserId === payeeUserId && l.payeeRole === role);
  const components = mine.map((l) => ({
    component: l.component,
    amountCoins: l.amountCoins,
    amountUsd: l.amountUsd
  }));
  return {
    userId: payeeUserId,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    role,
    amountCoins: components.reduce((s, c) => s + c.amountCoins, 0),
    amountUsd: components.reduce((s, c) => s + c.amountUsd, 0),
    ackStatus: "pending",
    batchId,
    components
  };
}
function batchToSections(batches, profiles) {
  const tlSections = [];
  const directHosts = [];
  batches.forEach((batch, idx) => {
    const batchId = `estimate-${idx + 1}`;
    if (batch.batchKind === "team_leader_bundle" && batch.teamLeaderId) {
      const hostIds = [
        ...new Set(
          batch.lineItems.filter((l) => l.payeeRole === "host").map((l) => l.payeeUserId)
        )
      ];
      const hosts = hostIds.map(
        (id) => linesToPayeeRow(batchId, id, "host", batch.lineItems, profiles.get(id))
      ).filter((h) => h.amountUsd > 0 || h.amountCoins > 0 || h.components.length > 0).sort((a, b) => b.amountUsd - a.amountUsd);
      const teamLeader = linesToPayeeRow(
        batchId,
        batch.teamLeaderId,
        "team_leader",
        batch.lineItems,
        profiles.get(batch.teamLeaderId)
      );
      tlSections.push({
        teamLeaderId: batch.teamLeaderId,
        teamLeader: teamLeader.amountUsd > 0 || teamLeader.components.length > 0 ? teamLeader : null,
        hosts,
        totalHostSalaryUsd: batch.totalHostSalaryUsd,
        totalTlCommissionUsd: batch.totalTlCommissionUsd,
        totalDueUsd: batch.totalDueUsd,
        batchId,
        batchStatus: "estimate",
        ackProgress: { acknowledged: 0, total: hosts.length + (teamLeader.components.length ? 1 : 0) }
      });
    } else {
      const hostId = batch.payeeUserId;
      const row = linesToPayeeRow(batchId, hostId, "host", batch.lineItems, profiles.get(hostId));
      if (row.amountUsd > 0 || row.components.length > 0) directHosts.push(row);
    }
  });
  tlSections.sort((a, b) => b.totalDueUsd - a.totalDueUsd);
  directHosts.sort((a, b) => b.amountUsd - a.amountUsd);
  return { tlSections, directHosts };
}
async function buildOpenPeriodEstimate(at = /* @__PURE__ */ new Date()) {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, error: "Supabase admin not configured" };
  }
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: "Supabase admin client unavailable" };
  const config = await loadFinanceSystemConfig();
  const ensured = await ensureOpenPeriod({ at, config });
  if (!ensured.success || !ensured.period) {
    return { success: false, error: ensured.error || "No open settlement period" };
  }
  const period = ensured.period;
  const periodStart = period.periodStart;
  const periodEndExclusive = toIso(at);
  const periodId = period.id;
  const snapshot = freezeFinanceConfigSnapshot(config, { includeFrozenAt: false });
  const fxRatio = Number(snapshot.coin_usd_peg) || config.coinUsdPeg;
  const thresholds = config.thresholds;
  const accrual = await aggregateWalletLedgerEarnings({
    periodStart,
    periodEnd: periodEndExclusive,
    client
  });
  if (!accrual.success) {
    return { success: false, error: accrual.error || "Accrual query failed" };
  }
  const { data: metricsRows, error: metricsError } = await client.from("creator_metrics").select("*");
  if (metricsError) return { success: false, error: metricsError.message };
  const metricsList = metricsRows || [];
  const userIds = Array.from(accrual.byUser.keys());
  for (const m of metricsList) {
    if (m.creator_id && !accrual.byUser.has(m.creator_id)) {
      userIds.push(String(m.creator_id));
    }
  }
  const profileById = /* @__PURE__ */ new Map();
  if (userIds.length) {
    const chunkSize = 200;
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      const { data: profiles, error: profileError } = await client.from("profiles").select("id, team_leader_id, created_by_id, role, coin_earn_override_rate, name, email").in("id", chunk);
      if (profileError) return { success: false, error: profileError.message };
      for (const p of profiles || []) {
        profileById.set(String(p.id), {
          teamLeaderId: p.team_leader_id || p.created_by_id || null,
          role: String(p.role || ""),
          coinEarnOverrideRate: p.coin_earn_override_rate != null ? Number(p.coin_earn_override_rate) : null,
          name: p.name != null ? String(p.name) : null,
          email: p.email != null ? String(p.email) : null
        });
      }
    }
  }
  const metricsByCreator = /* @__PURE__ */ new Map();
  const metricsHoursCoins = /* @__PURE__ */ new Map();
  for (const m of metricsList) {
    const cid = String(m.creator_id);
    metricsByCreator.set(cid, m);
    metricsHoursCoins.set(cid, {
      hours: Number(m.active_online_hours || 0),
      coins: Number(m.total_target_coins) || Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0)
    });
  }
  const burnRates = resolveEconomyBurnRates(snapshot);
  const trueUpAgg = await aggregateHostCallBurnForTrueUp({
    periodStart,
    periodEnd: periodEndExclusive,
    periodId,
    client
  });
  if (!trueUpAgg.success) {
    return { success: false, error: trueUpAgg.error || "True-up accrual failed" };
  }
  const creatorHostIds = Array.from(
    /* @__PURE__ */ new Set([
      ...Array.from(trueUpAgg.byHost.keys()),
      ...Array.from(metricsByCreator.keys()).filter((id) => {
        const role = profileById.get(id)?.role || "";
        return role === "female_creator" || role === "female_host";
      })
    ])
  ).filter((id) => {
    const role = profileById.get(id)?.role || "";
    if (!role) return true;
    return role === "female_creator" || role === "female_host";
  });
  const overrideByHost = /* @__PURE__ */ new Map();
  for (const id of creatorHostIds) {
    overrideByHost.set(id, profileById.get(id)?.coinEarnOverrideRate);
  }
  const trueUpPlans = planHostShareTrueUps({
    hostIds: creatorHostIds,
    aggByHost: trueUpAgg.byHost,
    metricsByCreator: metricsHoursCoins,
    overrideByHost,
    thresholds,
    targetSharePercent: burnRates.femaleHostTargetSharePercent,
    burnConfig: snapshot
  });
  const hostTrueUpByUser = /* @__PURE__ */ new Map();
  for (const plan of trueUpPlans) {
    if (plan.skippedAlreadyPosted) {
      const already = trueUpAgg.byHost.get(plan.hostId)?.alreadyTrueUpCoins || 0;
      if (already > 0) hostTrueUpByUser.set(plan.hostId, already);
      continue;
    }
    if (plan.trueUpCoins > 0) hostTrueUpByUser.set(plan.hostId, plan.trueUpCoins);
  }
  const hostIds = /* @__PURE__ */ new Set();
  const tlCommission = /* @__PURE__ */ new Map();
  const hostBonusByUser = /* @__PURE__ */ new Map();
  for (const [userId, totals] of accrual.byUser.entries()) {
    if (totals.hostEarnCoins > 0 || totals.giftHostEarnCoins > 0) {
      hostIds.add(userId);
    }
    if (totals.tlEarnCoins > 0) {
      tlCommission.set(userId, (tlCommission.get(userId) || 0) + totals.tlEarnCoins);
    }
  }
  for (const id of hostTrueUpByUser.keys()) hostIds.add(id);
  for (const m of metricsList) {
    const cid = String(m.creator_id);
    const hours = Number(m.active_online_hours || 0);
    const coins = Number(m.total_target_coins) || Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0);
    const bonus = computeHostTargetBonus2({
      hours,
      totalCoins: coins,
      thresholds,
      fxRatio
    });
    if (bonus.bonusUsd > 0) {
      hostIds.add(cid);
      hostBonusByUser.set(cid, { ...bonus, hours, coins });
    } else if (hours > 0 || coins > 0) {
      hostBonusByUser.set(cid, { ...bonus, hours, coins });
    }
  }
  const builtAccruals = [];
  for (const hostId of hostIds) {
    const totals = accrual.byUser.get(hostId);
    const profile = profileById.get(hostId);
    const metrics = metricsByCreator.get(hostId);
    const teamLeaderId = metrics?.agency_leader_id || profile?.teamLeaderId || null;
    let bonus = hostBonusByUser.get(hostId);
    if (!bonus && metrics) {
      const hours = Number(metrics.active_online_hours || 0);
      const coins = Number(metrics.total_target_coins) || Number(metrics.coins_earned_from_calls || 0) + Number(metrics.coins_earned_from_gifts || 0);
      bonus = {
        ...computeHostTargetBonus2({
          hours,
          totalCoins: coins,
          thresholds,
          fxRatio
        }),
        hours,
        coins
      };
      hostBonusByUser.set(hostId, bonus);
    }
    builtAccruals.push({
      userId: hostId,
      teamLeaderId,
      role: "host",
      callEarningsCoins: totals?.callHostEarnCoins || 0,
      giftEarningsCoins: totals?.giftHostEarnCoins || 0,
      targetShareTrueUpCoins: hostTrueUpByUser.get(hostId) || 0,
      targetBonusCoins: bonus?.bonusCoins || 0,
      targetBonusUsd: bonus?.bonusUsd || 0,
      breakdown: {
        performanceTier: bonus?.tier || "bronze",
        activeOnlineHours: bonus?.hours ?? Number(metrics?.active_online_hours || 0),
        totalTargetCoins: bonus?.coins ?? 0
      }
    });
  }
  for (const [tlId, coins] of tlCommission.entries()) {
    builtAccruals.push({
      userId: tlId,
      role: "team_leader",
      tlCommissionCoins: coins,
      breakdown: { source: "wallet_ledger.TL_EARN" }
    });
  }
  for (const a of builtAccruals) {
    if (a.role === "host" && a.teamLeaderId && !tlCommission.has(a.teamLeaderId)) {
      if (!builtAccruals.some((x) => x.role === "team_leader" && x.userId === a.teamLeaderId)) {
        builtAccruals.push({
          userId: a.teamLeaderId,
          role: "team_leader",
          tlCommissionCoins: 0
        });
      }
    }
  }
  const built = buildSettlementBatches({
    accruals: builtAccruals,
    fxRatio
  }).filter((b) => b.totalDueUsd > 0 || b.lineItems.length > 0);
  const payeeIds = /* @__PURE__ */ new Set();
  for (const b of built) {
    payeeIds.add(b.payeeUserId);
    if (b.teamLeaderId) payeeIds.add(b.teamLeaderId);
    for (const li of b.lineItems) payeeIds.add(li.payeeUserId);
  }
  const missing = [...payeeIds].filter((id) => !profileById.has(id));
  if (missing.length) {
    const { data: extra } = await client.from("profiles").select("id, name, email, team_leader_id, created_by_id, role, coin_earn_override_rate").in("id", missing);
    for (const p of extra || []) {
      profileById.set(String(p.id), {
        teamLeaderId: p.team_leader_id || p.created_by_id || null,
        role: String(p.role || ""),
        coinEarnOverrideRate: p.coin_earn_override_rate != null ? Number(p.coin_earn_override_rate) : null,
        name: p.name != null ? String(p.name) : null,
        email: p.email != null ? String(p.email) : null
      });
    }
  }
  const profileMap = new Map(
    [...profileById.entries()].map(([id, p]) => [id, { name: p.name, email: p.email }])
  );
  const { tlSections, directHosts } = batchToSections(built, profileMap);
  const allPayeeIds = Array.from(
    /* @__PURE__ */ new Set([
      ...tlSections.flatMap((s) => [
        s.teamLeaderId,
        ...s.teamLeader ? [s.teamLeader.userId] : [],
        ...s.hosts.map((h) => h.userId)
      ]),
      ...directHosts.map((h) => h.userId)
    ])
  );
  const payoutMap = await loadSalaryPayoutDetailsByUserIds(allPayeeIds, { mask: false });
  for (const section of tlSections) {
    if (section.teamLeader) {
      section.teamLeader = attachPayoutToPayee(section.teamLeader, payoutMap);
    }
    section.hosts = section.hosts.map((h) => attachPayoutToPayee(h, payoutMap));
  }
  for (let i = 0; i < directHosts.length; i++) {
    directHosts[i] = attachPayoutToPayee(directHosts[i], payoutMap);
  }
  const totalHostSalaryUsd = built.reduce((s, b) => s + b.totalHostSalaryUsd, 0);
  const totalTlCommissionUsd = built.reduce((s, b) => s + b.totalTlCommissionUsd, 0);
  const totalDueUsd = built.reduce((s, b) => s + b.totalDueUsd, 0);
  return {
    success: true,
    data: {
      isEstimate: true,
      asOf: periodEndExclusive,
      periodClock: {
        periodId,
        cycleType: period.cycleType,
        periodStart: String(period.periodStart),
        periodEnd: String(period.periodEnd),
        closeScheduledAt: period.closeScheduledAt ? String(period.closeScheduledAt) : null,
        periodStatus: period.status,
        accrualEnd: periodEndExclusive
      },
      tlSections,
      directHosts,
      totals: {
        totalDueUsd: Math.round(totalDueUsd * 1e4) / 1e4,
        totalHostSalaryUsd: Math.round(totalHostSalaryUsd * 1e4) / 1e4,
        totalTlCommissionUsd: Math.round(totalTlCommissionUsd * 1e4) / 1e4,
        outstandingDueUsd: Math.round(totalDueUsd * 1e4) / 1e4,
        batchCount: built.length,
        pendingAdminPayCount: built.length,
        adminPaidCount: 0,
        fullyAckedBatchCount: 0
      },
      disclaimer: "Estimate only \u2014 accrued from period start until now. Not payable until period close creates settlement batches."
    }
  };
}
function filterForTeamLeader(data, tlId) {
  const section = data.tlSections.find((s) => s.teamLeaderId === tlId);
  const tlSections = section ? [section] : [];
  const totals = {
    totalDueUsd: section?.totalDueUsd || 0,
    totalHostSalaryUsd: section?.totalHostSalaryUsd || 0,
    totalTlCommissionUsd: section?.totalTlCommissionUsd || 0,
    outstandingDueUsd: section?.totalDueUsd || 0,
    batchCount: section ? 1 : 0,
    pendingAdminPayCount: section ? 1 : 0,
    adminPaidCount: 0,
    fullyAckedBatchCount: 0
  };
  return {
    ...data,
    tlSections,
    directHosts: [],
    totals
  };
}
function filterForHost(data, hostId) {
  const hosts = [];
  for (const s of data.tlSections) {
    const hit = s.hosts.find((h) => h.userId === hostId);
    if (hit) hosts.push(hit);
  }
  const direct = data.directHosts.filter((h) => h.userId === hostId);
  const all = [...hosts, ...direct];
  const totalUsd = all.reduce((s, h) => s + h.amountUsd, 0);
  return {
    ...data,
    tlSections: [],
    directHosts: all,
    totals: {
      totalDueUsd: Math.round(totalUsd * 1e4) / 1e4,
      totalHostSalaryUsd: Math.round(totalUsd * 1e4) / 1e4,
      totalTlCommissionUsd: 0,
      outstandingDueUsd: Math.round(totalUsd * 1e4) / 1e4,
      batchCount: all.length ? 1 : 0,
      pendingAdminPayCount: all.length ? 1 : 0,
      adminPaidCount: 0,
      fullyAckedBatchCount: 0
    }
  };
}
async function buildSalaryEstimatePreview(opts) {
  const built = await buildOpenPeriodEstimate(opts.at ?? /* @__PURE__ */ new Date());
  if (!built.success || !built.data) return built;
  if (opts.scope === "admin") return built;
  const actorId = String(opts.actorUserId || "").trim();
  if (!actorId) return { success: false, error: "Unauthorized" };
  if (opts.scope === "team_leader") {
    const scoped = filterForTeamLeader(built.data, actorId);
    const hostIds = scoped.tlSections.flatMap((s) => s.hosts.map((h) => h.userId));
    if (hostIds.length) {
      const masked = await loadSalaryPayoutDetailsByUserIds(hostIds, { mask: true });
      for (const section of scoped.tlSections) {
        section.hosts = section.hosts.map((h) => attachPayoutToPayee(h, masked));
      }
    }
    return { success: true, data: scoped };
  }
  return { success: true, data: filterForHost(built.data, actorId) };
}

// server/finance/salaryExport.ts
var import_exceljs = __toESM(require("exceljs"), 1);
var import_jspdf = require("jspdf");
var import_jspdf_autotable = __toESM(require("jspdf-autotable"), 1);

// shared/finance/hostEarningsBreakdown.ts
var EMPTY_HOST_EARNINGS_BREAKDOWN = {
  callEarningsCoins: 0,
  callEarningsUsd: 0,
  giftEarningsCoins: 0,
  giftEarningsUsd: 0,
  targetShareTrueUpCoins: 0,
  targetShareTrueUpUsd: 0,
  targetBonusCoins: 0,
  targetBonusUsd: 0,
  totalCoins: 0,
  totalUsd: 0
};
function labelSettlementComponent(component) {
  switch (component) {
    case "call_earnings":
      return "Call earnings (base)";
    case "gift_earnings":
      return "Gift earnings";
    case "target_share_trueup":
      return "Target share true-up";
    case "target_bonus":
      return "Target cash bonus";
    case "tl_commission":
      return "Agency commission";
    default:
      return component.replace(/_/g, " ");
  }
}
function add(a, patch) {
  const next = { ...a };
  for (const [k, v] of Object.entries(patch)) {
    const key = k;
    next[key] = (Number(next[key]) || 0) + (Number(v) || 0);
  }
  next.totalCoins = next.callEarningsCoins + next.giftEarningsCoins + next.targetShareTrueUpCoins + next.targetBonusCoins;
  next.totalUsd = next.callEarningsUsd + next.giftEarningsUsd + next.targetShareTrueUpUsd + next.targetBonusUsd;
  return next;
}
function summarizeHostSettlementLines(lines) {
  let out = { ...EMPTY_HOST_EARNINGS_BREAKDOWN };
  for (const li of lines) {
    const coins = Number(li.amountCoins ?? li.amount_coins) || 0;
    const usd = Number(li.amountUsd ?? li.amount_usd) || 0;
    const c = String(li.component || "");
    if (c === "call_earnings") {
      out = add(out, { callEarningsCoins: coins, callEarningsUsd: usd });
    } else if (c === "gift_earnings") {
      out = add(out, { giftEarningsCoins: coins, giftEarningsUsd: usd });
    } else if (c === "target_share_trueup") {
      out = add(out, { targetShareTrueUpCoins: coins, targetShareTrueUpUsd: usd });
    } else if (c === "target_bonus") {
      out = add(out, { targetBonusCoins: coins, targetBonusUsd: usd });
    } else if (c !== "tl_commission") {
      out = add(out, { callEarningsCoins: coins, callEarningsUsd: usd });
    }
  }
  return out;
}

// server/finance/salaryExport.ts
function formatUsd(n) {
  return Number(n || 0).toFixed(4);
}
function componentCols(payee) {
  if (!payee) {
    return { call: "0", gift: "0", trueUp: "0", tierBonus: "0", coins: 0 };
  }
  if (payee.role === "team_leader") {
    return {
      call: formatUsd(payee.amountUsd),
      gift: "0",
      trueUp: "0",
      tierBonus: "0",
      coins: payee.amountCoins
    };
  }
  const b = summarizeHostSettlementLines(payee.components || []);
  return {
    call: formatUsd(b.callEarningsUsd),
    gift: formatUsd(b.giftEarningsUsd),
    trueUp: formatUsd(b.targetShareTrueUpUsd),
    tierBonus: formatUsd(b.targetBonusUsd),
    coins: payee.amountCoins
  };
}
function formatWindow(start, end) {
  try {
    return `${new Date(start).toISOString().slice(0, 10)} \u2192 ${new Date(end).toISOString().slice(0, 10)} UTC`;
  } catch {
    return `${start} \u2192 ${end}`;
  }
}
function pegFromDetail(detail) {
  const snap = detail.period.configSnapshot || {};
  const peg = Number(snap.coin_usd_peg ?? snap.female_payout_ratio_usd ?? 0);
  return peg ? peg.toFixed(6) : "\u2014";
}
async function buildSalaryPeriodXlsx(periodId) {
  const loaded = await loadSalaryPeriodDetail(periodId);
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error || "Failed to load period" };
  }
  const d = loaded.data;
  const wb = new import_exceljs.default.Workbook();
  wb.creator = "Minglecall Finance";
  wb.created = /* @__PURE__ */ new Date();
  const sheet = wb.addWorksheet("Salary disbursement");
  sheet.columns = [
    { header: "Section", key: "section", width: 22 },
    { header: "Role", key: "role", width: 14 },
    { header: "Name", key: "name", width: 24 },
    { header: "User ID", key: "userId", width: 38 },
    { header: "Email", key: "email", width: 28 },
    { header: "Payout method", key: "payoutMethod", width: 14 },
    { header: "Payout country", key: "payoutCountry", width: 12 },
    { header: "Payout details", key: "payoutDetails", width: 48 },
    { header: "Call USD", key: "call", width: 12 },
    { header: "Gift USD", key: "gift", width: 12 },
    { header: "True-up USD", key: "trueUp", width: 12 },
    { header: "Tier bonus USD", key: "tierBonus", width: 14 },
    { header: "Amount USD", key: "usd", width: 14 },
    { header: "Amount coins", key: "coins", width: 14 },
    { header: "Ack status", key: "ack", width: 14 },
    { header: "Batch ID", key: "batchId", width: 38 }
  ];
  sheet.insertRow(1, ["Minglecall \u2014 Salary disbursement"]);
  sheet.insertRow(2, [
    `Period: ${formatWindow(d.period.periodStart, d.period.periodEnd)} \xB7 ${d.period.cycleType}`
  ]);
  sheet.insertRow(3, [
    `Peg: ${pegFromDetail(d)} \xB7 Generated: ${(/* @__PURE__ */ new Date()).toISOString()} \xB7 Payment refs: ${d.paymentReferences.join(", ") || "\u2014"}`
  ]);
  sheet.insertRow(4, [
    `Totals \u2014 Due $${formatUsd(d.totals.totalDueUsd)} \xB7 Hosts $${formatUsd(
      d.totals.totalHostSalaryUsd
    )} \xB7 TL $${formatUsd(d.totals.totalTlCommissionUsd)} \xB7 Ack ${d.ackProgress.acknowledged}/${d.ackProgress.total}`
  ]);
  sheet.insertRow(5, []);
  const headerRow = sheet.getRow(6);
  headerRow.values = [
    "Section",
    "Role",
    "Name",
    "User ID",
    "Email",
    "Payout method",
    "Payout country",
    "Payout details",
    "Call USD",
    "Gift USD",
    "True-up USD",
    "Tier bonus USD",
    "Amount USD",
    "Amount coins",
    "Ack status",
    "Batch ID"
  ];
  headerRow.font = { bold: true };
  const payoutCols = (p) => [
    p.payout?.methodLabel || "\u2014",
    p.payout?.countryCode || "\u2014",
    p.payout?.summary || "No payout card"
  ];
  let rowIdx = 7;
  for (const section of d.tlSections) {
    const sectionLabel = `TL ${section.teamLeader?.name || section.teamLeaderId.slice(0, 8)}`;
    if (section.teamLeader) {
      const tl = section.teamLeader;
      const c = componentCols(tl);
      sheet.getRow(rowIdx).values = [
        sectionLabel,
        "team_leader",
        tl.name || "",
        tl.userId,
        tl.email || "",
        ...payoutCols(tl),
        c.call,
        c.gift,
        c.trueUp,
        c.tierBonus,
        formatUsd(tl.amountUsd),
        tl.amountCoins,
        tl.ackStatus,
        tl.batchId
      ];
      rowIdx += 1;
    }
    for (const host of section.hosts) {
      const c = componentCols(host);
      sheet.getRow(rowIdx).values = [
        sectionLabel,
        "host",
        host.name || "",
        host.userId,
        host.email || "",
        ...payoutCols(host),
        c.call,
        c.gift,
        c.trueUp,
        c.tierBonus,
        formatUsd(host.amountUsd),
        host.amountCoins,
        host.ackStatus,
        host.batchId
      ];
      rowIdx += 1;
    }
  }
  for (const host of d.directHosts) {
    const c = componentCols(host);
    sheet.getRow(rowIdx).values = [
      "Direct hosts",
      "host",
      host.name || "",
      host.userId,
      host.email || "",
      ...payoutCols(host),
      c.call,
      c.gift,
      c.trueUp,
      c.tierBonus,
      formatUsd(host.amountUsd),
      host.amountCoins,
      host.ackStatus,
      host.batchId
    ];
    rowIdx += 1;
  }
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = `salary-${d.period.cycleType}-${String(d.period.periodStart).slice(0, 10)}.xlsx`;
  return { success: true, buffer, filename };
}
async function buildSalaryPeriodPdf(periodId) {
  const loaded = await loadSalaryPeriodDetail(periodId);
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error || "Failed to load period" };
  }
  const d = loaded.data;
  const doc = new import_jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text("Minglecall \u2014 Salary disbursement", 40, 36);
  doc.setFontSize(9);
  doc.text(
    `Period: ${formatWindow(d.period.periodStart, d.period.periodEnd)} \xB7 ${d.period.cycleType}`,
    40,
    52
  );
  doc.text(
    `Peg: ${pegFromDetail(d)} \xB7 Generated: ${(/* @__PURE__ */ new Date()).toISOString()} \xB7 Refs: ${d.paymentReferences.join(", ") || "\u2014"}`,
    40,
    66
  );
  doc.text(
    `Totals \u2014 Due $${formatUsd(d.totals.totalDueUsd)} \xB7 Hosts $${formatUsd(
      d.totals.totalHostSalaryUsd
    )} \xB7 TL $${formatUsd(d.totals.totalTlCommissionUsd)} \xB7 Ack ${d.ackProgress.acknowledged}/${d.ackProgress.total}`,
    40,
    80
  );
  const body = [];
  for (const section of d.tlSections) {
    const sectionLabel = `TL ${section.teamLeader?.name || section.teamLeaderId.slice(0, 8)}`;
    if (section.teamLeader) {
      const tl = section.teamLeader;
      const c = componentCols(tl);
      body.push([
        sectionLabel,
        "TL",
        tl.name || "\u2014",
        tl.payout?.summary || "No payout card",
        c.call,
        c.gift,
        c.trueUp,
        c.tierBonus,
        formatUsd(tl.amountUsd),
        tl.ackStatus
      ]);
    }
    for (const host of section.hosts) {
      const c = componentCols(host);
      body.push([
        sectionLabel,
        "Host",
        host.name || "\u2014",
        host.payout?.summary || "No payout card",
        c.call,
        c.gift,
        c.trueUp,
        c.tierBonus,
        formatUsd(host.amountUsd),
        host.ackStatus
      ]);
    }
  }
  for (const host of d.directHosts) {
    const c = componentCols(host);
    body.push([
      "Direct hosts",
      "Host",
      host.name || "\u2014",
      host.payout?.summary || "No payout card",
      c.call,
      c.gift,
      c.trueUp,
      c.tierBonus,
      formatUsd(host.amountUsd),
      host.ackStatus
    ]);
  }
  (0, import_jspdf_autotable.default)(doc, {
    startY: 96,
    head: [
      [
        "Section",
        "Role",
        "Name",
        "Payout",
        "Call",
        "Gift",
        "True-up",
        "Tier bonus",
        "Total USD",
        "Ack"
      ]
    ],
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] }
  });
  const arrayBuffer = doc.output("arraybuffer");
  const buffer = Buffer.from(arrayBuffer);
  const filename = `salary-${d.period.cycleType}-${String(d.period.periodStart).slice(0, 10)}.pdf`;
  return { success: true, buffer, filename };
}

// server/finance/earningsOverview.ts
init_supabaseAdmin();

// shared/finance/salaryComponents.ts
var HOST_SALARY_LINE_COMPONENTS = [
  "call_earnings",
  "gift_earnings",
  "target_share_trueup",
  "target_bonus"
];
var HOST_SALARY_FINANCIAL_ENTRY_TYPES = [
  "HOST_EARN",
  "TARGET_SHARE_TRUEUP",
  "TARGET_BONUS"
];
var HOST_SALARY_WALLET_TYPES = ["HOST_EARN", "TARGET_SHARE_TRUEUP"];
var NON_SALARY_REWARD_WALLET_TYPES = [
  "REWARD_STREAK",
  "REWARD_MISSION",
  "REWARD_MASTER_CHEST"
];
function isGiftWalletMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata;
  const kind = String(m.kind || m.source || m.category || "").toLowerCase();
  return kind === "gift" || kind === "virtual_gift" || m.is_gift === true;
}
function isNonSalaryRewardType(transactionType) {
  return NON_SALARY_REWARD_WALLET_TYPES.includes(String(transactionType));
}
function isHostSalaryFinancialEntryType(entryType) {
  return HOST_SALARY_FINANCIAL_ENTRY_TYPES.includes(String(entryType));
}
function labelEarningsMoneyCategory(cat) {
  switch (cat) {
    case "call":
      return "Call earn";
    case "gift":
      return "Gift earn";
    case "true_up":
      return "Share true-up";
    case "tier_bonus":
      return "Tier cash bonus";
    case "tl_commission":
      return "Agency commission";
    case "platform":
      return "Platform retained";
    case "reward":
      return "Reward (not salary)";
    default:
      return "Other";
  }
}
function categoryFromSettlementComponent(component) {
  switch (String(component)) {
    case "call_earnings":
      return "call";
    case "gift_earnings":
      return "gift";
    case "target_share_trueup":
      return "true_up";
    case "target_bonus":
      return "tier_bonus";
    case "tl_commission":
      return "tl_commission";
    default:
      return "other";
  }
}

// shared/finance/groupWalletLedgerByCall.ts
function resolveSessionCallId(row) {
  const meta = row.metadata;
  if (meta && typeof meta === "object") {
    const sid = String(meta.session_call_id || "").trim();
    if (sid) return sid;
  }
  const minute = Number(row.billingMinute);
  const callId = String(row.callId || "").trim();
  if (!callId) return null;
  if (Number.isFinite(minute) && minute >= 1) return callId;
  return null;
}
function isCompositeEligibleType(entryType) {
  const t = String(entryType || "");
  return t === "CALL_DEBIT" || t === "GIFT_DEBIT" || t === "HOST_EARN" || t === "TL_EARN";
}
function pickPrimaryEntryType(types) {
  if (types.has("CALL_DEBIT")) return "CALL_DEBIT";
  if (types.has("HOST_EARN")) return "HOST_EARN";
  if (types.has("TL_EARN")) return "TL_EARN";
  if (types.has("GIFT_DEBIT")) return "GIFT_DEBIT";
  return [...types][0] || "HOST_EARN";
}
function pickCategory(acc) {
  if (acc.giftCoins > 0 && acc.callCoins <= 0) return "gift";
  if (acc.callCoins > 0) {
    if (acc.entryType === "CALL_DEBIT" || acc.entryType === "GIFT_DEBIT") return "platform";
    if (acc.entryType === "TL_EARN") return "tl_commission";
    return "call";
  }
  if (acc.trueUpCoins > 0) return "true_up";
  if (acc.rewardCoins > 0) return "reward";
  if (acc.entryType === "CALL_DEBIT" || acc.entryType === "GIFT_DEBIT") return "platform";
  if (acc.entryType === "TL_EARN") return "tl_commission";
  return "other";
}
function toStandaloneRow(row) {
  const minute = row.billingMinute != null && Number.isFinite(Number(row.billingMinute)) ? Number(row.billingMinute) : null;
  return {
    id: String(row.id),
    createdAt: row.createdAt,
    entryType: String(row.entryType || ""),
    userId: row.userId ? String(row.userId) : null,
    userName: row.userName ?? null,
    teamLeaderId: row.teamLeaderId ?? null,
    callId: row.callId ? String(row.callId) : null,
    hostId: row.hostId ? String(row.hostId) : null,
    hostName: row.hostName ?? null,
    billingMinute: minute,
    billedMinutes: minute != null && minute >= 1 ? 1 : null,
    minuteFrom: minute != null && minute >= 1 ? minute : null,
    minuteTo: minute != null && minute >= 1 ? minute : null,
    grouped: false,
    firstAt: row.createdAt,
    lastAt: row.createdAt,
    amountCoins: Number(row.amountCoins) || 0,
    amountUsd: Number(row.amountUsd) || 0,
    fxRatio: Number(row.fxRatio) || 0,
    source: row.source || "wallet",
    category: row.category || "other",
    inSalary: row.inSalary !== false,
    callCoins: Number(row.callCoins) || 0,
    callUsd: Number(row.callUsd) || 0,
    giftCoins: Number(row.giftCoins) || 0,
    giftUsd: Number(row.giftUsd) || 0,
    trueUpCoins: Number(row.trueUpCoins) || 0,
    trueUpUsd: Number(row.trueUpUsd) || 0,
    tierBonusCoins: Number(row.tierBonusCoins) || 0,
    tierBonusUsd: Number(row.tierBonusUsd) || 0,
    rewardCoins: Number(row.rewardCoins) || 0,
    rewardUsd: Number(row.rewardUsd) || 0,
    hostEarnCoins: Number(row.hostEarnCoins) || 0,
    hostEarnUsd: Number(row.hostEarnUsd) || 0,
    tlEarnCoins: Number(row.tlEarnCoins) || 0,
    tlEarnUsd: Number(row.tlEarnUsd) || 0,
    platformRetainedCoins: Number(row.platformRetainedCoins) || 0,
    platformRetainedUsd: Number(row.platformRetainedUsd) || 0
  };
}
function groupWalletLedgerByCall(rows, opts) {
  const sortDesc = opts?.sortDesc !== false;
  const groups = /* @__PURE__ */ new Map();
  const standalone = [];
  const orderKeys = [];
  for (const row of rows) {
    const type = String(row.entryType || "");
    const sessionCallId = resolveSessionCallId(row);
    if (!sessionCallId || !isCompositeEligibleType(type)) {
      standalone.push(toStandaloneRow(row));
      continue;
    }
    const key = `${sessionCallId}|${String(row.userId || "")}`;
    const minuteRaw = Number(row.billingMinute);
    const minute = Number.isFinite(minuteRaw) && minuteRaw >= 1 ? Math.floor(minuteRaw) : null;
    const createdAt = String(row.createdAt || "");
    const existing = groups.get(key);
    if (!existing) {
      orderKeys.push(key);
      groups.set(key, {
        callId: sessionCallId,
        userId: row.userId ? String(row.userId) : null,
        userName: row.userName ?? null,
        teamLeaderId: row.teamLeaderId ?? null,
        hostId: row.hostId ? String(row.hostId) : null,
        hostName: row.hostName ?? null,
        entryTypes: /* @__PURE__ */ new Set([type]),
        inSalary: row.inSalary !== false,
        fxRatio: Number(row.fxRatio) || 0,
        source: row.source || "wallet",
        amountCoins: Number(row.amountCoins) || 0,
        amountUsd: Number(row.amountUsd) || 0,
        callCoins: Number(row.callCoins) || 0,
        callUsd: Number(row.callUsd) || 0,
        giftCoins: Number(row.giftCoins) || 0,
        giftUsd: Number(row.giftUsd) || 0,
        trueUpCoins: Number(row.trueUpCoins) || 0,
        trueUpUsd: Number(row.trueUpUsd) || 0,
        tierBonusCoins: Number(row.tierBonusCoins) || 0,
        tierBonusUsd: Number(row.tierBonusUsd) || 0,
        rewardCoins: Number(row.rewardCoins) || 0,
        rewardUsd: Number(row.rewardUsd) || 0,
        hostEarnCoins: Number(row.hostEarnCoins) || 0,
        hostEarnUsd: Number(row.hostEarnUsd) || 0,
        tlEarnCoins: Number(row.tlEarnCoins) || 0,
        tlEarnUsd: Number(row.tlEarnUsd) || 0,
        platformRetainedCoins: Number(row.platformRetainedCoins) || 0,
        platformRetainedUsd: Number(row.platformRetainedUsd) || 0,
        minutes: minute != null ? /* @__PURE__ */ new Set([minute]) : /* @__PURE__ */ new Set(),
        minuteFrom: minute,
        minuteTo: minute,
        firstAt: createdAt,
        lastAt: createdAt
      });
      continue;
    }
    existing.entryTypes.add(type);
    existing.amountCoins += Number(row.amountCoins) || 0;
    existing.amountUsd += Number(row.amountUsd) || 0;
    existing.callCoins += Number(row.callCoins) || 0;
    existing.callUsd += Number(row.callUsd) || 0;
    existing.giftCoins += Number(row.giftCoins) || 0;
    existing.giftUsd += Number(row.giftUsd) || 0;
    existing.trueUpCoins += Number(row.trueUpCoins) || 0;
    existing.trueUpUsd += Number(row.trueUpUsd) || 0;
    existing.tierBonusCoins += Number(row.tierBonusCoins) || 0;
    existing.tierBonusUsd += Number(row.tierBonusUsd) || 0;
    existing.rewardCoins += Number(row.rewardCoins) || 0;
    existing.rewardUsd += Number(row.rewardUsd) || 0;
    existing.hostEarnCoins += Number(row.hostEarnCoins) || 0;
    existing.hostEarnUsd += Number(row.hostEarnUsd) || 0;
    existing.tlEarnCoins += Number(row.tlEarnCoins) || 0;
    existing.tlEarnUsd += Number(row.tlEarnUsd) || 0;
    existing.platformRetainedCoins += Number(row.platformRetainedCoins) || 0;
    existing.platformRetainedUsd += Number(row.platformRetainedUsd) || 0;
    if (minute != null) {
      existing.minutes.add(minute);
      existing.minuteFrom = existing.minuteFrom == null ? minute : Math.min(existing.minuteFrom, minute);
      existing.minuteTo = existing.minuteTo == null ? minute : Math.max(existing.minuteTo, minute);
    }
    if (createdAt && (!existing.firstAt || createdAt < existing.firstAt)) {
      existing.firstAt = createdAt;
    }
    if (createdAt && (!existing.lastAt || createdAt > existing.lastAt)) {
      existing.lastAt = createdAt;
    }
    if (!existing.userName && row.userName) existing.userName = row.userName;
    if (!existing.hostId && row.hostId) existing.hostId = String(row.hostId);
    if (!existing.hostName && row.hostName) existing.hostName = row.hostName;
    if (row.inSalary === false) existing.inSalary = false;
  }
  const groupedRows = orderKeys.map((key) => {
    const g = groups.get(key);
    const entryType = pickPrimaryEntryType(g.entryTypes);
    const billedMinutes = g.minutes.size > 0 ? g.minutes.size : null;
    const category = pickCategory({
      callCoins: g.callCoins,
      giftCoins: g.giftCoins,
      trueUpCoins: g.trueUpCoins,
      rewardCoins: g.rewardCoins,
      entryType
    });
    return {
      id: `callgrp:${g.callId}:${g.userId || "none"}`,
      createdAt: g.lastAt || g.firstAt,
      entryType,
      userId: g.userId,
      userName: g.userName,
      teamLeaderId: g.teamLeaderId,
      callId: g.callId,
      hostId: g.hostId,
      hostName: g.hostName,
      billingMinute: null,
      billedMinutes,
      minuteFrom: g.minuteFrom,
      minuteTo: g.minuteTo,
      grouped: true,
      firstAt: g.firstAt,
      lastAt: g.lastAt,
      amountCoins: g.amountCoins,
      amountUsd: g.amountUsd,
      fxRatio: g.fxRatio,
      source: g.source,
      category,
      inSalary: g.inSalary,
      callCoins: g.callCoins,
      callUsd: g.callUsd,
      giftCoins: g.giftCoins,
      giftUsd: g.giftUsd,
      trueUpCoins: g.trueUpCoins,
      trueUpUsd: g.trueUpUsd,
      tierBonusCoins: g.tierBonusCoins,
      tierBonusUsd: g.tierBonusUsd,
      rewardCoins: g.rewardCoins,
      rewardUsd: g.rewardUsd,
      hostEarnCoins: g.hostEarnCoins,
      hostEarnUsd: g.hostEarnUsd,
      tlEarnCoins: g.tlEarnCoins,
      tlEarnUsd: g.tlEarnUsd,
      platformRetainedCoins: g.platformRetainedCoins,
      platformRetainedUsd: g.platformRetainedUsd
    };
  });
  const merged = [...groupedRows, ...standalone];
  merged.sort((a, b) => {
    const ta = String(a.lastAt || a.createdAt || "");
    const tb = String(b.lastAt || b.createdAt || "");
    return sortDesc ? tb.localeCompare(ta) : ta.localeCompare(tb);
  });
  return merged;
}
function groupLiveLedgerRowsByCall(rows, opts) {
  const groups = /* @__PURE__ */ new Map();
  const standalone = [];
  const orderKeys = [];
  const sortDesc = opts?.sortDesc !== false;
  for (const row of rows) {
    const type = String(row.transactionType || "");
    const sessionCallId = resolveSessionCallId({
      callId: row.callId,
      billingMinute: row.billingMinute,
      metadata: row.metadata
    });
    const minute = Number(row.billingMinute);
    const canGroup = type === "CALL_DEBIT" && Boolean(sessionCallId) && Number.isFinite(minute) && minute >= 1 && !isGiftWalletMetadata(row.metadata);
    if (!canGroup) {
      const m = row.billingMinute != null && Number.isFinite(Number(row.billingMinute)) ? Number(row.billingMinute) : null;
      standalone.push({
        ...row,
        billedMinutes: m != null && m >= 1 ? 1 : null,
        minuteFrom: m != null && m >= 1 ? m : null,
        minuteTo: m != null && m >= 1 ? m : null,
        grouped: false,
        firstAt: row.createdAt,
        lastAt: row.createdAt
      });
      continue;
    }
    const key = `${sessionCallId}|${row.userId}`;
    const min = Math.floor(minute);
    const createdAt = String(row.createdAt || "");
    const coins = Number(row.amountCoins) || 0;
    const existing = groups.get(key);
    if (!existing) {
      orderKeys.push(key);
      groups.set(key, {
        callId: String(sessionCallId),
        userId: String(row.userId),
        userName: row.userName ?? null,
        userEmail: row.userEmail ?? null,
        transactionType: type,
        amountCoins: coins,
        balanceAfter: Number(row.balanceAfter) || 0,
        metadata: row.metadata,
        minutes: /* @__PURE__ */ new Set([min]),
        minuteFrom: min,
        minuteTo: min,
        firstAt: createdAt,
        lastAt: createdAt
      });
      continue;
    }
    existing.amountCoins += coins;
    existing.minutes.add(min);
    existing.minuteFrom = Math.min(existing.minuteFrom, min);
    existing.minuteTo = Math.max(existing.minuteTo, min);
    if (createdAt && (!existing.firstAt || createdAt < existing.firstAt)) {
      existing.firstAt = createdAt;
    }
    if (createdAt && (!existing.lastAt || createdAt > existing.lastAt)) {
      existing.lastAt = createdAt;
      existing.balanceAfter = Number(row.balanceAfter) || existing.balanceAfter;
      existing.metadata = row.metadata ?? existing.metadata;
    }
    if (!existing.userName && row.userName) existing.userName = row.userName;
    if (!existing.userEmail && row.userEmail) existing.userEmail = row.userEmail;
  }
  const groupedRows = orderKeys.map((key) => {
    const g = groups.get(key);
    return {
      id: `callgrp:call_debit:${g.callId}:${g.userId}`,
      userId: g.userId,
      userName: g.userName,
      userEmail: g.userEmail,
      callId: g.callId,
      transactionType: g.transactionType,
      amountCoins: g.amountCoins,
      balanceAfter: g.balanceAfter,
      billingMinute: g.minuteTo,
      metadata: g.metadata,
      createdAt: g.lastAt || g.firstAt,
      billedMinutes: g.minutes.size,
      minuteFrom: g.minuteFrom,
      minuteTo: g.minuteTo,
      grouped: true,
      firstAt: g.firstAt,
      lastAt: g.lastAt
    };
  });
  const merged = [...groupedRows, ...standalone];
  merged.sort((a, b) => {
    const ta = String(a.lastAt || a.createdAt || "");
    const tb = String(b.lastAt || b.createdAt || "");
    return sortDesc ? tb.localeCompare(ta) : ta.localeCompare(tb);
  });
  return merged;
}

// server/finance/earningsOverview.ts
var HOST_FIN_TYPES = [...HOST_SALARY_FINANCIAL_ENTRY_TYPES];
var TL_FIN_TYPES = ["TL_EARN"];
var PLATFORM_FIN_TYPES = ["PLATFORM_EARN"];
var HOST_WALLET_TYPES = [
  ...HOST_SALARY_WALLET_TYPES,
  ...NON_SALARY_REWARD_WALLET_TYPES
];
var TL_WALLET_TYPES = ["TL_EARN"];
var PLATFORM_WALLET_TYPES = ["CALL_DEBIT", "GIFT_DEBIT"];
function emptyComponentSplit() {
  return {
    callCoins: 0,
    callUsd: 0,
    giftCoins: 0,
    giftUsd: 0,
    trueUpCoins: 0,
    trueUpUsd: 0,
    tierBonusCoins: 0,
    tierBonusUsd: 0,
    rewardCoins: 0,
    rewardUsd: 0,
    salaryCoins: 0,
    salaryUsd: 0,
    totalCoins: 0,
    totalUsd: 0
  };
}
function finalizeSplit(s) {
  s.salaryCoins = s.callCoins + s.giftCoins + s.trueUpCoins + s.tierBonusCoins;
  s.salaryUsd = s.callUsd + s.giftUsd + s.trueUpUsd + s.tierBonusUsd;
  s.totalCoins = s.salaryCoins + s.rewardCoins;
  s.totalUsd = s.salaryUsd + s.rewardUsd;
  return s;
}
function emptyLedgerAmounts() {
  return {
    callCoins: 0,
    callUsd: 0,
    giftCoins: 0,
    giftUsd: 0,
    trueUpCoins: 0,
    trueUpUsd: 0,
    tierBonusCoins: 0,
    tierBonusUsd: 0,
    rewardCoins: 0,
    rewardUsd: 0,
    hostEarnCoins: 0,
    hostEarnUsd: 0,
    tlEarnCoins: 0,
    tlEarnUsd: 0,
    platformRetainedCoins: 0,
    platformRetainedUsd: 0
  };
}
function hostIdFromWalletMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata;
  const raw = m.receiverId ?? m.receiver_id ?? m.hostId ?? m.host_id;
  const id = String(raw || "").trim();
  return id || null;
}
function mapWalletRowToLedger(row, peg) {
  const coins = Math.abs(Number(row.amount) || 0);
  const usd = coinsToUsd(coins, peg);
  const type = String(row.transaction_type || "");
  const amounts = emptyLedgerAmounts();
  let category = "other";
  let inSalary = true;
  const billingRaw = Number(row.billing_minute);
  const billingMinute = Number.isFinite(billingRaw) && billingRaw > 0 ? Math.floor(billingRaw) : null;
  const hostId = type === "TL_EARN" ? hostIdFromWalletMetadata(row.metadata) : null;
  if (type === "HOST_EARN") {
    if (isGiftWalletMetadata(row.metadata)) {
      category = "gift";
      amounts.giftCoins = coins;
      amounts.giftUsd = usd;
    } else {
      category = "call";
      amounts.callCoins = coins;
      amounts.callUsd = usd;
    }
  } else if (type === "TARGET_SHARE_TRUEUP") {
    category = "true_up";
    amounts.trueUpCoins = coins;
    amounts.trueUpUsd = usd;
  } else if (type === "TL_EARN") {
    if (isGiftWalletMetadata(row.metadata)) {
      category = "gift";
      amounts.giftCoins = coins;
      amounts.giftUsd = usd;
    } else {
      category = "tl_commission";
      amounts.callCoins = coins;
      amounts.callUsd = usd;
    }
  } else if (type === "REWARD_STREAK" || type === "REWARD_MISSION" || type === "REWARD_MASTER_CHEST") {
    category = "reward";
    inSalary = false;
    amounts.rewardCoins = coins;
    amounts.rewardUsd = usd;
  } else if (type === "CALL_DEBIT") {
    category = "platform";
    amounts.callCoins = coins;
    amounts.callUsd = usd;
  } else if (type === "GIFT_DEBIT") {
    category = "platform";
    amounts.giftCoins = coins;
    amounts.giftUsd = usd;
  }
  return {
    id: String(row.id),
    createdAt: row.created_at,
    entryType: type,
    userId: row.user_id ? String(row.user_id) : null,
    userName: null,
    teamLeaderId: null,
    callId: row.call_id ? String(row.call_id) : null,
    hostId,
    hostName: null,
    billingMinute,
    billedMinutes: billingMinute != null ? 1 : null,
    minuteFrom: billingMinute,
    minuteTo: billingMinute,
    grouped: false,
    firstAt: row.created_at,
    lastAt: row.created_at,
    amountCoins: coins,
    amountUsd: usd,
    fxRatio: peg,
    source: "wallet",
    category,
    inSalary,
    ...amounts
  };
}
function mapFinancialRowToLedger(row) {
  const coins = Number(row.amount_coins) || 0;
  const usd = Number(row.amount_usd) || 0;
  const type = String(row.entry_type || "");
  const amounts = emptyLedgerAmounts();
  let category = "other";
  const inSalary = true;
  const meta = row.metadata || {};
  if (type === "TARGET_SHARE_TRUEUP") {
    category = "true_up";
    amounts.trueUpCoins = coins;
    amounts.trueUpUsd = usd;
  } else if (type === "TARGET_BONUS") {
    category = "tier_bonus";
    amounts.tierBonusCoins = coins;
    amounts.tierBonusUsd = usd;
  } else if (type === "TL_EARN") {
    category = "tl_commission";
    amounts.callCoins = coins;
    amounts.callUsd = usd;
  } else if (type === "PLATFORM_EARN") {
    category = "platform";
    amounts.callCoins = coins;
    amounts.callUsd = usd;
    amounts.platformRetainedCoins = coins;
    amounts.platformRetainedUsd = usd;
  } else if (type === "HOST_EARN") {
    const call = Number(meta.call);
    const gift = Number(meta.gift);
    if (Number.isFinite(call) || Number.isFinite(gift)) {
      const callC = Math.max(0, Math.round(Number.isFinite(call) ? call : 0));
      const giftC = Math.max(0, Math.round(Number.isFinite(gift) ? gift : 0));
      const sum = callC + giftC;
      amounts.callCoins = callC;
      amounts.giftCoins = giftC;
      amounts.callUsd = sum > 0 ? usd * (callC / sum) : usd;
      amounts.giftUsd = sum > 0 ? usd * (giftC / sum) : 0;
      category = giftC > callC ? "gift" : "call";
    } else {
      category = "call";
      amounts.callCoins = coins;
      amounts.callUsd = usd;
    }
  }
  return {
    id: String(row.id),
    createdAt: row.created_at,
    entryType: type,
    userId: row.user_id ? String(row.user_id) : null,
    userName: null,
    teamLeaderId: row.team_leader_id ? String(row.team_leader_id) : null,
    callId: null,
    hostId: null,
    hostName: null,
    billingMinute: null,
    billedMinutes: null,
    minuteFrom: null,
    minuteTo: null,
    grouped: false,
    firstAt: row.created_at,
    lastAt: row.created_at,
    amountCoins: coins,
    amountUsd: usd,
    fxRatio: Number(row.fx_ratio) || 0,
    source: "financial",
    category,
    inSalary,
    ...amounts
  };
}
async function loadProfileNames(client, ids) {
  const nameById = /* @__PURE__ */ new Map();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunk = 200;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const { data, error } = await client.from("profiles").select("id, name").in("id", slice);
    if (error) throw new Error(error.message);
    for (const p of data || []) {
      const id = String(p.id || "");
      const name = String(p.name || "").trim();
      if (id && name) nameById.set(id, name);
    }
  }
  return nameById;
}
async function hydrateHostIdsFromCallLogs(client, rows) {
  const needCallIds = Array.from(
    new Set(
      rows.filter((r) => r.entryType === "TL_EARN" && !r.hostId && r.callId).map((r) => String(r.callId))
    )
  );
  if (!needCallIds.length) return rows;
  const hostByCall = /* @__PURE__ */ new Map();
  const chunk = 100;
  for (let i = 0; i < needCallIds.length; i += chunk) {
    const slice = needCallIds.slice(i, i + chunk);
    const { data, error } = await client.from("call_logs").select("id, host_id, receiver_id, host_name").in("id", slice);
    if (error) throw new Error(error.message);
    for (const c of data || []) {
      const callId = String(c.id || "");
      const hostId = String(c.host_id || c.receiver_id || "").trim();
      if (callId && hostId) hostByCall.set(callId, hostId);
    }
  }
  return rows.map((r) => {
    if (r.hostId || r.entryType !== "TL_EARN" || !r.callId) return r;
    const hostId = hostByCall.get(String(r.callId)) || null;
    return hostId ? { ...r, hostId } : r;
  });
}
async function hydrateLedgerUserNames(client, rows) {
  const withHosts = await hydrateHostIdsFromCallLogs(client, rows);
  const userIds = withHosts.map((r) => r.userId).filter((id) => Boolean(id));
  const hostIds = withHosts.map((r) => r.hostId).filter((id) => Boolean(id));
  const nameById = await loadProfileNames(client, [...userIds, ...hostIds]);
  return withHosts.map((r) => ({
    ...r,
    userName: r.userId ? nameById.get(r.userId) || r.userName || null : null,
    hostName: r.hostId ? nameById.get(r.hostId) || r.hostName || null : r.hostName || null
  }));
}
function addRowToSplit(split, row) {
  split.callCoins += row.callCoins;
  split.callUsd += row.callUsd;
  split.giftCoins += row.giftCoins;
  split.giftUsd += row.giftUsd;
  split.trueUpCoins += row.trueUpCoins;
  split.trueUpUsd += row.trueUpUsd;
  split.tierBonusCoins += row.tierBonusCoins;
  split.tierBonusUsd += row.tierBonusUsd;
  split.rewardCoins += row.rewardCoins;
  split.rewardUsd += row.rewardUsd;
}
function isAdminRole(role) {
  return role === "admin";
}
function isTeamLeaderRole(role) {
  return role === "team_leader" || role === "agency_manager" || role === "admin";
}
function calendarWeekBounds(at = /* @__PURE__ */ new Date()) {
  const start = startOfUtcWeekMonday(at);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}
function calendarMonthBounds(at = /* @__PURE__ */ new Date()) {
  const start = startOfUtcMonth(at);
  const end = addUtcMonths(start, 1);
  return { start, end };
}
function dayKey(d) {
  return d.toISOString().slice(0, 10);
}
function weekKey(d) {
  return `w:${dayKey(startOfUtcWeekMonday(d))}`;
}
function monthKey(d) {
  const m = startOfUtcMonth(d);
  return `m:${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
}
function parsePeriodKey(periodKey, groupBy) {
  const raw = String(periodKey || "").trim();
  if (!raw) return null;
  if (groupBy === "week" || raw.startsWith("w:")) {
    const iso2 = raw.startsWith("w:") ? raw.slice(2) : raw;
    const start2 = startOfUtcWeekMonday(/* @__PURE__ */ new Date(`${iso2}T00:00:00.000Z`));
    if (Number.isNaN(start2.getTime())) return null;
    const end = new Date(start2);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start: start2, end };
  }
  const iso = raw.startsWith("m:") ? raw.slice(2) + "-01" : raw;
  const start = startOfUtcMonth(/* @__PURE__ */ new Date(`${iso}T00:00:00.000Z`));
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: addUtcMonths(start, 1) };
}
function groupLabel(groupBy, start, end) {
  if (groupBy === "week") {
    return `Week ${dayKey(start)} \u2192 ${dayKey(new Date(end.getTime() - 1))}`;
  }
  return start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function emptyKpi(start, end) {
  return {
    coins: 0,
    usd: 0,
    entryCount: 0,
    periodStart: toIso(start),
    periodEnd: toIso(end)
  };
}
function scopeCoinsFromAccrual(scope, totals) {
  if (scope === "platform") return Math.max(0, totals.platformRetainedCoins);
  if (scope === "tl") return Math.max(0, totals.tlEarnCoins);
  return Math.max(0, totals.hostEarnCoins + totals.targetShareTrueUpCoins);
}
function finEntryTypes(scope) {
  if (scope === "platform") return [...PLATFORM_FIN_TYPES];
  if (scope === "tl") return [...TL_FIN_TYPES];
  return [...HOST_FIN_TYPES];
}
function walletEntryTypes(scope) {
  if (scope === "platform") return [...PLATFORM_WALLET_TYPES];
  if (scope === "tl") return [...TL_WALLET_TYPES];
  return [...HOST_WALLET_TYPES];
}
async function listManagedHostIds(client, teamLeaderId) {
  const { data, error } = await client.from("profiles").select("id").or(`team_leader_id.eq.${teamLeaderId},created_by_id.eq.${teamLeaderId}`);
  if (error) throw new Error(error.message);
  return (data || []).map((r) => String(r.id)).filter(Boolean);
}
async function resolveEarningsScopeAccess(input, client) {
  const scope = input.scope;
  const actorId = String(input.actorId || "").trim();
  const role = String(input.actorRole || "").trim();
  if (!actorId) {
    return { ok: false, status: 401, message: "Unauthorized", code: "UNAUTHORIZED" };
  }
  if (scope !== "platform" && scope !== "tl" && scope !== "host") {
    return { ok: false, status: 400, message: "Invalid scope", code: "INVALID_SCOPE" };
  }
  const db = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdmin() : null);
  if (!db) {
    return { ok: false, status: 503, message: "Finance backend unavailable", code: "NO_ADMIN" };
  }
  if (scope === "platform") {
    if (!isAdminRole(role)) {
      return { ok: false, status: 403, message: "Platform earnings are admin-only", code: "FORBIDDEN" };
    }
    return { ok: true, scope, userIds: null, teamLeaderId: null };
  }
  if (scope === "tl") {
    if (isAdminRole(role)) {
      const tlFilter = String(input.teamLeaderId || "").trim();
      if (tlFilter) {
        return { ok: true, scope, userIds: [tlFilter], teamLeaderId: tlFilter };
      }
      return { ok: true, scope, userIds: null, teamLeaderId: null };
    }
    if (!isTeamLeaderRole(role)) {
      return { ok: false, status: 403, message: "Team leader earnings forbidden", code: "FORBIDDEN" };
    }
    return { ok: true, scope, userIds: [actorId], teamLeaderId: actorId };
  }
  if (isAdminRole(role)) {
    const hostId = String(input.userId || "").trim();
    const tlFilter = String(input.teamLeaderId || "").trim();
    if (hostId) {
      return { ok: true, scope, userIds: [hostId], teamLeaderId: tlFilter || null };
    }
    if (tlFilter) {
      const ids = await listManagedHostIds(db, tlFilter);
      return { ok: true, scope, userIds: ids.length ? ids : [], teamLeaderId: tlFilter };
    }
    return { ok: true, scope, userIds: null, teamLeaderId: null };
  }
  if (isTeamLeaderRole(role) && role !== "admin") {
    const managed = await listManagedHostIds(db, actorId);
    const hostId = String(input.userId || "").trim();
    if (hostId) {
      if (!managed.includes(hostId)) {
        return {
          ok: false,
          status: 403,
          message: "Host is not managed by this team leader",
          code: "FORBIDDEN"
        };
      }
      return { ok: true, scope, userIds: [hostId], teamLeaderId: actorId };
    }
    return {
      ok: true,
      scope,
      userIds: managed.length ? managed : [],
      teamLeaderId: actorId
    };
  }
  return { ok: true, scope, userIds: [actorId], teamLeaderId: null };
}
async function sumFinancialLedger(client, opts) {
  const types = finEntryTypes(opts.scope);
  let coins = 0;
  let usd = 0;
  let entryCount = 0;
  const pageSize = 1e3;
  let offset = 0;
  for (; ; ) {
    let q = client.from("financial_ledger").select("amount_coins, amount_usd, user_id, team_leader_id, entry_type, created_at").in("entry_type", types).order("created_at", { ascending: true }).range(offset, offset + pageSize - 1);
    if (opts.periodStart) q = q.gte("created_at", toIso(opts.periodStart));
    if (opts.periodEnd) q = q.lt("created_at", toIso(opts.periodEnd));
    if (opts.scope === "tl" && opts.userIds && opts.userIds.length === 1) {
      q = q.or(
        `user_id.eq.${opts.userIds[0]},team_leader_id.eq.${opts.userIds[0]}`
      );
    } else if (opts.userIds) {
      if (opts.userIds.length === 0) {
        return { coins: 0, usd: 0, entryCount: 0 };
      }
      q = q.in("user_id", opts.userIds);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      coins += Number(row.amount_coins) || 0;
      usd += Number(row.amount_usd) || 0;
      entryCount += 1;
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return { coins, usd, entryCount };
}
async function buildDailySeriesFromWallet(client, opts) {
  const types = walletEntryTypes(opts.scope);
  const byDay = /* @__PURE__ */ new Map();
  for (let t = opts.start.getTime(); t < opts.end.getTime(); t += 864e5) {
    const key = dayKey(new Date(t));
    byDay.set(key, { coins: 0, count: 0 });
  }
  let entryCount = 0;
  const pageSize = 1e3;
  let offset = 0;
  if (opts.scope === "platform") {
    for (let t = opts.start.getTime(); t < Math.min(opts.end.getTime(), Date.now() + 864e5); t += 864e5) {
      const dayStart = startOfUtcDay(new Date(t));
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      if (dayStart.getTime() >= opts.end.getTime()) break;
      const endBound = dayEnd.getTime() > opts.end.getTime() ? opts.end : dayEnd;
      const accrual = await aggregateWalletLedgerEarnings({
        periodStart: dayStart,
        periodEnd: endBound,
        client
      });
      const coins = accrual.success ? scopeCoinsFromAccrual("platform", accrual.totals) : 0;
      const key = dayKey(dayStart);
      byDay.set(key, { coins, count: coins > 0 ? 1 : 0 });
      if (coins > 0) entryCount += 1;
    }
  } else {
    if (opts.userIds && opts.userIds.length === 0) {
      return {
        series: [...byDay.entries()].map(([date, v]) => ({
          date,
          label: date.slice(5),
          coins: v.coins,
          usd: coinsToUsd(v.coins, opts.peg)
        })),
        entryCount: 0
      };
    }
    for (; ; ) {
      let q = client.from("wallet_ledger").select("amount, transaction_type, created_at, user_id").in("transaction_type", types).gte("created_at", toIso(opts.start)).lt("created_at", toIso(opts.end)).order("created_at", { ascending: true }).range(offset, offset + pageSize - 1);
      if (opts.userIds) q = q.in("user_id", opts.userIds);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data || [];
      for (const row of rows) {
        const amount = Number(row.amount) || 0;
        if (amount === 0) continue;
        const coins = Math.abs(amount);
        const created = new Date(row.created_at);
        const key = dayKey(created);
        const prev = byDay.get(key) || { coins: 0, count: 0 };
        prev.coins += coins;
        prev.count += 1;
        byDay.set(key, prev);
        entryCount += 1;
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  }
  const series = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
    date,
    label: date.slice(5),
    coins: v.coins,
    usd: coinsToUsd(v.coins, opts.peg)
  }));
  return { series, entryCount };
}
async function loadWalletLedgerRows(client, opts) {
  if (opts.userIds && opts.userIds.length === 0) return [];
  const types = opts.scope === "platform" ? [...PLATFORM_WALLET_TYPES] : walletEntryTypes(opts.scope);
  const raw = [];
  const pageSize = 1e3;
  let offset = 0;
  const maxRaw = Math.min(Math.max(opts.limit * 40, 500), 1e4);
  while (raw.length < maxRaw) {
    let q = client.from("wallet_ledger").select(
      "id, user_id, transaction_type, amount, created_at, metadata, call_id, billing_minute"
    ).in("transaction_type", types).gte("created_at", toIso(opts.start)).lt("created_at", toIso(opts.end)).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    if (opts.userIds) q = q.in("user_id", opts.userIds);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      const amount = Number(row.amount) || 0;
      if (amount === 0) continue;
      const mapped = mapWalletRowToLedger(row, opts.peg);
      raw.push({ ...mapped, metadata: row.metadata });
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
    if (groupWalletLedgerByCall(raw).length >= opts.limit) break;
  }
  let grouped = groupWalletLedgerByCall(raw).slice(0, opts.limit);
  if (opts.scope === "platform") {
    grouped = await hydratePlatformCallEconomics(client, grouped, opts.peg, opts.start, opts.end);
  }
  return hydrateLedgerUserNames(client, grouped);
}
async function hydratePlatformCallEconomics(client, rows, peg, start, end) {
  const callIds = Array.from(
    new Set(rows.map((r) => String(r.callId || "").trim()).filter(Boolean))
  );
  if (!callIds.length) {
    return rows.map((r) => ({
      ...r,
      hostEarnCoins: 0,
      hostEarnUsd: 0,
      tlEarnCoins: 0,
      tlEarnUsd: 0,
      platformRetainedCoins: Math.max(0, Number(r.amountCoins) || 0),
      platformRetainedUsd: coinsToUsd(Math.max(0, Number(r.amountCoins) || 0), peg)
    }));
  }
  const callIdSet = new Set(callIds);
  const byCall = /* @__PURE__ */ new Map();
  const pageSize = 1e3;
  let offset = 0;
  for (; ; ) {
    const { data, error } = await client.from("wallet_ledger").select("call_id, transaction_type, amount, billing_minute, metadata").in("transaction_type", ["HOST_EARN", "TL_EARN"]).gte("created_at", toIso(start)).lt("created_at", toIso(end)).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    for (const row of page) {
      const sessionId = resolveSessionCallId({
        callId: row.call_id,
        billingMinute: row.billing_minute,
        metadata: row.metadata
      });
      if (!sessionId || !callIdSet.has(sessionId)) continue;
      const coins = Math.abs(Number(row.amount) || 0);
      if (coins === 0) continue;
      const prev = byCall.get(sessionId) || { host: 0, tl: 0 };
      if (String(row.transaction_type) === "HOST_EARN") prev.host += coins;
      else if (String(row.transaction_type) === "TL_EARN") prev.tl += coins;
      byCall.set(sessionId, prev);
    }
    if (page.length < pageSize) break;
    offset += pageSize;
    if (offset >= 2e4) break;
  }
  return rows.map((r) => {
    const callId = String(r.callId || "").trim();
    const split = callId ? byCall.get(callId) : null;
    const host = split?.host || 0;
    const tl = split?.tl || 0;
    const burn = Math.max(0, Number(r.amountCoins) || 0);
    const platform = Math.max(0, burn - host - tl);
    return {
      ...r,
      hostEarnCoins: host,
      hostEarnUsd: coinsToUsd(host, peg),
      tlEarnCoins: tl,
      tlEarnUsd: coinsToUsd(tl, peg),
      platformRetainedCoins: platform,
      platformRetainedUsd: coinsToUsd(platform, peg)
    };
  });
}
async function loadFinancialLedgerRows(client, opts) {
  if (opts.userIds && opts.userIds.length === 0) return [];
  const types = finEntryTypes(opts.scope);
  const out = [];
  const pageSize = Math.min(opts.limit, 1e3);
  let offset = 0;
  while (out.length < opts.limit) {
    let q = client.from("financial_ledger").select(
      "id, created_at, entry_type, user_id, team_leader_id, amount_coins, amount_usd, fx_ratio, metadata"
    ).in("entry_type", types).gte("created_at", toIso(opts.start)).lt("created_at", toIso(opts.end)).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    if (opts.scope === "tl" && opts.userIds && opts.userIds.length === 1) {
      q = q.or(`user_id.eq.${opts.userIds[0]},team_leader_id.eq.${opts.userIds[0]}`);
    } else if (opts.userIds) {
      q = q.in("user_id", opts.userIds);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      out.push(mapFinancialRowToLedger(row));
      if (out.length >= opts.limit) break;
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return hydrateLedgerUserNames(client, out);
}
async function computeComponentSplit(client, opts) {
  const split = emptyComponentSplit();
  if (opts.scope !== "host" && opts.scope !== "tl") {
    const accrual = await aggregateWalletLedgerEarnings({
      periodStart: opts.start,
      periodEnd: opts.end,
      client
    });
    if (accrual.success) {
      const coins = scopeCoinsFromAccrual(opts.scope, accrual.totals);
      split.callCoins = coins;
      split.callUsd = coinsToUsd(coins, opts.peg);
    }
    return finalizeSplit(split);
  }
  if (opts.userIds && opts.userIds.length === 0) return finalizeSplit(split);
  const types = opts.scope === "tl" ? [...TL_WALLET_TYPES] : [...HOST_WALLET_TYPES];
  const pageSize = 1e3;
  let offset = 0;
  for (; ; ) {
    let q = client.from("wallet_ledger").select("id, user_id, transaction_type, amount, created_at, metadata").in("transaction_type", types).gte("created_at", toIso(opts.start)).lt("created_at", toIso(opts.end)).order("created_at", { ascending: true }).range(offset, offset + pageSize - 1);
    if (opts.userIds) q = q.in("user_id", opts.userIds);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      if (!(Number(row.amount) || 0)) continue;
      addRowToSplit(split, mapWalletRowToLedger(row, opts.peg));
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  if (opts.includeClosedBonus && opts.scope === "host") {
    let offsetFin = 0;
    for (; ; ) {
      let q = client.from("financial_ledger").select(
        "id, created_at, entry_type, user_id, team_leader_id, amount_coins, amount_usd, fx_ratio, metadata"
      ).eq("entry_type", "TARGET_BONUS").gte("created_at", toIso(opts.start)).lt("created_at", toIso(opts.end)).order("created_at", { ascending: true }).range(offsetFin, offsetFin + pageSize - 1);
      if (opts.userIds) q = q.in("user_id", opts.userIds);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data || [];
      for (const row of rows) {
        addRowToSplit(split, mapFinancialRowToLedger(row));
      }
      if (rows.length < pageSize) break;
      offsetFin += pageSize;
    }
  }
  return finalizeSplit(split);
}
async function loadLifetimeGroups(client, opts) {
  if (opts.userIds && opts.userIds.length === 0) return [];
  const types = finEntryTypes(opts.scope);
  const groups = /* @__PURE__ */ new Map();
  const pageSize = 1e3;
  let offset = 0;
  for (; ; ) {
    let q = client.from("financial_ledger").select("amount_coins, amount_usd, created_at, user_id, team_leader_id, entry_type").in("entry_type", types).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    if (opts.scope === "tl" && opts.userIds && opts.userIds.length === 1) {
      q = q.or(`user_id.eq.${opts.userIds[0]},team_leader_id.eq.${opts.userIds[0]}`);
    } else if (opts.userIds) {
      q = q.in("user_id", opts.userIds);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      const created = new Date(row.created_at);
      if (Number.isNaN(created.getTime())) continue;
      const key = opts.groupBy === "week" ? weekKey(created) : monthKey(created);
      let start;
      let end;
      if (opts.groupBy === "week") {
        start = startOfUtcWeekMonday(created);
        end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 7);
      } else {
        start = startOfUtcMonth(created);
        end = addUtcMonths(start, 1);
      }
      const prev = groups.get(key) || {
        start,
        end,
        coins: 0,
        usd: 0,
        entryCount: 0
      };
      prev.coins += Number(row.amount_coins) || 0;
      prev.usd += Number(row.amount_usd) || 0;
      prev.entryCount += 1;
      groups.set(key, prev);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  const now = /* @__PURE__ */ new Date();
  const currentBounds = opts.groupBy === "week" ? calendarWeekBounds(now) : calendarMonthBounds(now);
  const currentKey = opts.groupBy === "week" ? weekKey(now) : monthKey(now);
  if (!groups.has(currentKey)) {
    const accrual = await aggregateWalletLedgerEarnings({
      periodStart: currentBounds.start,
      periodEnd: now < currentBounds.end ? now : currentBounds.end,
      userIds: opts.scope === "platform" ? void 0 : opts.userIds === null ? void 0 : opts.userIds,
      client
    });
    const coins = accrual.success ? scopeCoinsFromAccrual(opts.scope, accrual.totals) : 0;
    if (coins > 0) {
      groups.set(currentKey, {
        start: currentBounds.start,
        end: currentBounds.end,
        coins,
        usd: coinsToUsd(coins, opts.peg),
        entryCount: 0
      });
    }
  }
  return [...groups.entries()].map(([periodKey, g]) => ({
    periodKey,
    label: groupLabel(opts.groupBy, g.start, g.end),
    periodStart: toIso(g.start),
    periodEnd: toIso(g.end),
    totalCoins: g.coins,
    totalUsd: g.usd,
    entryCount: g.entryCount
  })).sort((a, b) => b.periodStart.localeCompare(a.periodStart)).slice(0, opts.limit);
}
async function buildEarningsOverview(opts) {
  const client = opts.client ?? getSupabaseAdmin();
  if (!client) throw new Error("Supabase admin client unavailable");
  const at = opts.at ?? /* @__PURE__ */ new Date();
  const config = opts.config ?? await loadFinanceSystemConfig();
  const peg = getCoinUsdPeg(config);
  const week = calendarWeekBounds(at);
  const month = calendarMonthBounds(at);
  const weekEndLive = at < week.end ? at : week.end;
  const monthEndLive = at < month.end ? at : month.end;
  const userIdsForAccrual = opts.scope === "platform" ? void 0 : opts.userIds === null ? void 0 : opts.userIds;
  const [weekAccrual, monthAccrual, lifetimeFin, weekSeriesPack, monthSeriesPack] = await Promise.all([
    aggregateWalletLedgerEarnings({
      periodStart: week.start,
      periodEnd: weekEndLive,
      userIds: userIdsForAccrual,
      client
    }),
    aggregateWalletLedgerEarnings({
      periodStart: month.start,
      periodEnd: monthEndLive,
      userIds: userIdsForAccrual,
      client
    }),
    sumFinancialLedger(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      teamLeaderId: opts.teamLeaderId
    }),
    buildDailySeriesFromWallet(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      start: week.start,
      end: week.end,
      peg
    }),
    buildDailySeriesFromWallet(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      start: month.start,
      end: month.end,
      peg
    })
  ]);
  const weekCoins = weekAccrual.success ? scopeCoinsFromAccrual(opts.scope, weekAccrual.totals) : 0;
  const monthCoins = monthAccrual.success ? scopeCoinsFromAccrual(opts.scope, monthAccrual.totals) : 0;
  const settlementBounds = getCurrentPeriodBounds(config.creatorTargetCycle, at);
  const openAccrual = await aggregateWalletLedgerEarnings({
    periodStart: settlementBounds.periodStart,
    periodEnd: at < settlementBounds.periodEnd ? at : settlementBounds.periodEnd,
    userIds: userIdsForAccrual,
    client
  });
  const openCoins = openAccrual.success ? scopeCoinsFromAccrual(opts.scope, openAccrual.totals) : 0;
  const lifetimeCoins = lifetimeFin.coins + openCoins;
  const lifetimeUsd = lifetimeFin.usd + coinsToUsd(openCoins, peg);
  const ensured = await ensureOpenPeriod({ at, config });
  const nextCloseAtDate = await getNextCloseAt2({ at, config });
  const remainingMs = Math.max(0, nextCloseAtDate.getTime() - at.getTime());
  const totalMs = Math.max(
    1,
    nextCloseAtDate.getTime() - settlementBounds.periodStart.getTime()
  );
  const daysElapsedWeek = Math.max(
    1,
    Math.ceil((weekEndLive.getTime() - week.start.getTime()) / 864e5)
  );
  const weekKpi = {
    ...emptyKpi(week.start, week.end),
    coins: weekCoins,
    usd: coinsToUsd(weekCoins, peg),
    entryCount: weekSeriesPack.entryCount
  };
  const monthKpi = {
    ...emptyKpi(month.start, month.end),
    coins: monthCoins,
    usd: coinsToUsd(monthCoins, peg),
    entryCount: monthSeriesPack.entryCount
  };
  const [weekSplit, monthSplit, lifetimeSplit] = await Promise.all([
    computeComponentSplit(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      start: week.start,
      end: weekEndLive,
      peg,
      includeClosedBonus: true
    }),
    computeComponentSplit(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      start: month.start,
      end: monthEndLive,
      peg,
      includeClosedBonus: true
    }),
    (async () => {
      const split = emptyComponentSplit();
      const pageSize = 1e3;
      let offset = 0;
      const types = finEntryTypes(opts.scope);
      for (; ; ) {
        let q = client.from("financial_ledger").select(
          "id, created_at, entry_type, user_id, team_leader_id, amount_coins, amount_usd, fx_ratio, metadata"
        ).in("entry_type", types).order("created_at", { ascending: true }).range(offset, offset + pageSize - 1);
        if (opts.scope === "tl" && opts.userIds && opts.userIds.length === 1) {
          q = q.or(`user_id.eq.${opts.userIds[0]},team_leader_id.eq.${opts.userIds[0]}`);
        } else if (opts.userIds) {
          if (opts.userIds.length === 0) break;
          q = q.in("user_id", opts.userIds);
        }
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const rows = data || [];
        for (const row of rows) addRowToSplit(split, mapFinancialRowToLedger(row));
        if (rows.length < pageSize) break;
        offset += pageSize;
      }
      const openSplit = await computeComponentSplit(client, {
        scope: opts.scope,
        userIds: opts.userIds,
        start: settlementBounds.periodStart,
        end: at < settlementBounds.periodEnd ? at : settlementBounds.periodEnd,
        peg,
        includeClosedBonus: false
      });
      split.callCoins += openSplit.callCoins;
      split.callUsd += openSplit.callUsd;
      split.giftCoins += openSplit.giftCoins;
      split.giftUsd += openSplit.giftUsd;
      split.trueUpCoins += openSplit.trueUpCoins;
      split.trueUpUsd += openSplit.trueUpUsd;
      split.rewardCoins += openSplit.rewardCoins;
      split.rewardUsd += openSplit.rewardUsd;
      return finalizeSplit(split);
    })()
  ]);
  return {
    scope: opts.scope,
    coinUsdPeg: peg,
    week: weekKpi,
    month: monthKpi,
    lifetime: {
      coins: lifetimeCoins,
      usd: lifetimeUsd,
      entryCount: lifetimeFin.entryCount,
      periodStart: null,
      periodEnd: null
    },
    periodClock: {
      cycleType: config.creatorTargetCycle,
      periodCloseUtcTime: config.periodCloseUtcTime,
      settlementEnabled: config.settlementEnabled,
      periodStart: toIso(settlementBounds.periodStart),
      periodEnd: toIso(settlementBounds.periodEnd),
      nextCloseAt: nextCloseAtDate.toISOString(),
      remainingMs,
      elapsedRatio: Math.min(1, Math.max(0, 1 - remainingMs / totalMs)),
      periodId: ensured.period?.id ?? null,
      periodStatus: ensured.period?.status ?? null
    },
    extras: {
      entriesThisWeek: weekSeriesPack.entryCount,
      avgDailyUsdThisWeek: coinsToUsd(weekCoins, peg) / daysElapsedWeek,
      settlementCycleLabel: String(config.creatorTargetCycle || "weekly")
    },
    series: {
      week: weekSeriesPack.series,
      month: monthSeriesPack.series
    },
    componentSplit: {
      week: weekSplit,
      month: monthSplit,
      lifetime: lifetimeSplit
    }
  };
}
async function buildEarningsLedger(opts) {
  const client = opts.client ?? getSupabaseAdmin();
  if (!client) throw new Error("Supabase admin client unavailable");
  const at = opts.at ?? /* @__PURE__ */ new Date();
  const config = opts.config ?? await loadFinanceSystemConfig();
  const peg = getCoinUsdPeg(config);
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const groupBy = opts.groupBy === "month" ? "month" : "week";
  const mode = opts.mode;
  if (mode === "lifetime" && !opts.periodKey) {
    const groups = await loadLifetimeGroups(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      groupBy,
      peg,
      limit
    });
    return {
      scope: opts.scope,
      mode,
      groupBy,
      rows: [],
      groups,
      periodStart: null,
      periodEnd: null
    };
  }
  if (mode === "lifetime" && opts.periodKey) {
    const bounds2 = parsePeriodKey(String(opts.periodKey), groupBy);
    if (!bounds2) {
      throw Object.assign(new Error("Invalid periodKey"), { code: "INVALID_PERIOD_KEY" });
    }
    const finRows = await loadFinancialLedgerRows(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      start: bounds2.start,
      end: bounds2.end,
      limit
    });
    const now = at;
    const isCurrent = now >= bounds2.start && now < bounds2.end;
    let rows2 = finRows;
    if (isCurrent) {
      const walletRows = await loadWalletLedgerRows(client, {
        scope: opts.scope,
        userIds: opts.userIds,
        start: bounds2.start,
        end: now < bounds2.end ? now : bounds2.end,
        peg,
        limit
      });
      const seen = new Set(finRows.map((r) => r.id));
      rows2 = [...finRows, ...walletRows.filter((r) => !seen.has(r.id))].slice(0, limit);
    }
    return {
      scope: opts.scope,
      mode,
      groupBy,
      periodKey: opts.periodKey,
      rows: rows2,
      groups: [],
      periodStart: toIso(bounds2.start),
      periodEnd: toIso(bounds2.end)
    };
  }
  const bounds = mode === "month" ? calendarMonthBounds(at) : calendarWeekBounds(at);
  const endLive = at < bounds.end ? at : bounds.end;
  const rows = await loadWalletLedgerRows(client, {
    scope: opts.scope,
    userIds: opts.userIds,
    start: bounds.start,
    end: endLive,
    peg,
    limit
  });
  return {
    scope: opts.scope,
    mode,
    groupBy: null,
    rows,
    groups: [],
    periodStart: toIso(bounds.start),
    periodEnd: toIso(bounds.end)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_COIN_TO_USD_RATIO,
  DEFAULT_COIN_USD_PEG,
  DEFAULT_FEMALE_PAYOUT_RATIO_USD,
  DEFAULT_TARGET_THRESHOLDS,
  EMPTY_HOST_EARNINGS_BREAKDOWN,
  HOST_SALARY_FINANCIAL_ENTRY_TYPES,
  HOST_SALARY_LINE_COMPONENTS,
  HOST_SALARY_WALLET_TYPES,
  NON_SALARY_REWARD_WALLET_TYPES,
  PAYABLE_MODEL_NOTES,
  PAYABLE_SOURCE_OF_TRUTH,
  PAYOUT_PERIOD_END_ONLY,
  PayoutPolicyError,
  SETTLEMENT_STATUS_TRANSITIONS,
  acknowledgePayeeSalary,
  agencyMarkHostPaid,
  aggregateHostCallBurnForTrueUp,
  aggregateWalletLedgerEarnings,
  appendFinancialLedgerEntries,
  appendFinancialLedgerEntry,
  appendGiftEarnLedger,
  appendReversalEntry,
  appendSettlementNote,
  applyCreatorEarnCoins,
  assertManualPayoutAllowed,
  assertManualPayoutAllowedSync,
  buildEarningsLedger,
  buildEarningsOverview,
  buildSalaryEstimatePreview,
  buildSalaryPeriodPdf,
  buildSalaryPeriodXlsx,
  buildSettlementBatches,
  canTransitionSettlementStatus,
  cancelSettlementBatch,
  categoryFromSettlementComponent,
  checkManualPayoutAllowed,
  closeDuePeriods,
  closePeriod,
  coinsToUsd,
  coinsToUsdWithCachedRatio,
  coinsToUsdWithLiveRatio,
  coinsToUsdWithSnapshot,
  completeCoinPurchase,
  computeCloseScheduledAt,
  computePerformanceTier,
  computePerformanceTierFromCache,
  computePerformanceTierFromConfig,
  createCheckoutIntent,
  createSettlementBatchesForPeriod,
  defaultFinanceSystemConfig,
  ensureOpenPeriod,
  evaluateManualPayoutPolicy,
  failCheckoutIntent,
  findDueOpenPeriods,
  findRetryableFailedPeriods,
  formatPegExample,
  freezeFinanceConfigSnapshot,
  getCachedCoinUsdPeg,
  getCachedFinanceConfig,
  getCoinUsdPeg,
  getCurrentPeriodBounds,
  getNextCloseAt,
  getTargetThresholds,
  getUserPeriodAccrual,
  groupLiveLedgerRowsByCall,
  groupWalletLedgerByCall,
  invalidateFinanceConfigCache,
  isGiftWalletMetadata,
  isHostSalaryFinancialEntryType,
  isNonSalaryRewardType,
  labelEarningsMoneyCategory,
  labelSettlementComponent,
  listSalaryPeriods,
  loadFinanceSystemConfig,
  loadGiftSharePercents,
  loadSalaryPayoutDetailsByUserIds,
  loadSalaryPeriodDetail,
  markBatchAdminPaid,
  markBatchTlConfirmed,
  markPeriodAdminPaid,
  normalizeCycleType,
  normalizeFxRatio,
  normalizePayeeSalaryStatus,
  planHostShareTrueUps,
  postHostShareTrueUpWallet,
  reconcileBatch,
  recordBatchCreatedEvent,
  refreshFinanceConfigInBackground,
  resolveCatalogGiftById,
  resolveEarningsScopeAccess,
  resolveSessionCallId,
  resolveTargetThresholds,
  summarizeHostSettlementLines,
  targetBonusUsdForTier,
  updateFinanceSystemConfig,
  usdToCoins
});
