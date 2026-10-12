import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { authFetch } from '../../utils/apiClient';
import { getPasswordPolicyError, evaluatePasswordStrength } from '../../../shared/passwordPolicy';
import {
  Settings,
  DollarSign,
  Users,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Edit2,
  TrendingUp,
  Coins,
  Search,
  Lock,
  Sparkles,
  Zap,
  Key,
  Video,
  Eye,
  EyeOff,
  Server,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  LogIn,
  Sliders,
  MapPin,
  Radio,
  PhoneOff,
  ShieldAlert,
  Volume2,
  Camera,
  AlertTriangle,
  Play,
  Clock,
  Layers,
  FileText,
  Database,
  Crown,
  Building,
  UserPlus,
  Gift,
  Sparkle,
  UploadCloud,
  Loader2,
  Image as ImageIcon,
  Globe,
  Upload,
  Rocket,
  Percent,
  ChevronRight,
  Target,
  Landmark,
  Activity,
  Mail,
} from 'lucide-react';
import { AdminEmailPanel } from './AdminEmailPanel';
import { CoinPackage, UserProfile, AdminActiveCall, getUserRoleLabel, getFemaleRoleMark, VirtualGift } from '../../types';
import { getCoinUsdPeg, coinsToUsd, usdToCoins, formatPegExample } from '../../../shared/finance/fx';
import {
  DEFAULT_COIN_BURN_RATE_PER_MIN,
  DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
  DEFAULT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
  DEFAULT_TEAM_LEADER_SHARE_PERCENT,
  deriveHostEarnPerMin,
} from '../../../shared/finance/economyBurn';
import {
  DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
} from '../../../shared/finance/economyGift';
import {
  totalCoins as pkgTotalCoins,
  payPriceUSD,
  listPriceUSD,
  savingUSD,
  savingPercent,
  savingDisplayLabel,
  approxCallMinutes as pkgApproxCallMinutes,
  hasDiscount,
} from '../../utils/coinPackagePricing';
import { getUserEffectiveLocation } from '../../utils/location';
import { ManualCoinModal } from './ManualCoinModal';
import { EditUserModal } from './EditUserModal';
import { AdminHomeCMS } from './AdminHomeCMS';
import { AdminNavBarEditor } from './AdminNavBarEditor';
import { AdminPayoutCardsCMS } from './AdminPayoutCardsCMS';
import { UserAnalyticsModal } from './UserAnalyticsModal';
import { AdminSilentCallMonitorModal } from './AdminSilentCallMonitorModal';
import { AdminDatabaseStorageConfig } from './AdminDatabaseStorageConfig';
import { AdminApiHealthPanel } from './AdminApiHealthPanel';
import { AdminSystemTestingPanel } from './AdminSystemTestingPanel';
import { AdminK6LoadTestingPanel } from './AdminK6LoadTestingPanel';
import { ResetMockDataModal } from './ResetMockDataModal';
import { AdminTaxonomyManager } from './AdminTaxonomyManager';
import { AdminCreatorTargetConfig } from './AdminCreatorTargetConfig';
import { AdminFinancialModule } from './finance/AdminFinancialModule';
import { ALL_WORLDWIDE_COUNTRIES, getAllowedCountries } from '../../utils/countries';
import { getAllowedLanguages } from '../../utils/taxonomies';
import { uploadMediaDirectlyToR2 } from '../../utils/r2Storage';
import { UnifiedImageUploader } from '../common/UnifiedImageUploader';
import { getFallbackAvatar } from '../../utils/avatars';
import { AdminAnalyticsHub } from './analytics/AdminAnalyticsHub';
import type { AnalyticsHubTab } from './analytics/AdminAnalyticsHub';
import { AdminEconomyConfigHub } from './AdminEconomyConfigHub';
import { AdminShell } from './AdminShell';
import {
  ADMIN_NAV_GROUPS,
  AdminSubTabKey,
  defaultL2ForTab,
  filterAdminNavGroups,
} from './adminNavConfig';
import { AdminOfficeRbacPage } from './AdminOfficeRbacPage';
import { fetchOfficeRbacMe } from '../../services/officeRbacApi';
import { hasOfficePermission } from '../../../shared/officeRbac/features';

/** Female hosts managed by a Team Leader — ID/authId first, agencyName only as fallback. */
function getManagedCreatorsForLeader(leader: UserProfile, allUsers: UserProfile[]): UserProfile[] {
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

    // Prefer ID match: skip agency fallback when host already points at a different TL id
    if (u.teamLeaderId && u.teamLeaderId !== leader.id && u.teamLeaderId !== leader.authId) {
      return false;
    }
    if (u.createdById && u.createdById !== leader.id && u.createdById !== leader.authId) {
      return false;
    }

    if (
      leader.agencyName &&
      u.agencyName &&
      u.agencyName.trim().toLowerCase() === leader.agencyName.trim().toLowerCase()
    ) {
      return true;
    }

    return false;
  });
}

