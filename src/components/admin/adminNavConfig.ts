/**
 * Admin sidebar nav tree — L1 mirrors AdminDashboard activeSubTab keys;
 * L2 mirrors nested tabs inside each panel. Keys must stay stable for deep-links.
 */

export type AdminSubTabKey =
  | 'analytics'
  | 'monitoring'
  | 'financials'
  | 'finance-module'
  | 'gifts'
  | 'countries'
  | 'creator-ops'
  | 'livekit'
  | 'infra'
  | 'api-health'
  | 'system-testing'
  | 'email'
  | 'skus'
  | 'leaders'
  | 'payouts'
  | 'users'
  | 'cms'
  | 'cms-navigation';

/** Non-tab sidebar actions (Setup Wizard / Reset Data). */
export type AdminNavActionKey = 'setup-wizard' | 'reset-data';

export type AdminNavIconName =
  | 'TrendingUp'
  | 'Radio'
  | 'Coins'
  | 'Package'
  | 'Gift'
  | 'Landmark'
  | 'History'
  | 'Users'
  | 'Crown'
  | 'Target'
  | 'Globe'
  | 'Key'
  | 'Database'
  | 'Activity'
  | 'Mail'
  | 'Layers'
  | 'Rocket'
  | 'Trash2'
  | 'LayoutDashboard'
  | 'Building2'
  | 'ShieldAlert'
  | 'Award'
  | 'Percent'
  | 'Wallet'
  | 'Banknote'
  | 'CalendarClock'
  | 'Cloud'
  | 'Shield'
  | 'Sliders'
  | 'FileCode2'
  | 'Image'
  | 'FileText'
  | 'Zap'
  | 'LayoutTemplate'
  | 'BarChart3'
  | 'Ruler'
  | 'Languages'
  | 'Sparkles'
  | 'Heart'
  | 'FlaskConical';

export interface AdminNavL2Item {
  id: string;
  label: string;
  icon?: AdminNavIconName;
}

