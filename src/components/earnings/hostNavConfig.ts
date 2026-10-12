/**
 * Female host (Host Studio) sidebar nav — L1 sections + L2 for earnings timeframe / call-log filters.
 */

export type HostTabKey =
  | 'overview'
  | 'targets'
  | 'earnings'
  | 'engagement'
  | 'ratings'
  | 'salary'
  | 'payout_cards'
  | 'call_logs';

export type HostEarningsTimeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type HostCallLogFilter = 'all' | 'missed' | 'answered' | 'non_friends' | 'friends';

export type HostNavIconName =
  | 'LayoutDashboard'
  | 'Zap'
  | 'TrendingUp'
  | 'PhoneCall'
  | 'Star'
  | 'ShieldCheck'
  | 'CreditCard'
  | 'History'
  | 'Calendar'
  | 'Users'
  | 'UserPlus';

export interface HostNavL2Item {
  id: string;
  label: string;
  icon?: HostNavIconName;
}

export interface HostNavL1Item {
  id: HostTabKey;
  label: string;
  icon: HostNavIconName;
  buttonId?: string;
  children?: HostNavL2Item[];
  title?: string;
  /** Hide when host cannot earn coins */
  requiresCanEarn?: boolean;
}

export interface HostNavGroup {
  id: string;
  label: string;
  items: HostNavL1Item[];
}

export const HOST_NAV_GROUPS: HostNavGroup[] = [
  {
    id: 'home',
    label: 'Studio',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        icon: 'LayoutDashboard',
        buttonId: 'host-nav-overview',
        title: 'Period & lifetime snapshot',
      },
      {
        id: 'targets',
        label: 'Targets',
        icon: 'Zap',
        buttonId: 'host-nav-targets',
        title: 'Targets & daily checklist',
      },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      {
        id: 'earnings',
        label: 'Earnings',
        icon: 'TrendingUp',
        buttonId: 'host-nav-earnings',
        requiresCanEarn: true,
        title: 'Week / month / lifetime finance ledger',
      },
      {
        id: 'salary',
        label: 'Salary',
        icon: 'ShieldCheck',
        buttonId: 'host-nav-salary',
        requiresCanEarn: true,
        title: 'Salary status & settlements',
      },
      {
        id: 'payout_cards',
        label: 'Payout Cards',
        icon: 'CreditCard',
        buttonId: 'host-nav-payout-cards',
        requiresCanEarn: true,
        title: 'PayPal, bank, and wallet details for local salary pay',
      },
    ],
  },
  {
    id: 'activity',
    label: 'Activity',
    items: [
      {
        id: 'engagement',
        label: 'Engagement',
        icon: 'PhoneCall',
        buttonId: 'host-nav-engagement',
      },
      {
        id: 'ratings',
        label: 'Ratings',
        icon: 'Star',
        buttonId: 'host-nav-ratings',
      },
      {
        id: 'call_logs',
        label: 'Call Logs',
        icon: 'History',
        buttonId: 'host-nav-call-logs',
        children: [
          { id: 'all', label: 'All', icon: 'History' },
          { id: 'missed', label: 'Missed', icon: 'PhoneCall' },
          { id: 'answered', label: 'Answered', icon: 'PhoneCall' },
          { id: 'non_friends', label: 'Non-friends', icon: 'UserPlus' },
          { id: 'friends', label: 'Friends', icon: 'Users' },
        ],
      },
    ],
  },
];

export function getHostNavGroups(canEarnCoins: boolean): HostNavGroup[] {
  return HOST_NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.requiresCanEarn || canEarnCoins),
  })).filter((g) => g.items.length > 0);
}

export function findHostNavL1(id: HostTabKey, canEarnCoins = true): HostNavL1Item | undefined {
  for (const g of getHostNavGroups(canEarnCoins)) {
    const hit = g.items.find((i) => i.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function defaultL2ForHostTab(tab: HostTabKey, canEarnCoins = true): string | undefined {
  const item = findHostNavL1(tab, canEarnCoins);
  return item?.children?.[0]?.id;
}

export function getHostSectionLabel(
  tab: HostTabKey,
  nestedKey?: string,
  canEarnCoins = true
): string {
  const item = findHostNavL1(tab, canEarnCoins);
  if (!item) return 'Host Studio';
  if (nestedKey && item.children) {
    const child = item.children.find((c) => c.id === nestedKey);
    if (child) return `${item.label} · ${child.label}`;
  }
  return item.label;
}

/** Map shell L1 → FemaleHostAnalyticsDashboard section key (overview handled separately). */
export function hostTabToAnalyticsSection(
  tab: HostTabKey
): 'targets' | 'financial' | 'engagement' | 'ratings' | 'payouts' | null {
  switch (tab) {
    case 'targets':
      return 'targets';
    case 'earnings':
      return 'financial';
    case 'engagement':
      return 'engagement';
    case 'ratings':
      return 'ratings';
    case 'salary':
      return 'payouts';
    default:
      return null;
  }
}
