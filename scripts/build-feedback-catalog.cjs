const fs = require('fs');
const inv = JSON.parse(fs.readFileSync('scripts/toast-inventory.json', 'utf8'));

function slug(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'item'
  );
}

function categoryFromFile(file, title) {
  const f = file.toLowerCase();
  const t = title.toLowerCase();
  if (
    f.includes('auth') ||
    t.includes('sign in') ||
    t.includes('password') ||
    t.includes('otp') ||
    t.includes('logged')
  )
    return 'auth';
  if (f.includes('onboarding') || t.includes('registration')) return 'onboarding';
  if (
    f.includes('videocall') ||
    t.includes('call ') ||
    t.startsWith('call') ||
    t.includes('webrtc') ||
    t.includes('livekit')
  )
    return 'calls';
  if (t.includes('match') || f.includes('quickmatch') || f.includes('discovery')) return 'match';
  if (
    t.includes('gift') ||
    t.includes('tip') ||
    t.includes('coin') ||
    t.includes('purchase') ||
    t.includes('wallet') ||
    t.includes('insufficient')
  )
    return 'wallet';
  if (f.includes('chat') || t.includes('message') || t.includes('chat')) return 'chat';
  if (
    t.includes('friend') ||
    t.includes('block') ||
    t.includes('report') ||
    t.includes('favorite') ||
    t.includes('like') ||
    t.includes('moment') ||
    f.includes('moments')
  )
    return 'social';
  if (t.includes('payout') || f.includes('payout')) return 'payout';
  if (
    t.includes('profile') ||
    t.includes('photo') ||
    t.includes('avatar') ||
    t.includes('gender') ||
    t.includes('picture')
  )
    return 'profile';
  if (t.includes('upload') || t.includes('r2') || t.includes('media') || t.includes('image'))
    return 'media';
  if (
    f.includes('admin') ||
    f.includes('teamleader') ||
    t.includes('agency') ||
    t.includes('cms') ||
    t.includes('seed') ||
    t.includes('salary') ||
    t.includes('settlement') ||
    t.includes('finance')
  )
    return 'admin';
  if (
    t.includes('streak') ||
    t.includes('quest') ||
    t.includes('mission') ||
    t.includes('chest') ||
    t.includes('goal')
  )
    return 'wallet';
  return 'general';
}

function inferType(title, message) {
  const s = (title + ' ' + message).toLowerCase();
  if (/fail|error|denied|invalid|required|offline|busy|blocked|unavailable/.test(s)) return 'error';
  if (/warn|pending|lock|missed|empty/.test(s)) return 'warning';
  if (
    /success|saved|updated|connected|published|uploaded|added|complete|unlocked|sent|claimed|welcome/.test(
      s
    )
  )
    return 'success';
  return 'info';
}

const used = new Set();
const entries = [];
for (const row of inv) {
  let keyBase = slug(row.title);
  let key = keyBase;
  let n = 2;
  while (used.has(key)) key = `${keyBase}_${n++}`;
  used.add(key);
  const category = categoryFromFile(row.file, row.title);
  entries.push({
    key: `${category}.${key}`,
    kind: 'toast',
    category,
    title: row.title,
    message: row.message,
    defaultType: inferType(row.title, row.message),
  });
}

