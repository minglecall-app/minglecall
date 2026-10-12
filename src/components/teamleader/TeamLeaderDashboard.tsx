import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { UserProfile, PayoutRequest, CallLogItem } from '../../types';
import { getCountryFlag } from '../../utils/flags';
import { uploadMediaDirectlyToR2 } from '../../utils/r2Storage';
import { UnifiedImageUploader } from '../common/UnifiedImageUploader';
import { CountrySelector } from '../common/CountrySelector';
import { LanguageSelector } from '../common/LanguageSelector';
import { getFallbackAvatar } from '../../utils/avatars';
import { AgencyHostLeaderboard } from './AgencyHostLeaderboard';
import { AgencyMilestoneAlerts } from './AgencyMilestoneAlerts';
import { TeamLeaderSettlementsPanel } from './TeamLeaderSettlementsPanel';
import { PayoutCardsPanel } from '../payout/PayoutCardsPanel';
import { PayoutRosterPanel } from '../payout/PayoutRosterPanel';
import { TeamLeaderShell } from './TeamLeaderShell';
import { TeamLeaderKpiBoard } from './TeamLeaderKpiBoard';
import { TeamLeaderTabKey } from './teamLeaderNavConfig';
import { EarningsPeriodDashboard } from '../finance/EarningsPeriodDashboard';
import { buildTlKpiSeries } from '../../utils/teamLeaderKpiSeries';
import { PasswordStrengthField } from '../auth/PasswordStrengthField';
import { getPasswordPolicyError, isPasswordPolicyValid } from '../../../shared/passwordPolicy';
import { authFetch } from '../../utils/apiClient';
import { getCoinUsdPeg, coinsToUsd } from '../../../shared/finance/fx';
import {
  Users,
  UserPlus,
  Zap,
  TrendingUp,
  PhoneCall,
  DollarSign,
  Coins,
  ShieldCheck,
  Crown,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Eye,
  Award,
  Globe,
  Lock,
  ArrowUpRight,
  MessageCircle,
  Video,
  X,
  Building,
  Percent,
  Check,
  ChevronRight,
  RefreshCw,
  Info,
  UploadCloud,
  Loader2,
  Camera,
  Upload,
  XCircle,
  Ban,
  Trash2,
  UserX,
} from 'lucide-react';

interface TeamLeaderDashboardProps {
  onStartCall?: (userId: string) => void;
  onOpenChat?: (userId: string) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const TeamLeaderDashboard: React.FC<TeamLeaderDashboardProps> = ({
  onStartCall,
  onOpenChat,
  onNavigateToTab,
}) => {
  const {
    currentUser,
    users,
    payoutRequests,
    callLogs,
    systemSettings,
    createCreatorByTeamLeader,
    banCreatorByTeamLeader,
    unbanCreatorByTeamLeader,
    deleteCreatorByTeamLeader,
    refreshTeamLeaderCreators,
    adminUpdateUser,
    syncUsersFromSupabase,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TeamLeaderTabKey>('creators');
  const [leaderboardView, setLeaderboardView] = useState<'milestones' | 'rankings'>('milestones');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'busy' | 'offline'>('all');

  const navigateTl = (tab: TeamLeaderTabKey, nestedKey?: string) => {
    setActiveTab(tab);
    if (tab === 'leaderboard') {
      setLeaderboardView((nestedKey as 'milestones' | 'rankings') || 'milestones');
    }
  };

  const activeNestedKey = activeTab === 'leaderboard' ? leaderboardView : undefined;
  const [isSyncing, setIsSyncing] = useState(false);
  const [hydratedCreatorIds, setHydratedCreatorIds] = useState<Set<string>>(new Set());
  const [hydratedCreators, setHydratedCreators] = useState<UserProfile[]>([]);
  const [agencyStats, setAgencyStats] = useState<{
    managedCreatorCount: number;
    totalCalls: number;
    totalMinutes: number;
    hostEarningsCoins: number;
    hostEarningsUSD: number;
    teamLeaderEarnedCoins: number;
    teamLeaderEarnedUSD: number;
    teamLeaderSharePercent: number;
    femalePayoutRatioUSD: number;
    statsSource?: string;
  } | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const loadAgencyStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const res = await authFetch('/api/teamleader/stats');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.data) {
        setAgencyStats(data.data);
      }
    } catch (e) {
      console.warn('Failed to load team leader stats:', e);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const hydrateManagedCreators = useCallback(async () => {
    const creators = await refreshTeamLeaderCreators();
    setHydratedCreators(creators);
    setHydratedCreatorIds(new Set(creators.map((c) => c.id)));
    await loadAgencyStats();
  }, [refreshTeamLeaderCreators, loadAgencyStats]);

  useEffect(() => {
    if (currentUser.role === 'team_leader' || currentUser.role === 'admin' || currentUser.role === 'agency_manager') {
      void hydrateManagedCreators();
    }
  }, [currentUser.id, currentUser.role, hydrateManagedCreators]);

  const handleSyncDatabase = async () => {
    setIsSyncing(true);
    try {
      await syncUsersFromSupabase(true);
      await hydrateManagedCreators();
    } finally {
      setIsSyncing(false);
    }
  };

  // Modals
  const [isAddCreatorOpen, setIsAddCreatorOpen] = useState(false);
  const [isCreatorAvatarModalOpen, setIsCreatorAvatarModalOpen] = useState(false);
  const [viewingPayout, setViewingPayout] = useState<PayoutRequest | null>(null);
  const [editingCreator, setEditingCreator] = useState<UserProfile | null>(null);

  // Ban / Suspend & Deletion Modal States
  const [banningCreator, setBanningCreator] = useState<UserProfile | null>(null);
  const [banDaysInput, setBanDaysInput] = useState<number>(7);
  const [banReasonInput, setBanReasonInput] = useState<string>('Violation of host guidelines & missed live sessions');
  const [deletingCreator, setDeletingCreator] = useState<UserProfile | null>(null);
  const [isProcessingBan, setIsProcessingBan] = useState(false);

  // New Creator Form State & Uploading
  const [isUploadingCreatorAvatar, setIsUploadingCreatorAvatar] = useState(false);
  const [uploadCreatorProgress, setUploadCreatorProgress] = useState(0);
  const [creatorAvatarError, setCreatorAvatarError] = useState<string | null>(null);
  const creatorFileInputRef = useRef<HTMLInputElement>(null);

  const systemFemaleEarnRate =
    systemSettings.femaleEarningRatePerMin ||
    Math.round((systemSettings.coinBurnRatePerMin ?? 120) * ((systemSettings.femaleHostSharePercent ?? 30) / 100)) ||
    48;

  const handleUploadCreatorAvatar = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Invalid File', 'Please select a valid image file (PNG, JPG, WEBP, GIF).', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast('File Too Large', 'Avatar image must be under 15MB', 'error');
      return;
    }

