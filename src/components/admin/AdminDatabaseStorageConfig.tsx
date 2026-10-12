import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  Shield,
  Sliders,
  FileCode2,
  Check,
  Copy,
  Play,
  RefreshCw,
  Server,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Zap,
  Activity,
  Radio,
  FileCheck,
  Plus,
  Trash2,
  Info,
  Mail,
  Send,
  Download,
  Sparkles,
  Terminal,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase, testSupabaseConnection, isSupabaseConfigured } from '../../lib/supabase';
import { getSupabaseProfilesStats, pushAllTaxonomiesAndSettingsToSupabase } from '../../services/supabaseService';
import { uploadMediaDirectlyToR2 } from '../../utils/r2Storage';
import { InfraSystemConfig } from '../../types';
import { ResetMockDataModal } from './ResetMockDataModal';
import { getMasterSchemaSql, getMigrationSchemaSql } from '../../utils/schemaSql';
import { authFetch } from '../../utils/apiClient';

type InfraTab = 'db_pool' | 'r2_storage' | 'moderation' | 'features' | 'sql_schema';

function DailyLoginCoinsField() {
  const { systemSettings, updateSystemSettings } = useApp();
  const [coins, setCoins] = useState(String(systemSettings.freeDailyLoginCoins ?? 20));

  useEffect(() => {
    setCoins(String(systemSettings.freeDailyLoginCoins ?? 20));
  }, [systemSettings.freeDailyLoginCoins]);

  return (
    <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-lg md:col-span-2 space-y-2">
      <div className="text-xs font-bold text-white">Free daily login coins</div>
      <p className="text-[11px] text-slate-400">
        Coins used when a streak day has no amount. The 7-day schedule is under Economy → Legacy knobs.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="1"
          value={coins}
          onChange={(e) => setCoins(e.target.value)}
          className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => updateSystemSettings({ freeDailyLoginCoins: Math.max(0, Math.round(Number(coins) || 0)) })}
          className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white cursor-pointer"
        >
          Save
        </button>
      </div>
    </div>
  );
}

interface AdminDatabaseStorageConfigProps {
  activeTab?: InfraTab;
  onTabChange?: (tab: InfraTab) => void;
  navPlacement?: 'inline' | 'sidebar';
}