const templates = [
  {
    key: 'auth.welcome_back',
    kind: 'toast',
    category: 'auth',
    title: 'Welcome Back! 👋',
    message: 'Logged in as {name}',
    defaultType: 'success',
  },
  {
    key: 'calls.user_offline',
    kind: 'toast',
    category: 'calls',
    title: 'User Offline 🚫',
    message: '{name} is currently offline. Calls can only be placed when online.',
    defaultType: 'warning',
  },
  {
    key: 'calls.user_busy',
    kind: 'toast',
    category: 'calls',
    title: 'User Busy 🚫',
    message: '{name} is currently busy on another video call.',
    defaultType: 'warning',
  },
  {
    key: 'match.mutual_quick',
    kind: 'toast',
    category: 'match',
    title: '🎉 Mutual Match!',
    message: '{name} matched with you in Quick Match!',
    defaultType: 'success',
  },
  {
    key: 'match.mutual_discovery',
    kind: 'toast',
    category: 'match',
    title: '🎉 Mutual Match!',
    message: 'You and {name} matched!',
    defaultType: 'success',
  },
  {
    key: 'wallet.gift_insufficient',
    kind: 'toast',
    category: 'wallet',
    title: 'Insufficient Coins 🪙',
    message: 'Sending {gift} requires {amount} coins. Please buy coins!',
    defaultType: 'error',
  },
  {
    key: 'wallet.goal_contribution',
    kind: 'toast',
    category: 'wallet',
    title: 'Goal Contribution Sent! 🎉',
    message: 'Dropped {amount} 🪙 into creator goal target!',
    defaultType: 'success',
  },
  {
    key: 'wallet.quest_completed',
    kind: 'toast',
    category: 'wallet',
    title: 'Quest Completed! ✨',
    message: '+{amount} Free Coins earned from daily mission!',
    defaultType: 'success',
  },
  {
    key: 'wallet.master_chest',
    kind: 'toast',
    category: 'wallet',
    title: '🏆 Master Chest Unlocked!',
    message: '+{amount} Mega Bonus Coins added to your wallet!',
    defaultType: 'success',
  },
  {
    key: 'social.already_friends',
    kind: 'toast',
    category: 'social',
    title: 'Already Friends 👥',
    message: 'You and {name} are already connected as friends!',
    defaultType: 'info',
  },
  {
    key: 'social.friend_pending',
    kind: 'toast',
    category: 'social',
    title: 'Request Pending ⏳',
    message: 'Friend request already sent to {name}. Waiting for approval.',
    defaultType: 'info',
  },
  {
    key: 'social.user_blocked',
    kind: 'toast',
    category: 'social',
    title: 'User Blocked 🚫',
    message: 'User has been blocked. Reason: {detail}',
    defaultType: 'warning',
  },
  {
    key: 'general.error_detail',
    kind: 'toast',
    category: 'general',
    title: 'Error',
    message: '{detail}',
    defaultType: 'error',
  },
  {
    key: 'calls.unavailable_detail',
    kind: 'toast',
    category: 'calls',
    title: 'Call Unavailable 🚫',
    message: '{detail}',
    defaultType: 'error',
  },
];

const byKey = new Map(entries.map((e) => [e.key, e]));
for (const t of templates) {
  if (!byKey.has(t.key)) {
    entries.push(t);
    byKey.set(t.key, t);
  }
}
entries.sort((a, b) => a.key.localeCompare(b.key));

const header = `/**
 * Default UI feedback catalog (toasts / alerts / modals / inline).
 * DB overlays override title/message/defaultType/active by key.
 * Keys must stay stable — edit copy via Admin → CMS → Toasts & messages.
 */

export type FeedbackKind = 'toast' | 'alert' | 'modal' | 'inline';
export type FeedbackType = 'success' | 'error' | 'info' | 'warning';

export type FeedbackCatalogEntry = {
  key: string;
  kind: FeedbackKind;
  category: string;
  title: string;
  message: string;
  defaultType: FeedbackType;
};

export const FEEDBACK_CATEGORIES = [
  'auth',
  'onboarding',
  'calls',
  'match',
  'discovery',
  'wallet',
  'gifts',
  'chat',
  'social',
  'profile',
  'media',
  'payout',
  'presence',
  'general',
  'admin',
] as const;

export const DEFAULT_FEEDBACK_CATALOG: FeedbackCatalogEntry[] = `;

