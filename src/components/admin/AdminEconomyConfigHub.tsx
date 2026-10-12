import React, { useEffect, useMemo, useState } from 'react';
import {
  Coins,
  DollarSign,
  Gift,
  Percent,
  Package,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CoinPackage } from '../../types';
import {
  totalCoins as pkgTotalCoins,
  payPriceUSD,
  listPriceUSD,
  pegValueUSD,
  loadMarginUSD,
} from '../../utils/coinPackagePricing';
import {
  DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
  DEFAULT_COIN_BURN_RATE_PER_MIN,
  DEFAULT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
  DEFAULT_TEAM_LEADER_SHARE_PERCENT,
  deriveHostEarnPerMin,
  computeCallMinuteSplit,
} from '../../../shared/finance/economyBurn';
import {
  DEFAULT_COIN_USD_PEG,
  formatPegExample,
  getCoinUsdPeg,
  coinsToUsd,
  usdToCoins,
} from '../../../shared/finance/fx';
import {
  DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
  computeGiftCoinSplit,
} from '../../../shared/finance/economyGift';

type EconomySectionId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

interface AdminEconomyConfigHubProps {
  /** Optional deep-link: scroll/expand a section on mount (e.g. 'C' for gift shares). */
  initialSection?: EconomySectionId;
  onOpenSkuBundles?: () => void;
  onOpenGiftsCatalog?: () => void;
}

const SECTION_IDS: EconomySectionId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

const SECTION_META: Record<
  EconomySectionId,
  { title: string; blurb: string; accent: string }
> = {
  A: {
    title: 'Coin burn rates',
    blurb: 'Standard and friend per-minute burn. Edits apply on the next billing minute.',
    accent: 'text-amber-300 border-amber-500/40',
  },
  B: {
    title: 'Call revenue shares',
    blurb:
      'Base % = live burn. Target % = period-end share true-up if bronze+ met (Finance shows true-up as its own line). TL % static — no TL true-up. Override > 0 skips share true-up.',
    accent: 'text-pink-300 border-pink-500/40',
  },
  C: {
    title: 'Gift / tip shares',
    blurb: 'Host %, TL %, and implied platform % of virtual gift coin value.',
    accent: 'text-rose-300 border-rose-500/40',
  },
  D: {
    title: 'Coin ↔ USD peg & payout thresholds',
    blurb: 'Fixed Peg for host/TL/platform coin→USD, plus minimum cashout.',
    accent: 'text-purple-300 border-purple-500/40',
  },
  E: {
    title: 'Package / peg margin preview',
    blurb:
      'Retail pay price vs Fixed Peg liability. Purchase $ is never forced to coins×peg.',
    accent: 'text-cyan-300 border-cyan-500/40',
  },
  F: {
    title: 'Legacy / deprecated knobs',
    blurb: 'Derived or alternate controls — do not delete DB columns yet.',
    accent: 'text-slate-300 border-slate-600',
  },
};

/**
 * Must live outside AdminEconomyConfigHub. Defining it inside remounts every section
 * (and its inputs) on each parent re-render → focus loss + page jump on click/type.
 */
