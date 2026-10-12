import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { isSupabaseConfigured } from '../../services/supabaseService';
import { authFetch } from '../../utils/apiClient';
import { ResetDataOptions } from '../../types';
import {
  Trash2,
  AlertTriangle,
  Users,
  Coins,
  MessageSquare,
  PhoneCall,
  Flame,
  Database,
  RefreshCw,
  X,
  Sparkles,
  CheckCircle2,
  DollarSign,
  Heart,
  Sliders,
  Star,
  Zap,
  Gift,
  Building,
  Crown,
  Globe,
  Compass,
  Trophy,
  ShieldAlert,
} from 'lucide-react';

interface ResetMockDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ResetMockDataModal: React.FC<ResetMockDataModalProps> = ({ isOpen, onClose }) => {
  const {
    users,
    chatMessages,
    callLogs,
    payoutRequests,
    feedPosts,
    friends,
    friendRequests,
    favorites,
    blockedUserIds,
    coinPackages,
    liveHostIds,
    incidentEvidenceLogs,
    creatorReviews,
    virtualGifts,
    homeBanners,
    policyDocuments,
    homeQuickLinks,
    resetMockDataGranular,
    showToast,
  } = useApp();

  const supabaseActive = isSupabaseConfigured();

  // Selected categories state — user deletes OFF by default (destructive)
  const [options, setOptions] = useState<ResetDataOptions>({
    mockFemaleCreators: false,
    mockMaleCallers: false,
    customUsers: false,
    teamLeaderAgencies: false,
    adminAccount: false,
    profilesMedia: false,
    r2PurgeAllUploads: false,
    userCoins: false,
    creatorEarnings: false,
    walletLedger: false,
    payoutRequests: false,
    coinPackages: false,
    virtualGiftsCatalog: false,
    chatMessages: true,
    friendRequests: true,
    friendsList: true,
    favoritesList: true,
    blockedList: false,
    callLogs: true,
    liveHostsPool: true,
    quickMatchQueues: true,
    surveillanceLogs: true,
    feedPosts: true,
    creatorGoals: false,
    creatorAnalytics: false,
    creatorReviews: false,
    dailyRewardsAndQuests: false,
    homeBanners: false,
    policyDocuments: false,
    quickLinks: false,
    systemSettings: false,
    taxonomiesAndFlags: false,
    syncWithSupabase: supabaseActive,
    syncWithServer: true,
    clientStoragePurge: false,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [factoryResetAllowed, setFactoryResetAllowed] = useState<boolean | null>(null);
  const [factoryResetHint, setFactoryResetHint] = useState('');
  const [factoryResetEnvValue, setFactoryResetEnvValue] = useState('');
  const [resetFeedback, setResetFeedback] = useState<{
    success?: boolean;
    summary?: string;
    categories?: string[];
  } | null>(null);

  const refreshFactoryResetStatus = async (): Promise<boolean | null> => {
    try {
      const res = await authFetch('/api/admin/factory-reset-status');
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success && json?.data) {
        const allowed = json.data.allowed === true;
        setFactoryResetAllowed(allowed);
        setFactoryResetHint(String(json.data.hint || ''));
        setFactoryResetEnvValue(String(json.data.envValue ?? ''));
        return allowed;
      }
      setFactoryResetAllowed(null);
      setFactoryResetEnvValue('');
      setFactoryResetHint('Could not verify ALLOW_FACTORY_RESET status. Server may refuse the wipe.');
      return null;
    } catch {
      setFactoryResetAllowed(null);
      setFactoryResetEnvValue('');
      setFactoryResetHint('Could not reach factory-reset status endpoint.');
      return null;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      await refreshFactoryResetStatus();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Counts calculation
  const nonAdminCount = users.filter((u) => u.role !== 'admin').length;
  // Agencies = Team Leader / agency_manager only (not managed hosts with teamLeaderId).
  // Dedupe by email/id so dual id/authId ghosts do not inflate the badge.
  const teamLeadersCount = (() => {
    const seen = new Set<string>();
    let n = 0;
    for (const u of users) {
      if (u.role !== 'team_leader' && u.role !== 'agency_manager') continue;
      const key = (u.email || u.id || '').toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      n += 1;
    }
    return n;
  })();

  const requiresTypedConfirm = Boolean(options.customUsers || options.adminAccount || options.r2PurgeAllUploads);
  const deleteTyped = confirmPhrase.trim().toUpperCase() === 'DELETE';
  const confirmOk = !requiresTypedConfirm || deleteTyped;
  const serverBlocksReset = factoryResetAllowed === false;
  const factoryWipeUnlocked = deleteTyped && !serverBlocksReset;

  const toggleOption = (key: keyof ResetDataOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Quick Presets
  const handleSelectAll = () => {
    setOptions({
      mockFemaleCreators: false,
      mockMaleCallers: false,
      customUsers: true,
      teamLeaderAgencies: true,
      adminAccount: true,
      profilesMedia: true,
      r2PurgeAllUploads: true,
      userCoins: true,
      creatorEarnings: true,
      walletLedger: true,
      payoutRequests: true,
      coinPackages: true,
      virtualGiftsCatalog: true,
      chatMessages: true,
      friendRequests: true,
      friendsList: true,
      favoritesList: true,
      blockedList: true,
      callLogs: true,
      liveHostsPool: true,
      quickMatchQueues: true,
      surveillanceLogs: true,
      feedPosts: true,
      creatorGoals: true,
      creatorAnalytics: true,
      creatorReviews: true,
      dailyRewardsAndQuests: true,
      homeBanners: true,
      policyDocuments: true,
      quickLinks: true,
      systemSettings: true,
      taxonomiesAndFlags: true,
      syncWithSupabase: supabaseActive,
      syncWithServer: true,
      clientStoragePurge: true,
    });
  };

  const handleDeselectAll = () => {
    setOptions({
      mockFemaleCreators: false,
      mockMaleCallers: false,
      customUsers: false,
      teamLeaderAgencies: false,
      adminAccount: false,
      profilesMedia: false,
      r2PurgeAllUploads: false,
      userCoins: false,
      creatorEarnings: false,
      walletLedger: false,
      payoutRequests: false,
      coinPackages: false,
      virtualGiftsCatalog: false,
      chatMessages: false,
      friendRequests: false,
      friendsList: false,
      favoritesList: false,
      blockedList: false,
      callLogs: false,
      liveHostsPool: false,
      quickMatchQueues: false,
      surveillanceLogs: false,
      feedPosts: false,
      creatorGoals: false,
      creatorAnalytics: false,
      creatorReviews: false,
      dailyRewardsAndQuests: false,
      homeBanners: false,
      policyDocuments: false,
      quickLinks: false,
      systemSettings: false,
      taxonomiesAndFlags: false,
      syncWithSupabase: false,
      syncWithServer: true,
      clientStoragePurge: false,
    });
  };

  const handlePresetMockDataOnly = () => {
    setOptions({
      mockFemaleCreators: false,
      mockMaleCallers: false,
      customUsers: false,
      teamLeaderAgencies: false,
      adminAccount: false,
      profilesMedia: false,
      walletLedger: true,
      userCoins: true,
      creatorEarnings: true,
      payoutRequests: true,
      coinPackages: false,
      virtualGiftsCatalog: false,
      chatMessages: true,
      friendRequests: true,
      friendsList: true,
      favoritesList: true,
      blockedList: false,
      callLogs: true,
      liveHostsPool: true,
      quickMatchQueues: true,
      surveillanceLogs: false,
      feedPosts: true,
      creatorGoals: true,
      creatorAnalytics: true,
      creatorReviews: true,
      dailyRewardsAndQuests: true,
      homeBanners: false,
      policyDocuments: false,
      quickLinks: false,
      systemSettings: false,
      taxonomiesAndFlags: false,
      syncWithSupabase: supabaseActive,
      syncWithServer: true,
      clientStoragePurge: false,
    });
  };

  const handlePresetSocialAndChats = () => {
    setOptions({
      mockFemaleCreators: false,
      mockMaleCallers: false,
      customUsers: false,
      teamLeaderAgencies: false,
      adminAccount: false,
      profilesMedia: false,
      walletLedger: false,
      userCoins: false,
      creatorEarnings: false,
      payoutRequests: false,
      coinPackages: false,
      virtualGiftsCatalog: false,
      chatMessages: true,
      friendRequests: true,
      friendsList: true,
      favoritesList: true,
      blockedList: true,
      callLogs: true,
      liveHostsPool: true,
      quickMatchQueues: true,
      surveillanceLogs: true,
      feedPosts: true,
      creatorGoals: false,
      creatorAnalytics: false,
      creatorReviews: true,
      dailyRewardsAndQuests: false,
      homeBanners: false,
      policyDocuments: false,
      quickLinks: false,
      systemSettings: false,
      taxonomiesAndFlags: false,
      syncWithSupabase: supabaseActive,
      syncWithServer: true,
    });
  };

  const handlePresetCoinsAndFinancials = () => {
    setOptions({
      mockFemaleCreators: false,
      mockMaleCallers: false,
      customUsers: false,
      teamLeaderAgencies: false,
      adminAccount: false,
      profilesMedia: false,
      userCoins: true,
      creatorEarnings: true,
      walletLedger: true,
      payoutRequests: true,
      coinPackages: true,
      virtualGiftsCatalog: true,
      chatMessages: false,
      friendRequests: false,
      friendsList: false,
      favoritesList: false,
      blockedList: false,
      callLogs: false,
      liveHostsPool: false,
      quickMatchQueues: false,
      surveillanceLogs: false,
      feedPosts: false,
      creatorGoals: true,
      creatorAnalytics: true,
      creatorReviews: false,
      dailyRewardsAndQuests: true,
      homeBanners: false,
      policyDocuments: false,
      quickLinks: false,
      systemSettings: false,
      taxonomiesAndFlags: false,
      syncWithSupabase: supabaseActive,
      syncWithServer: true,
    });
  };

  // Count active checkboxes
  const activeKeysCount = Object.entries(options).filter(
    ([k, v]) => v === true && k !== 'syncWithSupabase' && k !== 'syncWithServer'
  ).length;

  const handleExecuteReset = async () => {
    const allowedNow = await refreshFactoryResetStatus();
    if (allowedNow === false) {
      showToast(
        'Factory Reset Disabled',
        factoryResetHint ||
          'Set ALLOW_FACTORY_RESET=true in server .env, then click Refresh in this modal.',
        'warning'
      );
      return;
    }
    if (activeKeysCount === 0) {
      showToast('Select Category', 'Please check at least one data category to reset.', 'warning');
      return;
    }
    if (!confirmOk) {
      showToast('Confirmation Required', 'Type DELETE to confirm destructive user / admin / R2 purge options.', 'warning');
      return;
    }
    if (options.customUsers) {
      const ok = window.confirm(
        `⚠️ DESTRUCTIVE: Delete ALL ${nonAdminCount} non-admin user accounts from the database?\n\nThis is not limited to demo accounts.\n\nServer must have ALLOW_FACTORY_RESET=true.`
      );
      if (!ok) return;
    }

    setIsProcessing(true);
    setResetFeedback(null);
    try {
      const res = await resetMockDataGranular(options);
      setResetFeedback({
        success: res.success,
        summary: res.summary,
        categories: res.categoriesCleared,
      });
      if (res.success) {
        setTimeout(() => {
          setIsProcessing(false);
          onClose();
        }, 600);
      } else {
        setIsProcessing(false);
      }
    } catch (err: any) {
      setIsProcessing(false);
      setResetFeedback({
        success: false,
        summary: err.message || 'An error occurred during reset.',
      });
    }
  };

  const handleResetAllWipe = async () => {
    const allowedNow = await refreshFactoryResetStatus();
    if (allowedNow === false) {
      showToast(
        'Factory Wipe Disabled',
        factoryResetHint ||
          'Set ALLOW_FACTORY_RESET=true in server .env, then click Refresh in this modal.',
        'warning'
      );
      return;
    }
    if (!deleteTyped) {
      showToast('Confirmation Required', 'Type DELETE in the confirmation box before factory wipe.', 'warning');
      return;
    }
    const ok = window.confirm(
      '⚠️ FACTORY WIPE: This deletes ALL non-admin users and selected application data.\n\nAdmin password is NOT reset.\n\nRequires ALLOW_FACTORY_RESET=true on the server.\n\nContinue?'
    );
    if (!ok) return;

    setIsProcessing(true);
    setResetFeedback(null);
    try {
      const allOptions: ResetDataOptions = {
        mockFemaleCreators: false,
        mockMaleCallers: false,
        customUsers: true,
        teamLeaderAgencies: true,
        adminAccount: true,
        profilesMedia: true,
        r2PurgeAllUploads: true,
        userCoins: true,
        creatorEarnings: true,
        walletLedger: true,
        payoutRequests: true,
        coinPackages: true,
        virtualGiftsCatalog: true,
        chatMessages: true,
        friendRequests: true,
        friendsList: true,
        favoritesList: true,
        blockedList: true,
        callLogs: true,
        liveHostsPool: true,
        quickMatchQueues: true,
        surveillanceLogs: true,
        feedPosts: true,
        creatorGoals: true,
        creatorAnalytics: true,
        creatorReviews: true,
        dailyRewardsAndQuests: true,
        homeBanners: true,
        policyDocuments: true,
        quickLinks: true,
        systemSettings: true,
        taxonomiesAndFlags: true,
        clientStoragePurge: true,
        syncWithSupabase: supabaseActive,
        syncWithServer: true,
      };

      const res = await resetMockDataGranular(allOptions);
      setResetFeedback({
        success: res.success,
        summary: res.success
          ? 'Selected application and storage data wiped. Admin Auth password was not changed.'
          : res.summary,
        categories: res.categoriesCleared,
      });
      setIsProcessing(false);
      if (res.success) onClose();
    } catch (err: any) {
      setIsProcessing(false);
      setResetFeedback({
        success: false,
        summary: err.message || 'Failed to perform total wipe.',
      });
    }
  };

  return (
    <div
      id="reset-mock-data-modal-overlay"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-mock-data-title"
    >
      <div
        id="reset-mock-data-modal-container"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-rose-500/20 to-red-600/20 border border-rose-500/30 text-rose-400 shadow-inner">
              <Trash2 className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h2 id="reset-mock-data-title" className="text-lg font-bold text-white flex items-center gap-2">
                <span>Destructive Data Reset</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono border rounded-full ${
                    factoryResetAllowed === true
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                      : factoryResetAllowed === false
                        ? 'bg-rose-950/80 text-rose-400 border-rose-800/60'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                  }`}
                >
                  {factoryResetAllowed === true
                    ? `ENABLED (${factoryResetEnvValue || 'true'})`
                    : factoryResetAllowed === false
                      ? `Disabled (${factoryResetEnvValue || 'false'})`
                      : 'Checking server…'}
                </span>
                <button
                  type="button"
                  onClick={() => void refreshFactoryResetStatus()}
                  className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                  title="Re-read ALLOW_FACTORY_RESET from server .env"
                >
                  Refresh
                </button>
              </h2>
              <p className="text-xs text-slate-400">
                {serverBlocksReset
                  ? factoryResetHint ||
                    'Set ALLOW_FACTORY_RESET=true in server .env, reopen this modal, run wipe, then set back to false.'
                  : 'Type DELETE in the box below to unlock Factory Wipe. Admin password is never restored here.'}
              </p>
            </div>
          </div>

          <button
            id="close-reset-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Presets Bar */}
        <div className="px-6 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-medium text-[11px] mr-1">Quick Presets:</span>
            <button
              type="button"
              onClick={handlePresetMockDataOnly}
              className="px-2.5 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
            >
              Activity Logs Only (no users)
            </button>
            <button
              type="button"
              onClick={handlePresetSocialAndChats}
              className="px-2.5 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
            >
              💬 Chats & Matches Only
            </button>
            <button
              type="button"
              onClick={handlePresetCoinsAndFinancials}
              className="px-2.5 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
            >
              💰 Coins & Financials
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1 rounded hover:bg-indigo-950/40 transition-colors cursor-pointer"
            >
              Select All
            </button>
            <span className="text-slate-600">|</span>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-xs text-slate-400 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {factoryResetAllowed === false && (
            <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100 space-y-1">
              <div className="font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-300" />
                Factory reset is disabled on this server
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                1) Set <code className="font-mono text-amber-100">ALLOW_FACTORY_RESET=true</code> in the server{' '}
                <code className="font-mono">.env</code> (not <code className="font-mono">.env.example</code>)
                <br />
                2) Click <strong>Refresh</strong> in the header (or reopen this modal)
                <br />
                3) Type <code className="font-mono">DELETE</code> below, then run Factory Wipe
                <br />
                4) Set <code className="font-mono">ALLOW_FACTORY_RESET=false</code> again afterward
              </p>
            </div>
          )}

          {/* Feedback banner if reset just completed */}
          {resetFeedback && (
            <div
              className={`p-4 rounded-xl border flex items-start space-x-3 ${
                resetFeedback.success
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}
            >
              {resetFeedback.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs space-y-1">
                <p className="font-bold text-sm">
                  {resetFeedback.success ? 'Reset Completed Successfully' : 'Reset Notice'}
                </p>
                <p className="text-slate-300">{resetFeedback.summary}</p>
                {resetFeedback.categories && resetFeedback.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {resetFeedback.categories.map((c, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono"
                      >
                        ✓ {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Grid of Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category 1: Users & Accounts */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm">
                  <Users className="w-4 h-4" />
                  <span>1. Users & Accounts</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {users.length} registered
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.customUsers}
                    onChange={() => toggleOption('customUsers')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-rose-200 group-hover:text-white">
                        Delete ALL Non-Admin Users
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-rose-950 text-[10px] text-rose-300 border border-rose-800 font-mono">
                        {nonAdminCount} accounts
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Permanently deletes every non-admin profile (real and test). Not limited to a demo roster.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.teamLeaderAgencies}
                    onChange={() => toggleOption('teamLeaderAgencies')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Agency Accounts
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-950 text-[10px] text-amber-300 border border-amber-800 font-mono">
                        {teamLeadersCount} agencies
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Deletes Agency accounts and their managed host roster (users with a teamLeaderId).
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.adminAccount}
                    onChange={() => toggleOption('adminAccount')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Reset Admin Profile Fields
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-purple-950 text-[10px] text-purple-300 border border-purple-800">
                        No Password Change
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Resets display name / verification flags only. Password must be changed via authenticated update-password (passwordPolicy). Coin balance is left unchanged.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Category 2: Profiles & Media Content */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-pink-400 font-semibold text-sm">
                  <Sparkles className="w-4 h-4" />
                  <span>2. Profiles & Custom Media</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">Media & Bio</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.profilesMedia}
                    onChange={() => toggleOption('profilesMedia')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-pink-500 focus:ring-pink-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Custom Bios, Galleries & Mock Locations
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        Reset
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Clears uploaded profile galleries, verification video records, interests, and simulated coordinates.
                    </p>
                  </div>
                </label>

                <label
                  className="flex items-start space-x-2.5 cursor-pointer select-none group opacity-95"
                >
                  <input
                    type="checkbox"
                    checked={options.r2PurgeAllUploads || false}
                    onChange={() => toggleOption('r2PurgeAllUploads')}
                    disabled={!options.profilesMedia}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-pink-500 focus:ring-pink-500/40 disabled:opacity-50"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Request R2 media purge (not executed on Vercel)
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-[10px] text-amber-200 font-mono border border-amber-500/30">
                        DB-only on Vercel
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      On Vercel production the API records this request but does <span className="text-amber-300 font-semibold">not</span> delete
                      R2 objects. Clear the bucket in Cloudflare if a full media wipe is required. Local Express may purge when configured.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.creatorGoals}
                    onChange={() => toggleOption('creatorGoals')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-pink-500 focus:ring-pink-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Creator Fundraising Goals
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        Goals
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Wipes creator crowdfunding goals and coin contribution progress.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Category 3: Coins & Balances */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-amber-400 font-semibold text-sm">
                  <Coins className="w-4 h-4" />
                  <span>3. Coins & Wallet Balances</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">Economy</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.userCoins}
                    onChange={() => toggleOption('userCoins')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Male Caller Coin Balances
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-amber-400 font-mono">
                        → 0 Coins
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Resets male user balances back to initial wallet state.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.creatorEarnings}
                    onChange={() => toggleOption('creatorEarnings')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Female Creator Earnings & USD
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-emerald-400 font-mono">
                        → $0.00
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Resets host earned coins and total lifetime earned USD.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={Boolean(options.walletLedger)}
                    onChange={() => toggleOption('walletLedger')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Wallet Ledger (burns, gifts, rewards)
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        wallet_ledger
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Deletes all wallet_ledger rows. Also auto-purged with call logs, coin resets, or full user wipe.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Category 4: Transactions, SKUs & Gifts */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
                  <DollarSign className="w-4 h-4" />
                  <span>4. Transactions, SKUs & Gifts</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {payoutRequests.length} payouts
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.payoutRequests}
                    onChange={() => toggleOption('payoutRequests')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Creator Payout Requests
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {payoutRequests.length} records
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Wipes all pending, approved, and completed payout requests history.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.coinPackages}
                    onChange={() => toggleOption('coinPackages')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Coin Store SKU Packages
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {coinPackages.length} SKUs
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Restores coin packages back to initial default store pricing tiers.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.virtualGiftsCatalog}
                    onChange={() => toggleOption('virtualGiftsCatalog')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Virtual Gifts & Tips Catalog
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-pink-300 font-mono">
                        {virtualGifts.length} gifts
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Restores virtual gifts catalog, animations, and coin price values to system defaults.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Category 5: Chats & Social */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-sm">
                  <MessageSquare className="w-4 h-4" />
                  <span>5. Chats & Social</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {chatMessages.length} msgs
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.chatMessages}
                    onChange={() => toggleOption('chatMessages')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Direct Chat Message Histories
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {chatMessages.length} logs
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Wipes all direct messages, gift notifications, and read indicators.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.friendRequests}
                    onChange={() => toggleOption('friendRequests')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Friend Requests
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {friendRequests.length} pending
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Clears pending incoming and outgoing friend proposals.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.friendsList}
                    onChange={() => toggleOption('friendsList')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Friends Roster & Favorites
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {friends.length + favorites.length} social
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Clears reciprocal friendships, starred favorites, and blocked blacklist.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.blockedList}
                    onChange={() => toggleOption('blockedList')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Blacklist & Blocked Accounts
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-rose-400 font-mono">
                        {blockedUserIds.length} blocked
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Unblocks all currently blacklisted caller and host accounts.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Category 6: Matches & Call Records */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-violet-400 font-semibold text-sm">
                  <PhoneCall className="w-4 h-4" />
                  <span>6. Matches, Calls & Surveillance</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {callLogs.length} calls
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.callLogs}
                    onChange={() => toggleOption('callLogs')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-violet-500 focus:ring-violet-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Video Call Logs & Receipts
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {callLogs.length} calls
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Clears 1-on-1 call duration, coins burned, and caller history logs.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.liveHostsPool}
                    onChange={() => toggleOption('liveHostsPool')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-violet-500 focus:ring-violet-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Live Broadcast Queue
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {liveHostIds.length} live
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Clears active Quick Match live broadcasting queue.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.quickMatchQueues}
                    onChange={() => toggleOption('quickMatchQueues')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-violet-500 focus:ring-violet-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Quick Match & Discovery Queues
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-violet-300 font-mono">
                        Queues
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Clears client discovery history and quick speed dating match pairs.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.surveillanceLogs}
                    onChange={() => toggleOption('surveillanceLogs')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-violet-500 focus:ring-violet-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Admin Incident & Safety Logs
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {incidentEvidenceLogs.length} logs
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Wipes captured security snapshots, warnings, and abuse incident reports.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Category 7: Performance Analytics, Reviews & Quests */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-yellow-400 font-semibold text-sm">
                  <Trophy className="w-4 h-4" />
                  <span>7. Analytics, Reviews & Quests</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {creatorReviews.length} reviews
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.creatorAnalytics}
                    onChange={() => toggleOption('creatorAnalytics')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-yellow-500 focus:ring-yellow-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Host Performance & Target Pacing
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-yellow-400 font-mono">
                        Target Quotas
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Purges creator active online hours, response health, call answer rates, and Ready Now flags.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.creatorReviews}
                    onChange={() => toggleOption('creatorReviews')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-yellow-500 focus:ring-yellow-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Host Reviews & 5-Star Standing
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-amber-300 font-mono">
                        {creatorReviews.length} reviews
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Clears creator ratings for communication, friendliness, energy, and user comments.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.dailyRewardsAndQuests}
                    onChange={() => toggleOption('dailyRewardsAndQuests')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-yellow-500 focus:ring-yellow-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Daily Rewards, Streaks & Quests
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-yellow-300 font-mono">
                        Quests
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Resets daily login streaks, 7-day reward claims, mission tasks, and master chest unlocks.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Category 8: Feed Moments & Community */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-rose-400 font-semibold text-sm">
                  <Flame className="w-4 h-4" />
                  <span>8. Feed Moments & Posts</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {feedPosts.length} posts
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.feedPosts}
                    onChange={() => toggleOption('feedPosts')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Creator Moments Feed Posts
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {feedPosts.length} posts
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Clears uploaded moment stories, likes, captions, and comments.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Category 9: CMS, Policies & Taxonomies */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3 md:col-span-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center space-x-2 text-blue-400 font-semibold text-sm">
                  <Sliders className="w-4 h-4" />
                  <span>9. CMS, Policies & Taxonomy Configuration</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">Settings</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.homeBanners}
                    onChange={() => toggleOption('homeBanners')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Home Carousel Banners
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {homeBanners.length} banners
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Resets promotional hero banners & slideshow CTA campaigns.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.policyDocuments}
                    onChange={() => toggleOption('policyDocuments')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Legal & Safety Policy Documents
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {policyDocuments.length} docs
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Resets custom written policy content back to template defaults.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.quickLinks}
                    onChange={() => toggleOption('quickLinks')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Home Quick Shortcuts
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {homeQuickLinks.length} links
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Restores home shortcuts and discovery quick actions.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={options.systemSettings}
                    onChange={() => toggleOption('systemSettings')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        System Economy & Burn Rates
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        Settings
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Resets 10 coins/min rate, 60% creator share, and LiveKit credentials.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer select-none group sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={options.taxonomiesAndFlags}
                    onChange={() => toggleOption('taxonomiesAndFlags')}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/40"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 group-hover:text-white">
                        Global Taxonomies & Dynamic Flag Sizing
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        Countries, Langs, Zodiacs
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Restores worldwide enabled countries, spoken languages, zodiac astrological signs, categorized interests, and SVG vector flag dimensions.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Category 10: Client Storage Purge */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors space-y-3">
            <div className="flex items-center space-x-2 text-purple-400 font-semibold text-sm">
              <span>Client Storage Purge (local/session/cookies)</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={options.clientStoragePurge || false}
                  onChange={() => toggleOption('clientStoragePurge')}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-purple-400 focus:ring-purple-400/40"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200 group-hover:text-white">
                      Purge client storage + sign out
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-purple-950 text-[10px] text-purple-300 font-mono border border-purple-800/40">
                      Tokens Cleared
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Clears <span className="font-mono">localStorage</span>, <span className="font-mono">sessionStorage</span>, and attempts cookie cleanup; then signs out Supabase.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Sync Targets & Safety Box */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Storage & Synchronization Destinations</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-start space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.syncWithSupabase}
                  onChange={() => toggleOption('syncWithSupabase')}
                  disabled={!supabaseActive}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40 disabled:opacity-50"
                />
                <div>
                  <span className="font-medium text-slate-200">
                    Purge from Connected Supabase Database
                  </span>
                  <p className="text-[11px] text-slate-400">
                    {supabaseActive
                      ? '🟢 Supabase Connected — will execute DELETE queries on PostgreSQL tables.'
                      : '⚪ Supabase not configured in settings.'}
                  </p>
                </div>
              </label>

              <label className="flex items-start space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.syncWithServer}
                  onChange={() => toggleOption('syncWithServer')}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40"
                />
                <div>
                  <span className="font-medium text-slate-200">
                    Synchronize Server Memory & WebSockets
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Broadcasts instant purge notifications to active client sessions.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex flex-col gap-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-rose-800/60 bg-rose-950/30 px-3 py-2">
              <label className="text-[11px] text-rose-200 font-medium shrink-0" htmlFor="reset-confirm-phrase">
                Type DELETE to unlock factory wipe{requiresTypedConfirm ? ' / destructive options' : ''}:
              </label>
              <input
                id="reset-confirm-phrase"
                type="text"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="DELETE"
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                autoComplete="off"
              />
            </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Selected categories: <span className="font-bold text-white">{activeKeysCount}</span>
            {serverBlocksReset && (
              <span className="ml-2 text-rose-400">· server gate off</span>
            )}
            {!serverBlocksReset && !deleteTyped && (
              <span className="ml-2 text-amber-300">· type DELETE to unlock Factory Wipe</span>
            )}
            {!confirmOk && requiresTypedConfirm && (
              <span className="ml-2 text-rose-400">· confirmation incomplete</span>
            )}
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <button
              id="reset-modal-cancel-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              id="execute-selected-reset-btn"
              type="button"
              onClick={handleExecuteReset}
              disabled={isProcessing || activeKeysCount === 0 || !confirmOk || serverBlocksReset}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-all shadow-md shadow-indigo-900/30 flex items-center space-x-1.5 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying Reset...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset Selected Data ({activeKeysCount})</span>
                </>
              )}
            </button>

            <button
              id="reset-all-wipe-btn"
              type="button"
              onClick={handleResetAllWipe}
              disabled={isProcessing || !factoryWipeUnlocked}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-all shadow-md shadow-rose-950/50 flex items-center space-x-1.5 border border-rose-400/30 cursor-pointer"
              title={
                serverBlocksReset
                  ? 'Disabled: set ALLOW_FACTORY_RESET=true in .env, then click Refresh'
                  : !deleteTyped
                    ? 'Type DELETE in the confirmation box above to unlock'
                    : 'Wipe application data'
              }
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-200" />
              <span>
                {serverBlocksReset
                  ? 'Factory Wipe (Disabled on server)'
                  : !deleteTyped
                    ? 'Factory Wipe (type DELETE above)'
                    : 'Factory Wipe'}
              </span>
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
