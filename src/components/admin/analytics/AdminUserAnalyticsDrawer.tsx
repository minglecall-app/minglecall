import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  LogIn,
  ShieldCheck,
  Coins,
  PhoneCall,
  Users,
  AlertTriangle,
  Sparkles,
  Building2,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { UserProfile } from '../../../types';
import { AnalyticsDashboardHub } from '../../earnings/AnalyticsDashboardHub';
import { RoleBadge } from './RoleBadge';
import {
  DateRange,
  buildDateRange,
  computeUserEarningsDetail,
  getAgencyRoster,
  isEarningEligibleCreator,
  resolveAdminAnalyticsRole,
  filterCallLogsByRange,
  getLogTimestamp,
  formatCoins,
  formatUsd,
} from '../../../utils/adminAnalytics';
import { computeCallerMetrics as computeCallerMetricsHelper } from '../../../utils/analyticsHelper';
import { getHostPeriodTargetProgress } from '../../../../shared/finance/hostPeriodTargetProgress';
import { HostPeriodTargetProgressPanel } from '../../common/HostPeriodTargetProgressPanel';
import { HostPeriodEarningsBreakdown } from '../../finance/HostPeriodEarningsBreakdown';
import {
  fetchAdminHostPeriodEarnings,
  type HostPeriodEarningsItem,
} from '../../../services/financeApi';

interface AdminUserAnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  range?: DateRange;
  onOverrideEarning?: (user: UserProfile) => void;
}

type DrawerTab = 'summary' | 'money' | 'calls' | 'social' | 'risk' | 'actions' | 'preview';

