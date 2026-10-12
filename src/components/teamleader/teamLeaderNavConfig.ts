/**
 * Team Leader sidebar nav — L1 mirrors TeamLeaderDashboard activeTab keys.
 * Keys must stay stable for automation ids (tl-tab-*).
 */

export type TeamLeaderTabKey =
  | 'creators'
  | 'leaderboard'
  | 'analytics'
  | 'tl_earnings'
  | 'host_earnings'
  | 'payouts'
  | 'payout_cards'
  | 'agency';

export type TeamLeaderNavActionKey = 'sync-db' | 'create-creator';

export type TeamLeaderNavIconName =
  | 'Users'
  | 'Crown'
  | 'TrendingUp'
  | 'DollarSign'
  | 'Wallet'
  | 'Coins'
  | 'CreditCard'
  | 'Building'
  | 'RefreshCw'
  | 'UserPlus'
  | 'Sparkles'
  | 'Award';

export interface TeamLeaderNavL2Item {
  id: string;
  label: string;
  icon?: TeamLeaderNavIconName;
}

export interface TeamLeaderNavL1Item {
  id: TeamLeaderTabKey | TeamLeaderNavActionKey;
  label: string;
  icon: TeamLeaderNavIconName;
  buttonId?: string;
  kind: 'tab' | 'action';
  children?: TeamLeaderNavL2Item[];
  title?: string;
}

export interface TeamLeaderNavGroup {
  id: string;
  label: string;
  items: TeamLeaderNavL1Item[];
}

export const TEAM_LEADER_NAV_GROUPS: TeamLeaderNavGroup[] = [
  {
    id: 'roster',
    label: 'Roster',
    items: [
      {
        id: 'creators',
        label: 'My Creators',
        icon: 'Users',
        kind: 'tab',
        buttonId: 'tl-tab-creators',
      },
    ],
  },
  {
    id: 'performance',
    label: 'Performance',
    items: [
      {
        id: 'leaderboard',
        label: 'Target Leaderboard',
        icon: 'Crown',
        kind: 'tab',
        buttonId: 'tl-tab-leaderboard',
        children: [
          { id: 'milestones', label: 'Milestones', icon: 'Sparkles' },
          { id: 'rankings', label: 'Rankings', icon: 'Award' },
        ],
      },
      {
        id: 'analytics',
        label: 'Call History',
        icon: 'TrendingUp',
        kind: 'tab',
        buttonId: 'tl-tab-analytics',
      },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      {
        id: 'tl_earnings',
        label: 'Agency Earnings',
        icon: 'Wallet',
        kind: 'tab',
        buttonId: 'tl-tab-tl-earnings',
        title: 'Your commission week / month / lifetime',
      },
      {
        id: 'host_earnings',
        label: 'Host Earnings',
        icon: 'Coins',
        kind: 'tab',
        buttonId: 'tl-tab-host-earnings',
        title: 'Managed hosts week / month / lifetime',
      },
      {
        id: 'payouts',
        label: 'Settlements',
        icon: 'DollarSign',
        kind: 'tab',
        buttonId: 'tl-tab-payouts',
      },
      {
        id: 'payout_cards',
        label: 'Payout Cards',
        icon: 'CreditCard',
        kind: 'tab',
        buttonId: 'tl-tab-payout-cards',
        title: 'Your payout details and managed hosts’ cards for local salary pay',
      },
    ],
  },
  {
    id: 'profile',
    label: 'Profile',
    items: [
      {
        id: 'agency',
        label: 'Agency Guild',
        icon: 'Building',
        kind: 'tab',
        buttonId: 'tl-tab-agency',
      },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    items: [
      {
        id: 'sync-db',
        label: 'Sync Database',
        icon: 'RefreshCw',
        kind: 'action',
        buttonId: 'tl-sync-db-btn',
        title: 'Sync and refresh latest creators from Supabase database',
      },
      {
        id: 'create-creator',
        label: 'Create Female Creator',
        icon: 'UserPlus',
        kind: 'action',
        buttonId: 'tl-create-creator-btn',
      },
    ],
  },
];

export function findTeamLeaderNavL1(id: string): TeamLeaderNavL1Item | undefined {
  for (const group of TEAM_LEADER_NAV_GROUPS) {
    const found = group.items.find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

export function defaultL2ForTeamLeaderTab(tab: TeamLeaderTabKey): string | undefined {
  const item = findTeamLeaderNavL1(tab);
  return item?.children?.[0]?.id;
}