    setIsUploadingCreatorAvatar(true);
    setUploadCreatorProgress(15);
    setCreatorAvatarError(null);

    // 1. Instant local preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setNewCreatorForm((prev) => ({ ...prev, avatarUrl: e.target!.result as string }));
      }
    };
    reader.readAsDataURL(file);

    try {
      const res = await uploadMediaDirectlyToR2({
        file,
        category: 'avatar',
        onProgress: (p) => setUploadCreatorProgress(Math.max(15, p)),
      });
      if (res && res.publicUrl) {
        setNewCreatorForm((prev) => ({ ...prev, avatarUrl: res.publicUrl }));
      }
      showToast('Profile Picture Uploaded ☁️', 'Female Host picture stored on Cloudflare R2.', 'success');
      setIsCreatorAvatarModalOpen(false);
    } catch (err: any) {
      console.warn('Creator avatar upload note:', err);
      showToast('Profile Picture Applied ✨', 'Image applied to host profile preview.', 'info');
    } finally {
      setIsUploadingCreatorAvatar(false);
      setUploadCreatorProgress(0);
    }
  };

  const [newCreatorForm, setNewCreatorForm] = useState({
    name: '',
    email: '',
    password: '',
    age: 22,
    nationality: 'Spain',
    countryCode: 'ES',
    spokenLanguages: 'English',
    bio: 'Excited to chat and connect on 1-on-1 live video!',
    hourlyCoinRate: 10,
    tags: 'VIP Creator, HD Video, Conversationalist',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
  });

  // Avatar presets for quick creation
  const avatarPresets = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&q=80&w=400',
  ];

  // Managed Creators: ownership by teamLeaderId / createdById (or API-hydrated roster).
  // Do NOT include hosts solely because agencyName string matches — that leaks other agencies into money metrics.
  const managedCreators = useMemo(() => {
    const byId = new Map<string, UserProfile>();

    for (const u of users) {
      if (u.id === currentUser.id || (currentUser.authId && u.authId === currentUser.authId)) {
        continue;
      }
      if (u.role === 'team_leader' || u.role === 'agency_manager' || u.role === 'admin') {
        continue;
      }
      const isFemale = u.gender === 'female' || u.role === 'female_creator' || u.role === 'female_host';
      if (!isFemale) continue;

      const owned =
        u.teamLeaderId === currentUser.id ||
        u.createdById === currentUser.id ||
        (currentUser.authId &&
          (u.teamLeaderId === currentUser.authId || u.createdById === currentUser.authId)) ||
        hydratedCreatorIds.has(u.id);

      if (owned) byId.set(u.id, u);
    }

    // Authoritative server roster — show even if /api/users sync dropped ownership fields
    for (const c of hydratedCreators) {
      if (!c?.id || c.id === currentUser.id) continue;
      const prior = byId.get(c.id);
      byId.set(c.id, prior ? { ...prior, ...c, onlineStatus: prior.onlineStatus || c.onlineStatus } : c);
    }

    return Array.from(byId.values());
  }, [users, currentUser, hydratedCreatorIds, hydratedCreators]);

  // Managed Payout Requests (View Only) — ownership-safe
  const managedCreatorIds = useMemo(() => new Set(managedCreators.map((c) => c.id)), [managedCreators]);
  const teamPayoutRequests = useMemo(() => {
    return payoutRequests.filter(
      (p) => p.teamLeaderId === currentUser.id || managedCreatorIds.has(p.userId)
    );
  }, [payoutRequests, currentUser, managedCreatorIds]);

  // Team Call Logs — owned hosts only
  const teamCallLogs = useMemo(() => {
    return callLogs.filter(
      (log) =>
        managedCreatorIds.has(log.receiverId) ||
        (log.teamLeaderId && log.teamLeaderId === currentUser.id)
    );
  }, [callLogs, managedCreatorIds, currentUser.id]);

  // Authoritative agency metrics from GET /api/teamleader/stats (call_logs / wallet TL_EARN).
  // Fallback to owned-host logs only — never invent commission as % of host balances.
  const totalCallsHosted = agencyStats?.totalCalls ?? teamCallLogs.length;
  const totalMinutesInCalls =
    agencyStats?.totalMinutes ??
    Math.round(teamCallLogs.reduce((acc, l) => acc + (l.durationSeconds || 0), 0) / 60);
  const totalCoinsEarnedByTeam =
    agencyStats?.hostEarningsCoins ??
    managedCreators.reduce((acc, c) => acc + (c.earningsCoins || 0), 0);
  const totalUSDEarned =
    agencyStats?.hostEarningsUSD ??
    coinsToUsd(totalCoinsEarnedByTeam, getCoinUsdPeg(systemSettings));
  const teamLeaderEarnedCoins =
    agencyStats?.teamLeaderEarnedCoins ??
    teamCallLogs.reduce((acc, l) => acc + (Number(l.teamLeaderEarnedCoins) || 0), 0);
  const teamLeaderEarnedUSD =
    agencyStats?.teamLeaderEarnedUSD ??
    coinsToUsd(teamLeaderEarnedCoins, getCoinUsdPeg(systemSettings));
  /** Informational burn-split config — not multiplied again onto teamLeaderEarnedCoins */
  const commissionPercent =
    agencyStats?.teamLeaderSharePercent ??
    currentUser.commissionPercent ??
    systemSettings.teamLeaderSharePercent ??
    10;

  const kpiSeries = useMemo(
    () => buildTlKpiSeries(teamCallLogs, getCoinUsdPeg(systemSettings), 7),
    [teamCallLogs, systemSettings.coinUsdPeg, systemSettings.femalePayoutRatioUSD, systemSettings.coinToUSDRatio]
  );

  // Filtered Creators List
  const filteredCreators = useMemo(() => {
    return managedCreators.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.nationality && c.nationality.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'online'
          ? c.onlineStatus === 'online'
          : statusFilter === 'busy'
          ? c.onlineStatus === 'busy' || c.onlineStatus === 'in_call'
          : c.onlineStatus === 'offline';

      return matchesSearch && matchesStatus;
    });
  }, [managedCreators, searchQuery, statusFilter]);

  // Handle Add Creator Submit
  const handleCreateCreatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCreatorForm.name.trim()) {
      showToast('Validation Error', 'Please enter creator name', 'error');
      return;
    }
    if (!newCreatorForm.email.trim()) {
      showToast('Validation Error', 'A valid email address is required', 'error');
      return;
    }

    const passwordError = getPasswordPolicyError(newCreatorForm.password);
    if (passwordError) {
      showToast('Password Requirements', passwordError, 'error');
      return;
    }

    const languages = newCreatorForm.spokenLanguages
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const tags = newCreatorForm.tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const created = await createCreatorByTeamLeader({
      name: newCreatorForm.name.trim(),
      email: newCreatorForm.email.trim(),
      password: newCreatorForm.password,
      age: Number(newCreatorForm.age) || 22,
      nationality: newCreatorForm.nationality,
      countryCode: newCreatorForm.countryCode,
      spokenLanguages: languages.length > 0 ? languages : ['English'],
      bio: newCreatorForm.bio,
      hourlyCoinRate: Number(newCreatorForm.hourlyCoinRate) || 10,
      tags: tags.length > 0 ? tags : ['Agency Host'],
      avatarUrl: newCreatorForm.avatarUrl,
      gallery: [newCreatorForm.avatarUrl],
    });

    if (!created) return;

    // Close create popup immediately on success (don't wait on list hydrate)
    setIsAddCreatorOpen(false);
    setIsCreatorAvatarModalOpen(false);
    setNewCreatorForm({
      name: '',
      email: '',
      password: '',
      age: 22,
      nationality: 'Spain',
      countryCode: 'ES',
      spokenLanguages: 'English',
      bio: 'Excited to chat and connect on 1-on-1 live video!',
      hourlyCoinRate: 10,
      tags: 'VIP Creator, HD Video, Conversationalist',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    });

    setHydratedCreators((prev) => {
      const without = prev.filter((c) => c.id !== created.id);
      return [created, ...without];
    });
    setHydratedCreatorIds((prev) => new Set([...prev, created.id]));
    void hydrateManagedCreators().catch(() => {});
  };

  // Handle Save Edited Creator Details
  const handleSaveCreatorDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCreator) return;
    adminUpdateUser(editingCreator.id, {
      name: editingCreator.name,
      avatarUrl: editingCreator.avatarUrl,
      gallery: editingCreator.gallery && editingCreator.gallery.length > 0 ? editingCreator.gallery : [editingCreator.avatarUrl],
      bio: editingCreator.bio,
      hourlyCoinRate: editingCreator.hourlyCoinRate,
      nationality: editingCreator.nationality,
      countryCode: editingCreator.countryCode,
      isVerified: editingCreator.isVerified,
    });
    showToast('Host Profile Updated', `${editingCreator.name}'s profile and picture saved!`, 'success');
    setEditingCreator(null);
  };

  return (
    <TeamLeaderShell
      activeTab={activeTab}
      activeNestedKey={activeNestedKey}
      onNavigateTab={navigateTl}
      onSyncDatabase={() => void handleSyncDatabase()}
      onCreateCreator={() => setIsAddCreatorOpen(true)}
      isSyncing={isSyncing}
      brandName={currentUser.agencyName || 'Your Agency'}
      brandSubtitle={currentUser.name || 'Agency'}
      badges={{
        creators: managedCreators.length,
        leaderboard: 'LIVE',
        analytics: teamCallLogs.length,
      }}
      headerKpis={[
        {
          label: 'Creators',
          value: String(managedCreators.length),
          accentClass: 'text-pink-300',
        },
        {
          label: 'Agency earnings',
          value: isLoadingStats && !agencyStats ? '…' : `$${teamLeaderEarnedUSD.toFixed(2)}`,
          accentClass: 'text-amber-300',
        },
        {
          label: 'Host revenue',
          value: `$${totalUSDEarned.toFixed(2)}`,
          accentClass: 'text-emerald-400',
        },
        {
          label: 'Video calls',
          value: String(totalCallsHosted),
          accentClass: 'text-sky-300',
        },
      ]}
    >
      {/* KPI board — Creators home only (hero TL earnings + small chart cards) */}
      {activeTab === 'creators' && (
        <TeamLeaderKpiBoard
          series={kpiSeries}
          creatorsTotal={managedCreators.length}
          creatorsOnline={managedCreators.filter((c) => c.onlineStatus === 'online').length}
          totalCalls={totalCallsHosted}
          totalMinutes={totalMinutesInCalls}
          hostCoins={totalCoinsEarnedByTeam}
          hostUsd={totalUSDEarned}
          tlUsd={teamLeaderEarnedUSD}
          tlCoins={teamLeaderEarnedCoins}
          tlLoading={isLoadingStats && !agencyStats}
        />
      )}

      {/* ======================= TAB 0: TARGET LEADERBOARD ======================= */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-6">
          {leaderboardView === 'milestones' ? (
            <AgencyMilestoneAlerts creators={managedCreators} />
          ) : (
            <AgencyHostLeaderboard creators={managedCreators} />
          )}
        </div>
      )}

      {/* ======================= TAB 1: CREATORS & OVERRIDES ======================= */}
      {activeTab === 'creators' && (
          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="bg-[#12151F] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search creators by name, email, country..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-700/70 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all"
                />
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Filter:
                </span>
                <select
                  value={statusFilter}
                  onChange={(e: any) => setStatusFilter(e.target.value)}
                  aria-label="Filter creators by online status"
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="all">All Statuses ({managedCreators.length})</option>
                  <option value="online">Online Only</option>
                  <option value="busy">Busy / In Call</option>
                  <option value="offline">Offline</option>
                </select>

                <button
                  onClick={() => setIsAddCreatorOpen(true)}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Host</span>
                </button>
              </div>
            </div>

            {/* Creators Grid */}
            {filteredCreators.length === 0 ? (
              <div className="bg-[#12151F] border border-slate-800 rounded-2xl p-12 text-center">
                <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-slate-300">No Creators Found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {searchQuery
                    ? 'No creators matched your search query.'
                    : 'You have not registered any female creators yet. Click "+ Create Female Creator" to add your first talent.'}
                </p>
                <button
                  onClick={() => setIsAddCreatorOpen(true)}
                  className="mt-4 px-4 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold hover:bg-amber-400 transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Create Female Creator</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCreators.map((creator) => {
                  const effectiveRate =
                    creator.coinEarnOverrideRate != null && Number(creator.coinEarnOverrideRate) > 0
                      ? Number(creator.coinEarnOverrideRate)
                      : systemFemaleEarnRate;
                  const hasAdminOverride =
                    creator.coinEarnOverrideRate != null && Number(creator.coinEarnOverrideRate) > 0;

                  return (
                    <div
                      key={creator.id}
                      id={`tl-creator-card-${creator.id}`}
                      className="bg-[#12151F] border border-slate-800 hover:border-amber-500/40 rounded-2xl p-4 transition-all duration-200 shadow-lg flex flex-col justify-between"
                    >
                      <div>
                        {/* Top: Avatar & Status */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center space-x-3">
                            <div className="relative">
                              <img
                                src={creator.avatarUrl}
                                alt={creator.name}
                                className="w-13 h-13 rounded-xl object-cover ring-1 ring-slate-700 shadow-md"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = getFallbackAvatar(creator.name, 'female', 'female_creator');
                                }}
                              />
                              <span
                                className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                                  creator.onlineStatus === 'online'
                                    ? 'bg-emerald-400'
                                    : creator.onlineStatus === 'busy' || creator.onlineStatus === 'in_call'
                                    ? 'bg-amber-400'
                                    : 'bg-rose-500'
                                }`}
                              />
                            </div>
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <h3 className="font-bold text-sm text-white truncate max-w-[140px]">
                                  {creator.name}
                                </h3>
                                {creator.isVerified && (
                                  <span title="Verified Creator">
                                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <span>{getCountryFlag(creator.countryCode, creator.nationality)}</span>
                                <span>{creator.nationality || 'Spain'}</span>
                                <span>•</span>
                                <span>{creator.age || 23} y/o</span>
                              </p>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider ${
                                creator.isBanned
                                  ? 'bg-rose-950 text-rose-300 border border-rose-500/50'
                                  : creator.onlineStatus === 'online'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                  : creator.onlineStatus === 'busy' || creator.onlineStatus === 'in_call'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {creator.isBanned ? 'SUSPENDED' : (creator.onlineStatus || 'offline')}
                            </span>
                          </div>
                        </div>

                        {/* Suspension Alert Banner if Banned */}
                        {creator.isBanned && (
                          <div className="mt-2.5 p-2 rounded-xl bg-rose-950/50 border border-rose-500/40 flex items-start gap-2">
                            <Ban className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300 flex items-center justify-between">
                                <span>LOGIN BLOCKED</span>
                                {creator.bannedUntil && (
                                  <span className="font-mono text-[9px] text-rose-400">
                                    until {new Date(creator.bannedUntil).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-rose-200/90 truncate mt-0.5">
                                {creator.banReason || 'Violated host guidelines'}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Bio snippet */}
                        {creator.bio && (
                          <p className="text-xs text-slate-400 mt-3 line-clamp-2 italic bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                            "{creator.bio}"
                          </p>
                        )}

                        {/* Coin Earn Rate (read-only — admin sets overrides) */}
                        <div className="mt-3 p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300">
                              <Zap className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">
                                Coin Earn Rate
                              </div>
                              <div className="text-xs font-bold text-amber-200 flex items-center gap-1">
                                <span>{effectiveRate} 🪙 / min</span>
                                {hasAdminOverride ? (
                                  <span className="text-[9px] px-1.5 py-0.2 bg-indigo-500 text-white rounded font-mono font-bold">
                                    ADMIN OVERRIDE
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-slate-400 font-mono">(system rate)</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Lifetime Stats */}
                        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                          <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2">
                            <span className="text-[10px] text-slate-400 block">Calls Hosted</span>
                            <span className="text-xs font-bold font-mono text-white">
                              {creator.totalCallsHosted || 0}
                            </span>
                          </div>
                          <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2">
                            <span className="text-[10px] text-slate-400 block">Live Minutes</span>
                            <span className="text-xs font-bold font-mono text-white">
                              {creator.totalCallMinutes || 0}m
                            </span>
                          </div>
                          <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2">
                            <span className="text-[10px] text-slate-400 block">Earned Coins</span>
                            <span className="text-xs font-bold font-mono text-amber-300">
                              {(creator.earningsCoins || 0).toLocaleString()} 🪙
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Actions */}
                      <div className="flex items-center space-x-1.5 mt-4 pt-3 border-t border-slate-800">
                        <button
                          onClick={() => setEditingCreator(creator)}
                          className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-medium transition-all cursor-pointer truncate"
                        >
                          Edit Profile
                        </button>

                        {/* Ban / Unban Button */}
                        {creator.isBanned ? (
                          <button
                            onClick={async () => {
                              const ok = await unbanCreatorByTeamLeader(creator.id);
                              if (ok) await loadAgencyStats();
                            }}
                            className="px-2 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                            title="Lift Suspension"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Unban</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setBanningCreator(creator);
                              setBanDaysInput(7);
                              setBanReasonInput('Violation of host guidelines & missed live sessions');
                            }}
                            className="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                            title="Suspend Host for N Days"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Ban</span>
                          </button>
                        )}

                        {/* Delete Host Button */}
                        <button
                          onClick={() => setDeletingCreator(creator)}
                          className="p-1.5 bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 rounded-lg text-xs transition-all cursor-pointer shrink-0"
                          title="Delete Host from Agency"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {onOpenChat && (
                          <button
                            onClick={() => onOpenChat(creator.id)}
                            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-indigo-400 border border-slate-700 rounded-lg text-xs transition-all cursor-pointer shrink-0"
                            title="Chat with Creator"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* ======================= TAB 2: CALL HISTORY & ANALYTICS ======================= */}
      {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Call Logs Table */}
            {teamCallLogs.length === 0 ? (
              <div className="bg-[#12151F] border border-slate-800 rounded-2xl p-12 text-center">
                <PhoneCall className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-300">No Call Records Found Yet</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  When male callers connect with your female creators, complete call duration and coin telemetry will appear here in real time.
                </p>
              </div>
            ) : (
              <div className="bg-[#12151F] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-sky-400" />
                    <span>Live Call Logs & Session Ledger</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Total Sessions: {teamCallLogs.length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Session Date</th>
                        <th className="py-3 px-4">Female Host</th>
                        <th className="py-3 px-4">Caller (User)</th>
                        <th className="py-3 px-4">Duration</th>
                        <th className="py-3 px-4">Coins Burned (Spent)</th>
                        <th className="py-3 px-4">Creator Earned (🪙)</th>
                        <th className="py-3 px-4">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {teamCallLogs.map((log) => {
                        const isUuid = (s?: string) => !s || /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s) || s.startsWith('user_');
                        const hostUser = users.find((u) => u.id === log.receiverId);
                        const hostName = hostUser?.name || (!isUuid(log.receiverName) ? log.receiverName : hostUser?.name || 'Creator Host');
                        const hostAvatar = hostUser?.avatarUrl || log.receiverAvatar || getFallbackAvatar(hostName, 'female', 'female_creator');

                        const callerUser = users.find((u) => u.id === log.callerId);
                        const callerName = callerUser?.name || (!isUuid(log.callerName) ? log.callerName : callerUser?.name || 'Verified Caller');
                        const callerAvatar = callerUser?.avatarUrl || log.callerAvatar || getFallbackAvatar(callerName, 'male');

                        return (
                          <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                              {log.timestamp}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center space-x-2">
                                <img
                                  src={hostAvatar}
                                  alt={hostName}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = getFallbackAvatar(hostName, 'female', 'female_creator');
                                  }}
                                  className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-700 bg-slate-800"
                                />
                                <span className="font-semibold text-slate-200">{hostName}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center space-x-2">
                                <img
                                  src={callerAvatar}
                                  alt={callerName}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = getFallbackAvatar(callerName, 'male');
                                  }}
                                  className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-700 bg-slate-800"
                                />
                                <span className="text-slate-300">{callerName}</span>
                              </div>
                            </td>
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            {log.status === 'missed' || log.status === 'declined' || (log.durationSeconds === 0 && log.coinsSpent === 0)
                              ? '0m 0s (Unanswered)'
                              : `${Math.floor(log.durationSeconds / 60)}m ${log.durationSeconds % 60}s`}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {log.coinsSpent} 🪙
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-amber-300">
                            +{log.coinsEarned} 🪙
                          </td>
                          <td className="py-3 px-4">
                            {log.status === 'missed' || log.status === 'unanswered' ? (
                              <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-700/40 text-[10px] font-bold flex items-center space-x-1 w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block animate-ping"></span>
                                <span>Missed Call</span>
                              </span>
                            ) : log.status === 'declined' ? (
                              <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/40 text-[10px] font-bold w-fit">
                                Declined / Busy
                              </span>
                            ) : log.wasFriendCall ? (
                              <span className="px-2 py-0.5 rounded bg-pink-950/80 text-pink-300 border border-pink-700/40 text-[10px]">
                                Friend Call (50% Off)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                                Standard Call
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tl_earnings' && (
          <div className="space-y-4">
            <EarningsPeriodDashboard scope="tl" accent="indigo" title="Your TL earnings" />
          </div>
        )}

        {activeTab === 'host_earnings' && (
          <div className="space-y-4">
            <EarningsPeriodDashboard
              scope="host"
              accent="emerald"
              title="Managed host earnings"
            />
          </div>
        )}

        {activeTab === 'payout_cards' && (
          <div className="space-y-6">
            <PayoutCardsPanel
              title="Your payout cards"
              subtitle="Save PayPal, bank, or wallet details so platform admin can pay your TL salary locally."
            />
            <PayoutRosterPanel title="Managed hosts’ payout cards" />
          </div>
        )}

        {/* ======================= TAB 3: SETTLEMENTS (FINANCE API) ======================= */}
        {activeTab === 'payouts' && (
          <div className="space-y-6">
            <TeamLeaderSettlementsPanel />

            {/* Legacy mid-period payout requests (read-only; period-end settlements are primary) */}
            {teamPayoutRequests.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                  Legacy payout requests (historical · read-only · not cash-out)
                </h4>
                <p className="text-[11px] text-slate-500 px-1">
                  Mid-period withdrawals are disabled. Pay hosts via Settlements above after period close.
                </p>
                <div className="bg-[#12151F] border border-slate-800 rounded-2xl overflow-hidden opacity-80">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/90 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Creator</th>
                          <th className="py-3 px-4">Amount USD</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {teamPayoutRequests.map((req) => (
                          <tr key={req.id} className="hover:bg-slate-900/40">
                            <td className="py-3 px-4 text-slate-200">{req.userName}</td>
                            <td className="py-3 px-4 font-mono text-emerald-400">${req.amountUSD.toFixed(2)}</td>
                            <td className="py-3 px-4 font-mono text-[10px] uppercase">{req.status}</td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => setViewingPayout(req)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs cursor-pointer"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 4: AGENCY PROFILE & TERMS ======================= */}
        {activeTab === 'agency' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#12151F] border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building className="w-5 h-5 text-amber-400" />
                Agency Organization Profile
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Agency Name:</span>
                  <span className="font-semibold text-slate-100">{currentUser.agencyName || 'Your Agency'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Director / Agency:</span>
                  <span className="font-semibold text-slate-100">{currentUser.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Agency Email:</span>
                  <span className="font-mono text-slate-200">{currentUser.email}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Call-split share (config):</span>
                  <span className="font-mono font-bold text-amber-300">{commissionPercent}%</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Spoken Languages:</span>
                  <span className="text-slate-200">{(currentUser.spokenLanguages || ['English', 'Spanish']).join(', ')}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Registered Creators Count:</span>
                  <span className="font-mono font-bold text-emerald-400">{managedCreators.length} Hosts</span>
                </div>
              </div>
            </div>

            <div className="bg-[#12151F] border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                Agency Rights & Privileges
              </h3>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <div className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Host Creation:</strong> Directly register and onboard verified female creators with custom profiles.
                  </span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>System Earn Rate:</strong> Hosts earn at the platform-defined coin rate. Individual earning overrides are managed by administrators only.
                  </span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Live Telemetry:</strong> Monitor real-time video session logs, duration, and viewer engagement.
                  </span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Payout Oversight:</strong> Track pending and approved withdrawal requests with transparent audit logs.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* ======================= MODAL: CREATE FEMALE CREATOR ======================= */}
      {isAddCreatorOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12151F] border border-amber-500/30 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Register New Female Creator</h3>
                  <p className="text-xs text-slate-400">
                    Add a female host to your agency. She will earn at the system-defined coin rate.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddCreatorOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCreatorSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar text-xs">
              {/* Informational Guidance Notice */}
              <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-indigo-200/90 leading-relaxed">
                  <span className="font-semibold text-white">Direct Supabase Authentication:</span> This host will be registered with a secure login account. All other details (photo gallery, video intro, custom tags, and extended bio) can be filled in by the host after logging in to edit her own profile.
                </div>
              </div>

              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Creator Full Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Valentina Gomez"
                    value={newCreatorForm.name}
                    onChange={(e) => setNewCreatorForm({ ...newCreatorForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Login Email <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="host@example.com"
                    value={newCreatorForm.email}
                    onChange={(e) => setNewCreatorForm({ ...newCreatorForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Password with strength meter & Age */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PasswordStrengthField
                  id="tl-creator-password"
                  label="Login Password"
                  value={newCreatorForm.password}
                  onChange={(password) => setNewCreatorForm({ ...newCreatorForm, password })}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  inputClassName="w-full pl-10 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono text-xs"
                />
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Age (18+ Mandatory)
                  </label>
                  <input
                    type="number"
                    min="18"
                    max="65"
                    value={newCreatorForm.age}
                    onChange={(e) => setNewCreatorForm({ ...newCreatorForm, age: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* 1. Full Worldwide Country Dropdown with Dynamic Search Bar & Ascending Order */}
              <div>
                <CountrySelector
                  value={newCreatorForm.countryCode || newCreatorForm.nationality}
                  onChange={(c) => {
                    setNewCreatorForm({
                      ...newCreatorForm,
                      nationality: c.name,
                      countryCode: c.code,
                    });
                  }}
                  label="Country / Nationality (Real SVG Flag, A-Z Searchable)"
                  required
                />
              </div>

              {/* 2. Full Spoken Languages Multi-Select with Dynamic Search Bar & Ascending Order */}
              <div className="space-y-2">
                <LanguageSelector
                  selectedLanguages={
                    newCreatorForm.spokenLanguages
                      ? newCreatorForm.spokenLanguages
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : ['English']
                  }
                  onChange={(langs) => {
                    setNewCreatorForm({
                      ...newCreatorForm,
                      spokenLanguages: langs.length > 0 ? langs.join(', ') : 'English',
                    });
                  }}
                  label="Spoken Languages (First Language = Primary Language)"
                  placeholder="Select languages..."
                  required
                />

                {/* Primary vs Secondary Language Informational Card */}
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Primary vs. Secondary Languages</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {newCreatorForm.spokenLanguages ? newCreatorForm.spokenLanguages.split(',').filter(Boolean).length : 1} selected
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    The <strong className="text-white">first added language</strong> is the creator's <strong className="text-amber-300">Primary Language</strong> shown on Discovery Cards, Quick Matches, and used for Discovery Language Filtering. Any other languages added by the Agency are <strong className="text-slate-300">Secondary Languages</strong> shown inside her profile view.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <div className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                      <span>🥇 Primary:</span>
                      <span className="text-white font-semibold">
                        {newCreatorForm.spokenLanguages?.split(',')[0]?.trim() || 'English'}
                      </span>
                    </div>
                    {newCreatorForm.spokenLanguages?.split(',').slice(1).filter((s) => s.trim()).length > 0 && (
                      <div className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px]">
                        <span>🥈 Secondary:</span>
                        <span className="text-slate-200">
                          {newCreatorForm.spokenLanguages
                            .split(',')
                            .slice(1)
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* System earn rate notice (overrides are admin-only) */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 flex items-start gap-2.5">
                <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-300 leading-relaxed">
                  <strong className="text-white">Coin earning:</strong> This host uses Economy call share % (
                  <span className="font-mono font-bold text-amber-300">{systemFemaleEarnRate} 🪙/min</span>
                  {' '}≈ {systemSettings.femaleHostSharePercent ?? 30}% of burn). Global burn/shares are edited only in
                  Admin → Coin Burn &amp; Economy. Per-host absolute override (
                  <code className="text-slate-400">coin_earn_override_rate</code>) is admin-only — Agencies cannot
                  change global economy.
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Host Profile Bio
                </label>
                <textarea
                  rows={2}
                  value={newCreatorForm.bio}
                  onChange={(e) => setNewCreatorForm({ ...newCreatorForm, bio: e.target.value })}
                  placeholder="Excited to chat and connect on 1-on-1 live video!"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Profile Picture Card (Identical setup to User Profile Page) */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-700/70 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-300 text-xs">
                    Female Host Profile Picture <span className="text-pink-400 font-normal">☁️ Cloudflare R2</span>
                  </label>
                  {isUploadingCreatorAvatar && (
                    <span className="text-[10px] text-pink-300 animate-pulse font-mono font-bold">
                      Uploading ({uploadCreatorProgress}%)...
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3.5">
                  {/* Avatar Preview with Camera Trigger */}
                  <div className="relative shrink-0 group">
                    <img
                      src={newCreatorForm.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400'}
                      alt="Female Host headshot"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getFallbackAvatar(newCreatorForm.name || 'Female Host', 'female', 'female_creator');
                      }}
                      className="w-16 h-16 rounded-2xl object-cover ring-2 ring-pink-500 shadow-lg shadow-pink-950/40"
                    />
                    <button
                      type="button"
                      onClick={() => creatorFileInputRef.current?.click()}
                      disabled={isUploadingCreatorAvatar}
                      className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer backdrop-blur-[1px]"
                      title="Upload from device"
                    >
                      <Camera className="w-4 h-4 text-pink-300" />
                      <span className="text-[8px] font-bold mt-0.5">Upload</span>
                    </button>
                    <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-emerald-500 text-[8px] font-bold text-slate-950 rounded-full uppercase tracking-wider shadow">
                      Active
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-xs text-white font-bold truncate">
                      <span>{newCreatorForm.name || 'New Female Host'}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 font-mono">Female Host</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Upload high-res host photo or select from curated model portraits & 3D avatars.
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <input
                        type="file"
                        ref={creatorFileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleUploadCreatorAvatar(e.target.files[0]);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => creatorFileInputRef.current?.click()}
                        disabled={isUploadingCreatorAvatar}
                        className="px-2.5 py-1 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white rounded-lg text-xs font-bold transition-all shadow cursor-pointer flex items-center gap-1 disabled:opacity-50"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{isUploadingCreatorAvatar ? `Uploading (${uploadCreatorProgress}%)` : 'Upload Photo'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatorAvatarModalOpen(true)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all border border-slate-700 cursor-pointer flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-pink-400" />
                        <span>Browse Gallery / 3D Avatars</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddCreatorOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingCreatorAvatar || !isPasswordPolicyValid(newCreatorForm.password)}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-950/50 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>Register Female Host</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dedicated Full Avatar Selector Modal for Female Creator */}
      {isCreatorAvatarModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#12151F] border border-pink-500/40 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-pink-500/20 text-pink-300">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Select Female Host Profile Picture</h4>
                  <p className="text-[11px] text-slate-400">Choose model portrait, 3D avatar, or upload high-res image to R2</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatorAvatarModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto custom-scrollbar">
              <UnifiedImageUploader
                currentImageUrl={newCreatorForm.avatarUrl}
                onImageUploaded={(newUrl) => {
                  setNewCreatorForm((prev) => ({ ...prev, avatarUrl: newUrl }));
                  setIsCreatorAvatarModalOpen(false);
                  showToast('Picture Selected ✨', 'Avatar applied to Female Host profile!', 'success');
                }}
                category="avatar"
                targetRole="female_creator"
                targetName={newCreatorForm.name || 'Female Host'}
                accentColor="pink"
                title="Choose Female Host Avatar"
                subtitle="High-definition female model portraits, 3D avatars, or direct upload to R2."
                showPresets={true}
                showUrlInput={true}
              />
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCreatorAvatarModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL: VIEW PAYOUT DETAILS (READ ONLY) ======================= */}
      {viewingPayout && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12151F] border border-amber-500/40 w-full max-w-lg rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Payout Request Details #{viewingPayout.id}
                  </h3>
                  <span className="text-[10px] text-amber-400 font-mono">🔒 View-Only Mode</span>
                </div>
              </div>
              <button
                onClick={() => setViewingPayout(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Creator Name</span>
                  <span className="font-semibold text-slate-200">{viewingPayout.userName}</span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Creator Email</span>
                  <span className="font-mono text-slate-200 text-[11px] truncate block">{viewingPayout.userEmail}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Payout Amount</span>
                  <span className="font-mono font-bold text-emerald-400 text-base">
                    ${viewingPayout.amountUSD.toFixed(2)} USD
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ({viewingPayout.amountCoins.toLocaleString()} coins)
                  </span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Payout Method</span>
                  <span className="font-semibold text-slate-200">{viewingPayout.payoutMethod}</span>
                  <span className="text-[10px] text-slate-400 font-mono block truncate">
                    {viewingPayout.accountDetails}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Submission Date:</span>
                  <span className="font-mono text-slate-200">{viewingPayout.requestDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-mono font-bold text-amber-300 uppercase">{viewingPayout.status}</span>
                </div>
                {viewingPayout.processedDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Processed On:</span>
                    <span className="font-mono text-slate-200">{viewingPayout.processedDate}</span>
                  </div>
                )}
                {viewingPayout.adminNote && (
                  <div className="pt-2 border-t border-slate-800 mt-2">
                    <span className="text-slate-400 text-[10px] block">Admin Settlement Note:</span>
                    <span className="text-slate-200 italic font-mono text-[11px]">
                      "{viewingPayout.adminNote}"
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setViewingPayout(null)}
                className="px-4 py-1.5 bg-slate-800 text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL: EDIT CREATOR DETAILS ======================= */}
      {editingCreator && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12151F] border border-amber-500/30 w-full max-w-lg rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <img
                  src={editingCreator.avatarUrl}
                  alt={editingCreator.name}
                  className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-700"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getFallbackAvatar(editingCreator.name, 'female', 'female_creator');
                  }}
                />
                <div>
                  <h3 className="font-bold text-white text-sm">Edit Host Profile</h3>
                  <p className="text-[11px] text-slate-400">{editingCreator.name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingCreator(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCreatorDetails} className="space-y-3.5 text-xs">
              {/* Avatar Selector in Edit Profile */}
              <UnifiedImageUploader
                currentImageUrl={editingCreator.avatarUrl}
                onImageUploaded={(newUrl) => setEditingCreator((prev) => (prev ? { ...prev, avatarUrl: newUrl } : null))}
                category="avatar"
                targetRole="female_creator"
                targetName={editingCreator.name}
                accentColor="pink"
                title="Update Profile Picture"
                subtitle="Upload a new photo to Cloudflare R2 or select an avatar preset."
                showPresets={true}
                showUrlInput={true}
              />

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingCreator.name}
                  onChange={(e) => setEditingCreator({ ...editingCreator, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Bio</label>
                <textarea
                  rows={2}
                  value={editingCreator.bio || ''}
                  onChange={(e) => setEditingCreator({ ...editingCreator, bio: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Hourly Burn Rate (🪙/min)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={editingCreator.hourlyCoinRate || 10}
                  onChange={(e) => setEditingCreator({ ...editingCreator, hourlyCoinRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100"
                />
                <p className="text-[10px] text-slate-500 mt-1">Coin earning override is managed by administrators only.</p>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="verified-toggle"
                  checked={editingCreator.isVerified || false}
                  onChange={(e) => setEditingCreator({ ...editingCreator, isVerified: e.target.checked })}
                  className="rounded accent-amber-400"
                />
                <label htmlFor="verified-toggle" className="text-slate-300">
                  Verified Host Badge (✓)
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCreator(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: BAN HOST FOR N DAYS ================= */}
      {banningCreator && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12151F] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Suspend Host Login</h3>
                  <p className="text-xs text-slate-400">Manage creator access for {banningCreator.name}</p>
                </div>
              </div>
              <button
                onClick={() => setBanningCreator(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-200/90 text-xs leading-relaxed">
                Suspended hosts are immediately blocked from logging in across all devices. Live call requests and chat features will be disabled for the duration of the suspension.
              </div>

              {/* Ban Duration Chips */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Suspension Duration (Days)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 3, 7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setBanDaysInput(d)}
                      className={`py-2 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                        banDaysInput === d
                          ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-950'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {d} {d === 1 ? 'Day' : 'Days'}
                    </button>
                  ))}
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      placeholder="Custom"
                      value={![1, 3, 7, 14, 30].includes(banDaysInput) ? banDaysInput : ''}
                      onChange={(e) => setBanDaysInput(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full py-2 px-2 bg-slate-900 border border-slate-700 rounded-xl text-center text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-rose-400" />
                  <span>Will be suspended until:</span>
                  <span className="font-mono text-rose-300 font-semibold">
                    {new Date(Date.now() + banDaysInput * 24 * 60 * 60 * 1000).toLocaleString()}
                  </span>
                </p>
              </div>

              {/* Ban Reason */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Reason for Suspension (Visible to Host)
                </label>
                <textarea
                  rows={2}
                  value={banReasonInput}
                  onChange={(e) => setBanReasonInput(e.target.value)}
                  placeholder="Explain the reason for this suspension..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />

                {/* Preset Reason Pills */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    'Missed scheduled live hours',
                    'Violated host community conduct',
                    'Poor video/audio quality complaint',
                    'Identity & KYC verification pending',
                    'Agency internal policy review',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBanReasonInput(preset)}
                      className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-all cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setBanningCreator(null)}
                  disabled={isProcessingBan}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProcessingBan}
                  onClick={async () => {
                    if (!banningCreator) return;
                    setIsProcessingBan(true);
                    try {
                      const ok = await banCreatorByTeamLeader(banningCreator.id, banDaysInput, banReasonInput);
                      if (ok) {
                        setBanningCreator(null);
                        void loadAgencyStats().catch(() => {});
                      }
                    } finally {
                      setIsProcessingBan(false);
                    }
                  }}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-950/60 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Ban className="w-4 h-4" />
                  <span>Confirm {banDaysInput}-Day Suspension</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: DELETE HOST CONFIRMATION ================= */}
      {deletingCreator && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12151F] border border-rose-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Delete Female Host</h3>
                <p className="text-xs text-rose-400 font-semibold">Permanent & Irreversible Action</p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <img
                  src={deletingCreator.avatarUrl}
                  alt={deletingCreator.name}
                  className="w-12 h-12 rounded-xl object-cover ring-1 ring-slate-700"
                />
                <div>
                  <h4 className="font-bold text-white text-sm">{deletingCreator.name}</h4>
                  <p className="text-slate-400 text-xs">{deletingCreator.email}</p>
                  <p className="text-slate-500 text-[11px]">{deletingCreator.agencyName || currentUser.agencyName || 'Your Agency'}</p>
                </div>
              </div>

              <p className="text-slate-300 text-xs leading-relaxed">
                Are you sure you want to delete <span className="font-bold text-white">{deletingCreator.name}</span>? This will permanently remove her from your agency, erase her database profile, and revoke all login credentials.
              </p>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeletingCreator(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!deletingCreator) return;
                    const targetId = deletingCreator.id;
                    const ok = await deleteCreatorByTeamLeader(targetId);
                    if (ok) {
                      setDeletingCreator(null);
                      setHydratedCreatorIds((prev) => {
                        const next = new Set(prev);
                        next.delete(targetId);
                        return next;
                      });
                      void loadAgencyStats().catch(() => {});
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-950/60 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Host Permanently</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </TeamLeaderShell>
  );
};
