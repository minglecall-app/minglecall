import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  DollarSign,
  TrendingUp,
  Video,
  Gift,
  Clock,
  AlertCircle,
  CheckCircle2,
  Building,
  CreditCard,
  Wallet,
  ShieldCheck,
  History,
  PhoneCall,
  Users,
  Eye,
  Star,
  Zap,
  Activity,
  Layers,
  Award,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Filter,
  BarChart3,
  PieChart as PieChartIcon,
  HelpCircle,
  Lock,
  ChevronRight,
  RefreshCw,
  Globe,
  MessageCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { UserProfile } from '../../types';
import {
  computeHostEarningsData,
  computeHostMetrics,
  EarningsDataPoint,
} from '../../utils/analyticsHelper';
import { getCoinUsdPeg, coinsToUsd } from '../../../shared/finance/fx';
import { getHostPeriodTargetProgress } from '../../../shared/finance/hostPeriodTargetProgress';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';
import { CreatorTargetProgressCard } from './CreatorTargetProgressCard';
import { CreatorDailyChecklistWidget } from './CreatorDailyChecklistWidget';
import { HostSalaryStatusPanel } from './HostSalaryStatusPanel';
import type { CreatorMetrics } from '../../types';

/** Female hosts managed by a Team Leader — mirrors TeamLeaderDashboard managedCreators. */
function getManagedHostsForLeader(leader: UserProfile, allUsers: UserProfile[]): UserProfile[] {
  return allUsers.filter((u) => {
    if (u.id === leader.id || (leader.authId && u.authId === leader.authId)) return false;
    if (u.role === 'team_leader' || u.role === 'agency_manager' || u.role === 'admin') return false;
    const isFemale = u.gender === 'female' || u.role === 'female_creator' || u.role === 'female_host';
    if (!isFemale) return false;
    if (
      u.teamLeaderId === leader.id ||
      u.createdById === leader.id ||
      (leader.authId && (u.teamLeaderId === leader.authId || u.createdById === leader.authId))
    ) {
      return true;
    }
    if (
      leader.agencyName &&
      u.agencyName &&
      u.agencyName.trim().toLowerCase() === leader.agencyName.trim().toLowerCase()
    ) {
      return true;
    }
    if (
      leader.email === 'teamleader@livecall.app' &&
      (!u.teamLeaderId || u.teamLeaderId === 'teamleader_elena' || u.teamLeaderId === leader.id)
    ) {
      return true;
    }
    return false;
  });
}

export type HostAnalyticsSection =
  | 'overview'
  | 'targets'
  | 'financial'
  | 'engagement'
  | 'ratings'
  | 'payouts';

interface FemaleHostAnalyticsDashboardProps {
  user?: UserProfile;
  onOpenCallLogs?: () => void;
  onOpenChat?: (userId: string) => void;
  onStartCall?: (userId: string) => void;
  /** Navigate to Money → Payout Cards (HostShell). */
  onOpenPayoutCards?: () => void;
  /** When true, hide page banner / in-page tabs (HostShell owns chrome). */
  shellMode?: boolean;
  /** Controlled section when used inside HostShell. */
  activeSection?: HostAnalyticsSection;
  onSectionChange?: (section: HostAnalyticsSection) => void;
  timeframe?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  onTimeframeChange?: (tf: 'daily' | 'weekly' | 'monthly' | 'yearly') => void;
}