export const AdminUserAnalyticsDrawer: React.FC<AdminUserAnalyticsDrawerProps> = ({
  isOpen,
  onClose,
  user,
  range: rangeProp,
  onOverrideEarning,
}) => {
  const {
    switchUser,
    callLogs,
    payoutRequests,
    systemSettings,
    users,
    friendRequests,
    creatorMetricsMap,
  } = useApp();
  const [tab, setTab] = useState<DrawerTab>('summary');
  const [hostPeriodEarnings, setHostPeriodEarnings] = useState<HostPeriodEarningsItem[]>([]);
  const [hostPeriodLoading, setHostPeriodLoading] = useState(false);
  const range = rangeProp || buildDateRange('30d');

  const role = user ? resolveAdminAnalyticsRole(user) : 'other';
  const detail = useMemo(() => {
    if (!user) return null;
    return computeUserEarningsDetail(user, callLogs, payoutRequests, systemSettings, range);
  }, [user, callLogs, payoutRequests, systemSettings, range]);

  const bronzeProgress = useMemo(() => {
    if (!user || !isEarningEligibleCreator(user, systemSettings)) return null;
    const metrics = creatorMetricsMap[user.id];
    return getHostPeriodTargetProgress({
      creatorId: user.id,
      metrics: (metrics || {
        activeOnlineHours: 0,
        totalTargetCoins: 0,
        coinsEarnedFromCalls: 0,
        coinsEarnedFromGifts: 0,
      }) as unknown as Record<string, unknown>,
      systemSettings: systemSettings as unknown as Record<string, unknown>,
      coinEarnOverrideRate: user.coinEarnOverrideRate,
    });
  }, [user, systemSettings, creatorMetricsMap]);

  useEffect(() => {
    if (!isOpen || !user || role !== 'female_creator' || tab !== 'money') {
      return;
    }
    let cancelled = false;
    setHostPeriodLoading(true);
    void fetchAdminHostPeriodEarnings({ userId: user.id, limit: 8 }).then((res) => {
      if (cancelled) return;
      setHostPeriodLoading(false);
      setHostPeriodEarnings(res.success ? res.data?.periods || [] : []);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, role, tab]);

  const callerMetrics = useMemo(() => {
    if (!user) return null;
    return computeCallerMetricsHelper(user, callLogs, systemSettings);
  }, [user, callLogs, systemSettings]);

  const periodCalls = useMemo(() => {
    if (!user) return [];
    return filterCallLogsByRange(callLogs, range)
      .filter((l) => l.callerId === user.id || l.receiverId === user.id)
      .sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a))
      .slice(0, 40);
  }, [user, callLogs, range]);

  const agencyRoster = useMemo(() => {
    if (!user || role !== 'team_leader') return [];
    return getAgencyRoster(user, users).filter((u) => isEarningEligibleCreator(u, systemSettings));
  }, [user, role, users, systemSettings]);

  const socialFriends = useMemo(() => {
    if (!user) return [];
    return friendRequests.filter(
      (r) =>
        r.status === 'accepted' &&
        (r.senderId === user.id || r.receiverId === user.id)
    );
  }, [user, friendRequests]);

  if (!isOpen || !user) return null;

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'money', label: 'Money' },
    { id: 'calls', label: 'Calls' },
    { id: 'social', label: 'Social' },
    { id: 'risk', label: 'Risk' },
    { id: 'actions', label: 'Actions' },
    { id: 'preview', label: 'App preview' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl h-full bg-[#0B0F17] border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="shrink-0 px-4 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <img
                src={user.avatarUrl}
                alt=""
                className="w-12 h-12 rounded-2xl object-cover ring-2 ring-slate-700"
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0B0F17] ${
                  user.onlineStatus === 'online'
                    ? 'bg-emerald-400'
                    : user.onlineStatus === 'in_call'
                    ? 'bg-indigo-400'
                    : 'bg-slate-500'
                }`}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-white truncate">{user.name}</h2>
                {user.isVerified && <ShieldCheck className="w-4 h-4 text-blue-400" />}
                <RoleBadge role={role} />
              </div>
              <div className="text-[11px] font-mono text-slate-500 truncate">
                {user.email || user.id} · {user.country || user.nationality || '—'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="shrink-0 px-3 py-2 border-b border-slate-800 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold cursor-pointer ${
                  tab === t.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {tab === 'summary' && (
            <div className="space-y-3 text-xs font-mono">
              {bronzeProgress && (
                <HostPeriodTargetProgressPanel
                  progress={bronzeProgress}
                  variant="admin"
                  showDeepLinks
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">Status</div>
                  <div className="text-white font-bold capitalize">{user.onlineStatus || 'offline'}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">Country</div>
                  <div className="text-white font-bold">{user.country || user.nationality || '—'}</div>
                </div>
                {role === 'male_user' && (
                  <>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Balance</div>
                      <div className="text-amber-300 font-black">{formatCoins(user.coinBalance || 0)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Role</div>
                      <div className="text-indigo-300 font-bold uppercase">
                        {role.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </>
                )}
                {role === 'female_creator' && (
                  <>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Earnings bal</div>
                      <div className="text-emerald-400 font-black">{formatCoins(user.earningsCoins || 0)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Agency</div>
                      <div className="text-amber-300 font-bold truncate">
                        {users.find((u) => u.id === user.teamLeaderId)?.agencyName ||
                          user.agencyName ||
                          'Unmanaged'}
                      </div>
                    </div>
                  </>
                )}
                {role === 'female_user' && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 col-span-2">
                    <div className="text-slate-500">Earning eligibility</div>
                    <div
                      className={
                        isEarningEligibleCreator(user, systemSettings)
                          ? 'text-emerald-400 font-bold'
                          : 'text-pink-300 font-bold'
                      }
                    >
                      {isEarningEligibleCreator(user, systemSettings)
                        ? 'Eligible (system toggle on)'
                        : 'Not eligible — activity only (no fabricated earnings)'}
                    </div>
                  </div>
                )}
                {role === 'team_leader' && (
                  <>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Agency</div>
                      <div className="text-amber-300 font-bold">{user.agencyName || '—'}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Managed hosts</div>
                      <div className="text-white font-black">{agencyRoster.length}</div>
                    </div>
                  </>
                )}
              </div>
              <div className="text-slate-500">
                Period KPIs use the Analytics Hub date range ({range.preset}, UTC).
              </div>
            </div>
          )}

          {tab === 'money' && detail && (
            <div className="space-y-4 text-xs font-mono">
              {role === 'male_user' && callerMetrics && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold uppercase text-[10px]">
                    <Coins className="w-3.5 h-3.5" /> Spending details
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Lifetime spend</div>
                      <div className="text-amber-300 font-black">
                        {formatUsd(callerMetrics.totalUSDSpent)}
                      </div>
                      <div className="text-slate-500">{formatCoins(callerMetrics.totalCoinsSpent)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Wallet</div>
                      <div className="text-white font-black">{formatCoins(user.coinBalance || 0)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Month spend</div>
                      <div className="text-white font-bold">{formatUsd(callerMetrics.monthlyUSDSpent)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Gifts sent</div>
                      <div className="text-slate-400">
                        {callerMetrics.totalGiftsCount == null
                          ? 'No gifts-sent ledger'
                          : callerMetrics.totalGiftsCount}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {role === 'female_creator' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold uppercase text-[10px]">
                    <Sparkles className="w-3.5 h-3.5" /> Earnings details
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Period earned</div>
                      <div className="text-emerald-400 font-black">{formatUsd(detail.periodEarnedUSD)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Paid / Pending</div>
                      <div className="text-white font-bold">
                        {formatUsd(detail.paidUSD)} / {formatUsd(detail.pendingUSD)}
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-slate-500 uppercase text-[10px]">Split waterfall</div>
                    <div className="text-amber-300">Burn {formatCoins(detail.splitWaterfall.burnedOnHost)}</div>
                    <div className="text-emerald-400">Host {formatCoins(detail.splitWaterfall.hostShare)}</div>
                    <div className="text-amber-200">TL {formatCoins(detail.splitWaterfall.tlShare)}</div>
                    <div className="text-indigo-300">Platform {formatCoins(detail.splitWaterfall.platformShare)}</div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                      Closed period settlement breakdown
                    </div>
                    {Number(user.coinEarnOverrideRate) > 0 && (
                      <p className="text-[10px] text-amber-300/90 rounded-lg border border-amber-700/40 bg-amber-950/30 px-2.5 py-2">
                        coin_earn_override_rate &gt; 0 — share true-up is skipped at period close for this
                        host.
                      </p>
                    )}
                    {hostPeriodLoading ? (
                      <div className="flex items-center gap-2 text-slate-500 py-4">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading settlement breakdown…
                      </div>
                    ) : hostPeriodEarnings.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        No closed-period settlement rows yet. After period close, call base, target share
                        true-up, and tier cash bonus appear here.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {hostPeriodEarnings.map((p) => (
                          <HostPeriodEarningsBreakdown
                            key={p.periodId}
                            breakdown={p.breakdown}
                            compact
                            title={
                              p.periodStart && p.periodEnd
                                ? `${String(p.periodStart).slice(0, 10)} → ${String(p.periodEnd).slice(0, 10)}`
                                : p.periodId
                            }
                            subtitle={`${(p.cycleType || 'period').toUpperCase()} · ${
                              p.hasTrueUp ? 'includes share true-up' : 'no share true-up'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {role === 'female_user' && (
                <div className="p-4 rounded-xl border border-pink-500/20 bg-pink-500/5 text-pink-200/90">
                  Regular female — no fabricated earnings. Activity metrics live under Calls.
                  Eligibility:{' '}
                  {isEarningEligibleCreator(user, systemSettings) ? 'ON via system toggle' : 'OFF'}.
                </div>
              )}

              {role === 'team_leader' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-300 font-bold uppercase text-[10px]">
                    <Building2 className="w-3.5 h-3.5" /> Agency P&L (period)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Agency commission</div>
                      <div className="text-amber-300 font-black">{formatUsd(detail.periodEarnedUSD)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Roster</div>
                      <div className="text-white font-black">{agencyRoster.length}</div>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {agencyRoster.slice(0, 12).map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800/80"
                      >
                        <span className="text-white truncate">{h.name}</span>
                        <span className="text-emerald-400">{formatCoins(h.earningsCoins || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.payoutHistory.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-slate-500 mb-1">Payout history</div>
                  {detail.payoutHistory.slice(0, 8).map((p) => (
                    <div
                      key={p.id}
                      className="flex justify-between py-1.5 border-b border-slate-800/60 text-slate-300"
                    >
                      <span>{p.requestDate}</span>
                      <span className="text-emerald-400">{formatUsd(p.amountUSD)}</span>
                      <span className="text-slate-500">{p.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'calls' && (
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-400 uppercase text-[10px]">
                <PhoneCall className="w-3.5 h-3.5" /> Recent period calls ({periodCalls.length})
              </div>
              {periodCalls.length === 0 ? (
                <div className="text-slate-500 py-8 text-center">No calls in selected range.</div>
              ) : (
                periodCalls.map((l) => (
                  <div
                    key={l.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-white font-bold truncate">
                        {l.callerId === user.id ? `→ ${l.receiverName}` : `← ${l.callerName}`}
                      </div>
                      <div className="text-slate-500">
                        {Math.round((l.durationSeconds || 0) / 60)}m · {l.status || 'completed'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {l.callerId === user.id ? (
                        <div className="text-amber-300">-{l.coinsSpent || 0}</div>
                      ) : (
                        <div className="text-emerald-400">+{l.coinsEarned || 0}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'social' && (
            <div className="space-y-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-400 uppercase text-[10px]">
                <Users className="w-3.5 h-3.5" /> Friends / gifts
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                Accepted friend links involving this user: {socialFriends.length}
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-500">
                Gifts received count (profile):{' '}
                {typeof user.totalGiftsReceivedCount === 'number'
                  ? user.totalGiftsReceivedCount
                  : 'not stored'}
              </div>
              <div className="text-slate-500">
                Favorites are session-scoped for the logged-in user — not shown as admin social graph.
              </div>
            </div>
          )}

          {tab === 'risk' && (
            <div className="space-y-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-rose-300 uppercase text-[10px]">
                <AlertTriangle className="w-3.5 h-3.5" /> Risk
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                Banned: {user.isBanned ? `Yes — ${user.banReason || 'no reason'}` : 'No'}
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                Acceptance:{' '}
                {typeof user.acceptanceRatePercent === 'number'
                  ? `${user.acceptanceRatePercent}%`
                  : 'not stored'}
              </div>
              <div className="p-3 rounded-xl border border-dashed border-slate-700 text-slate-500">
                Reports/blocks for this user: insufficient platform risk feed — placeholder only.
              </div>
            </div>
          )}

          {tab === 'actions' && (
            <div className="space-y-3 text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  switchUser(user.id);
                  onClose();
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-200 font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-purple-600/30"
              >
                <LogIn className="w-4 h-4" /> Login as user
              </button>
              {(role === 'female_creator' || role === 'female_user') && onOverrideEarning && (
                <button
                  type="button"
                  onClick={() => onOverrideEarning(user)}
                  className="w-full px-3 py-2.5 rounded-xl bg-pink-600/20 border border-pink-500/30 text-pink-200 font-bold cursor-pointer hover:bg-pink-600/30"
                >
                  Override earning rate
                </button>
              )}
              <p className="text-slate-500">
                Host Math deep tool is available under Creators → Creator Performance.
              </p>
            </div>
          )}

          {tab === 'preview' && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono text-slate-500">
                Consumer app analytics preview — not the primary admin money view.
              </p>
              <div className="rounded-2xl border border-slate-800 overflow-hidden bg-[#090C13]">
                <AnalyticsDashboardHub user={user} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