const helpers = `

export function feedbackFingerprint(title: string, message: string): string {
  return \`\${String(title || '').trim()}:::\${String(message || '').trim()}\`;
}

/** Map default title+message → key (static strings only; skips templates with {vars}). */
export function buildDefaultFingerprintIndex(
  catalog: FeedbackCatalogEntry[] = DEFAULT_FEEDBACK_CATALOG
): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of catalog) {
    if (e.message.includes('{') || e.title.includes('{')) continue;
    const fp = feedbackFingerprint(e.title, e.message);
    if (!map.has(fp)) map.set(fp, e.key);
  }
  return map;
}

export function applyFeedbackVars(
  template: string,
  vars?: Record<string, string | number | null | undefined>
): string {
  if (!vars) return template;
  return String(template).replace(/\\{([a-zA-Z0-9_]+)\\}/g, (_, name) => {
    const v = vars[name];
    return v == null ? '' : String(v);
  });
}

/** Inactive DB rows keep code defaults (no override). */
export function mergeFeedbackCatalog(
  defaults: FeedbackCatalogEntry[],
  overrides: Array<Partial<FeedbackCatalogEntry> & { key: string; active?: boolean }>
): FeedbackCatalogEntry[] {
  const map = new Map(defaults.map((d) => [d.key, { ...d }]));
  for (const row of overrides || []) {
    const key = String(row.key || '').trim();
    if (!key) continue;
    if (row.active === false) continue;
    const base = map.get(key) || {
      key,
      kind: (row.kind as FeedbackKind) || 'toast',
      category: row.category || 'general',
      title: row.title || key,
      message: row.message || '',
      defaultType: (row.defaultType as FeedbackType) || 'info',
    };
    map.set(key, {
      ...base,
      title: row.title != null ? String(row.title) : base.title,
      message: row.message != null ? String(row.message) : base.message,
      defaultType: (row.defaultType as FeedbackType) || base.defaultType,
      kind: (row.kind as FeedbackKind) || base.kind,
      category: row.category != null ? String(row.category) : base.category,
    });
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export type FeedbackDbRow = FeedbackCatalogEntry & { active: boolean; updatedAt?: string | null };

/** Admin table: every default + DB overlay state. */
export function buildAdminFeedbackList(
  defaults: FeedbackCatalogEntry[],
  dbRows: Array<{
    key: string;
    kind?: string;
    category?: string;
    title?: string;
    message?: string;
    default_type?: string;
    defaultType?: string;
    active?: boolean;
    updated_at?: string | null;
    updatedAt?: string | null;
  }>
): FeedbackDbRow[] {
  const dbByKey = new Map((dbRows || []).map((r) => [String(r.key), r] as const));
  const keys = new Set<string>([...defaults.map((d) => d.key), ...dbByKey.keys()]);
  const out: FeedbackDbRow[] = [];
  for (const key of keys) {
    const def = defaults.find((d) => d.key === key);
    const row = dbByKey.get(key);
    out.push({
      key,
      kind: (row?.kind as FeedbackKind) || def?.kind || 'toast',
      category: row?.category || def?.category || 'general',
      title: row?.title != null ? String(row.title) : def?.title || key,
      message: row?.message != null ? String(row.message) : def?.message || '',
      defaultType:
        (row?.defaultType as FeedbackType) ||
        (row?.default_type as FeedbackType) ||
        def?.defaultType ||
        'info',
      active: row ? row.active !== false : true,
      updatedAt: row?.updatedAt ?? row?.updated_at ?? null,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
`;

fs.mkdirSync('shared/cms', { recursive: true });
fs.writeFileSync(
  'shared/cms/feedbackCatalog.ts',
  header + JSON.stringify(entries, null, 2) + ';\n' + helpers
);
fs.writeFileSync('shared/cms/feedbackCatalog.defaults.json', JSON.stringify(entries, null, 2));
console.log('entries', entries.length);
console.log('wrote shared/cms/feedbackCatalog.ts + feedbackCatalog.defaults.json');