export const FemaleHostAnalyticsDashboard: React.FC<FemaleHostAnalyticsDashboardProps> = ({
  user,
  onOpenCallLogs,
  onOpenChat,
  onStartCall,
  onOpenPayoutCards,
  shellMode = false,
  activeSection: controlledSection,
  onSectionChange,
  timeframe: controlledTimeframe,
  onTimeframeChange,
}) => {
  const {
    currentUser,
    systemSettings,
    callLogs,
    virtualGifts,
    creatorReviews,
    refreshCreatorReviews,
    users,
    myCreatorMetrics,
    creatorMetricsMap,
  } = useApp();
  const activeUser = user || currentUser;

  useEffect(() => {
    if (!activeUser?.id) return;
    void refreshCreatorReviews(activeUser.id);
  }, [activeUser.id]);

  const isTeamLeaderViewer =
    activeUser.role === 'team_leader' || activeUser.role === 'agency_manager';

  const managedHosts = useMemo(
    () => (isTeamLeaderViewer ? getManagedHostsForLeader(activeUser, users) : []),
    [isTeamLeaderViewer, activeUser, users]
  );

  // Real Creator Reviews for this Host
  const hostReviews = useMemo(() => {
    return creatorReviews.filter((r) => r.creatorId === activeUser.id);
  }, [creatorReviews, activeUser.id]);

  // Real Dynamic Ratings Calculations
  const ratingsMetrics = useMemo(() => {
    const count = hostReviews.length;
    if (count === 0) {
      return {
        averageStars: 0,
        totalReviews: 0,
        scoreLabel: 'No reviews yet',
        communication: 0,
        friendliness: 0,
        clarity: 0,
        energy: 0,
      };
    }

    const sumStars = hostReviews.reduce((acc, r) => acc + (r.stars || 5), 0);
    const sumComm = hostReviews.reduce((acc, r) => acc + (r.communication || 5), 0);
    const sumFriend = hostReviews.reduce((acc, r) => acc + (r.friendliness || 5), 0);
    const sumClarity = hostReviews.reduce((acc, r) => acc + (r.clarity || 5), 0);
    const sumEnergy = hostReviews.reduce((acc, r) => acc + (r.energy || 5), 0);

    const avgStars = Number((sumStars / count).toFixed(2));
    const scoreLabel =
      avgStars >= 4.9
        ? 'Top 1% Creator Score'
        : avgStars >= 4.7
        ? 'Top 5% Creator Score'
        : avgStars >= 4.5
        ? 'Top Tier Creator Score'
        : 'Verified Creator Score';

    return {
      averageStars: avgStars,
      totalReviews: count,
      scoreLabel,
      communication: Number((sumComm / count).toFixed(1)),
      friendliness: Number((sumFriend / count).toFixed(1)),
      clarity: Number((sumClarity / count).toFixed(1)),
      energy: Number((sumEnergy / count).toFixed(1)),
    };
  }, [hostReviews]);

  // Real Dynamic Compliance & Attendance Metrics (call hours only — no invented standby/%)
  const complianceMetrics = useMemo(() => {
    const hostLogs = callLogs.filter((l) => l.receiverId === activeUser.id);
    const totalCallSeconds = hostLogs.reduce((acc, l) => acc + (l.durationSeconds || 0), 0);
    const totalCallHours = Number((totalCallSeconds / 3600).toFixed(1));

    const storedAcceptance =
      typeof activeUser.acceptanceRatePercent === 'number' &&
      Number.isFinite(activeUser.acceptanceRatePercent)
        ? activeUser.acceptanceRatePercent
        : null;

    const strikes = activeUser.isBanned ? 1 : 0;
    const healthScore = Math.max(0, 100 - strikes * 30);

    return {
      totalCallHours,
      acceptanceRate: storedAcceptance,
      strikes,
      healthScore,
    };
  }, [callLogs, activeUser]);

  // Determine if this female host has coin earning enabled
  const canEarnCoins = Boolean(activeUser.teamLeaderId) || Boolean(systemSettings.enableRegularFemaleCoinEarning);

  // Active Timeframe for Analytics Chart
  const [internalTimeframe, setInternalTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const timeframe = controlledTimeframe ?? internalTimeframe;
  const setTimeframe = (tf: 'daily' | 'weekly' | 'monthly' | 'yearly') => {
    onTimeframeChange?.(tf);
    if (controlledTimeframe === undefined) setInternalTimeframe(tf);
  };

  // Active Sub-tab in Analytics Dashboard
  const [internalSection, setInternalSection] = useState<HostAnalyticsSection>('targets');
  const activeSection = controlledSection ?? internalSection;
  const setActiveSection = (section: HostAnalyticsSection) => {
    onSectionChange?.(section);
    if (controlledSection === undefined) setInternalSection(section);
  };

  // Financial Calculations (Fixed Peg)
  // Header = CURRENT PERIOD (creator_metrics; resets on period close).
  // In-page CR-0.1 KPI = LIFETIME (hostMetrics.lifetimeUSD / wallet history).
  const peg = getCoinUsdPeg(systemSettings);

  const periodMetrics: CreatorMetrics = useMemo(() => {
    const fromMap = creatorMetricsMap[activeUser.id];
    if (fromMap) return fromMap;
    if (activeUser.id === currentUser.id && myCreatorMetrics) return myCreatorMetrics;
    return {
      creatorId: activeUser.id,
      activeOnlineSeconds: 0,
      activeOnlineHours: 0,
      coinsEarnedFromCalls: 0,
      coinsEarnedFromGifts: 0,
      totalTargetCoins: 0,
      currentStreakDays: 1,
      totalCallsOffered: 0,
      totalCallsAnswered: 0,
      totalCallsDeclined: 0,
      totalCallsMissed: 0,
      responseHealthScore: 100,
      performanceTier: 'bronze',
      isReadyNowActive: false,
      bonusEarnedCoins: 0,
      bonusEarnedUSD: 0,
    };
  }, [activeUser.id, currentUser.id, creatorMetricsMap, myCreatorMetrics]);

  const periodProgress = useMemo(
    () =>
      getHostPeriodTargetProgress({
        creatorId: activeUser.id,
        metrics: periodMetrics as unknown as Record<string, unknown>,
        systemSettings: systemSettings as unknown as Record<string, unknown>,
        coinEarnOverrideRate: activeUser.coinEarnOverrideRate,
      }),
    [activeUser.id, activeUser.coinEarnOverrideRate, periodMetrics, systemSettings]
  );

  const periodCoins = periodProgress.periodCoins;
  const periodUSD = coinsToUsd(periodCoins, peg);

  // Real Host Metrics computed dynamically from Supabase database call logs
  const hostMetrics = useMemo(() => {
    return computeHostMetrics(activeUser, callLogs, peg);
  }, [activeUser, callLogs, peg]);

  // Selected Graph Data computed dynamically from Supabase call logs
  const chartData = useMemo(() => {
    return computeHostEarningsData(activeUser.id, callLogs, peg, timeframe);
  }, [activeUser.id, callLogs, peg, timeframe]);

  // Real hourly volume breakdown from callLogs
  const peakHoursData = hostMetrics.peakHours;
  return (
    <div
      id="female-host-analytics-dashboard"
      className={
        shellMode
          ? 'space-y-5'
          : 'max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6'
      }
    >
      
      {/* 1. Header Banner — hidden inside HostShell */}
      {!shellMode && (
      <div className="relative rounded-3xl bg-gradient-to-r from-emerald-950 via-[#0E1B1B] to-[#0A0E17] border border-emerald-500/30 p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Glow ambient */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold font-mono">
              <Activity className="w-3.5 h-3.5" />
              <span>{canEarnCoins ? 'Female Creator Earnings & Performance Analytics' : 'Female Host Activity & Performance Analytics'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {canEarnCoins ? 'Host Performance & Financial Ledger' : 'Host Activity & Engagement Hub'}
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              {canEarnCoins
                ? 'Complete real-time transparency into your call minutes, virtual gift revenue, caller retention scores, and secure multi-gateway withdrawals.'
                : 'Detailed real-time metrics on your call volume, hosted sessions, caller ratings, and engagement performance.'}
            </p>
          </div>

          {/* Quick Balance Pill & Payout Action */}
          {canEarnCoins ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-900/90 border border-emerald-500/40 p-4 sm:p-5 rounded-2xl shadow-xl">
              <div>
                <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Current period earnings
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                  ${periodUSD.toFixed(2)} USD
                </div>
                <div className="text-[11px] text-emerald-300 font-mono flex items-center space-x-1 mt-0.5">
                  <span>🪙</span>
                  <span>{periodCoins.toLocaleString()} period coins</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 max-w-xs">
                  Resets when the target cycle closes. Lifetime revenue is in the KPIs below. Cash-out is period-end only — see Salary Status.
                </p>
              </div>

              <button
                id="host-open-salary-status-btn"
                onClick={() => setActiveSection('payouts')}
                className="mt-2 sm:mt-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs font-mono transition-all shadow-lg shadow-emerald-500/20 hover:scale-105 cursor-pointer flex items-center space-x-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>View Salary Status</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-slate-900/90 border border-pink-500/30 p-4 sm:p-5 rounded-2xl shadow-xl">
              <div>
                <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Host Account Status
                </div>
                <div className="text-lg font-black text-pink-300 font-mono">
                  Community Host
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {hostMetrics.totalCalls} Total Calls Hosted
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sub-Section Navigation Tabs */}
        <div className="flex items-center space-x-2 mt-6 pt-4 border-t border-slate-800/80 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveSection('targets')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 flex items-center space-x-1.5 ${
              activeSection === 'targets'
                ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-950/40 font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-yellow-300" />
            <span>Targets & Algorithmic Boosts</span>
          </button>

          {canEarnCoins && (
            <button
              onClick={() => setActiveSection('financial')}
              className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 flex items-center space-x-1.5 ${
                activeSection === 'financial'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Call Activity & Estimates</span>
            </button>
          )}

          <button
            onClick={() => setActiveSection('engagement')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 flex items-center space-x-1.5 ${
              activeSection === 'engagement'
                ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Call & Engagement Metrics</span>
          </button>

          <button
            onClick={() => setActiveSection('ratings')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 flex items-center space-x-1.5 ${
              activeSection === 'ratings'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            <span>Ratings & Quality Standing</span>
          </button>

          {canEarnCoins && (
            <button
              onClick={() => setActiveSection('payouts')}
              className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 flex items-center space-x-1.5 ${
                activeSection === 'payouts'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Salary Status</span>
            </button>
          )}
        </div>
      </div>
      )}

      {/* 2. TOP KPI CARDS — Overview only in shell; always when legacy layout */}
      {(!shellMode || activeSection === 'overview') && (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Revenue or Total Calls */}
        {canEarnCoins ? (
          <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
                <span>Lifetime Revenue</span>
              </span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">
              ${hostMetrics.lifetimeUSD.toFixed(2)}
            </div>
            <div className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1">
              <ArrowUpRight className="w-3 h-3" />
              <span>
                {(activeUser.earningsCoins ?? 0).toLocaleString()} 🪙 lifetime wallet ·{' '}
                {hostMetrics.totalCalls} completed sessions
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
                <span>Total Calls Hosted</span>
              </span>
              <PhoneCall className="w-4 h-4 text-pink-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">
              {hostMetrics.totalCalls}
            </div>
            <div className="text-[10px] text-pink-400 font-mono">
              Completed 1-on-1 calls
            </div>
          </div>
        )}

        {/* Card 2: Call Minutes */}
        <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
              <span>Call Minutes Hosted</span>
            </span>
            <Clock className="w-4 h-4 text-pink-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono">
            {hostMetrics.totalMinutes} <span className="text-xs text-slate-400 font-normal">mins</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {hostMetrics.totalCalls} Total 1-on-1 Sessions
          </div>
        </div>

        {/* Card 3: Virtual Gift Payouts or Social Engagements */}
        {canEarnCoins ? (
          <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
                <span>Gifts Received</span>
              </span>
              <Gift className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">
              {activeUser.totalGiftsReceivedCount || 0} <span className="text-xs text-amber-300 font-normal">tips</span>
            </div>
            <div className="text-[10px] text-amber-400 font-mono">
              {systemSettings.giftFemaleHostSharePercent ?? 70}% Host Share credited instantly
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
                <span>Connected Members</span>
              </span>
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">
              {hostMetrics.totalCallersCount} <span className="text-xs text-indigo-300 font-normal">callers</span>
            </div>
            <div className="text-[10px] text-indigo-300 font-mono">
              Active network & connections
            </div>
          </div>
        )}

        {/* Card 4: Quality & Acceptance Score */}
        <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
              <span>Host Quality Score</span>
            </span>
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400/20" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono flex items-center space-x-1.5">
            <span>
              {hostMetrics.hostQualityScore != null
                ? hostMetrics.hostQualityScore.toFixed(2)
                : 'N/A'}
            </span>
            {hostMetrics.hostQualityScore != null && (
              <span className="text-xs text-yellow-400 font-normal">★ / 5.0</span>
            )}
          </div>
          <div className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>
              {hostMetrics.acceptanceRatePercent != null
                ? `${hostMetrics.acceptanceRatePercent}% Call Acceptance Rate`
                : 'Acceptance rate N/A'}
            </span>
          </div>
        </div>
      </div>
      )}

      {/* Team Leader: Managed Hosts roster — Overview only in shell; always in legacy layout */}
      {isTeamLeaderViewer && (!shellMode || activeSection === 'overview') && (
        <div className="p-5 sm:p-6 bg-[#13161F] border border-amber-500/30 rounded-3xl space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Managed Hosts</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Female creators linked to {activeUser.agencyName || 'your agency'} ({managedHosts.length} host
                {managedHosts.length === 1 ? '' : 's'}).
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[11px] font-bold">
              {managedHosts.length} Managed
            </span>
          </div>

          {managedHosts.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-2xl">
              No managed hosts yet. Register creators from the Agency Hub.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Host</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Calls</th>
                    <th className="py-2.5 px-3">Minutes</th>
                    <th className="py-2.5 px-3">Earnings</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {[...managedHosts]
                    .sort((a, b) => (b.earningsCoins || 0) - (a.earningsCoins || 0))
                    .map((host) => {
                      const hostLogs = callLogs.filter((l) => l.receiverId === host.id);
                      const calls = hostLogs.length || host.totalCallsHosted || 0;
                      const mins =
                        hostLogs.reduce(
                          (acc, l) => acc + Math.round((l.durationSeconds || 0) / 60),
                          0
                        ) ||
                        host.totalCallMinutes ||
                        0;
                      const status = host.onlineStatus || 'offline';
                      return (
                        <tr key={host.id} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={host.avatarUrl}
                                alt={host.name}
                                className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-700 shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = getFallbackAvatar(
                                    host.name,
                                    'female',
                                    'female_creator'
                                  );
                                }}
                              />
                              <div className="min-w-0">
                                <div className="font-bold text-white truncate flex items-center gap-1">
                                  <span className="truncate">{host.name}</span>
                                  {host.isVerified && (
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono truncate">
                                  {host.nationality || '—'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                status === 'online'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : status === 'busy' || status === 'in_call'
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {String(status).replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-white">{calls}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-300">{mins}m</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-amber-300">
                            {(host.earningsCoins || 0).toLocaleString()} 🪙
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {onOpenChat && (
                                <button
                                  type="button"
                                  onClick={() => onOpenChat(host.id)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                                  title="Message host"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onStartCall && (
                                <button
                                  type="button"
                                  onClick={() => onStartCall(host.id)}
                                  className="p-1.5 rounded-lg bg-pink-600/80 hover:bg-pink-500 text-white cursor-pointer"
                                  title="Call host"
                                >
                                  <Video className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2.5 SECTION: CREATOR TARGETS & ALGORITHMIC BOOSTS */}
      {activeSection === 'targets' && (
        <div className="space-y-6">
          <CreatorTargetProgressCard />
          <CreatorDailyChecklistWidget />
        </div>
      )}

      {/* 3. SECTION 1: FINANCIAL & EARNINGS LEDGER */}
      {activeSection === 'financial' && (
        <div className="space-y-6">
          
          {/* Visual Earnings Trends Graph Card */}
          <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-white font-mono uppercase tracking-wider flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <span>Revenue & Earning Streams Breakdown</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Track call earnings from live call logs (coins × Coin USD Peg from Economy). Categories only appear when recorded in data.
                </p>
              </div>

              {/* Timeframe Filter Buttons — HostShell L2 owns this in shellMode */}
              {!shellMode && (
              <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold capitalize transition-all cursor-pointer ${
                      timeframe === tf
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              )}
            </div>

            {/* Recharts Area/Bar Graph — single real Call earnings series */}
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVideo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="period" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickFormatter={(val) => `$${val}`} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                    formatter={(value: any) => [`$${Number(value).toFixed(2)} USD`, '']}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    formatter={(val) => (
                      <span className="text-slate-300 font-mono text-xs capitalize">{val}</span>
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalUSD"
                    name="Call earnings ($)"
                    stroke="#10B981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorVideo)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Commission & Deductions Breakdown Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Transparent Commission Structure */}
            <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                  Commission & Deduction Breakdown
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Transparent revenue split structure ensuring creators keep the maximum value of all earned call minutes and gifts.
              </p>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-slate-300">Creator Base Revenue Share</span>
                  </div>
                  <span className="text-emerald-400 font-black text-sm">70.0%</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-slate-300">Top Host Tier Performance Bonus</span>
                  </div>
                  <span className="text-amber-400 font-black text-sm">+5.0%</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                    <span className="text-slate-400">Platform Streaming & AI Infrastructure</span>
                  </div>
                  <span className="text-slate-400 font-bold">25.0%</span>
                </div>

                <div className="p-3.5 bg-emerald-500/10 rounded-xl border border-emerald-500/30 flex items-center justify-between text-emerald-300">
                  <span className="font-bold">Total Effective Creator Net Payout</span>
                  <span className="font-black text-base">
                    75.0% Net (${getCoinUsdPeg(systemSettings)}/coin)
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Remittance overview → Money → Payout Cards */}
            <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
              <div className="flex items-center space-x-2">
                <Building className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                  Period-end settlement remittance
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Cash-out is period-end only via settlement batches. Save your PayPal, bank, or wallet
                details under Money → Payout Cards for local salary pay.
              </p>

              <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center space-x-3">
                  <Wallet className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white">PayPal</div>
                    <div className="text-[10px] text-slate-500">Wallet remittance</div>
                  </div>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center space-x-3">
                  <Building className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white">Bank Account</div>
                    <div className="text-[10px] text-slate-500">IBAN / wire</div>
                  </div>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center space-x-3">
                  <Zap className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white">Wallets</div>
                    <div className="text-[10px] text-slate-500">USDT, GCash, PIX…</div>
                  </div>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center space-x-3">
                  <CreditCard className="w-5 h-5 text-pink-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white">Your cards</div>
                    <div className="text-[10px] text-slate-500">Edit under Money</div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>
                  Cash-out:{' '}
                  <strong className="text-white">Period-end settlements only</strong>
                </span>
                {onOpenPayoutCards ? (
                  <button
                    type="button"
                    onClick={onOpenPayoutCards}
                    className="text-emerald-400 flex items-center space-x-1 hover:text-emerald-300"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Open Payout Cards</span>
                  </button>
                ) : (
                  <span className="text-emerald-400 flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Money → Payout Cards</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SECTION 2: CALL & ENGAGEMENT METRICS */}
      {activeSection === 'engagement' && (
        <div className="space-y-6">
          {/* Call Breakdown & Peak Hours Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Total Minutes Split */}
            <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <PhoneCall className="w-4 h-4 text-pink-400" />
                  <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                    Call Minutes by Session Type
                  </h3>
                </div>
                {onOpenCallLogs && (
                  <button
                    onClick={onOpenCallLogs}
                    className="text-xs text-pink-400 hover:text-pink-300 font-mono font-bold flex items-center space-x-1"
                  >
                    <span>Detailed Call Logs</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-3 font-mono text-xs">
                {/* 1-on-1 Video / Call Minutes */}
                <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center space-x-2">
                      <Video className="w-3.5 h-3.5 text-pink-400" />
                      <span>
                        {hostMetrics.hasCallTypeBreakdown
                          ? 'Private 1-on-1 Video Calls'
                          : 'Call Minutes'}
                      </span>
                    </span>
                    <span className="text-pink-400 font-black">
                      {hostMetrics.videoMinutes} mins
                      {hostMetrics.hasCallTypeBreakdown
                        ? ` (${hostMetrics.videoPercent}%)`
                        : ''}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-pink-500 h-full rounded-full"
                      style={{
                        width: `${hostMetrics.hasCallTypeBreakdown ? hostMetrics.videoPercent : 100}%`,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>{hostMetrics.videoSessions} sessions</span>
                    <span>Average: {hostMetrics.videoAvgMins} mins/call</span>
                  </div>
                </div>

                {/* Audio / Roulette only when call_logs actually record those flags */}
                {hostMetrics.hasCallTypeBreakdown && (
                  <>
                    <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white flex items-center space-x-2">
                          <PhoneCall className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Private Audio Calls</span>
                        </span>
                        <span className="text-indigo-400 font-black">
                          {hostMetrics.audioMinutes} mins ({hostMetrics.audioPercent}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full"
                          style={{ width: `${hostMetrics.audioPercent}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 flex justify-between">
                        <span>{hostMetrics.audioSessions} sessions</span>
                        <span>Average: {hostMetrics.audioAvgMins} mins/call</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white flex items-center space-x-2">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          <span>Live Roulette Matching</span>
                        </span>
                        <span className="text-amber-400 font-black">
                          {hostMetrics.rouletteMinutes} mins ({hostMetrics.roulettePercent}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-500 h-full rounded-full"
                          style={{ width: `${hostMetrics.roulettePercent}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 flex justify-between">
                        <span>{hostMetrics.rouletteSessions} sessions</span>
                        <span>Average: {hostMetrics.rouletteAvgMins} mins/call</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Peak Calling Hours Heat Bar */}
            <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                    Peak Calling Hours (UTC)
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                  PEAK: {hostMetrics.peakWindowLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Call volume distribution over 24 hours. Go online during peak bars to maximize incoming call rates!
              </p>

              <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakHoursData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <XAxis dataKey="hourLabel" stroke="#64748B" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={10} tickFormatter={(val) => `${val}%`} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '10px',
                        fontSize: '11px',
                        color: '#F8FAFC',
                      }}
                      formatter={(val: any) => [`${val}% Caller Traffic`, 'Volume']}
                    />
                    <Bar dataKey="callVolumePercent" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center justify-between">
                <span>Repeat Caller Retention:</span>
                <span className="text-emerald-400 font-bold">{hostMetrics.repeatCallerRatePercent}% of callers call again</span>
              </div>
            </div>
          </div>

          {/* Virtual Gifts Received Breakdown */}
          <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Gift className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                    Virtual Gifts & Tips Received Breakdown
                  </h3>
                  <p className="text-xs text-slate-400">
                    Gifts sent by loyal callers during 1-on-1 video chats and on your Moments feed.
                  </p>
                </div>
              </div>

              <div className="text-right font-mono">
                <div className="text-xs text-slate-400">Total Gift Tips Received</div>
                <div className="text-base font-black text-amber-400">{activeUser.totalGiftsReceivedCount || 0} gifts</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {virtualGifts.filter((g) => g.isActive !== false).map((g) => {
                const hostShareCoins = Math.round(g.coinCost * ((systemSettings.giftFemaleHostSharePercent ?? 70) / 100));
                const hostUSD = coinsToUsd(hostShareCoins, peg);
                return (
                  <div
                    key={g.id}
                    className="p-4 bg-slate-950 border border-slate-800/80 rounded-2xl flex items-center space-x-3 hover:border-slate-700 transition-all"
                  >
                    <div className="text-3xl shrink-0 p-2 rounded-xl bg-slate-900 border border-slate-800">
                      {g.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-xs">{g.name}</span>
                        <span className="text-xs font-mono font-bold text-amber-400">{g.coinCost} coins</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center justify-between">
                        <span>Your Take ({systemSettings.giftFemaleHostSharePercent ?? 70}%)</span>
                        <span className="text-emerald-400 font-bold">🪙 {hostShareCoins} (${hostUSD.toFixed(2)})</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate mt-1">
                        Ready to receive in 1-on-1 calls
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 5. SECTION 3: RATINGS & QUALITY STANDING */}
      {activeSection === 'ratings' && (
        <div className="space-y-6">
          {/* Quality Scorecard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Big Star Card */}
            <div className="p-6 bg-[#13161F] border border-slate-800 rounded-3xl text-center space-y-4 shadow-xl flex flex-col justify-center">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-12 h-12 rounded-2xl bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 flex items-center justify-center text-2xl">
                  ★
                </div>
              </div>
              <div>
                <div className="text-4xl font-black text-white font-mono">{ratingsMetrics.averageStars.toFixed(2)}</div>
                <div className="text-xs text-yellow-400 font-mono font-bold mt-0.5">{ratingsMetrics.scoreLabel}</div>
                <div className="text-[11px] text-slate-400 font-mono mt-1">
                  Based on {ratingsMetrics.totalReviews} verified caller reviews
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 text-left space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Communication:</span>
                  <span className="font-bold text-yellow-400">{ratingsMetrics.communication.toFixed(1)} ★</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Friendliness:</span>
                  <span className="font-bold text-yellow-400">{ratingsMetrics.friendliness.toFixed(1)} ★</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Video/Audio Clarity:</span>
                  <span className="font-bold text-yellow-400">{ratingsMetrics.clarity.toFixed(1)} ★</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Engagement & Energy:</span>
                  <span className="font-bold text-yellow-400">{ratingsMetrics.energy.toFixed(1)} ★</span>
                </div>
              </div>
            </div>

            {/* Attendance & Policy Health Card (Span 2) */}
            <div className="lg:col-span-2 p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                    Platform Compliance & Attendance Standing
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold">
                  {complianceMetrics.healthScore}% HEALTH SCORE
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase">Call Hours (from logs)</div>
                  <div className="text-lg font-black text-white">{complianceMetrics.totalCallHours} hrs</div>
                  <div className="text-[10px] text-slate-400">Completed session time only</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase">Incoming Call Acceptance</div>
                  <div className="text-lg font-black text-emerald-400">
                    {complianceMetrics.acceptanceRate != null
                      ? `${complianceMetrics.acceptanceRate}%`
                      : 'N/A'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {complianceMetrics.acceptanceRate != null
                      ? 'From profile record'
                      : 'Not recorded yet'}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase">Policy Violations / Strikes</div>
                  <div className="text-lg font-black text-emerald-400">{complianceMetrics.strikes} Strikes</div>
                  <div className="text-[10px] text-emerald-300">
                    {complianceMetrics.strikes === 0 ? 'Clean Record' : 'Under review'}
                  </div>
                </div>
              </div>

              {/* Policy standing summary */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Verified Creator in Good Standing</div>
                  <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                    {complianceMetrics.strikes === 0
                      ? 'No warnings, safety suspensions, or penalty deductions on record. Account is eligible for instant priority match queues and top tier creator earnings bonuses.'
                      : 'Account under active policy review. Please ensure compliance with community standards during live sessions.'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Verified Caller Reviews Feed */}
          <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400/20" />
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                  Recent Verified Caller Reviews
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">Real-time caller feedback ({hostReviews.length})</span>
            </div>

            <div className="space-y-3">
              {hostReviews.length > 0 ? (
                hostReviews.map((review) => (
                  <div
                    key={review.id}
                    className="p-4 bg-slate-950 border border-slate-800/80 rounded-2xl space-y-2.5 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-3">
                        <img
                          src={normalizeMediaUrl(review.callerAvatar)}
                          alt={review.callerName || 'Caller'}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getFallbackAvatar(review.callerName, 'male');
                          }}
                          className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-700 bg-slate-900 shrink-0"
                        />
                        <div>
                          <div className="font-bold text-white text-xs flex items-center space-x-2">
                            <span>{review.callerName || 'Verified Caller'}</span>
                            {review.callerCountry && (
                              <span className="text-[10px] text-slate-500 font-mono">({review.callerCountry})</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Call Duration: {Math.max(1, Math.round((review.callDurationSeconds || 60) / 60))}m • {review.createdAt || 'Recently'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 text-yellow-400 text-xs font-mono font-bold">
                        <div className="flex space-x-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3.5 h-3.5 ${
                                s <= review.stars ? 'fill-yellow-400 text-yellow-400' : 'text-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="ml-1 font-black text-white">{review.stars.toFixed(1)}</span>
                      </div>
                    </div>

                    {review.comment && (
                      <p className="text-xs text-slate-300 italic bg-[#0A0C10] p-2.5 rounded-xl border border-slate-800/80">
                        "{review.comment}"
                      </p>
                    )}

                    {review.tags && review.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {review.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md bg-pink-500/10 border border-pink-500/20 text-pink-300 text-[10px] font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl text-center space-y-2">
                  <div className="text-slate-400 text-xs font-mono">No caller reviews yet.</div>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Use “Ask for a rating” in chat after a call. Reviews appear here once a caller submits feedback.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. SECTION: SALARY STATUS ONLY (payout cards = Money → Payout Cards) */}
      {activeSection === 'payouts' && (
        <div className="space-y-6">
          <HostSalaryStatusPanel />
          {onOpenPayoutCards ? (
            <button
              type="button"
              onClick={onOpenPayoutCards}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-emerald-300 hover:bg-slate-800"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Manage payout cards
            </button>
          ) : null}
        </div>
      )}

    </div>
  );
};