export interface AdminNavL1Item {
  /** Tab key, or action key for Setup/Reset. */
  id: AdminSubTabKey | AdminNavActionKey;
  label: string;
  icon: AdminNavIconName;
  /** Preserve existing automation button ids where applicable. */
  buttonId?: string;
  kind: 'tab' | 'action';
  children?: AdminNavL2Item[];
  /** Optional title attribute. */
  title?: string;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavL1Item[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        id: 'analytics',
        label: 'Analytics Hub',
        icon: 'TrendingUp',
        kind: 'tab',
        buttonId: 'admin-master-analytics-tab-btn',
        children: [
          { id: 'overview', label: 'Overview', icon: 'LayoutDashboard' },
          { id: 'users', label: 'Users & Cohorts', icon: 'Users' },
          { id: 'finance', label: 'Money map', icon: 'Landmark' },
          { id: 'creators', label: 'Creators & Supply', icon: 'Award' },
          { id: 'agencies', label: 'Agencies', icon: 'Building2' },
          { id: 'risk', label: 'Risk & Quality', icon: 'ShieldAlert' },
        ],
      },
      {
        id: 'monitoring',
        label: 'Live Call Surveillance',
        icon: 'Radio',
        kind: 'tab',
      },
    ],
  },
  {
    id: 'economy',
    label: 'Economy',
    items: [
      {
        id: 'financials',
        label: 'Coin Burn & Economy',
        icon: 'Coins',
        kind: 'tab',
        buttonId: 'admin-economy-config-tab-btn',
        title: 'Coin burn rates, revenue shares, peg & payout thresholds',
        children: [
          { id: 'A', label: 'Coin burn rates', icon: 'Coins' },
          { id: 'B', label: 'Call revenue shares', icon: 'Percent' },
          { id: 'C', label: 'Gift / tip shares', icon: 'Gift' },
          { id: 'D', label: 'Peg & payout thresholds', icon: 'Wallet' },
          { id: 'E', label: 'Package / peg preview', icon: 'Package' },
          { id: 'F', label: 'Legacy knobs', icon: 'Sliders' },
        ],
      },
      { id: 'skus', label: 'SKU Bundles', icon: 'Package', kind: 'tab' },
      {
        id: 'gifts',
        label: 'Virtual Gifts',
        icon: 'Gift',
        kind: 'tab',
        buttonId: 'admin-virtual-gifts-tab-btn',
      },
      {
        id: 'finance-module',
        label: 'Financial Module',
        icon: 'Landmark',
        kind: 'tab',
        children: [
          { id: 'live_ledger', label: 'Live ledger', icon: 'Coins' },
          { id: 'platform', label: 'Platform earnings', icon: 'Landmark' },
          { id: 'team_leaders', label: 'Team leader earnings', icon: 'Building2' },
          { id: 'hosts', label: 'Host earnings', icon: 'Users' },
          { id: 'funding', label: 'Funding / Purchases', icon: 'Coins' },
          { id: 'batches', label: 'Payout / settlement requests', icon: 'Wallet' },
          { id: 'settlement', label: 'Payment settlement', icon: 'Banknote' },
          { id: 'period', label: 'Period & close settings', icon: 'CalendarClock' },
        ],
      },
      { id: 'payouts', label: 'Legacy Payout History', icon: 'History', kind: 'tab' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'users', label: 'User Directory', icon: 'Users', kind: 'tab' },
      {
        id: 'leaders',
        label: 'Team Leaders',
        icon: 'Crown',
        kind: 'tab',
        buttonId: 'admin-leaders-tab-btn',
      },
      {
        id: 'creator-ops',
        label: 'Creator Ops',
        icon: 'Target',
        kind: 'tab',
        buttonId: 'admin-creator-ops-tab-btn',
        children: [
          { id: 'analytics', label: 'Performance & Intelligence', icon: 'BarChart3' },
          { id: 'matrix', label: 'Rotational Priority Matrix', icon: 'Zap' },
          { id: 'targets', label: 'Target Thresholds & Bonuses', icon: 'Crown' },
        ],
      },
      {
        id: 'countries',
        label: 'Taxonomies & Attributes',
        icon: 'Globe',
        kind: 'tab',
        buttonId: 'admin-countries-tab-btn',
        children: [
          { id: 'countries', label: 'Countries & Flags', icon: 'Globe' },
          { id: 'flag_sizes', label: 'SVG Flag Sizing', icon: 'Ruler' },
          { id: 'languages', label: 'Spoken Languages', icon: 'Languages' },
          { id: 'zodiac', label: 'Zodiac Signs', icon: 'Sparkles' },
          { id: 'interests', label: 'Categorized Interests', icon: 'Heart' },
          { id: 'currencies', label: 'Currencies', icon: 'Banknote' },
        ],
      },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    items: [
      { id: 'livekit', label: 'LiveKit API Keys', icon: 'Key', kind: 'tab' },
      {
        id: 'infra',
        label: 'Settings',
        icon: 'Database',
        kind: 'tab',
        children: [
          { id: 'db_pool', label: 'Database & Pooling', icon: 'Database' },
          { id: 'r2_storage', label: 'Cloudflare R2 Storage', icon: 'Cloud' },
          { id: 'moderation', label: 'Content Moderation', icon: 'Shield' },
          { id: 'features', label: 'Global Feature Toggles', icon: 'Sliders' },
          { id: 'sql_schema', label: 'SQL Schema & RLS', icon: 'FileCode2' },
        ],
      },
      { id: 'api-health', label: 'API Health', icon: 'Activity', kind: 'tab' },
      {
        id: 'system-testing',
        label: 'System Testing',
        icon: 'FlaskConical',
        kind: 'tab',
        title: 'Redis, database pooler, billing safety, LiveKit, and realtime diagnostics',
      },
      { id: 'email', label: 'Email', icon: 'Mail', kind: 'tab' },
    ],
  },
  {
    id: 'cms',
    label: 'CMS',
    items: [
      {
        id: 'cms',
        label: 'Home CMS & Policies',
        icon: 'Layers',
        kind: 'tab',
        children: [
          { id: 'banners', label: 'Hero Banners', icon: 'Image' },
          { id: 'policies', label: 'Policies & Terms', icon: 'FileText' },
          { id: 'shortcuts', label: 'Quick Shortcuts', icon: 'Zap' },
          { id: 'discovery_card', label: 'Discovery Card', icon: 'LayoutTemplate' },
        ],
      },
      {
        id: 'cms-navigation',
        label: 'Navigation Editor',
        icon: 'LayoutTemplate',
        kind: 'tab',
      },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    items: [
      {
        id: 'setup-wizard',
        label: 'Setup Wizard GUI',
        icon: 'Rocket',
        kind: 'action',
        title: 'Launch Full Server Setup & VPS Installation Wizard (/server-setup)',
      },
      {
        id: 'reset-data',
        label: 'Reset Data',
        icon: 'Trash2',
        kind: 'action',
        buttonId: 'admin-open-reset-mock-modal-btn',
        title: 'Open Destructive Data Reset Manager (ALLOW_FACTORY_RESET required)',
      },
    ],
  },
];

export function findAdminNavL1(id: string): AdminNavL1Item | undefined {
  for (const group of ADMIN_NAV_GROUPS) {
    const found = group.items.find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

export function defaultL2ForTab(tab: AdminSubTabKey): string | undefined {
  const item = findAdminNavL1(tab);
  return item?.children?.[0]?.id;
}