const EconomySectionShell: React.FC<{
  id: EconomySectionId;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ id, open, onToggle, children }) => {
  const meta = SECTION_META[id];
  return (
    <section
      id={`economy-section-${id}`}
      className={`rounded-2xl border bg-slate-950/50 scroll-mt-4 ${meta.accent.split(' ')[1] || 'border-slate-800'}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-3 p-4 text-left cursor-pointer hover:bg-slate-900/40 rounded-2xl"
      >
        <div>
          <div className={`text-sm font-black ${meta.accent.split(' ')[0]}`}>
            {id}. {meta.title}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{meta.blurb}</p>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
        )}
      </button>
      {open && <div className="px-4 pb-4 space-y-4 border-t border-slate-800/80 pt-4">{children}</div>}
    </section>
  );
};

export const AdminEconomyConfigHub: React.FC<AdminEconomyConfigHubProps> = ({
  initialSection,
  onOpenSkuBundles,
  onOpenGiftsCatalog,
}) => {
  const { systemSettings, updateSystemSettings, showToast, coinPackages } = useApp();

  const [coinBurnRate, setCoinBurnRate] = useState(
    systemSettings.coinBurnRatePerMin ?? DEFAULT_COIN_BURN_RATE_PER_MIN
  );
  const [coinBurnRateFriend, setCoinBurnRateFriend] = useState(
    systemSettings.coinBurnRateFriendPerMin ?? DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN
  );
  const [femaleHostSharePercent, setFemaleHostSharePercent] = useState(
    systemSettings.femaleHostSharePercent ?? DEFAULT_FEMALE_HOST_SHARE_PERCENT
  );
  const [femaleHostTargetSharePercent, setFemaleHostTargetSharePercent] = useState(
    systemSettings.femaleHostTargetSharePercent ?? DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT
  );
  const [teamLeaderSharePercent, setTeamLeaderSharePercent] = useState(
    systemSettings.teamLeaderSharePercent ?? DEFAULT_TEAM_LEADER_SHARE_PERCENT
  );
  const [giftFemaleHostSharePercent, setGiftFemaleHostSharePercent] = useState(
    systemSettings.giftFemaleHostSharePercent ?? DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT
  );
  const [giftTeamLeaderSharePercent, setGiftTeamLeaderSharePercent] = useState(
    systemSettings.giftTeamLeaderSharePercent ?? DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT
  );
  const [enableVirtualGifts, setEnableVirtualGifts] = useState(
    systemSettings.enableVirtualGifts !== false
  );
  const [coinUsdPeg, setCoinUsdPeg] = useState(getCoinUsdPeg(systemSettings));
  const [minPayout, setMinPayout] = useState(systemSettings.minPayoutThresholdUSD ?? 50);
  const [enableRegularFemaleCoinEarning, setEnableRegularFemaleCoinEarning] = useState(
    systemSettings.enableRegularFemaleCoinEarning ?? false
  );
  const [quickMatchFreeEnabled, setQuickMatchFreeEnabled] = useState(
    systemSettings.quickMatchFreeEnabled !== false
  );
  const [quickMatchTimerSeconds, setQuickMatchTimerSeconds] = useState(
    systemSettings.quickMatchTimerSeconds || 5
  );
  const [quickMatchGiftRose, setQuickMatchGiftRose] = useState(
    systemSettings.quickMatchGiftPrices?.rose || 10
  );
  const [quickMatchGiftHeart, setQuickMatchGiftHeart] = useState(
    systemSettings.quickMatchGiftPrices?.heart || 25
  );
  const [quickMatchGiftCheers, setQuickMatchGiftCheers] = useState(
    systemSettings.quickMatchGiftPrices?.cheers || 50
  );
  const [quickMatchGiftTiara, setQuickMatchGiftTiara] = useState(
    systemSettings.quickMatchGiftPrices?.tiara || 100
  );
  const [quickMatchGiftDiamond, setQuickMatchGiftDiamond] = useState(
    systemSettings.quickMatchGiftPrices?.diamond || 200
  );
  const [quickMatchGiftRocket, setQuickMatchGiftRocket] = useState(
    systemSettings.quickMatchGiftPrices?.rocket || 500
  );
  const [quickMatchSplitCreator, setQuickMatchSplitCreator] = useState(
    systemSettings.quickMatchGiftSplitFemaleCreator ?? 60
  );
  const [quickMatchSplitTL, setQuickMatchSplitTL] = useState(
    systemSettings.quickMatchGiftSplitTL ?? 10
  );
  const [quickMatchAutoFallback, setQuickMatchAutoFallback] = useState(
    systemSettings.quickMatchAutoFallbackOnlineCreators !== false
  );

  const [streakRewards, setStreakRewards] = useState<number[]>(
    systemSettings.dailyStreakRewards || [10, 15, 20, 25, 35, 50, 100]
  );
  const [missionsConfig, setMissionsConfig] = useState(
    systemSettings.dailyMissionsConfig || {
      chatFriends: { target: 3, reward: 25, enabled: true },
      quickMatches: { target: 10, reward: 30, enabled: true },
      videoCall: { target: 60, reward: 35, enabled: true },
      momentInteract: { target: 3, reward: 15, enabled: true },
      sendGift: { target: 1, reward: 20, enabled: true },
      masterChest: { target: 4, reward: 50, enabled: true },
    }
  );

  const [expanded, setExpanded] = useState<Record<EconomySectionId, boolean>>(() => {
    const base = Object.fromEntries(SECTION_IDS.map((id) => [id, id !== 'F'])) as Record<
      EconomySectionId,
      boolean
    >;
    if (initialSection) base[initialSection] = true;
    return base;
  });

  useEffect(() => {
    setCoinBurnRate(systemSettings.coinBurnRatePerMin ?? DEFAULT_COIN_BURN_RATE_PER_MIN);
    setCoinBurnRateFriend(
      systemSettings.coinBurnRateFriendPerMin ?? DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN
    );
    setFemaleHostSharePercent(
      systemSettings.femaleHostSharePercent ?? DEFAULT_FEMALE_HOST_SHARE_PERCENT
    );
    setFemaleHostTargetSharePercent(
      systemSettings.femaleHostTargetSharePercent ?? DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT
    );
    setTeamLeaderSharePercent(
      systemSettings.teamLeaderSharePercent ?? DEFAULT_TEAM_LEADER_SHARE_PERCENT
    );
    setGiftFemaleHostSharePercent(
      systemSettings.giftFemaleHostSharePercent ?? DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT
    );
    setGiftTeamLeaderSharePercent(
      systemSettings.giftTeamLeaderSharePercent ?? DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT
    );
    setEnableVirtualGifts(systemSettings.enableVirtualGifts !== false);
    setCoinUsdPeg(getCoinUsdPeg(systemSettings));
    setMinPayout(systemSettings.minPayoutThresholdUSD ?? 50);
    setQuickMatchFreeEnabled(systemSettings.quickMatchFreeEnabled !== false);
    setQuickMatchTimerSeconds(systemSettings.quickMatchTimerSeconds || 5);
    setQuickMatchGiftRose(systemSettings.quickMatchGiftPrices?.rose || 10);
    setQuickMatchGiftHeart(systemSettings.quickMatchGiftPrices?.heart || 25);
    setQuickMatchGiftCheers(systemSettings.quickMatchGiftPrices?.cheers || 50);
    setQuickMatchGiftTiara(systemSettings.quickMatchGiftPrices?.tiara || 100);
    setQuickMatchGiftDiamond(systemSettings.quickMatchGiftPrices?.diamond || 200);
    setQuickMatchGiftRocket(systemSettings.quickMatchGiftPrices?.rocket || 500);
    setQuickMatchSplitCreator(systemSettings.quickMatchGiftSplitFemaleCreator ?? 60);
    setQuickMatchSplitTL(systemSettings.quickMatchGiftSplitTL ?? 10);
    setQuickMatchAutoFallback(systemSettings.quickMatchAutoFallbackOnlineCreators !== false);
    if (systemSettings.dailyStreakRewards?.length) setStreakRewards(systemSettings.dailyStreakRewards);
    if (systemSettings.dailyMissionsConfig) setMissionsConfig(systemSettings.dailyMissionsConfig);
  }, [
    systemSettings.coinBurnRatePerMin,
    systemSettings.coinBurnRateFriendPerMin,
    systemSettings.femaleHostSharePercent,
    systemSettings.femaleHostTargetSharePercent,
    systemSettings.teamLeaderSharePercent,
    systemSettings.giftFemaleHostSharePercent,
    systemSettings.giftTeamLeaderSharePercent,
    systemSettings.enableVirtualGifts,
    systemSettings.coinUsdPeg,
    systemSettings.femalePayoutRatioUSD,
    systemSettings.coinToUSDRatio,
    systemSettings.minPayoutThresholdUSD,
    systemSettings.quickMatchFreeEnabled,
    systemSettings.quickMatchTimerSeconds,
    systemSettings.quickMatchGiftPrices,
    systemSettings.quickMatchGiftSplitFemaleCreator,
    systemSettings.quickMatchGiftSplitTL,
    systemSettings.quickMatchAutoFallbackOnlineCreators,
    systemSettings.dailyStreakRewards,
    systemSettings.dailyMissionsConfig,
  ]);

  useEffect(() => {
    if (systemSettings.enableRegularFemaleCoinEarning !== undefined) {
      setEnableRegularFemaleCoinEarning(systemSettings.enableRegularFemaleCoinEarning);
    }
  }, [systemSettings.enableRegularFemaleCoinEarning]);

  useEffect(() => {
    if (!initialSection) return;
    setExpanded((prev) => ({ ...prev, [initialSection]: true }));
    // Deep-link scroll only — never on every re-render of settings
    const el = document.getElementById(`economy-section-${initialSection}`);
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
    return () => window.clearTimeout(t);
  }, [initialSection]);

  const derivedHostEarnPerMin = useMemo(
    () =>
      deriveHostEarnPerMin(
        Number(coinBurnRate) || DEFAULT_COIN_BURN_RATE_PER_MIN,
        Number(femaleHostSharePercent) || DEFAULT_FEMALE_HOST_SHARE_PERCENT
      ),
    [coinBurnRate, femaleHostSharePercent]
  );
  const derivedHostTargetEarnPerMin = useMemo(
    () =>
      deriveHostEarnPerMin(
        Number(coinBurnRate) || DEFAULT_COIN_BURN_RATE_PER_MIN,
        Number(femaleHostTargetSharePercent) || DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT
      ),
    [coinBurnRate, femaleHostTargetSharePercent]
  );

  const callPlatformPctBase = Math.max(
    0,
    100 - Number(femaleHostSharePercent || 0) - Number(teamLeaderSharePercent || 0)
  );
  const callPlatformPctTarget = Math.max(
    0,
    100 - Number(femaleHostTargetSharePercent || 0) - Number(teamLeaderSharePercent || 0)
  );
  const giftPlatformPct = Math.max(
    0,
    100 - Number(giftFemaleHostSharePercent || 0) - Number(giftTeamLeaderSharePercent || 0)
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const standardRate = Number(coinBurnRate) || DEFAULT_COIN_BURN_RATE_PER_MIN;
    const hostShare = Number(femaleHostSharePercent) || DEFAULT_FEMALE_HOST_SHARE_PERCENT;
    const hostTargetShare =
      Number(femaleHostTargetSharePercent) || DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT;
    const derivedHostRate = deriveHostEarnPerMin(standardRate, hostShare);

    updateSystemSettings({
      coinBurnRatePerMin: standardRate,
      coinBurnRateFriendPerMin:
        Number(coinBurnRateFriend) || DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
      femaleHostSharePercent: hostShare,
      femaleHostTargetSharePercent: hostTargetShare,
      teamLeaderSharePercent:
        Number(teamLeaderSharePercent) || DEFAULT_TEAM_LEADER_SHARE_PERCENT,
      giftFemaleHostSharePercent:
        Number(giftFemaleHostSharePercent) || DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
      giftTeamLeaderSharePercent:
        Number(giftTeamLeaderSharePercent) || DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
      enableVirtualGifts: Boolean(enableVirtualGifts),
      // Legacy derived display only — burn path does not read this
      femaleEarningRatePerMin: derivedHostRate,
      coinUsdPeg: Number(coinUsdPeg) || DEFAULT_COIN_USD_PEG,
      // Legacy dual-FX columns synced to peg for backward-compat readers
      coinToUSDRatio: Number(coinUsdPeg) || DEFAULT_COIN_USD_PEG,
      femalePayoutRatioUSD: Number(coinUsdPeg) || DEFAULT_COIN_USD_PEG,
      minPayoutThresholdUSD: Number(minPayout) || 50,
      enableRegularFemaleCoinEarning: Boolean(enableRegularFemaleCoinEarning),
      quickMatchFreeEnabled: Boolean(quickMatchFreeEnabled),
      quickMatchTimerSeconds: Number(quickMatchTimerSeconds) || 5,
      quickMatchGiftPrices: {
        rose: Number(quickMatchGiftRose) || 10,
        heart: Number(quickMatchGiftHeart) || 25,
        cheers: Number(quickMatchGiftCheers) || 50,
        tiara: Number(quickMatchGiftTiara) || 100,
        diamond: Number(quickMatchGiftDiamond) || 200,
        rocket: Number(quickMatchGiftRocket) || 500,
      },
      quickMatchGiftSplitFemaleCreator: Number(quickMatchSplitCreator) || 60,
      quickMatchGiftSplitTL: Number(quickMatchSplitTL) || 10,
      quickMatchGiftSplitPlatform: Math.max(
        0,
        100 - (Number(quickMatchSplitCreator) || 60) - (Number(quickMatchSplitTL) || 10)
      ),
      quickMatchAutoFallbackOnlineCreators: Boolean(quickMatchAutoFallback),
      dailyStreakRewards: streakRewards,
      dailyMissionsConfig: missionsConfig,
    });

    showToast(
      'Economy Settings Saved',
      'Burn rates, shares, peg, and legacy engagement knobs updated.',
      'success'
    );
  };

  const toggleSection = (id: EconomySectionId) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-white flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            <span>Coin Burn / Economy Config</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Sole editor for global coin economy (burn, shares, Fixed Peg). Other admin tabs show
            read-only snapshots with links here. Rates only — not the cash book. Use Financial Module for
            Funding, Live ledger, and Settlement. Gift SKUs stay under Virtual Gifts; share % live in §C.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
          {SECTION_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setExpanded((prev) => ({ ...prev, [id]: true }));
                document
                  .getElementById(`economy-section-${id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:border-amber-500/50 hover:text-amber-200 cursor-pointer"
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* A — Burn rates */}
        <EconomySectionShell id="A" open={expanded.A} onToggle={() => toggleSection('A')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-amber-300" htmlFor="admin-coin-burn-rate-input">
                Standard burn — non-friends (coins / min)
              </label>
              <input
                id="admin-coin-burn-rate-input"
                type="number"
                min="1"
                step="1"
                value={coinBurnRate}
                onChange={(e) => setCoinBurnRate(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-400"
              />
              <p className="text-[11px] text-slate-400">Male caller burn on regular non-friend calls.</p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-emerald-500/30 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-emerald-300" htmlFor="admin-coin-burn-rate-friend-input">
                Friend burn — friends (coins / min)
              </label>
              <input
                id="admin-coin-burn-rate-friend-input"
                type="number"
                min="1"
                step="1"
                value={coinBurnRateFriend}
                onChange={(e) => setCoinBurnRateFriend(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-emerald-500/40 rounded-xl text-sm font-bold text-emerald-300 focus:outline-none focus:border-emerald-400"
              />
              <p className="text-[11px] text-slate-400">Discounted burn when friendship is active.</p>
            </div>
          </div>
        </EconomySectionShell>

        {/* B — Call shares */}
        <EconomySectionShell id="B" open={expanded.B} onToggle={() => toggleSection('B')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/80 border border-pink-500/30 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-pink-300">Host base share (%)</label>
              <div className="relative">
                <input
                  id="admin-female-host-share-percent-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={femaleHostSharePercent}
                  onChange={(e) => setFemaleHostSharePercent(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-pink-500/40 rounded-xl text-sm font-bold text-pink-300 pr-8 focus:outline-none focus:border-pink-400"
                />
                <span className="absolute right-3 top-2.5 text-pink-400 font-bold text-sm">%</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Live weekly rate on every call burn minute. ≈ {derivedHostEarnPerMin} 🪙/min @ standard burn.
              </p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-rose-500/30 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-rose-300">Female host target share (%)</label>
              <div className="relative">
                <input
                  id="admin-female-host-target-share-percent-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={femaleHostTargetSharePercent}
                  onChange={(e) => setFemaleHostTargetSharePercent(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-rose-500/40 rounded-xl text-sm font-bold text-rose-300 pr-8 focus:outline-none focus:border-rose-400"
                />
                <span className="absolute right-3 top-2.5 text-rose-400 font-bold text-sm">%</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Applied at period END via true-up if bronze+ hours AND coins met (Phase 3). Not used mid-call.
                Effective ≈ {derivedHostTargetEarnPerMin} 🪙/min @ standard after true-up.
              </p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-indigo-500/30 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-indigo-300">Agency share (%)</label>
              <div className="relative">
                <input
                  id="admin-team-leader-share-percent-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={teamLeaderSharePercent}
                  onChange={(e) => setTeamLeaderSharePercent(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-indigo-500/40 rounded-xl text-sm font-bold text-indigo-300 pr-8 focus:outline-none focus:border-indigo-400"
                />
                <span className="absolute right-3 top-2.5 text-indigo-400 font-bold text-sm">%</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Static % of burn for the whole period when host has a linked TL. No TL true-up.
              </p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-emerald-500/30 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-emerald-300">Platform (implied)</label>
              <div className="px-3.5 py-2.5 bg-slate-950 border border-emerald-500/40 rounded-xl text-sm font-bold text-emerald-300 space-y-1">
                <div>Base: {callPlatformPctBase}%</div>
                <div>Target: {callPlatformPctTarget}%</div>
              </div>
              <p className="text-[11px] text-slate-400">100 − host − TL (read-only).</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p>
              <span className="text-amber-300 font-bold">Per-host override (admin Users only):</span> set{' '}
              <code className="text-slate-300">coin_earn_override_rate</code> as absolute host coins/min
              (ignores share %). TL % still applies from burn when TL linked. Host+TL clamped ≤ burn. If
              override &gt; 0 on the profile at period close, share true-up is skipped for that host. Team
              Leaders and creators cannot edit global burn/share/peg — only this Economy hub can.
            </p>
            <p>
              <span className="text-slate-300 font-bold">female_earning_rate_per_min</span> is legacy derived
              display only — burn path does not read it.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2">Scenario</th>
                  <th className="px-3 py-2">Burn</th>
                  <th className="px-3 py-2">Host</th>
                  <th className="px-3 py-2">TL</th>
                  <th className="px-3 py-2">Platform</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Std · live (base %)', coinBurnRate, femaleHostSharePercent],
                    ['Friend · live (base %)', coinBurnRateFriend, femaleHostSharePercent],
                    [
                      'Std · after true-up (target %)*',
                      coinBurnRate,
                      femaleHostTargetSharePercent,
                    ],
                    [
                      'Friend · after true-up (target %)*',
                      coinBurnRateFriend,
                      femaleHostTargetSharePercent,
                    ],
                  ] as const
                ).map(([label, burn, hostPct]) => {
                  const split = computeCallMinuteSplit({
                    coinsBurned: Number(burn) || 0,
                    hostSharePercent: Number(hostPct) || 0,
                    tlSharePercent: Number(teamLeaderSharePercent) || 0,
                    hasTeamLeader: true,
                  });
                  return (
                    <tr key={label} className="border-t border-slate-800/80 text-slate-200">
                      <td className="px-3 py-2 font-semibold text-white">{label}</td>
                      <td className="px-3 py-2 font-mono text-amber-300">{split.coinsBurned}</td>
                      <td className="px-3 py-2 font-mono text-pink-300">
                        {split.hostCoins} ({hostPct}%)
                      </td>
                      <td className="px-3 py-2 font-mono text-indigo-300">
                        {split.tlCoins} ({teamLeaderSharePercent}%)
                      </td>
                      <td className="px-3 py-2 font-mono text-emerald-300">{split.platformCoins}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-800/80">
              * Illustrative effective host % after period-end true-up if bronze+ met. Live minutes always use
              base %. TL stays static (no true-up).
            </p>
          </div>
        </EconomySectionShell>

        {/* C — Gift shares */}
        <EconomySectionShell id="C" open={expanded.C} onToggle={() => toggleSection('C')}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <p className="text-[11px] text-slate-400">
              Catalog SKUs (name, coin cost, icons) stay on Virtual Gifts. Share % editable here only.
              USD uses Fixed Peg (section D).
            </p>
            {onOpenGiftsCatalog && (
              <button
                type="button"
                onClick={onOpenGiftsCatalog}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-pink-500/15 text-pink-300 border border-pink-500/30 cursor-pointer"
              >
                Open gifts catalog →
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/80 border border-pink-500/30 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-pink-300">Gift host share (%)</label>
              <div className="relative">
                <input
                  id="admin-gift-female-host-share-percent-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={giftFemaleHostSharePercent}
                  onChange={(e) => setGiftFemaleHostSharePercent(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-pink-500/40 rounded-xl text-sm font-bold text-pink-300 pr-8 focus:outline-none focus:border-pink-400"
                />
                <span className="absolute right-3 top-2.5 text-pink-400 font-bold text-sm">%</span>
              </div>
            </div>
            <div className="p-4 bg-slate-900/80 border border-indigo-500/30 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-indigo-300">Gift TL share (%)</label>
              <div className="relative">
                <input
                  id="admin-gift-team-leader-share-percent-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={giftTeamLeaderSharePercent}
                  onChange={(e) => setGiftTeamLeaderSharePercent(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-indigo-500/40 rounded-xl text-sm font-bold text-indigo-300 pr-8 focus:outline-none focus:border-indigo-400"
                />
                <span className="absolute right-3 top-2.5 text-indigo-400 font-bold text-sm">%</span>
              </div>
            </div>
            <div className="p-4 bg-slate-900/80 border border-emerald-500/30 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-emerald-300">Platform (implied)</label>
              <div className="px-3.5 py-2.5 bg-slate-950 border border-emerald-500/40 rounded-xl text-sm font-bold text-emerald-300">
                {giftPlatformPct}%
              </div>
              <p className="text-[11px] text-slate-400">
                100 − host − TL. Ledger: GIFT_DEBIT + HOST_EARN/TL_EARN (kind=gift).
              </p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-amber-300">Virtual gifts switch</label>
              <button
                type="button"
                id="admin-toggle-enable-gifts-btn"
                onClick={() => setEnableVirtualGifts(!enableVirtualGifts)}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 border cursor-pointer ${
                  enableVirtualGifts
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                    : 'bg-rose-900/30 border-rose-700 text-rose-300'
                }`}
              >
                <Gift className="w-4 h-4" />
                <span>{enableVirtualGifts ? 'Gifts enabled' : 'Gifts disabled'}</span>
              </button>
            </div>
          </div>

          {(() => {
            const sample = computeGiftCoinSplit({
              giftCost: 100,
              hostSharePercent: Number(giftFemaleHostSharePercent) || 0,
              tlSharePercent: Number(giftTeamLeaderSharePercent) || 0,
              hasTeamLeader: true,
              hostEligible: true,
            });
            const peg = Number(coinUsdPeg) || DEFAULT_COIN_USD_PEG;
            return (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Sample gift</th>
                      <th className="px-3 py-2">Burn</th>
                      <th className="px-3 py-2">Host</th>
                      <th className="px-3 py-2">TL</th>
                      <th className="px-3 py-2">Platform</th>
                      <th className="px-3 py-2">Host USD @ peg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-800 text-slate-200">
                      <td className="px-3 py-2 font-semibold">100 🪙 gift · TL linked</td>
                      <td className="px-3 py-2 font-mono">{sample.giftCost}</td>
                      <td className="px-3 py-2 font-mono text-pink-300">{sample.hostCoins}</td>
                      <td className="px-3 py-2 font-mono text-indigo-300">{sample.tlCoins}</td>
                      <td className="px-3 py-2 font-mono text-emerald-300">{sample.platformCoins}</td>
                      <td className="px-3 py-2 font-mono text-amber-200">
                        ${coinsToUsd(sample.hostCoins, peg).toFixed(4)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}
        </EconomySectionShell>

        {/* D — Fixed Peg & thresholds */}
        <EconomySectionShell id="D" open={expanded.D} onToggle={() => toggleSection('D')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/80 border border-amber-500/30 rounded-2xl space-y-2 sm:col-span-2">
              <label className="block text-xs font-bold text-amber-300">
                Fixed Peg — coin_usd_peg ($ USD per coin)
              </label>
              <input
                id="admin-coin-usd-peg-input"
                type="number"
                min="0.0001"
                step="any"
                value={coinUsdPeg}
                onChange={(e) => setCoinUsdPeg(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-amber-500/40 rounded-xl text-sm font-bold text-amber-200 focus:outline-none focus:border-amber-400"
              />
              <p className="text-[11px] text-slate-300 font-mono">
                Example: {formatPegExample(coinUsdPeg || DEFAULT_COIN_USD_PEG)}
              </p>
              <p className="text-[11px] text-slate-400">
                Any positive $/coin (e.g. 0.0031). Independent of package retail price.
              </p>
              <p className="text-[11px] text-slate-400">
                One rate for host, TL, and platform coin→USD. Package <code className="text-slate-300">price_usd</code> stays
                the purchase amount (not forced to coins×peg).
              </p>
            </div>
            <div className="p-4 bg-slate-900/80 border border-emerald-500/30 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-emerald-300">Min withdrawal ($ USD)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-emerald-400 font-bold text-sm">$</span>
                <input
                  id="admin-min-payout-threshold-input"
                  type="number"
                  min="1"
                  step="1"
                  value={minPayout}
                  onChange={(e) => setMinPayout(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-emerald-500/40 rounded-xl text-sm font-bold text-emerald-300 pl-8 focus:outline-none focus:border-emerald-400"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                ≈{' '}
                {usdToCoins(Number(minPayout) || 50, coinUsdPeg || DEFAULT_COIN_USD_PEG).toLocaleString()}{' '}
                🪙 at current peg.
              </p>
            </div>
            <div className="p-4 bg-slate-900/60 border border-slate-700 rounded-2xl space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
                Legacy dual FX (read-only, synced)
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-600">
                  DEPRECATED
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">female_payout_ratio_usd</div>
                  <div className="text-slate-200 font-bold">{Number(coinUsdPeg) || DEFAULT_COIN_USD_PEG}</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">coin_to_usd_ratio</div>
                  <div className="text-slate-200 font-bold">{Number(coinUsdPeg) || DEFAULT_COIN_USD_PEG}</div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Saved equal to peg for old readers. Do not edit separately.
              </p>
            </div>
          </div>
        </EconomySectionShell>

        {/* E — Package margin preview */}
        <EconomySectionShell id="E" open={expanded.E} onToggle={() => toggleSection('E')}>
          <div className="space-y-2 mb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-cyan-400" />
                Read-only ops preview. Edit SKU retail prices on Coin Packages; peg in section D.
              </p>
              {onOpenSkuBundles && (
                <button
                  type="button"
                  onClick={onOpenSkuBundles}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 cursor-pointer"
                >
                  Open SKU Bundles →
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-400">
                <span className="font-bold text-cyan-300">Fixed Peg</span> — host/TL/platform coin→USD
                liability ({formatPegExample(Number(coinUsdPeg) || DEFAULT_COIN_USD_PEG)}). Used at
                purchase snapshot for peg_value_usd.
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-400">
                <span className="font-bold text-amber-300">Retail package price</span> — what the buyer
                pays (discount ?? list). Independent of peg; checkout still credits coins + bonus.
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2">Package</th>
                  <th className="px-3 py-2">Coins</th>
                  <th className="px-3 py-2">Pay $</th>
                  <th className="px-3 py-2">Peg value $</th>
                  <th className="px-3 py-2">Load margin $</th>
                  <th className="px-3 py-2">~Std mins</th>
                </tr>
              </thead>
              <tbody>
                {(coinPackages as CoinPackage[]).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500 text-center">
                      No SKUs loaded.
                    </td>
                  </tr>
                ) : (
                  (coinPackages as CoinPackage[]).map((pkg) => {
                    const total = pkgTotalCoins(pkg);
                    const pay = payPriceUSD(pkg);
                    const pegPer = Number(coinUsdPeg) || DEFAULT_COIN_USD_PEG;
                    const pegVal = pegValueUSD(pkg, pegPer);
                    const margin = loadMarginUSD(pkg, pegPer);
                    const mins = Math.floor(
                      total / (Number(coinBurnRate) || DEFAULT_COIN_BURN_RATE_PER_MIN)
                    );
                    return (
                      <tr key={pkg.id} className="border-t border-slate-800/80 text-slate-200">
                        <td className="px-3 py-2 font-semibold text-white">{pkg.title}</td>
                        <td className="px-3 py-2 font-mono text-amber-300">{total}</td>
                        <td className="px-3 py-2 font-mono">${pay.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono text-cyan-300">${pegVal.toFixed(2)}</td>
                        <td
                          className={`px-3 py-2 font-mono font-bold ${
                            margin >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {margin >= 0 ? '+' : ''}
                          {margin.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-400">{mins}m</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Load margin = payPriceUSD − (totalCoins × peg). Positive means retail above peg liability.
            List price
            {coinPackages[0] ? ` (e.g. $${listPriceUSD(coinPackages[0]).toFixed(2)})` : ''} is only
            used when no discount. Funding rows snapshot peg at purchase time.
          </p>
        </EconomySectionShell>

        {/* F — Legacy */}
        <EconomySectionShell id="F" open={expanded.F} onToggle={() => toggleSection('F')}>
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              These knobs are legacy, derived, or engagement-adjacent. Prefer sections A–D for peg /
              burn. Columns remain in DB; do not remove yet.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5" />
                femaleEarningRatePerMin (derived, read-only)
              </label>
              <div className="px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold text-slate-300 font-mono">
                {derivedHostEarnPerMin} 🪙/min
              </div>
              <p className="text-[11px] text-slate-500">
                Auto = standard burn × host base %. Written on save for legacy UI only —{' '}
                <strong className="text-slate-400">not used by burn_call_coins_atomic / call burn</strong>.
                Prefer share % in section B. Per-host absolute override:{' '}
                <code className="text-slate-400">coin_earn_override_rate</code>.
              </p>
            </div>

            <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-slate-400">Virtual gifts switch</label>
              <p className="text-[11px] text-slate-500">
                Moved to section <span className="text-rose-300 font-bold">C</span> (Gift / tip shares).
              </p>
            </div>

            <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-2xl space-y-3 sm:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    Regular female coin earning
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    When off, earning/payout UI is reserved for TL-managed hosts.
                  </p>
                </div>
                <button
                  type="button"
                  id="admin-toggle-regular-female-earning-btn"
                  onClick={() => {
                    const next = !enableRegularFemaleCoinEarning;
                    setEnableRegularFemaleCoinEarning(next);
                    updateSystemSettings({ enableRegularFemaleCoinEarning: next });
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border cursor-pointer ${
                    enableRegularFemaleCoinEarning
                      ? 'bg-emerald-600 border-emerald-400 text-white'
                      : 'bg-slate-900 border-amber-500/50 text-amber-300'
                  }`}
                >
                  {enableRegularFemaleCoinEarning ? 'Enabled' : 'Disabled (hosts only)'}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Match — legacy alternate economy */}
          <div className="p-4 bg-gradient-to-br from-slate-950 via-rose-950/15 to-slate-950 border border-rose-500/25 rounded-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-black text-white">
                Quick Match gift prices & splits (legacy alternate)
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                LEGACY
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Separate from catalog gift shares (section C). Prefer aligning to C in a later phase.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                <label className="text-xs font-bold text-slate-200">Free Quick Matching</label>
                <button
                  type="button"
                  onClick={() => setQuickMatchFreeEnabled(!quickMatchFreeEnabled)}
                  className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                    quickMatchFreeEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {quickMatchFreeEnabled ? 'Free matching on' : 'Paid matching only'}
                </button>
              </div>
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-200">
                  <span>Decision timer</span>
                  <span className="font-mono text-amber-400">{quickMatchTimerSeconds}s</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="15"
                  step="1"
                  value={quickMatchTimerSeconds}
                  onChange={(e) => setQuickMatchTimerSeconds(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                <label className="text-xs font-bold text-slate-200">Fallback matching</label>
                <button
                  type="button"
                  onClick={() => setQuickMatchAutoFallback(!quickMatchAutoFallback)}
                  className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                    quickMatchAutoFallback
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {quickMatchAutoFallback ? 'Auto-fallback on' : 'Live studio only'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs font-mono">
              {(
                [
                  ['🌹', quickMatchGiftRose, setQuickMatchGiftRose],
                  ['💖', quickMatchGiftHeart, setQuickMatchGiftHeart],
                  ['🥂', quickMatchGiftCheers, setQuickMatchGiftCheers],
                  ['👑', quickMatchGiftTiara, setQuickMatchGiftTiara],
                  ['💎', quickMatchGiftDiamond, setQuickMatchGiftDiamond],
                  ['🚀', quickMatchGiftRocket, setQuickMatchGiftRocket],
                ] as const
              ).map(([label, val, setter], i) => (
                <div key={i} className="p-2 bg-slate-900/80 border border-slate-800 rounded-lg text-center">
                  <span className="text-base block mb-1">{label}</span>
                  <input
                    type="number"
                    min="1"
                    value={val}
                    onChange={(e) => setter(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-center text-amber-300 font-bold"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-pink-300 font-bold block mb-1">QM creator %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={quickMatchSplitCreator}
                  onChange={(e) => setQuickMatchSplitCreator(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-pink-500/40 rounded-lg text-pink-300 font-bold text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-indigo-300 font-bold block mb-1">QM TL %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={quickMatchSplitTL}
                  onChange={(e) => setQuickMatchSplitTL(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-indigo-500/40 rounded-lg text-indigo-300 font-bold text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-emerald-300 font-bold block mb-1">QM platform %</label>
                <div className="px-3 py-1.5 bg-slate-950 border border-emerald-500/40 rounded-lg text-emerald-300 font-bold text-xs">
                  {Math.max(0, 100 - quickMatchSplitCreator - quickMatchSplitTL)}%
                </div>
              </div>
            </div>
          </div>

          {/* Daily rewards — engagement coins */}
          <div className="p-4 border border-amber-500/25 rounded-2xl space-y-3 bg-slate-950/60">
            <div className="text-xs font-black text-white flex items-center gap-2">
              <Gift className="w-4 h-4 text-amber-400" />
              Daily streak & missions (engagement coin grants)
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                LEGACY / ENGAGEMENT
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => (
                <div key={dayIdx} className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-1">
                  <span className="text-[10px] font-mono font-bold text-slate-400 block">
                    Day {dayIdx + 1}
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={streakRewards[dayIdx] || 20}
                    onChange={(e) => {
                      const copy = [...streakRewards];
                      copy[dayIdx] = Number(e.target.value) || 1;
                      setStreakRewards(copy);
                    }}
                    className="w-full px-2 py-1 bg-slate-950 border border-amber-500/40 rounded text-center text-amber-300 font-black text-xs font-mono"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(
                [
                  ['chatFriends', 'Chat friends'],
                  ['quickMatches', 'Quick matches'],
                  ['videoCall', 'Video call (sec)'],
                  ['momentInteract', 'Moments'],
                  ['sendGift', 'Send gift'],
                  ['masterChest', 'Master chest'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl grid grid-cols-2 gap-2 text-xs">
                  <div className="col-span-2 text-[10px] font-bold text-slate-300">{label}</div>
                  <div>
                    <label className="text-[9px] text-slate-500">Target</label>
                    <input
                      type="number"
                      min="1"
                      value={(missionsConfig as any)[key]?.target || 1}
                      onChange={(e) =>
                        setMissionsConfig((prev: any) => ({
                          ...prev,
                          [key]: {
                            ...prev[key],
                            target: Number(e.target.value) || 1,
                            reward: prev[key]?.reward || 10,
                            enabled: true,
                          },
                        }))
                      }
                      className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500">Reward 🪙</label>
                    <input
                      type="number"
                      min="1"
                      value={(missionsConfig as any)[key]?.reward || 10}
                      onChange={(e) =>
                        setMissionsConfig((prev: any) => ({
                          ...prev,
                          [key]: {
                            ...prev[key],
                            target: prev[key]?.target || 1,
                            reward: Number(e.target.value) || 10,
                            enabled: true,
                          },
                        }))
                      }
                      className="w-full px-2 py-1 bg-slate-950 border border-amber-500/40 rounded text-amber-300 font-mono font-bold"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </EconomySectionShell>

        <div className="pt-1">
          <button
            type="submit"
            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all"
          >
            Save Coin Burn / Economy Config
          </button>
        </div>
      </form>
    </div>
  );
};
