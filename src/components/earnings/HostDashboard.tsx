import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { HostShell } from './HostShell';
import { FemaleHostAnalyticsDashboard, type HostAnalyticsSection } from './FemaleHostAnalyticsDashboard';
import { FemaleCallLogsView } from './FemaleCallLogsView';
import { EarningsPeriodDashboard } from '../finance/EarningsPeriodDashboard';
import { PayoutCardsPanel } from '../payout/PayoutCardsPanel';
import {
  HostCallLogFilter,
  HostEarningsTimeframe,
  HostTabKey,
  defaultL2ForHostTab,
  hostTabToAnalyticsSection,
} from './hostNavConfig';

export type HostAppSurface = 'earnings' | 'call_logs';

interface HostDashboardProps {
  /** App-level tab that opened this shell (`/earnings` vs `/call-logs`). */
  appSurface: HostAppSurface;
  onAppSurfaceChange: (surface: HostAppSurface) => void;
  onOpenChat?: (userId: string) => void;
  onStartCall?: (userId: string) => void;
  onOpenProfile?: (userId: string) => void;
}

const CALL_LOG_FILTERS: HostCallLogFilter[] = [
  'all',
  'missed',
  'answered',
  'non_friends',
  'friends',
];

function isCallLogFilter(v: string | undefined): v is HostCallLogFilter {
  return Boolean(v && (CALL_LOG_FILTERS as string[]).includes(v));
}

export const HostDashboard: React.FC<HostDashboardProps> = ({
  appSurface,
  onAppSurfaceChange,
  onOpenChat,
  onStartCall,
  onOpenProfile,
}) => {
  const { currentUser, systemSettings, callLogs } = useApp();

  const canEarnCoins =
    Boolean(currentUser.teamLeaderId) || Boolean(systemSettings.enableRegularFemaleCoinEarning);

  const [hostTab, setHostTab] = useState<HostTabKey>(() =>
    appSurface === 'call_logs' ? 'call_logs' : 'overview'
  );
  const [nestedKey, setNestedKey] = useState<string | undefined>(() =>
    appSurface === 'call_logs' ? 'all' : undefined
  );
  const [timeframe, setTimeframe] = useState<HostEarningsTimeframe>('daily');
  const [callFilter, setCallFilter] = useState<HostCallLogFilter>('all');

  // Sync shell L1 when app navigates between /earnings and /call-logs.
  useEffect(() => {
    if (appSurface === 'call_logs') {
      setHostTab('call_logs');
      setNestedKey((prev) => (isCallLogFilter(prev) ? prev : 'all'));
      setCallFilter((prev) => prev || 'all');
      return;
    }
    setHostTab((prev) => (prev === 'call_logs' ? 'overview' : prev));
  }, [appSurface]);

  const missedBadge = useMemo(() => {
    const selfIds = new Set(
      [currentUser.id, currentUser.authId].map((id) => String(id || '').trim()).filter(Boolean)
    );
    const isSelf = (id?: string) => Boolean(id && selfIds.has(String(id)));
    const count = callLogs.filter(
      (l) =>
        (isSelf(l.receiverId) || isSelf((l as { hostId?: string }).hostId)) &&
        (l.status === 'missed' || l.status === 'declined' || l.status === 'unanswered')
    ).length;
    return count > 0 ? count : undefined;
  }, [callLogs, currentUser.id, currentUser.authId]);

  const analyticsSection: HostAnalyticsSection =
    hostTab === 'overview'
      ? 'overview'
      : hostTabToAnalyticsSection(hostTab) || 'overview';

  const handleNavigateTab = (tab: HostTabKey, nested?: string) => {
    setHostTab(tab);

    if (tab === 'call_logs') {
      const fallback = defaultL2ForHostTab(tab, canEarnCoins);
      const filter: HostCallLogFilter = isCallLogFilter(nested)
        ? nested
        : isCallLogFilter(fallback)
          ? fallback
          : 'all';
      setNestedKey(filter);
      setCallFilter(filter);
      if (appSurface !== 'call_logs') onAppSurfaceChange('call_logs');
      return;
    }

    if (tab === 'earnings') {
      setNestedKey(undefined);
      if (appSurface !== 'earnings') onAppSurfaceChange('earnings');
      return;
    }

    setNestedKey(undefined);
    if (appSurface !== 'earnings') onAppSurfaceChange('earnings');
  };

  const activeNestedKey = hostTab === 'call_logs' ? callFilter : nestedKey;

  return (
    <HostShell
      activeTab={hostTab}
      activeNestedKey={activeNestedKey}
      canEarnCoins={canEarnCoins}
      onNavigateTab={handleNavigateTab}
      badges={missedBadge != null ? { call_logs: missedBadge } : undefined}
    >
      {hostTab === 'call_logs' ? (
        <FemaleCallLogsView
          shellMode
          activeFilter={callFilter}
          onFilterChange={(f) => {
            setCallFilter(f);
            setNestedKey(f);
          }}
          onOpenChat={(id) => onOpenChat?.(id)}
          onStartCall={(id) => onStartCall?.(id)}
          onOpenProfile={(id) => onOpenProfile?.(id)}
        />
      ) : hostTab === 'earnings' ? (
        <EarningsPeriodDashboard scope="host" accent="emerald" title="Your host earnings" />
      ) : hostTab === 'payout_cards' ? (
        <PayoutCardsPanel
          title="Your payout cards"
          subtitle="Save PayPal, bank, or wallet details so admin and your agency can pay your period-end salary locally."
        />
      ) : (
        <FemaleHostAnalyticsDashboard
          shellMode
          activeSection={analyticsSection}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          onOpenCallLogs={() => handleNavigateTab('call_logs', callFilter || 'all')}
          onOpenPayoutCards={() => handleNavigateTab('payout_cards')}
          onOpenChat={onOpenChat}
          onStartCall={onStartCall}
        />
      )}
    </HostShell>
  );
};