export const AdminDatabaseStorageConfig: React.FC<AdminDatabaseStorageConfigProps> = ({
  activeTab: activeTabProp,
  onTabChange,
  navPlacement = 'inline',
}) => {
  const {
    showToast,
    syncAllProfilesToSupabase,
    purgeAllMockData,
    users,
    systemSettings,
    updateSystemSettings,
  } = useApp();

  const [activeTabInternal, setActiveTabInternal] = useState<InfraTab>('db_pool');
  const activeTab = activeTabProp ?? activeTabInternal;
  const setActiveTab = (tab: InfraTab) => {
    onTabChange?.(tab);
    if (activeTabProp === undefined) setActiveTabInternal(tab);
  };

  // Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Email OTP & SMTP State
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string; code?: string } | null>(null);
  const [copiedTemplateType, setCopiedTemplateType] = useState<string | null>(null);

  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: '587',
    user: '',
    pass: '',
    from: '',
    secure: false,
    resendApiKey: '',
    showOtpInForm: true,
  });
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<{ configured: boolean; host?: string; senderEmail?: string; port?: number; user?: string; showOtpInForm?: boolean } | null>(null);

  // Loading & Test states
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ connected?: boolean; latencyMs?: number; message?: string } | null>(null);
  const [profilesStats, setProfilesStats] = useState<{ configured: boolean; tableExists: boolean; count: number; error?: string } | null>(null);
  const [isSyncingProfiles, setIsSyncingProfiles] = useState(false);
  const [isPurgingMock, setIsPurgingMock] = useState(false);
  const [isTestingR2, setIsTestingR2] = useState(false);
  const [r2ConnResult, setR2ConnResult] = useState<{ success?: boolean; latencyMs?: number; message?: string; bucket?: string; endpoint?: string; corsHelp?: string } | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);
  const [isTestingR2Upload, setIsTestingR2Upload] = useState(false);
  const [r2TestResult, setR2TestResult] = useState<{ success?: boolean; url?: string; durationMs?: number; message?: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [storageRuntimeStatus, setStorageRuntimeStatus] = useState<{
    configured: boolean;
    mockStorageActive: boolean;
  } | null>(null);

  const [copiedSql, setCopiedSql] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingSchema, setIsUpdatingSchema] = useState(false);
  const [lastSchemaUpdated, setLastSchemaUpdated] = useState<string | null>(null);
  const [schemaStats, setSchemaStats] = useState<{ tablesCount: number; version: string }>({ tablesCount: 17, version: '3.2' });
  const [schemaSql, setSchemaSql] = useState<string>('');

  // New Keyword input
  const [newKeyword, setNewKeyword] = useState('');

  const handleSendTestEmail = async () => {
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
      showToast('Invalid Email', 'Please provide a valid email address to test dispatch.', 'error');
      return;
    }
    setIsSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const res = await authFetch('/api/auth/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmailAddress.trim(), name: 'Admin Test Recipient' }),
      });
      const data = await res.json();
      const errMsg =
        typeof data?.error === 'string'
          ? data.error
          : data?.error?.message || data?.message || 'Failed to dispatch email';
      if (res.ok && data.success) {
        setTestEmailResult(data);
        showToast('Email Dispatched ✉️', `Sent test OTP (${data.code}) to ${testEmailAddress}`, 'success');
      } else {
        setTestEmailResult({ success: false, message: errMsg });
        showToast(
          res.status === 401 ? 'Session expired' : 'Dispatch Notice',
          res.status === 401
            ? `${errMsg} Sign out/in, and confirm Vercel Supabase env vars match.`
            : errMsg,
          'error'
        );
      }
    } catch (e: any) {
      setTestEmailResult({ success: false, message: e.message });
      showToast('Dispatch Error', e.message, 'error');
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const copyTemplateToClipboard = (templateText: string, type: string) => {
    navigator.clipboard.writeText(templateText);
    setCopiedTemplateType(type);
    showToast('Template Copied! 📋', 'Paste into your Supabase Dashboard Email Templates.', 'success');
    setTimeout(() => setCopiedTemplateType(null), 2500);
  };

  // Form State
  const [config, setConfig] = useState<InfraSystemConfig>({
    supabaseUrl: '',
    supabaseAnonKey: '',
    r2AccountId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    r2BucketName: 'livecall-media-storage',
    r2PublicUrl: 'https://media.livecall-app.com',
    dbMaxPoolSize: 50,
    dbIdleTimeoutSeconds: 30,
    dbStatementTimeoutMs: 5000,
    dbQueryCachingEnabled: true,
    r2MaxImageSizeMb: 15,
    r2MaxVideoSizeMb: 100,
    r2ProfileVideoQuotaMb: 30,
    r2AllowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
    r2CdnCacheTtlSeconds: 86400,
    autoModerationSensitivity: 'medium',
    nsfwFilterEnabled: true,
    bannedKeywords: ['scam', 'wire transfer', 'bank password', 'abuse', 'underage'],
    abuseReportAutoSuspendThreshold: 5,
    featureRealtimeChatEnabled: true,
    featureR2DirectUploadEnabled: true,
    featureVideoCallingEnabled: true,
    featureGeoDiscoveryEnabled: true,
    featureMaintenanceMode: false,
    supabaseConfigured: false,
    r2Configured: false,
  });

  // Fetch initial config from server
  useEffect(() => {
    fetchConfig();
    fetchSmtpStatus();
    fetchStorageRuntimeStatus();
  }, []);

  // Hydrate media quotas from live system settings (DB-backed)
  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      r2ProfileVideoQuotaMb: systemSettings.profileVideoQuotaMb ?? prev.r2ProfileVideoQuotaMb ?? 100,
      r2MaxVideoSizeMb: systemSettings.r2MaxVideoSizeMb ?? prev.r2MaxVideoSizeMb ?? 100,
    }));
  }, [systemSettings.profileVideoQuotaMb, systemSettings.r2MaxVideoSizeMb]);

  const fetchStorageRuntimeStatus = async () => {
    try {
      const res = await authFetch('/api/storage/config');
      if (!res.ok) return;
      const data = await res.json();
      setStorageRuntimeStatus({
        configured: Boolean(data.configured),
        mockStorageActive: Boolean(data.mockStorageActive),
      });
    } catch (e) {
      console.warn('Storage runtime status fetch notice:', e);
    }
  };

  const fetchSmtpStatus = async () => {
    // 1. First check localStorage for instant client recovery
    try {
      const cached = localStorage.getItem('livecall_admin_smtp_config');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.host || parsed.user || parsed.resendApiKey) {
          setSmtpForm((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {}

    // 2. Fetch authoritative persistent config from server admin endpoint
    try {
      const res = await authFetch('/api/admin/email-config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          const cfg = data.config;
          setSmtpStatus({
            configured: Boolean(cfg.configured),
            host: cfg.host,
            senderEmail: cfg.from,
            port: cfg.port,
            user: cfg.user,
            showOtpInForm: cfg.showOtpInForm ?? true,
          });
          const formVals = {
            host: cfg.host || '',
            port: String(cfg.port || '587'),
            user: cfg.user || '',
            pass: cfg.pass || '',
            from: cfg.from || '',
            secure: Boolean(cfg.secure),
            resendApiKey: cfg.resendApiKey || '',
            showOtpInForm: cfg.showOtpInForm ?? true,
          };
          setSmtpForm(formVals);
          localStorage.setItem('livecall_admin_smtp_config', JSON.stringify(formVals));
          return;
        }
      }
    } catch (e) {
      console.warn('Admin SMTP config fetch notice:', e);
    }

    // 3. Fallback to public endpoint
    try {
      const res = await authFetch('/api/auth/email-config');
      if (res.ok) {
        const data = await res.json();
        setSmtpStatus({
          configured: data.smtpConfigured || data.resendConfigured,
          host: data.host,
          senderEmail: data.senderEmail,
          port: data.port,
          user: data.user,
          showOtpInForm: data.showOtpInForm ?? true,
        });
        if (data.host && data.host !== 'Not configured') {
          setSmtpForm((prev) => ({
            ...prev,
            host: data.host || '',
            port: String(data.port || '587'),
            from: data.senderEmail || '',
            showOtpInForm: data.showOtpInForm ?? true,
          }));
        }
      }
    } catch (e) {
      console.warn('SMTP config status fetch error:', e);
    }
  };

  const handleToggleShowOtpInForm = async (enabled: boolean) => {
    const updated = { ...smtpForm, showOtpInForm: enabled };
    setSmtpForm(updated);
    setSmtpStatus((prev) => prev ? { ...prev, showOtpInForm: enabled } : null);
    try {
      localStorage.setItem('livecall_admin_smtp_config', JSON.stringify(updated));
    } catch {}

    try {
      const res = await authFetch('/api/admin/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();

      if (isSupabaseConfigured()) {
        try {
          await supabase.from('system_configs').upsert({
            id: 'global_config',
            smtp_show_otp: enabled,
            updated_at: new Date().toISOString(),
          } as any);
        } catch {}
      }

      if (res.ok && data.success) {
        showToast(
          enabled ? 'OTP in Form Enabled 🟢' : 'OTP in Form Disabled 🔒',
          enabled
            ? '6-Digit OTP code will now appear directly in the registration modal for fast testing.'
            : 'OTP code is now strictly delivered via email only (Production Mode).',
          'success'
        );
        fetchSmtpStatus();
      } else {
        showToast('Update Failed', data.error || 'Failed to toggle OTP form display', 'error');
      }
    } catch (err: any) {
      showToast('Error', err.message || 'Network error updating toggle', 'error');
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSmtp(true);
    try {
      // 1. Client-side local persistence
      localStorage.setItem('livecall_admin_smtp_config', JSON.stringify(smtpForm));

      // 2. Server-side disk file persistence
      const res = await authFetch('/api/admin/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smtpForm),
      });
      const data = await res.json();

      // 3. Supabase database persistence
      if (isSupabaseConfigured()) {
        try {
          await supabase.from('system_configs').upsert({
            id: 'global_config',
            smtp_host: smtpForm.host,
            smtp_port: parseInt(smtpForm.port, 10) || 587,
            smtp_user: smtpForm.user,
            smtp_pass: smtpForm.pass,
            smtp_from: smtpForm.from,
            smtp_show_otp: smtpForm.showOtpInForm,
            resend_api_key: smtpForm.resendApiKey,
            updated_at: new Date().toISOString(),
          } as any);
        } catch (dbErr) {
          console.warn('Notice: Supabase system_configs table update notice:', dbErr);
        }
      }

      if (res.ok && data.success) {
        showToast('SMTP Saved & Persisted! 💾✉️', 'Live Email & OTP settings saved to disk and database. Settings will persist across restarts.', 'success');
        fetchSmtpStatus();
      } else {
        showToast('Save Error', data.error || 'Failed to save SMTP config.', 'error');
      }
    } catch (err: any) {
      showToast('Error', err.message || 'Network error saving SMTP', 'error');
    } finally {
      setIsSavingSmtp(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await authFetch('/api/admin/infra-config');
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (data && data.config) {
            setConfig((prev) => {
              const next = { ...prev, ...data.config };
              // Never replace a real typed secret with the server mask.
              if (
                typeof data.config.supabaseAnonKey === 'string' &&
                String(data.config.supabaseAnonKey).startsWith('••••') &&
                prev.supabaseAnonKey &&
                !String(prev.supabaseAnonKey).startsWith('••••')
              ) {
                next.supabaseAnonKey = prev.supabaseAnonKey;
              }
              if (
                typeof data.config.r2SecretAccessKey === 'string' &&
                String(data.config.r2SecretAccessKey).startsWith('••••') &&
                prev.r2SecretAccessKey &&
                !String(prev.r2SecretAccessKey).startsWith('••••')
              ) {
                next.r2SecretAccessKey = prev.r2SecretAccessKey;
              }
              return next;
            });
          }
        } catch {
          // Ignore if non-JSON received
        }
      }
    } catch (e) {
      console.warn('Infra config fetch notice:', e);
    }
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      // Secrets come from env only — POST acknowledges non-secret tuning / refreshes status.
      const res = await authFetch('/api/admin/infra-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dbMaxPoolSize: config.dbMaxPoolSize,
          dbIdleTimeoutSeconds: config.dbIdleTimeoutSeconds,
          dbStatementTimeoutMs: config.dbStatementTimeoutMs,
          dbQueryCachingEnabled: config.dbQueryCachingEnabled,
          r2MaxImageSizeMb: config.r2MaxImageSizeMb,
          r2MaxVideoSizeMb: config.r2MaxVideoSizeMb,
          r2ProfileVideoQuotaMb: config.r2ProfileVideoQuotaMb,
          r2AllowedMimeTypes: config.r2AllowedMimeTypes,
          r2CdnCacheTtlSeconds: config.r2CdnCacheTtlSeconds,
        }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.substring(0, 200) };
      }

      // Persist media quotas via system settings → system_configs (infra-config does not write quotas).
      const quotaMb = Math.max(1, Number(config.r2ProfileVideoQuotaMb) || 30);
      const maxVidMb = Math.max(1, Number(config.r2MaxVideoSizeMb) || 100);
      updateSystemSettings({
        profileVideoQuotaMb: quotaMb,
        r2MaxVideoSizeMb: maxVidMb,
      });

      if (res.ok && data.success !== false) {
        await fetchConfig();
        await checkProfilesStatus();
        return;
      }

      showToast(
        'Status Refresh Failed',
        data.error?.message || data.error || data.message || 'Could not read infrastructure status from server env.',
        'error'
      );
    } catch (e: any) {
      showToast('Network Error', e.message || 'Failed to communicate with configuration backend.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestDatabase = async () => {
    setIsTestingDb(true);
    setDbTestResult(null);
    try {
      const result = await testSupabaseConnection();
      setDbTestResult(result);
      if (result.connected) {
        showToast('Database Connected 🟢', result.message, 'success');
      } else {
        showToast('Database Offline / Mock Mode 🟡', result.message, 'info');
      }
      await checkProfilesStatus();
    } catch (e: any) {
      setDbTestResult({ connected: false, latencyMs: 0, message: e.message || 'Test failed' });
    } finally {
      setIsTestingDb(false);
    }
  };

  const checkProfilesStatus = async () => {
    try {
      const stats = await getSupabaseProfilesStats();
      setProfilesStats(stats);
    } catch (e) {
      console.warn('Supabase profiles stats check notice:', e);
    }
  };

  useEffect(() => {
    checkProfilesStatus();
  }, []);

  const handleSyncAllProfiles = async () => {
    setIsSyncingProfiles(true);
    try {
      const res = await syncAllProfilesToSupabase();
      await checkProfilesStatus();
      if (res.success) {
        showToast('Supabase Synced 🟢', `Successfully populated ${res.count} profiles into your Supabase database!`, 'success');
      } else {
        if (res.error?.includes('invalid input syntax for type uuid') || res.error?.includes('uuid')) {
          showToast(
            'Schema Update Required',
            'Your existing Supabase table expects UUID keys. Go to Tab 5 (SQL Schema), copy the schema (which drops the old UUID table), and run it in your Supabase SQL Editor.',
            'error'
          );
        } else {
          showToast('Sync Warning', res.error || 'Failed to populate Supabase profiles. Ensure your table schema is created in Tab 5.', 'error');
        }
      }
    } catch (err: any) {
      showToast('Sync Error', err.message || 'Error executing bulk upsert.', 'error');
    } finally {
      setIsSyncingProfiles(false);
    }
  };

  const handleTestR2Connection = async () => {
    setIsTestingR2(true);
    setR2ConnResult(null);
    try {
      // Always use server/Vercel env — do not send form secrets (masked or typed).
      const res = await authFetch('/api/r2-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        const snippet = text.replace(/\s+/g, ' ').slice(0, 220);
        data = {
          success: false,
          message:
            res.status === 404
              ? 'R2 test route missing (404). Redeploy the latest commit that includes /api/r2-test.'
              : `R2 API returned non-JSON (${res.status}). ${snippet || 'Check Vercel Function logs for api/r2-test.'}`,
        };
      }

      // Auth/config errors may be HTTP 503 with JSON body
      if (!data.message && data.error?.message) {
        data.message = data.error.message;
      }

      setR2ConnResult(data);
      if (data && data.success) {
        showToast('R2 Bucket Connected 🟢', data.message || `Connected to bucket "${data.bucket}"`, 'success');
      } else {
        showToast('R2 Connection Notice 🔴', data?.message || 'Failed to reach R2 bucket', 'error');
      }
    } catch (e: any) {
      setR2ConnResult({
        success: false,
        message: e.message || 'Network error communicating with R2 diagnostic service.',
      });
      showToast('R2 Test Error', e.message, 'error');
    } finally {
      setIsTestingR2(false);
    }
  };

  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchmarkResult(null);
    try {
      const res = await authFetch('/api/supabase/test-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: false, message: `Invalid response: ${text.slice(0, 100)}` };
      }

      if (data && data.success) {
        setBenchmarkResult(data);
        showToast('Benchmark Complete ⚡', `Index query executed in ${data.poolStats.queryExecutionMs}ms`, 'success');
      } else {
        showToast('Benchmark Notice', data?.message || 'Benchmark returned an error', 'error');
      }
    } catch (e: any) {
      showToast('Benchmark Error', e.message, 'error');
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleTestR2FileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTestingR2Upload(true);
    setR2TestResult(null);
    setUploadProgress(0);

    try {
      const result = await uploadMediaDirectlyToR2({
        file,
        userId: 'admin_tester',
        category: 'chat_media',
        onProgress: (p) => setUploadProgress(p),
      });

      setR2TestResult({
        success: true,
        url: result.publicUrl,
        durationMs: result.durationMs,
        message: `Direct presigned upload verified! Size: ${(result.fileSize / 1024).toFixed(1)} KB in ${result.durationMs}ms`,
      });
      showToast('Direct Upload Verified 🚀', 'File uploaded directly to Cloudflare R2 bucket with zero DB overhead.', 'success');
    } catch (err: any) {
      setR2TestResult({
        success: false,
        message: err.message || 'Direct upload failed. Check R2 credentials or CORS configuration.',
      });
      showToast('Upload Test Failed 🔴', err.message, 'error');
    } finally {
      setIsTestingR2Upload(false);
    }
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim().toLowerCase();
    if (trimmed && !config.bannedKeywords.includes(trimmed)) {
      setConfig((prev) => ({
        ...prev,
        bannedKeywords: [...prev.bannedKeywords, trimmed],
      }));
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (kw: string) => {
    setConfig((prev) => ({
      ...prev,
      bannedKeywords: prev.bannedKeywords.filter((k) => k !== kw),
    }));
  };

  const [schemaViewMode, setSchemaViewMode] = useState<'master' | 'migration'>('master');
  const [migrationSql, setMigrationSql] = useState<string>('');
  const rawSchemaSql = React.useMemo(() => getMasterSchemaSql(), []);
  const rawMigrationSql = React.useMemo(() => getMigrationSchemaSql(), []);
  const [isPushingAllData, setIsPushingAllData] = useState(false);
  const [lastPushStats, setLastPushStats] = useState<{
    countries: number;
    languages: number;
    zodiacs: number;
    interests: number;
    time: string;
  } | null>(null);

  const handlePushAllDataToSupabase = async () => {
    setIsPushingAllData(true);
    try {
      const res = await pushAllTaxonomiesAndSettingsToSupabase(systemSettings);
      if (res.success) {
        setLastPushStats({
          countries: res.countriesCount,
          languages: res.languagesCount,
          zodiacs: res.zodiacsCount,
          interests: res.interestsCount,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        });
        showToast(
          'Database Synchronized & Seeded 🚀',
          `Successfully saved ${res.countriesCount} Countries, ${res.languagesCount} Languages, ${res.zodiacsCount} Zodiacs, ${res.interestsCount} Interests, Coin Packages, CMS Policies, Home Banners, Quick Links, and System Settings to Supabase!`,
          'success'
        );
      } else {
        showToast(
          'Database Sync Incomplete ⚠️',
          res.errors.join(' | ') || 'Make sure your Supabase schema tables exist. You can run the Master SQL Schema in Tab 5.',
          'error'
        );
      }
    } catch (e: any) {
      showToast('Database Sync Error 🔴', e.message, 'error');
    } finally {
      setIsPushingAllData(false);
    }
  };

  // Initialize schemaSql and migrationSql on mount or load from API
  useEffect(() => {
    handleUpdateSchema(false);
  }, []);

  const handleUpdateSchema = async (showToastNotice: boolean = true) => {
    setIsUpdatingSchema(true);
    try {
      const res = await authFetch('/api/admin/schema');
      if (res.ok) {
        const data = await res.json();
        if (data && data.sql) {
          setSchemaSql(data.sql);
          if (data.migrationSql) {
            setMigrationSql(data.migrationSql);
          } else {
            setMigrationSql(rawMigrationSql);
          }
          setLastSchemaUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          setSchemaStats({
            tablesCount: data.tablesCount || 17,
            version: data.version || '3.2',
          });
          if (showToastNotice) {
            showToast(
              'Schema Updated & Populated 🚀',
              `Latest production SQL schema loaded (${data.tablesCount || 17} tables, Agency attribution, Taxonomies, RLS policies, Realtime triggers). Ready to copy & run in Supabase!`,
              'success'
            );
          }
          return;
        }
      }
      // Fallback: client no longer embeds the 59KB schema — require API/canonical file
      const unavailableNotice =
        '-- Canonical schema unavailable from API.\n-- Open /supabase_schema.sql at the project root, or retry GET /api/admin/schema.';
      setSchemaSql(rawSchemaSql || unavailableNotice);
      setMigrationSql(rawMigrationSql || unavailableNotice);
      setLastSchemaUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setSchemaStats({
        tablesCount: 21,
        version: '3.2',
      });
      if (showToastNotice) {
        showToast(
          'Schema API Unavailable ⚠️',
          'Could not load /supabase_schema.sql via /api/admin/schema. Open the root schema file directly.',
          'error'
        );
      }
    } catch (e: any) {
      const unavailableNotice =
        '-- Canonical schema unavailable from API.\n-- Open /supabase_schema.sql at the project root, or retry GET /api/admin/schema.';
      setSchemaSql(rawSchemaSql || unavailableNotice);
      setMigrationSql(rawMigrationSql || unavailableNotice);
      setLastSchemaUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setSchemaStats({
        tablesCount: 21,
        version: '3.2',
      });
      if (showToastNotice) {
        showToast('Schema Load Error 🔴', e.message || 'Failed to load canonical schema from server.', 'error');
      }
    } finally {
      setIsUpdatingSchema(false);
    }
  };

  const downloadSqlFile = () => {
    const isMigration = schemaViewMode === 'migration';
    const content = isMigration ? (migrationSql || rawMigrationSql) : (schemaSql || rawSchemaSql);
    const blob = new Blob([content], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = isMigration
      ? `livecall_supabase_migration_${new Date().toISOString().split('T')[0]}.sql`
      : `livecall_supabase_master_schema_${new Date().toISOString().split('T')[0]}.sql`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Download Started 💾', `Saved ${filename} to your downloads folder.`, 'info');
  };

  const copySqlToClipboard = (forceMode?: 'master' | 'migration') => {
    const targetMode = forceMode || schemaViewMode;
    const isMigration = targetMode === 'migration';
    const content = isMigration ? (migrationSql || rawMigrationSql) : (schemaSql || rawSchemaSql);
    navigator.clipboard.writeText(content);
    setCopiedSql(true);
    showToast(
      isMigration ? 'Migration SQL Copied! 📋' : 'Master SQL Schema Copied! 📋',
      'Paste this into Supabase SQL Editor and click "Run".',
      'success'
    );
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Infrastructure Top Overview Card */}
      <div className="bg-[#161920] border border-slate-800 rounded-xl p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono uppercase tracking-wider font-bold">
              <Database className="w-3 h-3" />
              <span>SUPABASE POSTGRESQL & CLOUDFLARE R2 INFRASTRUCTURE</span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mt-1">
              Database Scaling & Cloud Storage Control
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl mt-0.5">
              Decoupled presigned storage architecture, connection pooling latency benchmarks, Row-Level Security policies, and content moderation rules.
            </p>
            {(config as any).vercel || (config as any).source === 'environment' ? (
              <div className="mt-2 max-w-2xl text-[11px] leading-relaxed text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                <span className="font-bold text-amber-300">
                  {(config as any).vercel ? 'Vercel production' : 'Environment-backed'}
                </span>
                : secrets are read from{' '}
                <span className="font-semibold">Vercel Environment Variables</span> (or local process env).
                This UI never writes a <code className="text-amber-100">.env</code> file and cannot persist
                credentials on the serverless filesystem. Change secrets in the Vercel dashboard, then Redeploy.
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleTestDatabase}
              disabled={isTestingDb}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white flex items-center space-x-2 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isTestingDb ? 'animate-spin' : ''}`} />
              <span>{isTestingDb ? 'Pinging DB...' : 'Test Supabase'}</span>
            </button>

            <button
              onClick={handleTestR2Connection}
              disabled={isTestingR2}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-cyan-700/60 text-xs font-semibold text-cyan-300 flex items-center space-x-2 transition-all cursor-pointer"
            >
              <Cloud className={`w-3.5 h-3.5 text-cyan-400 ${isTestingR2 ? 'animate-bounce' : ''}`} />
              <span>{isTestingR2 ? 'Connecting R2...' : 'Test R2'}</span>
            </button>

            <button
              onClick={() => handleSaveConfig()}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 flex items-center space-x-2 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSaving ? 'Refreshing...' : 'Refresh Env Status'}</span>
            </button>
          </div>
        </div>

        {/* Live Architecture Status Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-[#0F1115] border border-slate-800/80 rounded-lg p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-bold">POSTGRESQL ENGINE</span>
              <span className={`w-2.5 h-2.5 rounded-full ${config.supabaseConfigured ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse' : 'bg-emerald-400'}`} />
            </div>
            <div className="text-white font-extrabold text-sm mt-1 flex items-center space-x-1.5">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>{config.supabaseConfigured ? 'Supabase v2 Active' : 'Hybrid Local Bridge'}</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">RLS Enabled // Schema v2.4</div>
          </div>

          <div className="bg-[#0F1115] border border-slate-800/80 rounded-lg p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-bold">CLOUDFLARE R2 BUCKET</span>
              <span className={`w-2.5 h-2.5 rounded-full ${config.r2Configured ? 'bg-cyan-400 shadow-lg shadow-cyan-400/50 animate-pulse' : 'bg-cyan-400'}`} />
            </div>
            <div className="text-white font-extrabold text-sm mt-1 flex items-center space-x-1.5">
              <Cloud className="w-4 h-4 text-cyan-400" />
              <span>{config.r2Configured ? 'S3 Direct Active' : 'Presigned Direct Hub'}</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">{config.r2BucketName}</div>
          </div>

          <div className="bg-[#0F1115] border border-slate-800/80 rounded-lg p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-bold">CONNECTION POOLING</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-white font-extrabold text-sm mt-1">
              {config.dbMaxPoolSize} Max Pool ({config.dbIdleTimeoutSeconds}s idle)
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">Statement timeout: {config.dbStatementTimeoutMs}ms</div>
          </div>

          <div className="bg-[#0F1115] border border-slate-800/80 rounded-lg p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-bold">CONTENT SAFETY</span>
              <Shield className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-white font-extrabold text-sm mt-1 capitalize">
              {config.autoModerationSensitivity} Sensitivity
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">Auto-ban at {config.abuseReportAutoSuspendThreshold} reports</div>
          </div>
        </div>

        {/* Sub-Tabs Nav — hidden when AdminShell sidebar owns L2 */}
        {navPlacement !== 'sidebar' && (
          <div className="flex bg-[#0F1115] p-1 rounded-lg border border-slate-800 text-xs font-semibold space-x-1 mt-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab('db_pool')}
              className={`px-4 py-2 rounded-md transition-all whitespace-nowrap flex items-center space-x-2 ${
                activeTab === 'db_pool' ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Database & Pooling</span>
            </button>

            <button
              onClick={() => setActiveTab('r2_storage')}
              className={`px-4 py-2 rounded-md transition-all whitespace-nowrap flex items-center space-x-2 ${
                activeTab === 'r2_storage' ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-600/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cloud className="w-4 h-4" />
              <span>Cloudflare R2 Storage</span>
            </button>

            <button
              onClick={() => setActiveTab('moderation')}
              className={`px-4 py-2 rounded-md transition-all whitespace-nowrap flex items-center space-x-2 ${
                activeTab === 'moderation' ? 'bg-rose-600 text-white font-bold shadow-md shadow-rose-600/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Content Moderation & Flags</span>
            </button>

            <button
              onClick={() => setActiveTab('features')}
              className={`px-4 py-2 rounded-md transition-all whitespace-nowrap flex items-center space-x-2 ${
                activeTab === 'features' ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Global Feature Toggles</span>
            </button>

            <button
              onClick={() => setActiveTab('sql_schema')}
              className={`px-4 py-2 rounded-md transition-all whitespace-nowrap flex items-center space-x-2 ${
                activeTab === 'sql_schema' ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode2 className="w-4 h-4" />
              <span>SQL Schema & RLS Policies</span>
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: DATABASE & POOLING PARAMETERS */}
      {activeTab === 'db_pool' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#161920] border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <span>Supabase PostgreSQL Client & Connection Settings</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Credentials are loaded from the <span className="text-emerald-300 font-semibold">server environment</span>
                {' '}(<code className="text-slate-300">VITE_SUPABASE_*</code> /{' '}
                <code className="text-slate-300">SUPABASE_SERVICE_ROLE_KEY</code>). On Vercel, set them in Project Settings →
                Environment Variables — do not paste secrets into this form.
              </p>
              {(config as any).supabaseConfigured && (
                <div className="mt-3 text-[11px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                  Supabase configured from environment
                  {config.supabaseUrl ? ` · ${config.supabaseUrl}` : ''}.
                  Anon / service-role keys stay on the server.
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0F1115] p-4 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">VITE_SUPABASE_URL</span>
                <span className="text-emerald-300 truncate max-w-[65%] text-right">
                  {config.supabaseUrl || '— not set in env —'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">VITE_SUPABASE_ANON_KEY</span>
                <span className="text-amber-300">
                  {(config as any).supabaseAnonKeyConfigured || config.supabaseAnonKey
                    ? '•••••••• (from env)'
                    : '— not set —'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">SUPABASE_SERVICE_ROLE_KEY</span>
                <span className="text-rose-300">
                  {(config as any).supabaseServiceRoleConfigured ? '•••••••• (from env)' : '— not set —'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-sm font-bold text-white mb-4 flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>PostgreSQL Connection Pooling Tuning</span>
              </h4>
              <p className="text-[11px] text-slate-500 mb-3">
                On Vercel these sliders are reference-only — Supabase manages pooling. Values are not written to
                disk or Vercel env from this form.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] text-slate-400 font-mono uppercase mb-1 font-semibold">
                    MAX POOL SIZE ({config.dbMaxPoolSize})
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={config.dbMaxPoolSize}
                    onChange={(e) => setConfig({ ...config, dbMaxPoolSize: Number(e.target.value) })}
                    className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                    <span>10 (Lite)</span>
                    <span>50 (Std)</span>
                    <span>100 (Max)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-mono uppercase mb-1 font-semibold">
                    IDLE TIMEOUT (SEC)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={config.dbIdleTimeoutSeconds}
                    onChange={(e) => setConfig({ ...config, dbIdleTimeoutSeconds: Number(e.target.value) })}
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-mono uppercase mb-1 font-semibold">
                    STATEMENT TIMEOUT (MS)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    max="30000"
                    step="500"
                    value={config.dbStatementTimeoutMs}
                    onChange={(e) => setConfig({ ...config, dbStatementTimeoutMs: Number(e.target.value) })}
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between p-3 bg-[#0F1115] border border-slate-800 rounded-lg">
                <div>
                  <div className="text-xs font-bold text-white">Enable Prepared Statement & Query Caching</div>
                  <div className="text-[11px] text-slate-400">Caches query execution plans in PostgreSQL buffer pool to prevent N+1 query overhead.</div>
                </div>
                <input
                  type="checkbox"
                  checked={config.dbQueryCachingEnabled}
                  onChange={(e) => setConfig({ ...config, dbQueryCachingEnabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Benchmark & Diagnostics Panel */}
          <div className="bg-[#161920] border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span>Query Latency & Pool Benchmark</span>
            </h3>

            <p className="text-xs text-slate-400">
              Runs a live service-role probe against Supabase (<code className="text-slate-300">profiles</code> count)
              and reports round-trip latency. Pool size figures from local Express are not applicable on Vercel serverless.
            </p>

            <button
              onClick={handleRunBenchmark}
              disabled={isBenchmarking}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2 transition-all"
            >
              <Play className={`w-4 h-4 ${isBenchmarking ? 'animate-pulse' : ''}`} />
              <span>{isBenchmarking ? 'Benchmarking Database...' : 'Execute Performance Benchmark'}</span>
            </button>

            {benchmarkResult && (
              <div className="bg-[#0F1115] border border-slate-800 rounded-lg p-4 font-mono text-xs space-y-2">
                <div className="text-emerald-400 font-bold flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Pool Benchmark Passed</span>
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500">Query Latency:</span> <span className="text-white font-bold">{benchmarkResult.poolStats.queryExecutionMs} ms</span>
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500">Active Connections:</span> <span className="text-white">{benchmarkResult.poolStats.activeConnections} / {benchmarkResult.poolStats.maxPoolSize}</span>
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500">Buffer Cache Hit:</span> <span className="text-emerald-400 font-bold">{benchmarkResult.poolStats.cacheHitRate}</span>
                </div>
                <div className="text-[10px] text-slate-500 bg-slate-900/90 p-2 rounded border border-slate-800 break-all">
                  {benchmarkResult.poolStats.queryPlan}
                </div>
              </div>
            )}

            {dbTestResult && (
              <div className={`p-3.5 rounded-lg border text-xs font-mono ${dbTestResult.connected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
                <div className="font-bold flex items-center space-x-1.5">
                  {dbTestResult.connected ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                  <span>{dbTestResult.connected ? 'Live Connection OK' : 'Local / Offline Notice'}</span>
                </div>
                <div className="mt-1 text-[11px] opacity-90">{dbTestResult.message}</div>
              </div>
            )}

            {/* Supabase Profiles Sync & Population Card */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Profiles Table Status</span>
                </div>
                <button
                  type="button"
                  onClick={checkProfilesStatus}
                  title="Refresh profiles table status"
                  className="text-slate-400 hover:text-white text-[11px] font-mono flex items-center space-x-1"
                >
                  <RefreshCw className="w-3 h-3 text-slate-400" />
                  <span>Refresh</span>
                </button>
              </div>

              {profilesStats && (
                <div className={`p-3 rounded-lg border text-xs font-mono ${
                  profilesStats.count > 0 
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' 
                    : profilesStats.configured 
                      ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {profilesStats.count > 0 
                        ? `🟢 ${profilesStats.count} Profiles in Supabase` 
                        : profilesStats.configured 
                          ? '🟡 Table Empty (0 Profiles)'
                          : '⚪ Supabase Not Connected'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 border border-current">
                      {profilesStats.configured ? 'Active Supabase' : 'Local Mock'}
                    </span>
                  </div>
                  {profilesStats.error && (
                    <div className="text-[10px] text-rose-300 mt-1.5 break-all space-y-1">
                      <div>⚠️ {profilesStats.error}</div>
                      {profilesStats.error.toLowerCase().includes('uuid') && (
                        <div className="p-1.5 rounded bg-rose-950/80 border border-rose-700/60 text-amber-200 text-[10px]">
                          <b>Fix UUID Mismatch:</b> Go to <button type="button" onClick={() => setActiveTab('sql_schema')} className="underline text-white font-bold">Tab 5 (SQL Schema)</button>, copy the SQL script (which drops the old UUID table), and run it in your Supabase SQL Editor.
                        </div>
                      )}
                    </div>
                  )}
                  {profilesStats.count === 0 && (
                    <div className="text-[10px] text-amber-200/90 mt-1.5">
                      Your Supabase <code className="bg-black/40 px-1 py-0.5 rounded text-white">profiles</code> table is currently empty. Click the button below to populate it with all creator hosts, photos, rates, and bios!
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSyncAllProfiles}
                  disabled={isSyncingProfiles}
                  className="py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                >
                  <UploadCloud className={`w-4 h-4 ${isSyncingProfiles ? 'animate-bounce' : ''}`} />
                  <span>{isSyncingProfiles ? 'Populating...' : '⚡ Sync to Supabase'}</span>
                </button>

                <button
                  id="open-reset-mock-data-modal-btn"
                  type="button"
                  onClick={() => setIsResetModalOpen(true)}
                  className="py-2.5 px-3 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-xs font-bold text-rose-200 flex items-center justify-center space-x-1.5 transition-all cursor-pointer shadow-md hover:shadow-rose-950/40"
                  title="Open granular reset popup to selectively or fully wipe mock data"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>🗑️ Reset Mock Data Options</span>
                </button>
              </div>

              <div className="text-[10px] text-slate-500 bg-[#0F1115] p-2.5 rounded-lg border border-slate-800 space-y-1">
                <div className="font-bold text-slate-400">💡 Empty Table Troubleshooting:</div>
                <div>1. Run SQL schema from <button type="button" onClick={() => setActiveTab('sql_schema')} className="text-emerald-400 underline hover:text-emerald-300">Tab 5 (SQL Schema)</button> in your Supabase SQL Editor.</div>
                <div>2. Ensure RLS policies are enabled (provided in Tab 5).</div>
                <div>3. Click the Sync button above to populate all {users.length} creator & user profiles.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLOUDFLARE R2 STORAGE */}
      {activeTab === 'r2_storage' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#161920] border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Cloud className="w-5 h-5 text-cyan-400" />
                <span>Cloudflare R2 Presigned Direct Storage Credentials</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                R2 keys come from server env (<code className="text-slate-300">R2_ACCOUNT_ID</code>,{' '}
                <code className="text-slate-300">R2_ACCESS_KEY_ID</code>,{' '}
                <code className="text-slate-300">R2_SECRET_ACCESS_KEY</code>,{' '}
                <code className="text-slate-300">R2_BUCKET_NAME</code>). On Vercel set them in Environment Variables.
                Test Connection uses those server values — you do not need to paste secrets into this form.
              </p>
              {config.r2Configured && (
                <div className="mt-3 text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2">
                  R2 configured from environment
                  {config.r2BucketName ? ` · bucket ${config.r2BucketName}` : ''}.
                </div>
              )}
              {storageRuntimeStatus?.mockStorageActive && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    <div className="font-semibold text-amber-100">Mock storage active</div>
                    <div className="mt-0.5 text-amber-200/90">
                      R2 credentials are missing or incomplete. Authenticated uploads use the local mock endpoint
                      (<code className="text-amber-100">/api/storage/mock-upload</code>). Configure R2 for production;
                      mock mode is blocked in production unless <code className="text-amber-100">ALLOW_MOCK_STORAGE=true</code>.
                    </div>
                  </div>
                </div>
              )}
              {storageRuntimeStatus && !storageRuntimeStatus.configured && !storageRuntimeStatus.mockStorageActive && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <div>
                    <div className="font-semibold text-rose-100">Storage not configured</div>
                    <div className="mt-0.5">Uploads will fail closed until R2 credentials are set (or mock storage is explicitly allowed).</div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0F1115] p-4 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">R2_ACCOUNT_ID</span>
                <span className="text-cyan-300">{config.r2AccountId || '— not set —'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">R2_BUCKET_NAME</span>
                <span className="text-cyan-300">{config.r2BucketName || '— not set —'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">R2_ACCESS_KEY_ID</span>
                <span className="text-amber-300">{config.r2AccessKeyId ? `${config.r2AccessKeyId} (masked)` : '— not set —'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">R2_SECRET_ACCESS_KEY</span>
                <span className="text-rose-300">{config.r2SecretAccessKey ? '•••••••• (from env)' : '— not set —'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">R2_PUBLIC_URL</span>
                <span className="text-slate-300 truncate max-w-[65%] text-right">
                  {config.r2PublicUrl || '— optional / proxy —'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-sm font-bold text-white mb-4 flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span>Media Quotas, Max Sizes & MIME Policy</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] text-slate-400 font-mono uppercase mb-1 font-semibold">
                    MAX IMAGE SIZE (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={config.r2MaxImageSizeMb}
                    onChange={(e) => setConfig({ ...config, r2MaxImageSizeMb: Number(e.target.value) })}
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-mono uppercase mb-1 font-semibold">
                    MAX SINGLE VIDEO (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={config.r2MaxVideoSizeMb}
                    onChange={(e) => setConfig({ ...config, r2MaxVideoSizeMb: Number(e.target.value) })}
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-mono uppercase mb-1 font-semibold">
                    PROFILE VIDEO QUOTA / USER (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={config.r2ProfileVideoQuotaMb}
                    onChange={(e) =>
                      setConfig({ ...config, r2ProfileVideoQuotaMb: Number(e.target.value) })
                    }
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="mt-1 text-[10px] text-slate-500 font-mono">
                    Total MB all profile videos may use per user (default 30).
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-mono uppercase mb-1 font-semibold">
                    CDN CACHE TTL (SEC)
                  </label>
                  <input
                    type="number"
                    min="3600"
                    max="604800"
                    step="3600"
                    value={config.r2CdnCacheTtlSeconds}
                    onChange={(e) => setConfig({ ...config, r2CdnCacheTtlSeconds: Number(e.target.value) })}
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-[11px] text-slate-400 font-mono uppercase mb-1.5 font-semibold">
                  ALLOWED MIME TYPES
                </label>
                <div className="flex flex-wrap gap-2">
                  {config.r2AllowedMimeTypes.map((mime) => (
                    <span key={mime} className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 rounded text-[11px] font-mono">
                      {mime}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Test Presigned Direct Upload Box & Connectivity Diagnostics */}
          <div className="bg-[#161920] border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Cloud className="w-5 h-5 text-cyan-400" />
                <span>R2 Bucket Connectivity Test</span>
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${config.r2Configured ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-slate-800 text-slate-400'}`}>
                {config.r2Configured ? 'Configured' : 'Missing Keys'}
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Execute real-time S3 API authentication check and verify bucket reachability on Cloudflare R2.
            </p>

            <button
              onClick={handleTestR2Connection}
              disabled={isTestingR2}
              className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-lg shadow-cyan-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isTestingR2 ? 'animate-spin' : ''}`} />
              <span>{isTestingR2 ? 'Testing R2 Bucket Connection...' : 'Ping & Verify R2 Bucket'}</span>
            </button>

            {r2ConnResult && (
              <div className={`p-4 rounded-lg border text-xs font-mono space-y-2 ${r2ConnResult.success ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
                <div className="font-bold flex items-center space-x-1.5">
                  {r2ConnResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>{r2ConnResult.success ? 'R2 S3 API Handshake OK' : 'R2 Connection Failed'}</span>
                </div>
                <div className="text-[11px] opacity-90">{r2ConnResult.message}</div>
                {r2ConnResult.latencyMs !== undefined && r2ConnResult.latencyMs > 0 && (
                  <div className="text-[10px] text-slate-400">Ping latency: <strong className="text-white">{r2ConnResult.latencyMs} ms</strong></div>
                )}
                {r2ConnResult.corsHelp && (
                  <div className="mt-2 p-2 bg-slate-900/90 rounded border border-slate-800 text-[10px] text-amber-300/90">
                    💡 <strong>CORS Note:</strong> {r2ConnResult.corsHelp}
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-white flex items-center space-x-2">
                <UploadCloud className="w-4 h-4 text-cyan-400" />
                <span>Test Direct Browser Upload (Presigned PUT)</span>
              </h4>

              <label className="block border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-xl p-5 text-center cursor-pointer transition-all bg-[#0F1115]/50">
                <UploadCloud className="w-7 h-7 text-cyan-400 mx-auto mb-1.5" />
                <div className="text-xs font-bold text-white">Click or Drag Image to Test Upload</div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Streams directly to R2 bucket</div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleTestR2FileUpload}
                  disabled={isTestingR2Upload}
                  className="hidden"
                />
              </label>

              {isTestingR2Upload && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono text-cyan-400">
                    <span>Uploading to R2...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-cyan-400 h-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {r2TestResult && (
                <div className={`p-4 rounded-lg border text-xs font-mono space-y-2 ${r2TestResult.success ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
                  <div className="font-bold flex items-center space-x-1.5">
                    {r2TestResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span>{r2TestResult.success ? 'R2 Direct Upload Succeeded' : 'Upload Error'}</span>
                  </div>
                  <div className="text-[11px] opacity-90">{r2TestResult.message}</div>
                  {r2TestResult.url && (
                    <div className="pt-2">
                      <img src={r2TestResult.url} alt="Uploaded test" className="w-full h-28 object-cover rounded-lg border border-slate-700" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CONTENT MODERATION & SAFETY FLAGS */}
      {activeTab === 'moderation' && (
        <div className="bg-[#161920] border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Shield className="w-5 h-5 text-rose-400" />
              <span>Real-Time Safety & Moderation Controls</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Automated image classification filters, banned keywords regex matching, and automated account suspension triggers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase font-mono tracking-wider mb-2">
                  AUTO-MODERATION SENSITIVITY
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'strict'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setConfig({ ...config, autoModerationSensitivity: level })}
                      className={`py-2 px-3 rounded-lg text-xs font-bold capitalize transition-all border ${
                        config.autoModerationSensitivity === level
                          ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30'
                          : 'bg-[#0F1115] text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#0F1115] border border-slate-800 rounded-lg">
                <div>
                  <div className="text-xs font-bold text-white">AI NSFW / Nudity Shield on Media Uploads</div>
                  <div className="text-[11px] text-slate-400">Classifies image buffers before saving attachment references.</div>
                </div>
                <input
                  type="checkbox"
                  checked={systemSettings.aiNudityShieldEnabled !== false}
                  onChange={(e) => updateSystemSettings({ aiNudityShieldEnabled: e.target.checked })}
                  className="w-4 h-4 accent-rose-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase font-mono tracking-wider mb-1.5">
                  ABUSE REPORT AUTO-SUSPEND THRESHOLD
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={config.abuseReportAutoSuspendThreshold}
                  onChange={(e) => setConfig({ ...config, abuseReportAutoSuspendThreshold: Number(e.target.value) })}
                  className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">Users receiving this many verified safety flags are automatically quarantined.</p>
              </div>
            </div>

            {/* Banned Keywords Editor */}
            <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                BANNED KEYWORDS & PROHIBITED PHRASES
              </div>
              <p className="text-[11px] text-slate-400">
                Messages containing these substrings will be blocked or automatically flagged for review.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                  placeholder="Add forbidden keyword..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-all flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 max-h-48 overflow-y-auto">
                {config.bannedKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-full text-xs font-mono"
                  >
                    <span>{kw}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(kw)}
                      className="hover:text-white"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GLOBAL FEATURE TOGGLES */}
      {activeTab === 'features' && (
        <div className="bg-[#161920] border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              <span>Global Application Feature Flags</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Toggle platform capabilities without needing code deployments or infrastructure rebuilds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Real-Time Chat & Broadcast Engine</div>
                <div className="text-[11px] text-slate-400">PostgreSQL `postgres_changes` channel for instant message sync.</div>
              </div>
              <input
                type="checkbox"
                checked={config.featureRealtimeChatEnabled}
                onChange={(e) => setConfig({ ...config, featureRealtimeChatEnabled: e.target.checked })}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Decoupled Direct R2 Media Uploads</div>
                <div className="text-[11px] text-slate-400">Presigned PUT streaming to Cloudflare R2.</div>
              </div>
              <input
                type="checkbox"
                checked={config.featureR2DirectUploadEnabled}
                onChange={(e) => setConfig({ ...config, featureR2DirectUploadEnabled: e.target.checked })}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">WebRTC 1080p Video Calling & Coin Burn</div>
                <div className="text-[11px] text-slate-400">Dynamic coin economy burn rates and female host earning split.</div>
              </div>
              <input
                type="checkbox"
                checked={config.featureVideoCallingEnabled}
                onChange={(e) => setConfig({ ...config, featureVideoCallingEnabled: e.target.checked })}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Geographic Discovery Radius Matching</div>
                <div className="text-[11px] text-slate-400">Calculates Haversine distance using profile lat/long coordinates.</div>
              </div>
              <input
                type="checkbox"
                checked={config.featureGeoDiscoveryEnabled}
                onChange={(e) => setConfig({ ...config, featureGeoDiscoveryEnabled: e.target.checked })}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Screen recording protection</div>
                <div className="text-[11px] text-slate-400">During a call, blocks the right-click menu and covers the video when the tab is hidden.</div>
              </div>
              <input
                type="checkbox"
                checked={systemSettings.screenRecordingProtection !== false}
                onChange={(e) => updateSystemSettings({ screenRecordingProtection: e.target.checked })}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">AI nudity shield</div>
                <div className="text-[11px] text-slate-400">Same switch as Content Moderation. Saved on system settings for upload screening.</div>
              </div>
              <input
                type="checkbox"
                checked={systemSettings.aiNudityShieldEnabled !== false}
                onChange={(e) => updateSystemSettings({ aiNudityShieldEnabled: e.target.checked })}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
            </div>

            <DailyLoginCoinsField />

            <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-lg flex items-center justify-between md:col-span-2">
              <div>
                <div className="text-xs font-bold text-rose-300 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Platform Maintenance Mode</span>
                </div>
                <div className="text-[11px] text-rose-400/80">Displays maintenance banner to users while keeping Admin Dashboard accessible.</div>
              </div>
              <input
                type="checkbox"
                checked={config.featureMaintenanceMode}
                onChange={(e) => setConfig({ ...config, featureMaintenanceMode: e.target.checked })}
                className="w-4 h-4 accent-rose-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SQL SCHEMA & RLS POLICIES */}
      {activeTab === 'sql_schema' && (
        <div className="bg-[#161920] border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <FileCode2 className="w-5 h-5 text-purple-400" />
                  <span>Production PostgreSQL Schema & Database Sync</span>
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-mono font-bold">
                  v{schemaStats.version} Production Master
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Complete consolidated PostgreSQL database definition with 17 tables, Taxonomies (240+ Countries, 60+ Languages, 12 Zodiacs, 38+ Interests), Agency attribution, RLS policies, Auth sync triggers, and Realtime replication.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePushAllDataToSupabase}
                disabled={isPushingAllData}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold flex items-center space-x-2 transition-all shadow-lg shadow-emerald-600/25 cursor-pointer disabled:opacity-50 border border-emerald-500/30"
                title="Save and synchronize all taxonomies (Countries, Languages, Zodiac Signs, Interests), Dynamic SVG Flag Sizes, and System Settings directly into Supabase PostgreSQL tables"
              >
                <Database className={`w-4 h-4 ${isPushingAllData ? 'animate-spin' : 'text-emerald-200'}`} />
                <span>{isPushingAllData ? 'Saving All Data to DB...' : 'Save & Seed All Data to Supabase DB 🚀'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleUpdateSchema(true)}
                disabled={isUpdatingSchema}
                className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold flex items-center space-x-2 transition-all shadow-md shadow-purple-600/20 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingSchema ? 'animate-spin' : ''}`} />
                <span>{isUpdatingSchema ? 'Updating Schema...' : 'Update & Populate Schema'}</span>
              </button>

              <button
                type="button"
                onClick={() => copySqlToClipboard()}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center space-x-2 transition-all border border-slate-700 cursor-pointer"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Copied to Clipboard!' : schemaViewMode === 'migration' ? 'Copy Migration SQL' : 'Copy Master Schema'}</span>
              </button>

              <button
                type="button"
                onClick={downloadSqlFile}
                className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all border border-slate-700/80 cursor-pointer"
                title="Download as .sql file"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .sql</span>
              </button>
            </div>
          </div>

          {/* Database Sync Status Banner */}
          {lastPushStats && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-300">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Database Synced:</strong> {lastPushStats.countries} Countries, {lastPushStats.languages} Languages, {lastPushStats.zodiacs} Zodiacs, {lastPushStats.interests} Interests saved to Supabase PostgreSQL at {lastPushStats.time}.
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-mono text-[10px] uppercase font-bold">Live in DB</span>
            </div>
          )}

          {/* View Selector: Master vs Incremental Migration */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setSchemaViewMode('master')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-2 transition-all ${
                  schemaViewMode === 'master'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Master Schema (Fresh Setup - 17 Tables & Taxonomies)</span>
              </button>
              <button
                type="button"
                onClick={() => setSchemaViewMode('migration')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-2 transition-all ${
                  schemaViewMode === 'migration'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Safe Incremental Migration (Existing DBs)</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{schemaViewMode === 'master' ? 'Full DDL + Seed Data + Triggers + RLS' : 'Non-destructive ALTER & Seed statements'}</span>
            </div>
          </div>

          {/* Quick Metrics & Last Updated Bar */}
          <div className="bg-[#0D1017] border border-purple-500/20 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-1.5 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-semibold text-white">Status:</span>
                <span className="text-emerald-400 font-mono">Ready to Run in Supabase SQL Editor or Push Directly</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center space-x-1.5 text-slate-300">
                <Database className="w-3.5 h-3.5 text-purple-400" />
                <span className="font-mono text-purple-300 font-bold">{schemaStats.tablesCount} Tables Covered</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center space-x-1.5 text-slate-300">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-mono text-indigo-300">17 RLS Security Policies</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center space-x-1.5 text-slate-300">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono text-amber-300">5 Realtime Channels</span>
              </div>
            </div>

            {lastSchemaUpdated && (
              <div className="text-[11px] text-slate-400 font-mono">
                Populated: <span className="text-slate-200">{lastSchemaUpdated}</span>
              </div>
            )}
          </div>

          {/* Quick Setup 3-Step Guide */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#0F1115] border border-slate-800 p-4 rounded-lg text-xs">
            <div className="space-y-1">
              <div className="font-bold text-purple-400 flex items-center space-x-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center text-[10px]">1</span>
                <span>1. Update & Copy SQL</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Click <b className="text-white">"Update & Populate Schema"</b> then click <b className="text-white">"Copy SQL"</b>.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-bold text-emerald-400 flex items-center space-x-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-[10px]">2</span>
                <span>2. Run in Supabase SQL Editor</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Open your Supabase Dashboard ➔ <b className="text-white">SQL Editor</b> ➔ Click <b className="text-white">New Query</b> ➔ Paste & click <b className="text-emerald-400">Run</b>.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-bold text-cyan-400 flex items-center space-x-1.5">
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-500 flex items-center justify-center text-[10px]">3</span>
                <span>3. Live Multi-Device Sync</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                All agencies, female creators, earnings, and payout requests now persist safely without data loss.
              </p>
            </div>
          </div>

          <div className="bg-[#0A0C10] border border-slate-800 rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-[11px] text-slate-300 leading-relaxed">
            <pre>
              {schemaViewMode === 'migration'
                ? (migrationSql || rawMigrationSql)
                : (schemaSql || rawSchemaSql)}
            </pre>
          </div>
        </div>
      )}

      {/* Reset Mock Data Granular Modal */}
      <ResetMockDataModal
        isOpen={isResetModalOpen}
        onClose={() => {
          setIsResetModalOpen(false);
          checkProfilesStatus();
        }}
      />
    </div>
  );
};