export const AdminDashboard: React.FC = () => {
  const {
    systemSettings,
    updateSystemSettings,
    updateLiveKitConfig,
    showToast,
    coinPackages,
    saveCoinPackage,
    deleteCoinPackage,
    virtualGifts,
    saveVirtualGift,
    deleteVirtualGift,
    resetVirtualGifts,
    payoutRequests,
    users,
    toggleVerifyUser,
    updateUserProfile,
    adminUpdateUser,
    adminDeleteUser,
    switchUser,
    toggleUserStatus,
    adminActiveCalls,
    incidentEvidenceLogs,
    refreshAdminActiveCalls,
    adminTerminateCall,
    adminIssueCallWarning,
    adminCaptureEvidence,
    syncUsersFromSupabase,
    createTeamLeader,
    callLogs,
    updateCreatorCoinEarnOverride,
  } = useApp();

  const [isSyncingFromDb, setIsSyncingFromDb] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const [activeSubTab, setActiveSubTab] = useState<AdminSubTabKey>('analytics');
  const [officeRbac, setOfficeRbac] = useState<{
    isSuper: boolean;
    permissions: string[];
  }>({ isSuper: true, permissions: [] });
  /** Deep-link section inside Coin Burn / Economy hub (A–F). */
  const [economySection, setEconomySection] = useState<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | undefined>(undefined);
  const [analyticsHubTab, setAnalyticsHubTab] = useState<AnalyticsHubTab>('overview');
  const [taxonomyTab, setTaxonomyTab] = useState<
    'countries' | 'flag_sizes' | 'languages' | 'zodiac' | 'interests' | 'currencies'
  >('countries');
  const [creatorOpsView, setCreatorOpsView] = useState<'analytics' | 'matrix' | 'targets'>('targets');
  const [infraTab, setInfraTab] = useState<
    'db_pool' | 'r2_storage' | 'moderation' | 'features' | 'sql_schema'
  >('db_pool');
  const [financeModuleTab, setFinanceModuleTab] = useState<
    | 'overview'
    | 'salary_batches'
    | 'live_ledger'
    | 'platform'
    | 'team_leaders'
    | 'hosts'
    | 'funding'
    | 'batches'
    | 'settlement'
    | 'period'
  >('overview');
  const [cmsSection, setCmsSection] = useState<'banners' | 'policies' | 'shortcuts' | 'discovery_card'>(
    'banners'
  );
  const [activeSpectatorCall, setActiveSpectatorCall] = useState<AdminActiveCall | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchOfficeRbacMe();
      if (cancelled) return;
      if (!res.success || !res.data) {
        // Tables missing or error → treat as legacy full admin so console stays usable
        setOfficeRbac({ isSuper: true, permissions: [] });
        return;
      }
      setOfficeRbac({
        isSuper: res.data.isSuper === true,
        permissions: res.data.permissions || [],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredNavGroups = useMemo(
    () =>
      filterAdminNavGroups(ADMIN_NAV_GROUPS, {
        isSuper: officeRbac.isSuper,
        permissions: officeRbac.permissions,
      }),
    [officeRbac.isSuper, officeRbac.permissions]
  );

  useEffect(() => {
    if (officeRbac.isSuper) return;
    const allowed = filteredNavGroups.flatMap((g) => g.items.filter((i) => i.kind === 'tab'));
    if (!allowed.length) return;
    const stillOk = allowed.some((i) => i.id === activeSubTab);
    if (!stillOk) {
      const first = allowed[0];
      setActiveSubTab(first.id as AdminSubTabKey);
    }
  }, [filteredNavGroups, officeRbac.isSuper, activeSubTab]);

  // Deep-links from host target progress panels (Creator Ops / Economy shares)
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | {
            tab?: string;
            economySection?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
            creatorOpsView?: 'analytics' | 'matrix' | 'targets';
          }
        | undefined;
      if (!detail?.tab) return;
      setActiveSubTab(detail.tab as AdminSubTabKey);
      if (detail.economySection) {
        setEconomySection(detail.economySection);
      }
      if (detail.creatorOpsView) {
        setCreatorOpsView(detail.creatorOpsView);
      }
    };
    window.addEventListener('minglecall:admin-navigate', handler as EventListener);
    return () => window.removeEventListener('minglecall:admin-navigate', handler as EventListener);
  }, []);

  const activeNestedKey = useMemo(() => {
    switch (activeSubTab) {
      case 'analytics':
        return analyticsHubTab;
      case 'financials':
        return economySection ?? 'A';
      case 'countries':
        return taxonomyTab;
      case 'creator-ops':
        return creatorOpsView;
      case 'infra':
        return infraTab;
      case 'finance-module':
        return financeModuleTab;
      case 'cms':
        return cmsSection;
      default:
        return undefined;
    }
  }, [
    activeSubTab,
    analyticsHubTab,
    economySection,
    taxonomyTab,
    creatorOpsView,
    infraTab,
    financeModuleTab,
    cmsSection,
  ]);

  const navigateAdmin = (tab: AdminSubTabKey, nestedKey?: string) => {
    if (
      !hasOfficePermission(
        { isSuper: officeRbac.isSuper, permissions: officeRbac.permissions },
        nestedKey ? `${tab}:${nestedKey}` : tab
      ) &&
      !hasOfficePermission(
        { isSuper: officeRbac.isSuper, permissions: officeRbac.permissions },
        tab
      )
    ) {
      return;
    }
    setActiveSubTab(tab);
    if (!nestedKey) {
      if (tab === 'financials') setEconomySection(undefined);
      return;
    }
    switch (tab) {
      case 'analytics':
        setAnalyticsHubTab(nestedKey as AnalyticsHubTab);
        break;
      case 'financials':
        setEconomySection(nestedKey as 'A' | 'B' | 'C' | 'D' | 'E' | 'F');
        break;
      case 'countries':
        setTaxonomyTab(nestedKey as typeof taxonomyTab);
        break;
      case 'creator-ops':
        setCreatorOpsView(nestedKey as typeof creatorOpsView);
        break;
      case 'infra':
        setInfraTab(nestedKey as typeof infraTab);
        break;
      case 'finance-module':
        setFinanceModuleTab(nestedKey as typeof financeModuleTab);
        break;
      case 'cms':
        setCmsSection(nestedKey as typeof cmsSection);
        break;
      default:
        break;
    }
  };

  // Virtual Gift Modal state
  const [editingGift, setEditingGift] = useState<(Partial<VirtualGift> & { id?: string }) | null>(null);

  // Team Leader Create Modal State
  const [isAddLeaderOpen, setIsAddLeaderOpen] = useState(false);
  const [isLeaderAvatarModalOpen, setIsLeaderAvatarModalOpen] = useState(false);
  const [showLeaderPassword, setShowLeaderPassword] = useState(false);
  const [isUploadingLeaderAvatar, setIsUploadingLeaderAvatar] = useState(false);
  const [uploadLeaderProgress, setUploadLeaderProgress] = useState(0);
  const [leaderAvatarUploadError, setLeaderAvatarUploadError] = useState<string | null>(null);
  const leaderFileInputRef = useRef<HTMLInputElement>(null);

  const leaderAvatarPresets = [
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
  ];

  const handleUploadLeaderAvatar = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Invalid File', 'Please select an image file (PNG, JPG, WEBP, GIF).', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast('File Too Large', 'Avatar image must be under 15MB', 'error');
      return;
    }

    setIsUploadingLeaderAvatar(true);
    setUploadLeaderProgress(15);
    setLeaderAvatarUploadError(null);

    // 1. Instant local preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setNewLeaderForm((prev) => ({ ...prev, avatarUrl: e.target!.result as string }));
      }
    };
    reader.readAsDataURL(file);

    try {
      const res = await uploadMediaDirectlyToR2({
        file,
        category: 'avatar',
        onProgress: (p) => setUploadLeaderProgress(Math.max(15, p)),
      });
      if (res && res.publicUrl) {
        setNewLeaderForm((prev) => ({ ...prev, avatarUrl: res.publicUrl }));
      }
      showToast('Profile Picture Uploaded ☁️', 'Agency picture stored on Cloudflare R2.', 'success');
      setIsLeaderAvatarModalOpen(false);
    } catch (err: any) {
      console.warn('Leader avatar upload note:', err);
      showToast('Profile Picture Applied ✨', 'Image applied to form preview.', 'info');
    } finally {
      setIsUploadingLeaderAvatar(false);
      setUploadLeaderProgress(0);
    }
  };

  const [newLeaderForm, setNewLeaderForm] = useState({
    name: '',
    email: '',
    password: '',
    agencyName: 'Aurora Talent Management',
    commissionPercent: systemSettings.teamLeaderSharePercent ?? 10,
    spokenLanguages: 'English, Spanish',
    nationality: 'United States',
    countryCode: 'US',
    bio: 'Director of Creator Guild & Talent Management',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
  });
  const [isCreatingLeader, setIsCreatingLeader] = useState(false);

  useEffect(() => {
    if (activeSubTab === 'monitoring') {
      refreshAdminActiveCalls();
    }
  }, [activeSubTab]);

  // LiveKit Keys & Encoding State
  const [livekitApiKey, setLivekitApiKey] = useState(systemSettings.livekitApiKey || '');
  const [livekitApiSecret, setLivekitApiSecret] = useState(systemSettings.livekitApiSecret || '');
  const [livekitWsUrl, setLivekitWsUrl] = useState(systemSettings.livekitWsUrl || 'wss://your-livekit-project.livekit.cloud');
  const [livekitCaptureResolution, setLivekitCaptureResolution] = useState<'1080p' | '720p' | '480p' | '4k'>(
    systemSettings.livekitCaptureResolution || '720p'
  );
  const [livekitMaxBitrateKbps, setLivekitMaxBitrateKbps] = useState<number>(
    systemSettings.livekitMaxBitrateKbps || 2200
  );
  const [livekitMaxFramerate, setLivekitMaxFramerate] = useState<number>(
    systemSettings.livekitMaxFramerate || 30
  );
  const [livekitSimulcastEnabled, setLivekitSimulcastEnabled] = useState<boolean>(
    systemSettings.livekitSimulcastEnabled !== undefined ? systemSettings.livekitSimulcastEnabled : true
  );
  const [livekitAdaptiveStream, setLivekitAdaptiveStream] = useState<boolean>(
    systemSettings.livekitAdaptiveStream !== undefined ? systemSettings.livekitAdaptiveStream : true
  );
  const [livekitDynacast, setLivekitDynacast] = useState<boolean>(
    systemSettings.livekitDynacast !== undefined ? systemSettings.livekitDynacast : true
  );
  const [livekitVideoCodec, setLivekitVideoCodec] = useState<'vp8' | 'h264' | 'vp9' | 'av1'>(
    systemSettings.livekitVideoCodec || 'vp8'
  );

  const [isSavingLivekit, setIsSavingLivekit] = useState(false);
  const [testTokenResult, setTestTokenResult] = useState<{ success?: boolean; message?: string; token?: string } | null>(null);
  const [isTestingToken, setIsTestingToken] = useState(false);

  useEffect(() => {
    if (systemSettings.livekitApiKey !== undefined) setLivekitApiKey(systemSettings.livekitApiKey);
    if (systemSettings.livekitApiSecret !== undefined) setLivekitApiSecret(systemSettings.livekitApiSecret);
    if (systemSettings.livekitWsUrl) setLivekitWsUrl(systemSettings.livekitWsUrl);
    if (systemSettings.livekitCaptureResolution) setLivekitCaptureResolution(systemSettings.livekitCaptureResolution);
    if (systemSettings.livekitMaxBitrateKbps) setLivekitMaxBitrateKbps(systemSettings.livekitMaxBitrateKbps);
    if (systemSettings.livekitMaxFramerate) setLivekitMaxFramerate(systemSettings.livekitMaxFramerate);
    if (systemSettings.livekitSimulcastEnabled !== undefined) setLivekitSimulcastEnabled(systemSettings.livekitSimulcastEnabled);
    if (systemSettings.livekitAdaptiveStream !== undefined) setLivekitAdaptiveStream(systemSettings.livekitAdaptiveStream);
    if (systemSettings.livekitDynacast !== undefined) setLivekitDynacast(systemSettings.livekitDynacast);
    if (systemSettings.livekitVideoCodec) setLivekitVideoCodec(systemSettings.livekitVideoCodec);
  }, [
    systemSettings.livekitApiKey,
    systemSettings.livekitApiSecret,
    systemSettings.livekitWsUrl,
    systemSettings.livekitCaptureResolution,
    systemSettings.livekitMaxBitrateKbps,
    systemSettings.livekitMaxFramerate,
    systemSettings.livekitSimulcastEnabled,
    systemSettings.livekitAdaptiveStream,
    systemSettings.livekitDynacast,
    systemSettings.livekitVideoCodec,
  ]);

  // SKU Modal Form State
  const [editingSku, setEditingSku] = useState<Partial<CoinPackage> | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  /** Users list: 'all' | 'independent' | team_leader.id */
  const [userTeamLeaderFilter, setUserTeamLeaderFilter] = useState<string>('all');
  /** Team Leaders tab: open managed-creators modal for this leader */
  const [managedCreatorsLeader, setManagedCreatorsLeader] = useState<UserProfile | null>(null);

  // Manual Coin Addition Modal State
  const [isCoinModalOpen, setIsCoinModalOpen] = useState(false);
  const [selectedUserForCoins, setSelectedUserForCoins] = useState<string | null>(null);

  // Edit User Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserProfile | null>(null);

  // User Analytics Modal State
  const [selectedUserForAnalytics, setSelectedUserForAnalytics] = useState<UserProfile | null>(null);

  // Override Earning Modal State (female_creator only)
  const [overrideEarningUser, setOverrideEarningUser] = useState<UserProfile | null>(null);
  const [overrideEarningRate, setOverrideEarningRate] = useState<number>(48);
  const [overrideUseSystemRate, setOverrideUseSystemRate] = useState(true);

  // Action Dropdown state (row ID with open menu)
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);

  // User Deletion Modal State
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [isDeletingUserProcessing, setIsDeletingUserProcessing] = useState(false);

  // Analytics Calculation
  const totalPendingPayoutsUSD = payoutRequests
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + r.amountUSD, 0);

  const totalCompletedPayoutsUSD = payoutRequests
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + r.amountUSD, 0);

  const handleSaveGiftForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGift) return;
    saveVirtualGift(editingGift);
    setEditingGift(null);
  };

  const handleSaveLiveKitQuality = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingLivekit(true);
    await updateLiveKitConfig();

    const currentProfile =
      livekitCaptureResolution === '4k' ? 'ultra_4k' :
      livekitCaptureResolution === '1080p' ? 'hd_1080p' :
      livekitCaptureResolution === '480p' ? 'standard_480p' :
      'high_720p';

    updateSystemSettings({
      livekitCaptureResolution,
      videoQualityProfile: currentProfile,
      livekitMaxBitrateKbps: Number(livekitMaxBitrateKbps),
      livekitMaxFramerate: Math.min(30, Math.max(24, Number(livekitMaxFramerate) || 30)),
      livekitSimulcastEnabled: Boolean(livekitSimulcastEnabled),
      livekitAdaptiveStream: Boolean(livekitAdaptiveStream),
      livekitDynacast: Boolean(livekitDynacast),
      livekitVideoCodec: livekitVideoCodec,
      livekitExplicitlySet: true,
    });
    setLivekitMaxFramerate(Math.min(30, Math.max(24, Number(livekitMaxFramerate) || 30)));
    setIsSavingLivekit(false);
  };

  const handleTestTokenGen = async () => {
    setIsTestingToken(true);
    setTestTokenResult(null);
    try {
      await updateLiveKitConfig();

      const res = await authFetch('/api/livekit/token', {
        method: 'POST',
        body: JSON.stringify({
          roomName: 'admin_test_room_' + Date.now(),
          name: 'Admin Tester',
        }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          configured: false,
          token: null,
          message: `Server returned non-JSON response (${res.status}): ${text.slice(0, 160)}`,
        };
      }

      const errorMessage =
        (typeof data?.error === 'string' && data.error) ||
        data?.error?.message ||
        data?.message ||
        null;

      if (res.ok && data.configured && data.token) {
        setTestTokenResult({
          success: true,
          message: 'Token generated successfully! LiveKit WebRTC authentication is active from server env.',
          token: data.token,
        });
        showToast('Token Verified 🟢', 'LiveKit WebRTC token signed successfully!', 'success');
      } else if (res.status === 401) {
        setTestTokenResult({
          success: false,
          message: errorMessage || 'Authentication required. Please sign in again as admin, then retry.',
        });
        showToast('Auth Required 🔴', 'Sign in as admin to test LiveKit tokens.', 'error');
      } else if (res.status === 403) {
        setTestTokenResult({
          success: false,
          message: errorMessage || 'Admin privileges required to generate a test token.',
        });
        showToast('Forbidden 🔴', errorMessage || 'Admin privileges required.', 'error');
      } else {
        setTestTokenResult({
          success: false,
          message:
            errorMessage ||
            'Token generation failed. Set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET in Vercel env and Redeploy.',
        });
        showToast('Verification Failed 🔴', errorMessage || 'Check LiveKit Vercel env.', 'error');
      }
    } catch (err: any) {
      setTestTokenResult({
        success: false,
        message: 'Network error contacting LiveKit backend endpoint: ' + err.message,
      });
      showToast('Error', 'Failed to test LiveKit token.', 'error');
    } finally {
      setIsTestingToken(false);
    }
  };

  const handleSaveSkuForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSku) return;
    const list = Number(editingSku.priceUSD) || 0;
    const discountRaw = editingSku.discountPriceUSD;
    if (discountRaw != null && String(discountRaw) !== '') {
      const discount = Number(discountRaw);
      if (!Number.isFinite(discount)) {
        showToast('Invalid Discount', 'Discount Price must be a valid number.', 'error');
        return;
      }
      if (discount > list) {
        showToast('Invalid Discount', 'Discount Price must be ≤ Price.', 'error');
        return;
      }
    }
    saveCoinPackage({
      ...editingSku,
      discountPriceUSD:
        discountRaw == null || String(discountRaw) === '' ? null : Number(discountRaw),
      approxCallMinutes:
        editingSku.approxCallMinutes == null || String(editingSku.approxCallMinutes) === ''
          ? null
          : Math.floor(Number(editingSku.approxCallMinutes)),
      savingLabel: editingSku.savingLabel ? String(editingSku.savingLabel).trim() || null : null,
    });
    setEditingSku(null);
  };

  const teamLeadersList = useMemo(
    () => users.filter((u) => u.role === 'team_leader' || u.role === 'agency_manager'),
    [users]
  );

  const teamLeaderIdSet = useMemo(() => {
    const ids = new Set<string>();
    teamLeadersList.forEach((tl) => {
      ids.add(tl.id);
      if (tl.authId) ids.add(tl.authId);
    });
    return ids;
  }, [teamLeadersList]);

  const managedCreatorsForModal = useMemo(() => {
    if (!managedCreatorsLeader) return [];
    return getManagedCreatorsForLeader(managedCreatorsLeader, users);
  }, [managedCreatorsLeader, users]);

  const filteredUsers = users.filter((u) => {
    const roleLabel = getUserRoleLabel(u);
    const femaleMark = getFemaleRoleMark(u);
    const matchesSearch =
      (u.name || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (u.role || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      roleLabel.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (femaleMark === 'creator' && 'creator'.includes(userSearchQuery.toLowerCase())) ||
      (u.id || '').toLowerCase().includes(userSearchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (userRoleFilter === 'male_user' && roleLabel !== 'Male User') return false;
    if (userRoleFilter === 'female_user' && femaleMark !== 'user') return false;
    if (userRoleFilter === 'female_creator' && femaleMark !== 'creator') return false;
    if (
      userRoleFilter === 'team_leader' &&
      u.role !== 'team_leader' &&
      u.role !== 'agency_manager'
    )
      return false;
    if (userRoleFilter === 'other_user' && roleLabel !== 'Other User') return false;
    if (userRoleFilter === 'admin' && roleLabel !== 'Admin') return false;

    if (userTeamLeaderFilter === 'independent') {
      const underTl =
        (u.teamLeaderId && teamLeaderIdSet.has(u.teamLeaderId)) ||
        (u.createdById && teamLeaderIdSet.has(u.createdById));
      if (underTl) return false;
    } else if (userTeamLeaderFilter !== 'all') {
      const leader = teamLeadersList.find((tl) => tl.id === userTeamLeaderFilter);
      if (!leader) return false;
      if (!getManagedCreatorsForLeader(leader, [u]).length) return false;
    }

    return true;
  });

  const totalCoinBurnAcrossPlatform = useMemo(() => {
    return callLogs.reduce((acc, l) => acc + (l.coinsSpent || 0), 0);
  }, [callLogs]);

  const activeLiveCallsCount = useMemo(() => {
    return adminActiveCalls.filter((c) => c.status === 'active').length;
  }, [adminActiveCalls]);

  const totalPlatformVolumeUSD = useMemo(() => {
    const peg = getCoinUsdPeg(systemSettings);
    const coinSpendUSD = coinsToUsd(totalCoinBurnAcrossPlatform, peg);
    const payoutsUSD = payoutRequests
      .filter((p) => p.status === 'completed')
      .reduce((acc, p) => acc + (p.amountUSD || 0), 0);
    return coinSpendUSD + payoutsUSD;
  }, [totalCoinBurnAcrossPlatform, payoutRequests, systemSettings.coinUsdPeg, systemSettings.femalePayoutRatioUSD, systemSettings.coinToUSDRatio]);

  const canOffice = (key: string) =>
    hasOfficePermission(
      { isSuper: officeRbac.isSuper, permissions: officeRbac.permissions },
      key
    );

  return (
    <AdminShell
      activeSubTab={activeSubTab}
      activeNestedKey={activeNestedKey}
      onNavigateTab={navigateAdmin}
      navGroups={filteredNavGroups}
      onSetupWizard={() => {
        if (!canOffice('setup-wizard')) return;
        window.location.hash = 'server-setup';
        window.location.reload();
      }}
      onResetData={() => {
        if (!canOffice('reset-data')) return;
        setIsResetModalOpen(true);
      }}
      badges={{
        monitoring: adminActiveCalls.length,
        gifts: virtualGifts.length,
        leaders: users.filter((u) => u.role === 'team_leader').length,
        payouts: payoutRequests.length,
        countries: systemSettings.allowedCountryCodes?.length ?? 'All',
      }}
      headerKpis={[
        {
          label: 'Net volume',
          value: `$${totalPlatformVolumeUSD.toFixed(2)}`,
          accentClass: 'text-emerald-400',
        },
        {
          label: 'Active calls',
          value: String(activeLiveCallsCount),
          accentClass: 'text-indigo-400',
        },
        {
          label: 'Coin burn',
          value: totalCoinBurnAcrossPlatform.toLocaleString(),
          accentClass: 'text-amber-400',
        },
      ]}
    >
      {/* Economy KPI snapshot — Overview only (avoid repeating on every admin menu) */}
      {activeSubTab === 'analytics' && analyticsHubTab === 'overview' && (
        <>
          <div className="px-3.5 py-2 rounded-xl bg-slate-950/70 border border-slate-700/80 text-[11px] text-slate-400 font-mono">
            Configured in Economy — cards below are read-only. Open{' '}
            <button
              type="button"
              onClick={() => navigateAdmin('financials', defaultL2ForTab('financials'))}
              className="text-amber-300 font-bold underline underline-offset-2 cursor-pointer hover:text-amber-200"
            >
              Coin Burn &amp; Economy
            </button>{' '}
            to edit burn, shares, or Coin USD Peg. Per-host absolute earn override is on Users (coin_earn_override_rate).
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => navigateAdmin('financials', 'A')}
              className="p-4 bg-[#13161F] border border-slate-800 border-l-[3px] border-l-amber-500/70 rounded-2xl text-left cursor-pointer hover:border-amber-500/40"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Male Coin Burn Rates</div>
              <div className="text-xl font-black text-amber-300 font-mono tracking-tight">
                {systemSettings.coinBurnRatePerMin ?? DEFAULT_COIN_BURN_RATE_PER_MIN}
                <span className="text-sm text-slate-400 font-semibold"> /m</span>
              </div>
              <div className="text-xs font-bold text-emerald-400 mt-1.5">
                Friend: {systemSettings.coinBurnRateFriendPerMin ?? DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN}/m
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigateAdmin('financials', 'B')}
              className="p-4 bg-[#13161F] border border-slate-800 border-l-[3px] border-l-emerald-500/70 rounded-2xl text-left cursor-pointer hover:border-pink-500/40"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Host & Agency Shares</div>
              <div className="text-xl font-black text-emerald-400 font-mono tracking-tight">
                {systemSettings.femaleHostSharePercent ?? DEFAULT_FEMALE_HOST_SHARE_PERCENT}%
                <span className="text-sm text-slate-400 font-semibold"> base</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1.5">
                Target {systemSettings.femaleHostTargetSharePercent ?? DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT}% · TL{' '}
                {systemSettings.teamLeaderSharePercent ?? DEFAULT_TEAM_LEADER_SHARE_PERCENT}% · Platform{' '}
                {100 -
                  (systemSettings.femaleHostSharePercent ?? DEFAULT_FEMALE_HOST_SHARE_PERCENT) -
                  (systemSettings.teamLeaderSharePercent ?? DEFAULT_TEAM_LEADER_SHARE_PERCENT)}
                %
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigateAdmin('financials', 'D')}
              className="p-4 bg-[#13161F] border border-slate-800 border-l-[3px] border-l-purple-500/70 rounded-2xl text-left cursor-pointer hover:border-purple-500/40"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Fixed Peg & Min Threshold</div>
              <div className="text-xl font-black text-purple-300 font-mono tracking-tight">
                ${getCoinUsdPeg(systemSettings)}
                <span className="text-sm text-slate-400 font-semibold"> / coin</span>
              </div>
              <div className="text-[11px] text-purple-400/90 mt-1.5">
                {formatPegExample(getCoinUsdPeg(systemSettings))} · Min ${systemSettings.minPayoutThresholdUSD ?? 50} (
                {usdToCoins(systemSettings.minPayoutThresholdUSD ?? 50, getCoinUsdPeg(systemSettings)).toLocaleString()} coins)
              </div>
            </button>

            <div className="p-4 bg-[#13161F] border border-slate-800 border-l-[3px] border-l-cyan-500/70 rounded-2xl">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Payout Queues & Dispatched</div>
              <div className="text-xl font-black text-emerald-400 font-mono tracking-tight">
                ${totalCompletedPayoutsUSD.toFixed(2)}
              </div>
              <div className="text-[11px] text-amber-300 mt-1.5">
                Pending: ${totalPendingPayoutsUSD.toFixed(2)}
              </div>
            </div>
          </div>
        </>
      )}

      {/* TAB -1: Admin Analytics Hub */}
      {activeSubTab === 'analytics' && (
        <AdminAnalyticsHub
          navPlacement="sidebar"
          hubTab={analyticsHubTab}
          onHubTabChange={setAnalyticsHubTab}
          onOpenFinancialModule={() => navigateAdmin('finance-module', defaultL2ForTab('finance-module'))}
          onOpenEconomyConfig={() => navigateAdmin('financials', defaultL2ForTab('financials'))}
          onOverrideEarning={(u) => {
            setOverrideEarningUser(u);
            const systemRate = deriveHostEarnPerMin(
              systemSettings.coinBurnRatePerMin ?? DEFAULT_COIN_BURN_RATE_PER_MIN,
              systemSettings.femaleHostSharePercent ?? DEFAULT_FEMALE_HOST_SHARE_PERCENT
            );
            const hasOverride = u.coinEarnOverrideRate != null && Number(u.coinEarnOverrideRate) > 0;
            setOverrideEarningRate(hasOverride ? Number(u.coinEarnOverrideRate) : systemRate);
            setOverrideUseSystemRate(!hasOverride);
          }}
        />
      )}

      {/* TAB 0: Silent Admin Video Call Surveillance & Quality Assurance */}
      {activeSubTab === 'monitoring' && (
        <div className="space-y-6">
          {/* Top Compliance & Capabilities Overview Banner */}
          <div className="bg-[#121722] border border-rose-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono font-bold tracking-wider">
                  <Radio className="w-3.5 h-3.5 text-rose-400 animate-ping" />
                  <span>TOTAL DISCRETION SURVEILLANCE MATRIX</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Silent Live Video Call Monitoring
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Discreetly monitor live WebRTC & LiveKit video calls between female hosts and male callers for quality assurance and safety compliance. 
                  <strong className="text-emerald-300 ml-1">Admin mic & camera are blocked at the server level</strong>, and participant counters remain <strong className="text-indigo-300">strictly invariant at 2</strong>.
                </p>
              </div>

              {/* Action Bar & Refresh */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs font-mono text-slate-400 flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${adminActiveCalls.length > 0 ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
                  <span>{adminActiveCalls.length > 0 ? `${adminActiveCalls.length} Active Stream(s)` : 'Monitoring Idle'}</span>
                </div>

                <button
                  id="admin-surveillance-manual-refresh"
                  onClick={() => {
                    refreshAdminActiveCalls();
                    showToast('Grid Refreshed', 'Synced real-time surveillance matrix with signaling server.', 'info');
                  }}
                  className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 hover:border-rose-500 text-rose-300 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm"
                  title="Force re-sync active calls from server"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Grid</span>
                </button>
              </div>
            </div>

            {/* Ingress Security & Safety Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80 font-mono text-xs">
              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-center space-x-2.5">
                <EyeOff className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">DISCRETION</div>
                  <div className="text-white font-bold text-xs">0 Notifications Sent</div>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-center space-x-2.5">
                <Lock className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">COUNTER INVARIANCE</div>
                  <div className="text-indigo-300 font-bold text-xs">Locked at "2 in Room"</div>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-center space-x-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">HARDWARE BLOCKS</div>
                  <div className="text-emerald-300 font-bold text-xs">Mic/Cam Ingress Null</div>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-center space-x-2.5">
                <Radio className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">ACTIVE SESSIONS</div>
                  <div className="text-rose-400 font-bold text-xs">{adminActiveCalls.length} Live Calls</div>
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Female Host Active Video Call Grid */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-black text-white flex items-center space-x-2">
                  <Video className="w-5 h-5 text-rose-400" />
                  <span>Female Host Live Call Grid ({adminActiveCalls.length})</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Showing all female hosts currently on a live video call session in real time.
                </p>
              </div>

              <div className="text-xs text-slate-400 font-mono">
                Auto-refreshes on WebRTC state change
              </div>
            </div>

            {adminActiveCalls.length === 0 ? (
              /* Empty State */
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-500">
                  <Video className="w-8 h-8 text-slate-600" />
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <h4 className="text-base font-black text-white">No Live Video Calls Active</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    There are currently no active real-time video calls in progress. Active 1-on-1 sessions between female hosts and callers will automatically appear here dynamically the moment a call connects.
                  </p>
                </div>
                <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-full text-[11px] font-mono text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Surveillance Matrix: Online & Listening</span>
                </div>
              </div>
            ) : (
              /* Active Calls Grid */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {adminActiveCalls.map((call) => {
                  const formatCallTime = (secs: number) => {
                    const m = Math.floor(secs / 60);
                    const s = secs % 60;
                    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                  };

                  return (
                    <div
                      key={call.id}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-2xl transition-all space-y-4 relative overflow-hidden"
                    >
                      {/* Top Call Info Bar */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 font-mono text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                          <span className="font-extrabold text-white text-xs">LIVE CALL</span>
                          <span className="text-slate-500">|</span>
                          <span className="text-slate-400 text-[11px] truncate max-w-[120px]">Room: {call.id}</span>
                        </div>

                        {/* Live Duration Clock */}
                        <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-slate-200 font-extrabold">
                          <Clock className="w-3.5 h-3.5 text-rose-400" />
                          <span>{formatCallTime(call.durationSeconds)}</span>
                        </div>
                      </div>

                      {/* Participants Dual Card View */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Female Host */}
                        <div className="bg-[#0e121a] border border-pink-500/30 rounded-2xl p-3 space-y-2">
                          <div className="flex items-center space-x-2">
                            <div className="relative">
                              <img
                                src={call.hostAvatar}
                                alt={call.hostName}
                                className="w-10 h-10 rounded-full object-cover ring-2 ring-pink-500"
                              />
                              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-black text-white truncate flex items-center gap-1">
                                <span>{call.hostName}</span>
                              </div>
                              <div className="text-[10px] text-pink-400 font-bold font-mono">FEMALE HOST</div>
                            </div>
                          </div>

                          <div className="space-y-1 text-[11px] font-mono border-t border-slate-800/80 pt-1.5 text-slate-400">
                            <div className="flex justify-between">
                              <span>Rate:</span>
                              <span className="text-amber-300 font-bold">{call.hostHourlyRate} 🪙/m</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Earned:</span>
                              <span className="text-emerald-400 font-bold">+{call.coinsEarned} 🪙</span>
                            </div>
                          </div>
                        </div>

                        {/* Male Caller */}
                        <div className="bg-[#0e121a] border border-indigo-500/30 rounded-2xl p-3 space-y-2">
                          <div className="flex items-center space-x-2">
                            <div className="relative">
                              <img
                                src={call.callerAvatar}
                                alt={call.callerName}
                                className="w-10 h-10 rounded-full object-cover ring-2 ring-indigo-500"
                              />
                              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-black text-white truncate flex items-center gap-1">
                                <span>{call.callerName}</span>
                              </div>
                              <div className="text-[10px] text-indigo-400 font-bold font-mono">
                                CALLER
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1 text-[11px] font-mono border-t border-slate-800/80 pt-1.5 text-slate-400">
                            <div className="flex justify-between">
                              <span>Spent:</span>
                              <span className="text-amber-400 font-bold">{call.coinsSpent} 🪙</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Wallet:</span>
                              <span className="text-indigo-300 font-bold">{call.callerCoinBalance} 🪙</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Stream Telemetry & AI Safety Score */}
                      <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                          <span className="text-emerald-400 font-bold">{call.videoQuality || '720p HD'}</span>
                          <span>•</span>
                          <span>{call.bitrateKbps ?? 3500} kbps</span>
                          <span>•</span>
                          <span>{call.latencyMs ?? 38}ms</span>
                        </div>

                        <div className="flex items-center space-x-1.5 text-indigo-400 text-[11px] font-bold">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                          <span>AI Safety: {call.safetyScore ?? 99.8}%</span>
                        </div>
                      </div>

                      {/* Action Controls */}
                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <button
                          onClick={() => setActiveSpectatorCall(call)}
                          className="py-2.5 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Discreet Spectate</span>
                        </button>

                        <button
                          onClick={() => {
                            if (window.confirm(`Execute immediate safety killswitch for call between ${call.hostName} and ${call.callerName}?`)) {
                              adminTerminateCall(call.id, 'Moderator Safety Killswitch');
                            }
                          }}
                          className="py-2.5 px-3 bg-slate-800 hover:bg-rose-950/40 hover:border-rose-500/50 border border-slate-700 text-slate-300 hover:text-rose-300 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-colors"
                        >
                          <PhoneOff className="w-4 h-4 text-rose-400" />
                          <span>Force End</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Incident Evidence & Safety Audit Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span>Surveillance Incident Evidence & Moderation Logs</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Audit trail of snapshots, automated warnings, and forced killswitches during live monitoring.
                </p>
              </div>

              <span className="px-2.5 py-1 bg-slate-800 rounded-lg text-xs font-mono text-slate-300">
                {incidentEvidenceLogs.length} Records
              </span>
            </div>

            {incidentEvidenceLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 font-mono">
                No incident evidence or violation reports recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Call ID</th>
                      <th className="py-2.5 px-3">Host</th>
                      <th className="py-2.5 px-3">Caller</th>
                      <th className="py-2.5 px-3">Action Type</th>
                      <th className="py-2.5 px-3">Moderator Note / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {incidentEvidenceLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30 text-slate-300">
                        <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                          {log.timestamp}
                        </td>
                        <td className="py-2.5 px-3 text-indigo-300 font-bold whitespace-nowrap">
                          {log.callId}
                        </td>
                        <td className="py-2.5 px-3 text-pink-300 font-bold whitespace-nowrap">
                          {log.hostName}
                        </td>
                        <td className="py-2.5 px-3 text-indigo-300 whitespace-nowrap">
                          {log.callerName}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              (log.actionTaken || '').toLowerCase().includes('killswitch') || (log.actionTaken || '').toLowerCase().includes('terminat')
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : (log.actionTaken || '').toLowerCase().includes('warning') || (log.actionTaken || '').toLowerCase().includes('advisor')
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            }`}
                          >
                            {(log.actionTaken || 'EVIDENCE').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">
                          {log.adminNote || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: Coin Burn / Economy Config hub (Phase 0) */}
      {activeSubTab === 'financials' && (
        <AdminEconomyConfigHub
          initialSection={economySection}
          onOpenSkuBundles={() => navigateAdmin('skus')}
          onOpenGiftsCatalog={() => navigateAdmin('gifts')}
        />
      )}

      {/* TAB 1.5: LiveKit WebRTC (env-backed credentials) */}
      {activeSubTab === 'livekit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Key className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white flex items-center space-x-2">
                    <span>LiveKit WebRTC Connection</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Credentials load from server env (<code className="text-slate-300">LIVEKIT_URL</code>,{' '}
                    <code className="text-slate-300">LIVEKIT_API_KEY</code>,{' '}
                    <code className="text-slate-300">LIVEKIT_API_SECRET</code>). Set them in Vercel → Environment Variables, then Redeploy.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 font-mono text-xs">
              {livekitApiKey && livekitApiKey !== 'devkey' && livekitWsUrl && !livekitWsUrl.includes('your-livekit') ? (
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1.5 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>LIVEKIT ENV ACTIVE</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center space-x-1.5 font-bold">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>SET LIVEKIT_* IN VERCEL ENV</span>
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">LIVEKIT_URL</span>
              <span className="text-indigo-300 truncate max-w-[70%] text-right">
                {livekitWsUrl && !livekitWsUrl.includes('your-livekit') ? livekitWsUrl : '— not set —'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">LIVEKIT_API_KEY</span>
              <span className="text-amber-300">{livekitApiKey ? '•••••••• (from env)' : '— not set —'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">LIVEKIT_API_SECRET</span>
              <span className="text-rose-300">{livekitApiSecret ? '•••••••• (from env)' : '— not set —'}</span>
            </div>
          </div>

          <form onSubmit={handleSaveLiveKitQuality} className="space-y-6">
            {/* System Defined Video Quality Presets & Global Policy */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <Video className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Global Video Quality & Bandwidth Policy
                  </h4>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    Active: {livekitCaptureResolution.toUpperCase()} @ {livekitMaxBitrateKbps} kbps
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLivekitCaptureResolution('720p');
                      setLivekitMaxBitrateKbps(2200);
                      setLivekitMaxFramerate(30);
                      setLivekitVideoCodec('h264');
                      setLivekitSimulcastEnabled(true);
                      setLivekitAdaptiveStream(true);
                      setLivekitDynacast(true);
                      updateSystemSettings({
                        livekitCaptureResolution: '720p',
                        videoQualityProfile: 'high_720p',
                        livekitMaxBitrateKbps: 2200,
                        livekitMaxFramerate: 30,
                        livekitVideoCodec: 'h264',
                        livekitSimulcastEnabled: true,
                        livekitAdaptiveStream: true,
                        livekitDynacast: true,
                        livekitExplicitlySet: true,
                      });
                      showToast('Default Restored ⚡', 'System reset to 720p HD @ 2,200 kbps (30 FPS) — recommended for smooth calls', 'success');
                    }}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-700 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm"
                    title="Reset to recommended default (720p30 @ 2,200 kbps)"
                  >
                    <RefreshCw className="w-3 h-3 text-amber-400" />
                    <span>Reset to Recommended (720p30 @ 2,200 kbps)</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-2 flex items-center justify-between">
                    <span>Select System Video Quality Profile:</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Applied automatically to all video calls
                    </span>
                  </label>
                  <select
                    value={livekitCaptureResolution}
                    onChange={(e) => {
                      const res = e.target.value as '720p' | '1080p' | '4k' | '480p';
                      setLivekitCaptureResolution(res);
                      const profile =
                        res === '4k' ? 'ultra_4k' :
                        res === '1080p' ? 'hd_1080p' :
                        res === '480p' ? 'standard_480p' :
                        'high_720p';
                      // Smooth-call bands: never default to 60fps (client also clamps to ≤30)
                      const bitrate = res === '4k' ? 8500 : res === '1080p' ? 4000 : res === '480p' ? 1200 : 2200;
                      const fps = res === '480p' ? 24 : 30;
                      setLivekitMaxBitrateKbps(bitrate);
                      setLivekitMaxFramerate(fps);
                      updateSystemSettings({
                        livekitCaptureResolution: res,
                        videoQualityProfile: profile,
                        livekitMaxBitrateKbps: bitrate,
                        livekitMaxFramerate: fps,
                        livekitExplicitlySet: true,
                      });
                      if (res === '4k') {
                        showToast(
                          '4K not recommended',
                          '4K / high FPS increases freeze risk on mobile. Client caps phones to 720p30. Prefer 720p30 for smooth 1-on-1 calls.',
                          'warning'
                        );
                      } else {
                        showToast('Quality Policy Updated ⚡', `System set to ${res.toUpperCase()} (${bitrate} kbps @ ${fps} FPS)`, 'info');
                      }
                    }}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm text-white font-medium focus:outline-none focus:border-indigo-500 font-sans cursor-pointer shadow-inner"
                  >
                    <option value="720p">
                      720p HD (1280x720) • 30 FPS • 2,200 kbps — Recommended for smooth calls
                    </option>
                    <option value="1080p">
                      1080p Full HD (1920x1080) • 30 FPS • 4,000 kbps — Desktop / Wi‑Fi
                    </option>
                    <option value="4k">
                      4K Ultra HD (3840x2160) • 30 FPS • 8,500 kbps — Not recommended (mobile freeze risk)
                    </option>
                    <option value="480p">
                      480p SD (854x480) • 24 FPS • 1,200 kbps — Low bandwidth saver
                    </option>
                  </select>
                  <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
                    Clients clamp publish FPS to ≤30 (admin 60 → 30). Mobile soft-caps capture to 720p.
                    Prefer <span className="text-cyan-400 font-semibold">720p30</span> for clear + smooth talking-head calls;
                    60fps / 4K increase encoder backlog and stuck frames on cellular.
                  </p>
                </div>

                {/* Preset Specs Summary Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs font-mono">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase">Resolution</span>
                    <div className="text-white font-bold">
                      {livekitCaptureResolution === '4k' ? '3840 × 2160' :
                       livekitCaptureResolution === '1080p' ? '1920 × 1080' :
                       livekitCaptureResolution === '720p' ? '1280 × 720' : '854 × 480'}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase">Bitrate Target</span>
                    <div className="text-emerald-400 font-bold">{livekitMaxBitrateKbps} kbps</div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase">Frame Rate</span>
                    <div className="text-amber-400 font-bold">{livekitMaxFramerate} FPS</div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase">Engine Architecture</span>
                    <div className="text-cyan-400 font-bold">H.264 GPU + Simulcast</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSavingLivekit}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center space-x-2"
              >
                {isSavingLivekit ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                )}
                <span>Save Video Quality Policy</span>
              </button>

              <button
                type="button"
                onClick={() => void updateLiveKitConfig()}
                className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition-all flex items-center space-x-2"
              >
                <RefreshCw className="w-4 h-4 text-indigo-400" />
                <span>Refresh Env Status</span>
              </button>

              <button
                type="button"
                onClick={handleTestTokenGen}
                disabled={isTestingToken}
                className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition-all flex items-center space-x-2"
              >
                {isTestingToken ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                ) : (
                  <Zap className="w-4 h-4 text-amber-400" />
                )}
                <span>Verify Token Signature</span>
              </button>
            </div>
          </form>

          {testTokenResult && (
            <div
              className={`p-4 rounded-2xl border ${
                testTokenResult.success
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
              } space-y-2 font-mono text-xs`}
            >
              <div className="flex items-center space-x-2 font-bold text-sm">
                {testTokenResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                )}
                <span>{testTokenResult.success ? 'Token Verification Success' : 'Token Verification Error'}</span>
              </div>
              <p className="text-slate-300 font-sans text-xs">{testTokenResult.message}</p>
              {testTokenResult.token && (
                <div className="mt-2 p-2 bg-slate-950/80 rounded border border-slate-800 break-all text-[10px] text-slate-400">
                  <span className="text-indigo-400 font-bold">Signed JWT: </span>
                  {testTokenResult.token}
                </div>
              )}
            </div>
          )}

          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-2">
            <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Where LiveKit keys live</span>
            </h4>
            <ol className="list-decimal list-inside text-xs text-slate-400 space-y-1 font-sans">
              <li>Local: set <code className="text-slate-300">LIVEKIT_*</code> in <code className="text-slate-300">.env</code>.</li>
              <li>Production: Vercel → Project → Settings → Environment Variables (Production).</li>
              <li>Redeploy after any key change, then click <strong>Verify Token Signature</strong>.</li>
            </ol>
          </div>
        </div>
      )}

      {/* TAB 2: Dynamic Coin Package SKUs CRUD */}
      {activeSubTab === 'skus' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold text-white flex items-center space-x-2">
                <Coins className="w-5 h-5 text-amber-400" />
                <span>Coin Store Package Bundles (SKUs)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure pricing, bonus coins, discounts, and promotional banners. Burn rate &amp; peg
                margin preview live under{' '}
                <button
                  type="button"
                  onClick={() => {
                    setEconomySection('E');
                    setActiveSubTab('financials');
                  }}
                  className="text-amber-300 hover:underline font-semibold cursor-pointer"
                >
                  Coin Burn &amp; Economy → Package preview
                </button>
                .
              </p>
            </div>

            <button
              onClick={() =>
                setEditingSku({
                  title: '',
                  coins: 100,
                  bonusCoins: 10,
                  priceUSD: 4.99,
                  discountPriceUSD: null,
                  approxCallMinutes: null,
                  savingLabel: null,
                  badgeTag: 'PROMO',
                  popular: false,
                })
              }
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Bundle SKU</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {coinPackages.map((pkg) => {
              const total = pkgTotalCoins(pkg);
              const list = listPriceUSD(pkg);
              const pay = payPriceUSD(pkg);
              const saveLabel = savingDisplayLabel(pkg);
              const mins = pkgApproxCallMinutes(
                pkg,
                systemSettings.coinBurnRatePerMin || DEFAULT_COIN_BURN_RATE_PER_MIN
              );
              return (
                <div key={pkg.id} className="bg-slate-950 border border-slate-800 p-3.5 rounded-2xl space-y-2 relative">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-white text-sm truncate">{pkg.title}</h4>
                      {pkg.popular && (
                        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wide">Popular</span>
                      )}
                    </div>
                    {pkg.badgeTag && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[9px] font-bold">
                        {pkg.badgeTag}
                      </span>
                    )}
                  </div>
                  <div className="text-amber-300 font-black text-lg leading-tight">🪙 {pkg.coins}</div>
                  {pkg.bonusCoins > 0 && (
                    <div className="text-[10px] text-emerald-400 font-bold">+{pkg.bonusCoins} bonus · {total} total</div>
                  )}
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {hasDiscount(pkg) ? (
                      <>
                        <span className="text-slate-500 text-xs line-through">${list.toFixed(2)}</span>
                        <span className="text-white font-bold text-sm">${pay.toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="text-slate-300 font-bold text-sm">${pay.toFixed(2)} USD</span>
                    )}
                    {saveLabel && (
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        {saveLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500">~{mins} min call time</div>

                  <div className="flex space-x-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => setEditingSku(pkg)}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => deleteCoinPackage(pkg.id)}
                      className="p-1.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 rounded-lg text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Edit / Add SKU Modal */}
          {editingSku && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
              <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-3xl w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto">
                <h4 className="font-bold text-white text-base">{editingSku.id ? 'Edit' : 'Add'} Coin Package SKU</h4>
                <form onSubmit={handleSaveSkuForm} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Package Title</label>
                    <input
                      type="text"
                      value={editingSku.title || ''}
                      onChange={(e) => setEditingSku({ ...editingSku, title: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Coins</label>
                      <input
                        type="number"
                        min={0}
                        value={editingSku.coins ?? 100}
                        onChange={(e) => setEditingSku({ ...editingSku, coins: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Bonus Coins</label>
                      <input
                        type="number"
                        min={0}
                        value={editingSku.bonusCoins ?? 0}
                        onChange={(e) => setEditingSku({ ...editingSku, bonusCoins: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Price ($ USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={editingSku.priceUSD ?? 4.99}
                        onChange={(e) => setEditingSku({ ...editingSku, priceUSD: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Discount Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={editingSku.discountPriceUSD ?? ''}
                        placeholder="No discount"
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditingSku({
                            ...editingSku,
                            discountPriceUSD: v === '' ? null : Number(v),
                          });
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Approx call time (min)</label>
                      <input
                        type="number"
                        min={0}
                        value={editingSku.approxCallMinutes ?? ''}
                        placeholder="Auto from burn rate"
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditingSku({
                            ...editingSku,
                            approxCallMinutes: v === '' ? null : Number(v),
                          });
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Saving label (optional)</label>
                      <input
                        type="text"
                        value={editingSku.savingLabel || ''}
                        placeholder="Auto from price − discount"
                        onChange={(e) => setEditingSku({ ...editingSku, savingLabel: e.target.value || null })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Promo Badge</label>
                      <input
                        type="text"
                        value={editingSku.badgeTag || ''}
                        placeholder="e.g. BEST VALUE"
                        onChange={(e) => setEditingSku({ ...editingSku, badgeTag: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(editingSku.popular)}
                          onChange={(e) => setEditingSku({ ...editingSku, popular: e.target.checked })}
                          className="rounded border-slate-600"
                        />
                        <span className="font-semibold">Popular</span>
                      </label>
                    </div>
                  </div>

                  {/* Live preview */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Live Preview</div>
                    <div className="text-sm text-white font-bold">
                      {pkgTotalCoins(editingSku)} total coins · Pay ${payPriceUSD(editingSku).toFixed(2)}
                      {hasDiscount(editingSku) && (
                        <span className="text-slate-500 font-medium line-through ml-2">
                          ${listPriceUSD(editingSku).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      ~{pkgApproxCallMinutes(
                        editingSku,
                        systemSettings.coinBurnRatePerMin || DEFAULT_COIN_BURN_RATE_PER_MIN
                      )}{' '}
                      min ·{' '}
                      {savingDisplayLabel(editingSku)
                        ? `Saving: ${savingDisplayLabel(editingSku)} ($${savingUSD(editingSku).toFixed(2)} / ${savingPercent(editingSku)}%)`
                        : 'No discount / saving'}
                    </div>
                  </div>

                  <div className="flex space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingSku(null)}
                      className="w-1/2 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="w-1/2 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold text-xs"
                    >
                      Save SKU
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2.2: Dynamic Virtual Gifts & Tipping Manager (catalog only — shares in Economy hub) */}
      {activeSubTab === 'gifts' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-extrabold text-white flex items-center space-x-2">
                <Gift className="w-5 h-5 text-pink-400" />
                <span>Virtual Gifts Catalog & In-Call Tips Manager</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Manage gift items, coin prices, and animations. Revenue splits are read-only here —
                edit Host / TL / Platform % in Coin Burn &amp; Economy.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                id="admin-gifts-open-economy-shares-btn"
                onClick={() => {
                  setEconomySection('C');
                  setActiveSubTab('financials');
                }}
                className="px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-semibold text-xs rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer border border-amber-500/30"
                title="Edit gift share percentages in Economy hub"
              >
                <Percent className="w-3.5 h-3.5" />
                <span>Edit gift shares →</span>
              </button>

              <button
                type="button"
                id="admin-reset-default-gifts-btn"
                onClick={() => {
                  if (confirm('Reset gift store catalog to platform default gifts?')) {
                    resetVirtualGifts();
                  }
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
                title="Restore default gifts"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>

              <button
                type="button"
                id="admin-add-virtual-gift-btn"
                onClick={() => setEditingGift({
                  name: '',
                  icon: '🎁',
                  coinCost: 100,
                  category: 'Fun',
                  gradient: 'from-pink-500 to-rose-600',
                  animationType: 'heart',
                  isActive: true,
                })}
                className="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-lg shadow-pink-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Virtual Gift</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar — read-only; edit via Economy section C */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Catalog Size</span>
              <div className="text-xl font-black text-white mt-1">{virtualGifts.length} Gifts</div>
              <span className="text-[10px] text-pink-400 font-semibold">{virtualGifts.filter(g => g.isActive !== false).length} Active in Calls</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEconomySection('C');
                setActiveSubTab('financials');
              }}
              className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl text-left cursor-pointer hover:border-pink-500/40"
            >
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Host Gift Split</span>
              <div className="text-xl font-black text-pink-400 mt-1">
                {systemSettings.giftFemaleHostSharePercent ?? DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT}%
              </div>
              <span className="text-[10px] text-amber-300/80 font-semibold">Edit in Economy →</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEconomySection('C');
                setActiveSubTab('financials');
              }}
              className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl text-left cursor-pointer hover:border-indigo-500/40"
            >
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agency Share</span>
              <div className="text-xl font-black text-indigo-400 mt-1">
                {systemSettings.giftTeamLeaderSharePercent ?? DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT}%
              </div>
              <span className="text-[10px] text-amber-300/80 font-semibold">Edit in Economy →</span>
            </button>
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Platform Margin</span>
              <div className="text-xl font-black text-emerald-400 mt-1">
                {Math.max(
                  0,
                  100 -
                    (systemSettings.giftFemaleHostSharePercent ??
                      DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT) -
                    (systemSettings.giftTeamLeaderSharePercent ??
                      DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT)
                )}%
              </div>
              <span className="text-[10px] text-slate-400">Implied (read-only)</span>
            </div>
          </div>

          {/* Virtual Gifts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {virtualGifts.map((gift) => {
              const hostSharePct =
                systemSettings.giftFemaleHostSharePercent ?? DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT;
              const tlSharePct =
                systemSettings.giftTeamLeaderSharePercent ?? DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT;
              const platformSharePct = Math.max(0, 100 - hostSharePct - tlSharePct);
              const hostCoins = Math.round(gift.coinCost * (hostSharePct / 100));
              const tlCoins = Math.round(gift.coinCost * (tlSharePct / 100));
              const platformCoins = Math.round(gift.coinCost * (platformSharePct / 100));
              const payoutUsdRatio = getCoinUsdPeg(systemSettings);

              return (
                <div
                  key={gift.id}
                  className={`bg-slate-950 border transition-all p-4 rounded-2xl space-y-3 relative flex flex-col justify-between ${
                    gift.isActive !== false ? 'border-slate-800 hover:border-pink-500/40' : 'border-slate-800/40 opacity-60'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Card Top: Icon & Badges */}
                    <div className="flex items-start justify-between">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gift.gradient || 'from-pink-500 to-rose-600'} flex items-center justify-center text-3xl shadow-lg`}>
                        {gift.icon}
                      </div>

                      <div className="flex flex-col items-end space-y-1">
                        <button
                          type="button"
                          onClick={() => saveVirtualGift({ ...gift, isActive: gift.isActive === false ? true : false })}
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold border cursor-pointer transition-all ${
                            gift.isActive !== false
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          {gift.isActive !== false ? '● ACTIVE' : '○ DISABLED'}
                        </button>
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{gift.category}</span>
                      </div>
                    </div>

                    {/* Title & Cost */}
                    <div>
                      <h4 className="font-extrabold text-white text-base leading-tight">{gift.name}</h4>
                      <div className="text-amber-400 font-black text-lg mt-0.5 flex items-center space-x-1">
                        <span>🪙</span>
                        <span>{gift.coinCost}</span>
                        <span className="text-xs text-slate-400 font-normal">Coins</span>
                      </div>
                    </div>

                    {/* Revenue Distribution Breakdown */}
                    <div className="p-2.5 bg-slate-900/90 border border-slate-800/80 rounded-xl space-y-1 text-[11px]">
                      <div className="flex justify-between text-pink-300 font-medium">
                        <span>Host ({hostSharePct}%):</span>
                        <span className="font-bold font-mono">🪙 {hostCoins} (${(hostCoins * payoutUsdRatio).toFixed(2)})</span>
                      </div>
                      <div className="flex justify-between text-indigo-300 font-medium">
                        <span>TL ({tlSharePct}%):</span>
                        <span className="font-bold font-mono">🪙 {tlCoins} (${(tlCoins * payoutUsdRatio).toFixed(2)})</span>
                      </div>
                      <div className="flex justify-between text-emerald-400 font-medium">
                        <span>Platform ({platformSharePct}%):</span>
                        <span className="font-bold font-mono">🪙 {platformCoins}</span>
                      </div>
                      <p className="text-[9px] text-slate-500 pt-1 border-t border-slate-800/80">
                        USD @ Coin USD Peg (Economy → D). Shares edited in Economy → C only.
                      </p>
                    </div>

                    {/* Animation info */}
                    <div className="flex items-center space-x-1 text-[10px] text-slate-400 font-mono">
                      <Sparkles className="w-3 h-3 text-pink-400" />
                      <span>Anim: {gift.animationType || 'heart'}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-2 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => setEditingGift(gift)}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete gift "${gift.name}"?`)) {
                          deleteVirtualGift(gift.id);
                        }
                      }}
                      className="p-1.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 rounded-lg text-xs transition-all cursor-pointer"
                      title="Delete Gift"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Edit / Add Virtual Gift Modal */}
          {editingGift && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-base flex items-center space-x-2">
                    <Gift className="w-4 h-4 text-pink-400" />
                    <span>{editingGift.id ? 'Edit Virtual Gift' : 'Create New Virtual Gift'}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setEditingGift(null)}
                    className="text-slate-400 hover:text-white text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveGiftForm} className="space-y-3.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Gift Name</label>
                      <input
                        type="text"
                        required
                        value={editingGift.name || ''}
                        placeholder="e.g. Red Rose, Diamond Ring"
                        onChange={(e) => setEditingGift({ ...editingGift, name: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Icon / Emoji</label>
                      <input
                        type="text"
                        required
                        value={editingGift.icon || ''}
                        placeholder="🌹"
                        onChange={(e) => setEditingGift({ ...editingGift, icon: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-center text-lg text-white focus:outline-none focus:border-pink-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Price (Coins 🪙)</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={editingGift.coinCost || 100}
                        onChange={(e) => setEditingGift({ ...editingGift, coinCost: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                      <select
                        value={editingGift.category || 'Love'}
                        onChange={(e) => setEditingGift({ ...editingGift, category: e.target.value as any })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-pink-500 cursor-pointer"
                      >
                        <option value="Love">Love</option>
                        <option value="Luxury">Luxury</option>
                        <option value="Fun">Fun</option>
                        <option value="Luxury">Luxury</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Animation Effect</label>
                      <select
                        value={editingGift.animationType || 'heart'}
                        onChange={(e) => setEditingGift({ ...editingGift, animationType: e.target.value as any })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-pink-500 cursor-pointer"
                      >
                        <option value="heart">Floating Hearts</option>
                        <option value="rose">Rose Petals</option>
                        <option value="diamond">Diamond Sparkles</option>
                        <option value="crown">Royal Crown Glow</option>
                        <option value="car">Supercar Zoom</option>
                        <option value="champagne">Champagne Pop</option>
                        <option value="rocket">Rocket Blast</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Gradient Theme</label>
                      <select
                        value={editingGift.gradient || 'from-pink-500 to-rose-600'}
                        onChange={(e) => setEditingGift({ ...editingGift, gradient: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-pink-500 cursor-pointer"
                      >
                        <option value="from-pink-500 to-rose-600">Pink / Rose</option>
                        <option value="from-red-500 to-rose-700">Crimson / Red</option>
                        <option value="from-amber-400 to-orange-500">Gold / Amber</option>
                        <option value="from-cyan-400 to-blue-600">Cyan / Blue</option>
                        <option value="from-purple-500 to-indigo-600">Purple / Indigo</option>
                        <option value="from-emerald-400 to-teal-600">Emerald / Teal</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">Active in In-Call Gifts Store</div>
                      <div className="text-[10px] text-slate-400">Allows male users to select and send this gift</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={editingGift.isActive !== false}
                      onChange={(e) => setEditingGift({ ...editingGift, isActive: e.target.checked })}
                      className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingGift(null)}
                      className="w-1/2 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-700 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="w-1/2 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-pink-600/30 transition-all cursor-pointer"
                    >
                      Save Virtual Gift
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2.5: Team Leaders & Agency Guild Management */}
      {activeSubTab === 'leaders' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-extrabold text-white flex items-center space-x-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <span>Agencies</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Only root administrators can create Agencies. Agencies can register female hosts. Individual earning overrides are set by Admin from the User List.
              </p>
            </div>

            <button
              id="admin-create-team-leader-btn"
              onClick={() => setIsAddLeaderOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Create Agency</span>
            </button>
          </div>

          {/* Leaders Roster */}
          {users.filter((u) => u.role === 'team_leader').length === 0 ? (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-12 text-center">
              <Crown className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h4 className="text-base font-bold text-slate-300">No Agencies Registered Yet</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Create your first Agency account to delegate female creator recruitment.
              </p>
              <button
                onClick={() => setIsAddLeaderOpen(true)}
                className="mt-4 px-4 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold hover:bg-amber-400 transition-all cursor-pointer inline-flex items-center gap-1"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create Agency</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users
                .filter((u) => u.role === 'team_leader')
                .map((leader) => {
                  const managedHosts = getManagedCreatorsForLeader(leader, users);
                  const managedCount = managedHosts.length;

                  return (
                    <div
                      key={leader.id}
                      className="bg-slate-950 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-4 transition-all shadow-lg flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="relative">
                              <img
                                src={leader.avatarUrl}
                                alt={leader.name}
                                className="w-12 h-12 rounded-xl object-cover ring-1 ring-amber-400"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = getFallbackAvatar(leader.name, leader.gender, leader.role);
                                }}
                              />
                              <span className="absolute -bottom-1 -right-1 text-xs">👑</span>
                            </div>
                            <div>
                              <h4 className="font-bold text-white text-sm">{leader.name}</h4>
                              <span className="text-[11px] text-slate-400 block font-mono">
                                {leader.email}
                              </span>
                            </div>
                          </div>

                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                            {leader.commissionPercent || 15}% Comm
                          </span>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                          <div className="flex justify-between text-slate-400">
                            <span>Agency:</span>
                            <span className="font-semibold text-slate-200">{leader.agencyName || 'Agency Guild'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setManagedCreatorsLeader(leader)}
                            className="w-full flex justify-between items-center text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer group rounded-lg -mx-1 px-1 py-0.5 hover:bg-emerald-500/5"
                            title="View managed female creators"
                          >
                            <span>Managed Creators:</span>
                            <span className="font-bold text-emerald-400 font-mono inline-flex items-center gap-1 group-hover:underline">
                              {managedCount} Hosts
                              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                            </span>
                          </button>
                          <div className="flex justify-between text-slate-400">
                            <span>Nationality:</span>
                            <span className="text-slate-200">{leader.nationality || 'United States'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 mt-4 pt-3 border-t border-slate-800">
                        <button
                          onClick={() => switchUser(leader.id)}
                          className="flex-1 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          <span>Login As Leader</span>
                        </button>
                        <button
                          onClick={() => adminDeleteUser(leader.id)}
                          className="p-1.5 bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-800/40 rounded-lg text-xs cursor-pointer"
                          title="Delete Agency"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Managed Creators Modal */}
          {managedCreatorsLeader && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <div className="bg-[#12151F] border border-amber-500/40 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 p-5 shrink-0">
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={managedCreatorsLeader.avatarUrl}
                      alt={managedCreatorsLeader.name}
                      className="w-10 h-10 rounded-xl object-cover ring-1 ring-amber-400 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getFallbackAvatar(
                          managedCreatorsLeader.name,
                          managedCreatorsLeader.gender,
                          managedCreatorsLeader.role
                        );
                      }}
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-white text-base truncate">
                        Managed Creators — {managedCreatorsLeader.name}
                      </h4>
                      <p className="text-xs text-slate-400 truncate">
                        {managedCreatorsLeader.agencyName || 'Agency Guild'} · {managedCreatorsForModal.length} host
                        {managedCreatorsForModal.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManagedCreatorsLeader(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer shrink-0"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <div className="overflow-y-auto custom-scrollbar p-4 space-y-2 flex-1">
                  {managedCreatorsForModal.length === 0 ? (
                    <div className="p-10 text-center text-slate-500 text-xs font-mono">
                      No female creators linked to this Agency yet.
                    </div>
                  ) : (
                    managedCreatorsForModal.map((host) => (
                      <div
                        key={host.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <img
                            src={host.avatarUrl}
                            alt={host.name}
                            className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = getFallbackAvatar(host.name, host.gender, host.role);
                            }}
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-white text-sm truncate">{host.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {host.email || host.id}
                            </div>
                            <div className="text-[10px] text-amber-400/90 font-mono mt-0.5">
                              {host.teamLeaderId === managedCreatorsLeader.id ||
                              host.createdById === managedCreatorsLeader.id ||
                              (managedCreatorsLeader.authId &&
                                (host.teamLeaderId === managedCreatorsLeader.authId ||
                                  host.createdById === managedCreatorsLeader.authId))
                                ? 'Linked by ID'
                                : 'Linked by agency name'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              host.onlineStatus === 'online'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {(host.onlineStatus || 'offline').replace('_', ' ')}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setManagedCreatorsLeader(null);
                              setSelectedUserForEdit(host);
                              setIsEditModalOpen(true);
                              setActiveSubTab('users');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold cursor-pointer"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 border-t border-slate-800 flex justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => setManagedCreatorsLeader(null)}
                    className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add Team Leader Modal */}
          {isAddLeaderOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <div className="bg-[#12151F] border border-amber-500/40 p-6 rounded-3xl w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
                      <Crown className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base">Create New Agency</h4>
                      <p className="text-xs text-slate-400">Admin privilege: Assign agency & custom commission tier</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAddLeaderOpen(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newLeaderForm.name.trim()) {
                      showToast('Validation Error', 'Name is required', 'error');
                      return;
                    }
                    if (!newLeaderForm.email.trim() || !newLeaderForm.email.includes('@')) {
                      showToast('Validation Error', 'Login email is required so the agency can sign in.', 'error');
                      return;
                    }
                    const pwError = getPasswordPolicyError(newLeaderForm.password);
                    if (pwError) {
                      showToast('Password Policy', pwError, 'error');
                      return;
                    }
                    setIsCreatingLeader(true);
                    try {
                      const created = await createTeamLeader({
                        name: newLeaderForm.name,
                        email: newLeaderForm.email.trim().toLowerCase(),
                        password: newLeaderForm.password,
                        gender: 'female',
                        genderLocked: true,
                        role: 'team_leader',
                        agencyName: newLeaderForm.agencyName || 'Aurora Talent Management',
                        commissionPercent: Number(newLeaderForm.commissionPercent) || (systemSettings.teamLeaderSharePercent ?? 10),
                        spokenLanguages: newLeaderForm.spokenLanguages.split(',').map((s) => s.trim()).filter(Boolean),
                        nationality: newLeaderForm.nationality,
                        countryCode: newLeaderForm.countryCode,
                        bio: newLeaderForm.bio,
                        avatarUrl: newLeaderForm.avatarUrl,
                        gallery: [newLeaderForm.avatarUrl],
                      });
                      if (created) {
                        setIsAddLeaderOpen(false);
                        setNewLeaderForm({
                          name: '',
                          email: '',
                          password: '',
                          agencyName: 'Aurora Talent Management',
                          commissionPercent: systemSettings.teamLeaderSharePercent ?? 10,
                          spokenLanguages: 'English, Spanish',
                          nationality: 'United States',
                          countryCode: 'US',
                          bio: 'Director of Creator Guild & Talent Management',
                          avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
                        });
                      }
                    } finally {
                      setIsCreatingLeader(false);
                    }
                  }}
                  className="space-y-3.5 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Director / Contact Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Elena Rostova"
                        value={newLeaderForm.name}
                        onChange={(e) => setNewLeaderForm({ ...newLeaderForm, name: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Login Email <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="elena@minglecall.com"
                        value={newLeaderForm.email}
                        onChange={(e) => setNewLeaderForm({ ...newLeaderForm, email: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* Password with Eye Visibility Toggle */}
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Login Password <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showLeaderPassword ? 'text' : 'password'}
                        required
                        value={newLeaderForm.password}
                        onChange={(e) => setNewLeaderForm({ ...newLeaderForm, password: e.target.value })}
                        placeholder="Min 8 chars, upper, lower, number, special"
                        className="w-full pl-3 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLeaderPassword(!showLeaderPassword)}
                        className="absolute right-2.5 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title={showLeaderPassword ? 'Hide Password' : 'Show Password'}
                      >
                        {showLeaderPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {newLeaderForm.password ? (
                      <p
                        className={`text-[11px] mt-1 ${
                          evaluatePasswordStrength(newLeaderForm.password).isValid
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {evaluatePasswordStrength(newLeaderForm.password).isValid
                          ? 'Password meets policy — Auth account can be created.'
                          : evaluatePasswordStrength(newLeaderForm.password).error}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Required. Must include uppercase, lowercase, number, and special character (min 8).
                      </p>
                    )}
                  </div>

                  {/* Agency & Commission Override */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Agency Guild Name</label>
                      <input
                        type="text"
                        placeholder="Aurora Talent Guild"
                        value={newLeaderForm.agencyName}
                        onChange={(e) => setNewLeaderForm({ ...newLeaderForm, agencyName: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-semibold text-slate-300">
                          Commission Cut (% cut)
                        </label>
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                          System: {systemSettings.teamLeaderSharePercent ?? 10}%
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={newLeaderForm.commissionPercent}
                        onChange={(e) => setNewLeaderForm({ ...newLeaderForm, commissionPercent: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 font-mono font-bold"
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Defaults to system commission ({systemSettings.teamLeaderSharePercent ?? 10}%); can be overridden here.
                      </p>
                    </div>
                  </div>

                  {/* Country & Spoken Languages */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Country / Nationality
                      </label>
                      <select
                        value={newLeaderForm.nationality}
                        onChange={(e) => {
                          const countryName = e.target.value;
                          const found = ALL_WORLDWIDE_COUNTRIES.find((c) => c.name === countryName);
                          setNewLeaderForm({
                            ...newLeaderForm,
                            nationality: countryName,
                            countryCode: found?.code || 'US',
                          });
                        }}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500"
                      >
                        {getAllowedCountries(systemSettings.allowedCountryCodes).map((c) => (
                          <option key={c.code} value={c.name} className="bg-slate-900 text-white">
                            {c.flag} {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Select Spoken Language
                      </label>
                      <select
                        onChange={(e) => {
                          const selectedLang = e.target.value;
                          if (!selectedLang) return;
                          const currentLangs = (newLeaderForm.spokenLanguages || '')
                            .split(',')
                            .map((l) => l.trim())
                            .filter(Boolean);
                          if (!currentLangs.includes(selectedLang)) {
                            const updated = [...currentLangs, selectedLang].join(', ');
                            setNewLeaderForm({ ...newLeaderForm, spokenLanguages: updated });
                          }
                          e.target.value = '';
                        }}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500 text-sm"
                      >
                        <option value="">
                          + Add language from taxonomies (
                          {getAllowedLanguages(systemSettings.allowedLanguages).length})...
                        </option>
                        {getAllowedLanguages(systemSettings.allowedLanguages).map((l) => (
                          <option key={l.code} value={l.name} className="bg-slate-900 text-white">
                            {l.name} ({l.nativeName})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Spoken Languages Quick Chips & Tag List */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block font-semibold text-slate-300 text-xs">
                        Spoken Languages List
                      </label>
                      <span className="text-[10px] text-slate-400">Click chips to toggle or choose from dropdown above</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 py-1">
                      {['English', 'Spanish', 'French', 'Portuguese', 'German', 'Italian', 'Russian', 'Japanese', 'Arabic', 'Hindi', 'Mandarin', 'Turkish'].map((lang) => {
                        const isSelected = (newLeaderForm.spokenLanguages || '')
                          .toLowerCase()
                          .includes(lang.toLowerCase());
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => {
                              const currentLangs = (newLeaderForm.spokenLanguages || '')
                                .split(',')
                                .map((l) => l.trim())
                                .filter(Boolean);
                              let updated: string[];
                              if (isSelected) {
                                updated = currentLangs.filter((l) => l.toLowerCase() !== lang.toLowerCase());
                              } else {
                                updated = [...currentLangs, lang];
                              }
                              setNewLeaderForm({
                                ...newLeaderForm,
                                spokenLanguages: updated.length > 0 ? updated.join(', ') : 'English',
                              });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}{lang}
                          </button>
                        );
                      })}
                    </div>

                    <input
                      type="text"
                      value={newLeaderForm.spokenLanguages}
                      onChange={(e) => setNewLeaderForm({ ...newLeaderForm, spokenLanguages: e.target.value })}
                      placeholder="e.g. English, Spanish, French..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm"
                    />
                  </div>

                  {/* Profile Picture Card (Identical setup to User Profile Page) */}
                  <div className="p-3.5 bg-slate-950/80 border border-slate-700/70 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block font-semibold text-slate-300 text-xs">
                        Agency Profile Picture <span className="text-amber-400 font-normal">☁️ Cloudflare R2</span>
                      </label>
                      {isUploadingLeaderAvatar && (
                        <span className="text-[10px] text-amber-300 animate-pulse font-mono font-bold">
                          Uploading ({uploadLeaderProgress}%)...
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3.5">
                      {/* Avatar Preview with Camera Trigger */}
                      <div className="relative shrink-0 group">
                        <img
                          src={newLeaderForm.avatarUrl || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400'}
                          alt="Agency headshot"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getFallbackAvatar(newLeaderForm.name || 'Agency', 'female', 'team_leader');
                          }}
                          className="w-16 h-16 rounded-2xl object-cover ring-2 ring-amber-400 shadow-lg shadow-amber-950/40"
                        />
                        <button
                          type="button"
                          onClick={() => leaderFileInputRef.current?.click()}
                          disabled={isUploadingLeaderAvatar}
                          className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer backdrop-blur-[1px]"
                          title="Upload from device"
                        >
                          <Camera className="w-4 h-4 text-amber-300" />
                          <span className="text-[8px] font-bold mt-0.5">Upload</span>
                        </button>
                        <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-emerald-500 text-[8px] font-bold text-slate-950 rounded-full uppercase tracking-wider shadow">
                          Active
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center space-x-1.5 text-xs text-white font-bold truncate">
                          <span>{newLeaderForm.name || 'New Agency'}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">Agency</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Upload high-res executive headshot or browse curated avatar models.
                        </p>

                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <input
                            type="file"
                            ref={leaderFileInputRef}
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleUploadLeaderAvatar(e.target.files[0]);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => leaderFileInputRef.current?.click()}
                            disabled={isUploadingLeaderAvatar}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-all shadow cursor-pointer flex items-center gap-1 disabled:opacity-50"
                          >
                            <Upload className="w-3 h-3" />
                            <span>{isUploadingLeaderAvatar ? `Uploading (${uploadLeaderProgress}%)` : 'Upload Headshot'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsLeaderAvatarModalOpen(true)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all border border-slate-700 cursor-pointer flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            <span>Browse Gallery / 3D Avatars</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsAddLeaderOpen(false)}
                      className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUploadingLeaderAvatar || isCreatingLeader}
                      className="px-5 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold rounded-xl shadow-lg cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      {isCreatingLeader ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>{isCreatingLeader ? 'Creating in Supabase…' : 'Create Agency'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Dedicated Full Avatar Selector Modal for Team Leader */}
          {isLeaderAvatarModalOpen && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
              <div className="bg-[#12151F] border border-amber-500/40 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300">
                      <Camera className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">Select Agency Headshot</h4>
                      <p className="text-[11px] text-slate-400">Choose portrait, 3D avatar, or upload high-res image to R2</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLeaderAvatarModalOpen(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 overflow-y-auto custom-scrollbar">
                  <UnifiedImageUploader
                    currentImageUrl={newLeaderForm.avatarUrl}
                    onImageUploaded={(newUrl) => {
                      setNewLeaderForm((prev) => ({ ...prev, avatarUrl: newUrl }));
                      setIsLeaderAvatarModalOpen(false);
                      showToast('Picture Selected ✨', 'Avatar applied to Agency profile!', 'success');
                    }}
                    category="avatar"
                    targetRole="team_leader"
                    targetName={newLeaderForm.name || 'Agency'}
                    accentColor="amber"
                    title="Choose Agency Avatar"
                    subtitle="Executive headshots, 3D avatars, or direct upload to R2."
                    showPresets={true}
                    showUrlInput={true}
                  />
                </div>

                <div className="p-3 border-t border-slate-800 bg-slate-900/50 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsLeaderAvatarModalOpen(false)}
                    className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Legacy payout history (read-only — settlements are cash-out) */}
      {activeSubTab === 'payouts' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <h3 className="text-lg font-extrabold text-white flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-slate-400" />
              <span>Legacy Payout History (Read-Only)</span>
            </h3>
            <p className="text-xs text-amber-200/90 bg-amber-950/40 border border-amber-700/40 rounded-xl px-3 py-2 max-w-xl">
              Manual <span className="font-mono">payout_requests</span> are historical only. Do not approve here —
              cash-out is <strong>Financial Module → settlement batches</strong> (avoids double-pay).
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Creator Name</th>
                  <th className="p-3">Agency</th>
                  <th className="p-3">Amount ($)</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Account Details</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {payoutRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono font-bold">#{req.id}</td>
                    <td className="p-3 font-bold text-white">{req.userName}</td>
                    <td className="p-3">
                      {req.teamLeaderName ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-medium inline-flex items-center gap-1">
                          👑 {req.teamLeaderName}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">Independent</span>
                      )}
                    </td>
                    <td className="p-3 font-extrabold text-emerald-400">${req.amountUSD.toFixed(2)}</td>
                    <td className="p-3 capitalize">{req.payoutMethod}</td>
                    <td className="p-3 text-slate-400 font-mono">{req.accountDetails}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          req.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : req.status === 'rejected'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] text-slate-500 italic">View only — use settlements</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: User Directory & Moderation */}
      {activeSubTab === 'users' && (
        <div className="bg-[#161920] border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-white flex items-center space-x-2 font-mono uppercase tracking-wider">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>Global User Directory & AI Verification Control</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Total Registered Accounts: <span className="text-indigo-400 font-mono font-bold">{users.length}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={async () => {
                  setIsSyncingFromDb(true);
                  await syncUsersFromSupabase(true);
                  setIsSyncingFromDb(false);
                }}
                disabled={isSyncingFromDb}
                className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 rounded text-xs font-mono font-bold flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                title="Fetch latest registered users and profiles from Supabase database"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncingFromDb ? 'animate-spin' : ''}`} />
                <span>{isSyncingFromDb ? 'Syncing...' : 'Sync Supabase'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 rounded text-xs font-mono font-bold flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer"
                title="Open destructive data reset manager (requires ALLOW_FACTORY_RESET)"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Reset Data…</span>
              </button>

              <button
                onClick={() => {
                  setSelectedUserForCoins(null);
                  setIsCoinModalOpen(true);
                }}
                className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 rounded text-xs font-mono font-bold flex items-center space-x-1.5 transition-all shadow-sm"
              >
                <span>🪙</span>
                <span>+ Grant Coins</span>
              </button>

              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search user ID, name, email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-[#0F1115] border border-slate-800 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <select
                value={userTeamLeaderFilter}
                onChange={(e) => setUserTeamLeaderFilter(e.target.value)}
                className="w-full sm:w-52 px-2.5 py-1.5 bg-[#0F1115] border border-slate-800 rounded text-xs text-slate-300 focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
                title="Filter by Agency"
              >
                <option value="all">All Agencies</option>
                <option value="independent">Independent (no TL)</option>
                {teamLeadersList.map((tl) => (
                  <option key={tl.id} value={tl.id}>
                    {tl.agencyName || tl.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Role Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {[
              { id: 'all', label: 'All Users', count: users.length, color: 'border-slate-700 bg-slate-800/80 text-slate-200' },
              { id: 'male_user', label: 'Male Users', count: users.filter((u) => getUserRoleLabel(u) === 'Male User').length, color: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' },
              { id: 'female_user', label: 'Female Users', count: users.filter((u) => getFemaleRoleMark(u) === 'user').length, color: 'border-pink-500/30 bg-pink-500/10 text-pink-300' },
              { id: 'female_creator', label: 'Female Creators (TL Hosts)', count: users.filter((u) => getFemaleRoleMark(u) === 'creator').length, color: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
              { id: 'team_leader', label: 'Agencies', count: users.filter((u) => u.role === 'team_leader' || u.role === 'agency_manager').length, color: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
              { id: 'other_user', label: 'Other Users', count: users.filter((u) => getUserRoleLabel(u) === 'Other User').length, color: 'border-teal-500/30 bg-teal-500/10 text-teal-300' },
              { id: 'admin', label: 'Admins', count: users.filter((u) => getUserRoleLabel(u) === 'Admin').length, color: 'border-purple-500/30 bg-purple-500/10 text-purple-300' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setUserRoleFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer flex items-center space-x-1.5 ${
                  userRoleFilter === tab.id
                    ? 'ring-2 ring-indigo-400 bg-indigo-600 text-white border-indigo-400 shadow-sm'
                    : `${tab.color} hover:opacity-90`
                }`}
              >
                <span>{tab.label}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[9px] font-mono">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#0F1115] text-slate-400 uppercase text-[10px] font-mono tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-3">User & ID</th>
                  <th className="p-3">Role & Gender Lock</th>
                  <th className="p-3">Coins / USD Earnings</th>
                  <th className="p-3">AI Verification</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 font-mono">
                      No matching users found in global directory for search term "{userSearchQuery}".
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center space-x-2.5">
                          <img
                            src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400'}
                            alt={u.name || 'User'}
                            className="w-8 h-8 rounded-full object-cover border border-slate-700"
                          />
                          <div>
                            <div className="font-bold text-white flex items-center space-x-1.5">
                              <span>{u.name || 'Unnamed User'}</span>
                              {u.isVerified && <span className="text-blue-400 text-xs font-bold" title="AI Face Verified">✓</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-2">
                              <span>{u.email}</span>
                              <span className="text-slate-600">•</span>
                              <span className="text-indigo-400">{u.id}</span>
                            </div>
                            <div className="text-[10px] text-slate-300 font-mono flex items-center space-x-1.5 mt-0.5">
                              <MapPin className={`w-3 h-3 ${getUserEffectiveLocation(u).isMock ? 'text-pink-400' : 'text-emerald-400'} shrink-0`} />
                              <span>{getUserEffectiveLocation(u).displayCity}</span>
                              <span>{getUserEffectiveLocation(u).flag}</span>
                              {getUserEffectiveLocation(u).isMock ? (
                                <span className="px-1 py-0.2 rounded bg-pink-500/20 text-pink-300 text-[8px] font-bold border border-pink-500/30">
                                  MOCK
                                </span>
                              ) : (
                                <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-bold border border-emerald-500/30">
                                  GPS
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${
                            getFemaleRoleMark(u) === 'creator'
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              : getFemaleRoleMark(u) === 'user'
                              ? 'bg-pink-500/15 text-pink-300 border-pink-500/30'
                              : getUserRoleLabel(u) === 'Male User'
                              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                              : u.role === 'team_leader' || u.role === 'agency_manager'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : getUserRoleLabel(u) === 'Admin'
                              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                              : 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                          }`}
                        >
                          {getUserRoleLabel(u)}
                          {getFemaleRoleMark(u) === 'creator' && (
                            <span className="ml-0.5 px-1 rounded bg-rose-500/30 text-[9px] uppercase tracking-wide">Creator</span>
                          )}
                          {getFemaleRoleMark(u) === 'user' && (
                            <span className="ml-0.5 px-1 rounded bg-pink-500/30 text-[9px] uppercase tracking-wide">User</span>
                          )}
                        </span>
                        {u.teamLeaderId && (
                          <div className="text-[9px] text-amber-400/90 font-mono mt-0.5">
                            Agency Host (TL ID: {u.teamLeaderId.slice(0, 8)}...)
                          </div>
                        )}
                        <div className="text-[10px] text-indigo-400 flex items-center space-x-1 font-mono mt-0.5">
                          <Lock className="w-3 h-3 text-indigo-400/80" />
                          <span>{(u.gender || 'MALE').toUpperCase()} Locked</span>
                        </div>
                      </td>
                      <td className="p-3 font-mono">
                        {u.gender === 'female' ? (
                          <div>
                            <span className="font-extrabold text-emerald-400">
                              ${(u.totalLifetimeEarnedUSD || 0).toFixed(2)} USD
                            </span>
                            <div className="text-[10px] text-slate-500">
                              {u.earningsCoins || 0} Accumulated Coins
                            </div>
                          </div>
                        ) : u.role === 'admin' ? (
                          <div>
                            <span className="font-bold text-purple-400">Super Admin</span>
                            <div className="text-[10px] text-amber-300">🪙 {(u.coinBalance ?? 0).toLocaleString()} Coins</div>
                          </div>
                        ) : (
                          <div>
                            <span className="font-extrabold text-amber-300">
                              🪙 {(u.coinBalance ?? 0).toLocaleString()} Coins
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleVerifyUser(u.id)}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all font-mono ${
                            u.isVerified
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/50 hover:bg-blue-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-600'
                          }`}
                        >
                          {u.isVerified ? '✓ Verified Badge' : 'Grant Verification'}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-1.5">
                          {/* Action Dropdown Menu */}
                          <div className="relative inline-block text-left">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionDropdownId(openActionDropdownId === u.id ? null : u.id);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all flex items-center space-x-1.5 border shadow-sm cursor-pointer ${
                                openActionDropdownId === u.id
                                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/30'
                                  : 'bg-[#181C26] hover:bg-[#202533] text-slate-200 border-slate-700 hover:border-slate-600'
                              }`}
                            >
                              <span>Actions</span>
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${openActionDropdownId === u.id ? 'rotate-180 text-white' : 'text-slate-400'}`} />
                            </button>

                            {openActionDropdownId === u.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setOpenActionDropdownId(null)}
                                />
                                <div className="absolute right-0 top-full mt-1.5 w-60 bg-[#151821] border border-slate-700/90 rounded-xl shadow-2xl z-50 py-1.5 divide-y divide-slate-800 text-xs font-sans animate-in fade-in zoom-in-95 duration-100">
                                  {/* Section 1: Main Admin Actions */}
                                  <div className="p-1 space-y-0.5">
                                    <button
                                      onClick={() => {
                                        setSelectedUserForEdit(u);
                                        setIsEditModalOpen(true);
                                        setOpenActionDropdownId(null);
                                      }}
                                      className="w-full px-3 py-2 text-left text-white hover:bg-indigo-600 rounded-lg font-semibold flex items-center space-x-2.5 transition-colors group cursor-pointer"
                                    >
                                      <div className="w-6 h-6 rounded bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white flex items-center justify-center">
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="flex-1">
                                        <div className="font-bold text-xs">Edit User</div>
                                        <div className="text-[10px] text-slate-400 group-hover:text-indigo-100">Full profile, roles, rates & info</div>
                                      </div>
                                    </button>

                                    {/* Earning & Analytics / Spending & Analytics Menu Item */}
                                    <button
                                      onClick={() => {
                                        setSelectedUserForAnalytics(u);
                                        setOpenActionDropdownId(null);
                                      }}
                                      className={`w-full px-3 py-2 text-left rounded-lg font-semibold flex items-center space-x-2.5 transition-colors group cursor-pointer ${
                                        u.gender === 'female' || u.role === 'female_creator'
                                          ? 'text-white hover:bg-emerald-600'
                                          : 'text-white hover:bg-indigo-600'
                                      }`}
                                    >
                                      <div
                                        className={`w-6 h-6 rounded flex items-center justify-center ${
                                          u.gender === 'female' || u.role === 'female_creator'
                                            ? 'bg-emerald-500/20 text-emerald-400 group-hover:bg-white/20 group-hover:text-white'
                                            : 'bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white'
                                        }`}
                                      >
                                        {u.gender === 'female' || u.role === 'female_creator' ? (
                                          <DollarSign className="w-3.5 h-3.5" />
                                        ) : (
                                          <TrendingUp className="w-3.5 h-3.5" />
                                        )}
                                      </div>
                                      <div className="flex-1">
                                        <div className="font-bold text-xs">
                                          {u.gender === 'female' || u.role === 'female_creator'
                                            ? 'Earnings & Analytics'
                                            : 'Spending & Analytics'}
                                        </div>
                                        <div className="text-[10px] text-slate-400 group-hover:text-slate-100">
                                          {u.gender === 'female' || u.role === 'female_creator'
                                            ? 'Host earnings, quality score & payouts'
                                            : 'Caller spending, coin ledger & receipts'}
                                        </div>
                                      </div>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setSelectedUserForCoins(u.id);
                                        setIsCoinModalOpen(true);
                                        setOpenActionDropdownId(null);
                                      }}
                                      className="w-full px-3 py-2 text-left text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 rounded-lg font-semibold flex items-center space-x-2.5 transition-colors group cursor-pointer"
                                    >
                                      <div className="w-6 h-6 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center">
                                        <Coins className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="flex-1">
                                        <div className="font-bold text-xs">Adjust / Grant Coins</div>
                                        <div className="text-[10px] text-slate-400">Add, subtract or set balance</div>
                                      </div>
                                    </button>

                                    {(u.role === 'female_creator' || u.role === 'female_host') && (
                                      <button
                                        onClick={() => {
                                          const systemRate = deriveHostEarnPerMin(
                                            systemSettings.coinBurnRatePerMin ??
                                              DEFAULT_COIN_BURN_RATE_PER_MIN,
                                            systemSettings.femaleHostSharePercent ??
                                              DEFAULT_FEMALE_HOST_SHARE_PERCENT
                                          );
                                          const hasOverride =
                                            u.coinEarnOverrideRate != null && Number(u.coinEarnOverrideRate) > 0;
                                          setOverrideEarningUser(u);
                                          setOverrideUseSystemRate(!hasOverride);
                                          setOverrideEarningRate(
                                            hasOverride ? Number(u.coinEarnOverrideRate) : systemRate
                                          );
                                          setOpenActionDropdownId(null);
                                        }}
                                        className="w-full px-3 py-2 text-left text-slate-200 hover:bg-pink-500/20 hover:text-pink-300 rounded-lg font-semibold flex items-center space-x-2.5 transition-colors group cursor-pointer"
                                      >
                                        <div className="w-6 h-6 rounded bg-pink-500/20 text-pink-400 flex items-center justify-center">
                                          <Percent className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1">
                                          <div className="font-bold text-xs">Override Earning</div>
                                          <div className="text-[10px] text-slate-400">
                                            {u.coinEarnOverrideRate != null && Number(u.coinEarnOverrideRate) > 0
                                              ? `Custom ${u.coinEarnOverrideRate} 🪙/min`
                                              : 'Using system rate'}
                                          </div>
                                        </div>
                                      </button>
                                    )}
                                  </div>

                                  {/* Section 2: Verification & Impersonation */}
                                  <div className="p-1 space-y-0.5">
                                    <button
                                      onClick={() => {
                                        toggleVerifyUser(u.id);
                                        setOpenActionDropdownId(null);
                                      }}
                                      className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 rounded-lg flex items-center space-x-2 transition-colors cursor-pointer"
                                    >
                                      <ShieldCheck className="w-4 h-4 text-blue-400" />
                                      <span>{u.isVerified ? 'Remove Verification' : 'Grant AI Verification'}</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        switchUser(u);
                                        setOpenActionDropdownId(null);
                                      }}
                                      className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 rounded-lg flex items-center space-x-2 transition-colors cursor-pointer"
                                    >
                                      <LogIn className="w-4 h-4 text-purple-400" />
                                      <span>Switch / Login as User</span>
                                    </button>
                                  </div>

                                  {/* Section 3: Presence Status */}
                                  <div className="p-1.5 space-y-1">
                                    <div className="px-2 text-[9px] font-mono text-slate-500 uppercase tracking-wider font-bold">
                                      Set Presence Status
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                      <button
                                        onClick={() => {
                                          toggleUserStatus(u.id, 'online');
                                          setOpenActionDropdownId(null);
                                        }}
                                        className={`px-2 py-1 rounded text-[10px] font-mono text-left flex items-center space-x-1.5 transition-colors cursor-pointer ${
                                          u.onlineStatus === 'online'
                                            ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                                            : 'hover:bg-slate-800 text-slate-400'
                                        }`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        <span>Online</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          toggleUserStatus(u.id, 'in_call');
                                          setOpenActionDropdownId(null);
                                        }}
                                        className={`px-2 py-1 rounded text-[10px] font-mono text-left flex items-center space-x-1.5 transition-colors cursor-pointer ${
                                          u.onlineStatus === 'in_call'
                                            ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30'
                                            : 'hover:bg-slate-800 text-slate-400'
                                        }`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                        <span>In Call</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          toggleUserStatus(u.id, 'busy');
                                          setOpenActionDropdownId(null);
                                        }}
                                        className={`px-2 py-1 rounded text-[10px] font-mono text-left flex items-center space-x-1.5 transition-colors cursor-pointer ${
                                          u.onlineStatus === 'busy'
                                            ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                                            : 'hover:bg-slate-800 text-slate-400'
                                        }`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        <span>Busy</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          toggleUserStatus(u.id, 'offline');
                                          setOpenActionDropdownId(null);
                                        }}
                                        className={`px-2 py-1 rounded text-[10px] font-mono text-left flex items-center space-x-1.5 transition-colors cursor-pointer ${
                                          u.onlineStatus === 'offline'
                                            ? 'bg-slate-700 text-slate-300 font-bold border border-slate-600'
                                            : 'hover:bg-slate-800 text-slate-400'
                                        }`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                        <span>Offline</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Section 4: Delete User */}
                                  <div className="p-1">
                                    <button
                                      id={`admin-menu-del-user-${u.id}`}
                                      onClick={() => {
                                        setDeletingUser(u);
                                        setOpenActionDropdownId(null);
                                      }}
                                      className="w-full px-3 py-1.5 text-left text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 rounded-lg flex items-center space-x-2 transition-colors font-semibold cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4 text-rose-400" />
                                      <span>Delete User Account</span>
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Direct Quick Delete Button */}
                          <button
                            id={`admin-quick-del-user-${u.id}`}
                            onClick={() => setDeletingUser(u)}
                            className="p-1.5 bg-rose-950/30 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/50 rounded-xl text-xs transition-all shadow-sm cursor-pointer flex items-center justify-center shrink-0"
                            title={`Delete ${u.name || u.id} permanently`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 6: Home CMS & Policies Management */}
      {activeSubTab === 'cms' && (
        <AdminHomeCMS
          navPlacement="sidebar"
          cmsSection={cmsSection}
          onCmsSectionChange={setCmsSection}
        />
      )}

      {activeSubTab === 'cms-navigation' && <AdminNavBarEditor />}
      {activeSubTab === 'cms-payout-cards' && <AdminPayoutCardsCMS />}
      {activeSubTab === 'office-rbac' && canOffice('office-rbac') && <AdminOfficeRbacPage />}

      {/* Sub-Tab: Worldwide Countries, Languages, Zodiac & Interests Control */}
      {activeSubTab === 'countries' && (
        <AdminTaxonomyManager
          navPlacement="sidebar"
          activeTab={taxonomyTab}
          onTabChange={setTaxonomyTab}
        />
      )}

      {/* Sub-Tab: Creator targets, rotational matrix, performance */}
      {activeSubTab === 'creator-ops' && (
        <AdminCreatorTargetConfig
          navPlacement="sidebar"
          activeSubView={creatorOpsView}
          onSubViewChange={setCreatorOpsView}
        />
      )}
      {activeSubTab === 'finance-module' && (
        <AdminFinancialModule
          navPlacement="sidebar"
          tab={financeModuleTab}
          onTabChange={setFinanceModuleTab}
        />
      )}

      {/* Settings: database, R2, moderation, features, schema */}
      {activeSubTab === 'infra' && (
        <AdminDatabaseStorageConfig
          navPlacement="sidebar"
          activeTab={infraTab}
          onTabChange={setInfraTab}
        />
      )}
      {activeSubTab === 'api-health' && <AdminApiHealthPanel />}
      {activeSubTab === 'system-testing' && <AdminSystemTestingPanel />}
      {activeSubTab === 'k6-load' && canOffice('k6-load') && <AdminK6LoadTestingPanel />}
      {/* Email: OTP / transactional templates, policy, logs */}
      {activeSubTab === 'email' && <AdminEmailPanel />}

      {/* Manual Coin Addition Modal */}
      <ManualCoinModal
        isOpen={isCoinModalOpen}
        onClose={() => setIsCoinModalOpen(false)}
        targetUserId={selectedUserForCoins}
      />

      {/* Comprehensive Edit User Modal */}
      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedUserForEdit(null);
        }}
        user={selectedUserForEdit}
      />

      {/* Override Female Creator Earning Modal */}
      {overrideEarningUser && (() => {
        const systemRate = deriveHostEarnPerMin(
          systemSettings.coinBurnRatePerMin ?? DEFAULT_COIN_BURN_RATE_PER_MIN,
          systemSettings.femaleHostSharePercent ?? DEFAULT_FEMALE_HOST_SHARE_PERCENT
        );
        const hostShare =
          systemSettings.femaleHostSharePercent ?? DEFAULT_FEMALE_HOST_SHARE_PERCENT;

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#12151F] border border-pink-500/40 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-3">
                  <img
                    src={overrideEarningUser.avatarUrl}
                    alt={overrideEarningUser.name}
                    className="w-10 h-10 rounded-xl object-cover ring-1 ring-pink-400"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getFallbackAvatar(
                        overrideEarningUser.name,
                        'female',
                        'female_creator'
                      );
                    }}
                  />
                  <div>
                    <h3 className="font-bold text-white text-sm">Override host coins/min</h3>
                    <p className="text-[11px] text-slate-400">{overrideEarningUser.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setOverrideEarningUser(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 leading-relaxed">
                  Default = Economy burn × host base share (
                  <span className="font-mono font-bold text-emerald-300">{systemRate} 🪙/min</span>
                  {' '}· {hostShare}% of burn). Custom override is{' '}
                  <span className="text-pink-300 font-bold">absolute host coins/min</span> (
                  <code className="text-slate-400">coin_earn_override_rate</code>) — ignores share %.
                  TL % still applies when linked; host+TL clamped ≤ burn. If override &gt; 0 at period
                  close, share true-up is skipped for this host. Global burn/share/peg stay in Coin Burn
                  &amp; Economy only.
                </div>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={overrideUseSystemRate}
                    onChange={() => {
                      setOverrideUseSystemRate(true);
                      setOverrideEarningRate(systemRate);
                    }}
                    className="accent-emerald-400"
                  />
                  <div>
                    <div className="font-bold text-white text-xs">Use Economy share %</div>
                    <div className="text-[10px] text-slate-400">{systemRate} 🪙/min ({hostShare}% base)</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-pink-500/30 cursor-pointer">
                  <input
                    type="radio"
                    checked={!overrideUseSystemRate}
                    onChange={() => setOverrideUseSystemRate(false)}
                    className="accent-pink-400 mt-0.5"
                  />
                  <div className="flex-1 space-y-2">
                    <div>
                      <div className="font-bold text-white text-xs">Custom absolute (🪙 / min)</div>
                      <div className="text-[10px] text-slate-400">Ignores host share % for this creator</div>
                    </div>
                    {!overrideUseSystemRate && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Override rate</span>
                          <span className="font-mono font-bold text-pink-300">
                            {overrideEarningRate} 🪙 / min
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max={Math.max(systemRate * 2, 100)}
                          step="1"
                          value={overrideEarningRate}
                          onChange={(e) => setOverrideEarningRate(Number(e.target.value))}
                          className="w-full accent-pink-400 cursor-pointer"
                        />
                        <input
                          type="number"
                          min="1"
                          max={Math.max(systemRate * 2, 100)}
                          value={overrideEarningRate}
                          onChange={(e) =>
                            setOverrideEarningRate(Math.max(1, Number(e.target.value) || 1))
                          }
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setOverrideEarningUser(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    updateCreatorCoinEarnOverride(
                      overrideEarningUser.id,
                      overrideUseSystemRate ? null : overrideEarningRate
                    );
                    setOverrideEarningUser(null);
                  }}
                  className="px-4 py-1.5 bg-pink-500 hover:bg-pink-400 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  {overrideUseSystemRate ? 'Clear Override' : 'Save Override'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* User Analytics — admin-native drawer */}
      <UserAnalyticsModal
        isOpen={selectedUserForAnalytics !== null}
        onClose={() => setSelectedUserForAnalytics(null)}
        user={selectedUserForAnalytics}
        onOverrideEarning={(u) => {
          setSelectedUserForAnalytics(null);
          setOverrideEarningUser(u);
          const systemRate = deriveHostEarnPerMin(
            systemSettings.coinBurnRatePerMin ?? DEFAULT_COIN_BURN_RATE_PER_MIN,
            systemSettings.femaleHostSharePercent ?? DEFAULT_FEMALE_HOST_SHARE_PERCENT
          );
          const hasOverride = u.coinEarnOverrideRate != null && Number(u.coinEarnOverrideRate) > 0;
          setOverrideEarningRate(hasOverride ? Number(u.coinEarnOverrideRate) : systemRate);
          setOverrideUseSystemRate(!hasOverride);
        }}
      />

      {/* Silent Admin Video Call Surveillance & Quality Assurance Modal */}
      {activeSpectatorCall && (
        <AdminSilentCallMonitorModal
          call={activeSpectatorCall}
          onClose={() => setActiveSpectatorCall(null)}
        />
      )}

      {/* Granular Mock & Storage Data Reset Modal */}
      <ResetMockDataModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
      />

      {/* ================= MODAL: DELETE USER CONFIRMATION (ADMIN) ================= */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#12151F] border border-rose-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Delete User Account</h3>
                <p className="text-xs text-rose-400 font-semibold">Permanent & Irreversible Deletion</p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <img
                  src={deletingUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400'}
                  alt={deletingUser.name}
                  className="w-12 h-12 rounded-xl object-cover ring-1 ring-slate-700"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-white text-sm truncate">{deletingUser.name || 'Unnamed User'}</h4>
                  <p className="text-slate-400 text-xs truncate">{deletingUser.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-mono font-bold">
                      {getUserRoleLabel(deletingUser)}
                    </span>
                    <span className="text-slate-500 text-[10px] font-mono truncate">ID: {deletingUser.id}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl text-rose-200/90 text-xs leading-relaxed">
                ⚠️ <strong className="text-white">Admin Warning:</strong> Deleting <span className="font-bold text-white">{deletingUser.name}</span> will permanently purge their profile from the Supabase <code className="bg-rose-900/40 px-1 py-0.5 rounded text-rose-200">profiles</code> database table, erase their Supabase Auth credentials, and remove their session cache across all devices.
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isDeletingUserProcessing}
                  onClick={() => setDeletingUser(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingUserProcessing}
                  onClick={async () => {
                    if (!deletingUser) return;
                    setIsDeletingUserProcessing(true);
                    try {
                      const ok = await adminDeleteUser(deletingUser.id);
                      if (ok) setDeletingUser(null);
                    } finally {
                      setIsDeletingUserProcessing(false);
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-950/60 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingUserProcessing ? 'Deleting...' : 'Delete Permanently'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
};
