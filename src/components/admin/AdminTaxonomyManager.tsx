import React, { useState, useMemo, useEffect } from 'react';
import {
  Globe,
  Languages,
  Sparkles,
  Heart,
  Search,
  CheckSquare,
  Square,
  ShieldCheck,
  Save,
  CheckCircle2,
  Filter,
  RefreshCw,
  Sliders,
  Flame,
  Music,
  Palette,
  Gamepad2,
  Coffee,
  HeartPulse,
  Users,
  Layers,
  Ruler,
  Maximize2,
  Eye,
  RotateCcw,
  Banknote,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  ALL_WORLDWIDE_COUNTRIES,
  ALL_LANGUAGES,
  ALL_ZODIAC_SIGNS,
  ALL_INTERESTS,
  INTEREST_CATEGORIES,
  CountryItem,
  DEFAULT_CURRENCIES,
  CurrencyItem,
} from '../../utils/taxonomies';
import { SvgFlag } from '../common/SvgFlag';
import { ZodiacIcon } from '../common/ZodiacIcon';
import { getCategoryIcon } from '../common/InterestSelector';
import { DEFAULT_FLAG_SIZES } from '../../constants/appDefaults';
import { FlagSizesConfig, FlagSizeVariant } from '../../types';

type TaxonomyTab = 'countries' | 'flag_sizes' | 'languages' | 'zodiac' | 'interests' | 'currencies';

interface AdminTaxonomyManagerProps {
  activeTab?: TaxonomyTab;
  onTabChange?: (tab: TaxonomyTab) => void;
  navPlacement?: 'inline' | 'sidebar';
}

export const AdminTaxonomyManager: React.FC<AdminTaxonomyManagerProps> = ({
  activeTab: activeTabProp,
  onTabChange,
  navPlacement = 'inline',
}) => {
  const { systemSettings, updateSystemSettings, showToast, currencyConfigs, saveCurrencyConfigs } = useApp();

  const [activeTabInternal, setActiveTabInternal] = useState<TaxonomyTab>('countries');
  const activeTab = activeTabProp ?? activeTabInternal;
  const setActiveTab = (tab: TaxonomyTab) => {
    onTabChange?.(tab);
    if (activeTabProp === undefined) setActiveTabInternal(tab);
  };
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 0. Dynamic Flag Sizes State
  const [flagSizes, setFlagSizes] = useState<FlagSizesConfig>(() => ({
    ...DEFAULT_FLAG_SIZES,
    ...(systemSettings.flagSizes || {}),
  }));

  const [previewCountryCode, setPreviewCountryCode] = useState<string>('US');

  const handleFlagHeightChange = (variant: keyof FlagSizesConfig, heightVal: number) => {
    const safeHeight = Math.max(8, Math.min(120, heightVal || 18));
    setFlagSizes((prev) => ({
      ...prev,
      [variant]: safeHeight,
    }));
    setHasUnsavedChanges(true);
  };

  const handleResetFlagSizes = () => {
    setFlagSizes(DEFAULT_FLAG_SIZES);
    setHasUnsavedChanges(true);
    showToast('Flag Sizes Reset 🚩', 'Restored recommended default SVG flag dimensions.', 'info');
  };

  // 1. Countries State
  const initialCountryCodes = useMemo(() => {
    if (systemSettings.allowedCountryCodes && systemSettings.allowedCountryCodes.length > 0) {
      return new Set(systemSettings.allowedCountryCodes.map((c) => c.toUpperCase()));
    }
    return new Set(ALL_WORLDWIDE_COUNTRIES.map((c) => c.code.toUpperCase()));
  }, [systemSettings.allowedCountryCodes]);

  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(initialCountryCodes);
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCountryRegion, setSelectedCountryRegion] = useState<string>('all');

  // 2. Languages State
  const initialLanguageCodes = useMemo(() => {
    if (systemSettings.allowedLanguages && systemSettings.allowedLanguages.length > 0) {
      return new Set(systemSettings.allowedLanguages.map((l) => l.toLowerCase()));
    }
    return new Set(ALL_LANGUAGES.map((l) => l.name.toLowerCase()));
  }, [systemSettings.allowedLanguages]);

  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(initialLanguageCodes);
  const [languageSearch, setLanguageSearch] = useState('');
  const [selectedLanguageRegion, setSelectedLanguageRegion] = useState<string>('all');

  // 3. Zodiac Signs State
  const initialZodiacKeys = useMemo(() => {
    if (systemSettings.allowedZodiacSigns && systemSettings.allowedZodiacSigns.length > 0) {
      return new Set(systemSettings.allowedZodiacSigns.map((z) => z.toLowerCase()));
    }
    return new Set(ALL_ZODIAC_SIGNS.map((z) => z.key.toLowerCase()));
  }, [systemSettings.allowedZodiacSigns]);

  const [selectedZodiacs, setSelectedZodiacs] = useState<Set<string>>(initialZodiacKeys);
  const [zodiacSearch, setZodiacSearch] = useState('');
  const [selectedZodiacElement, setSelectedZodiacElement] = useState<string>('all');

  // 4. Interests State
  const initialInterestIds = useMemo(() => {
    if (systemSettings.allowedInterests && systemSettings.allowedInterests.length > 0) {
      return new Set(systemSettings.allowedInterests.map((i) => i.toLowerCase()));
    }
    return new Set(ALL_INTERESTS.map((i) => i.name.toLowerCase()));
  }, [systemSettings.allowedInterests]);

  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(initialInterestIds);
  const [interestSearch, setInterestSearch] = useState('');
  const [selectedInterestCategory, setSelectedInterestCategory] = useState<string>('all');

  // 5. Currencies State (rates + enable)
  const [currencyRows, setCurrencyRows] = useState<CurrencyItem[]>(() =>
    (currencyConfigs?.length ? currencyConfigs : DEFAULT_CURRENCIES).map((c) => ({ ...c }))
  );

  useEffect(() => {
    if (hasUnsavedChanges) return;
    if (currencyConfigs && currencyConfigs.length > 0) {
      setCurrencyRows(currencyConfigs.map((c) => ({ ...c })));
    }
  }, [currencyConfigs, hasUnsavedChanges]);

  // ==========================================
  // FILTERS & COMPUTATIONS
  // ==========================================

  // Countries
  const countryRegions = useMemo(() => {
    const set = new Set<string>();
    ALL_WORLDWIDE_COUNTRIES.forEach((c) => set.add(c.region));
    return ['all', 'Tier 1 Only', ...Array.from(set)];
  }, []);

  const filteredCountries = useMemo(() => {
    return ALL_WORLDWIDE_COUNTRIES.filter((country) => {
      const matchesSearch =
        countrySearch.trim() === '' ||
        country.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        country.code.toLowerCase().includes(countrySearch.toLowerCase());

      if (!matchesSearch) return false;
      if (selectedCountryRegion === 'all') return true;
      if (selectedCountryRegion === 'Tier 1 Only') return country.isTier1;
      return country.region === selectedCountryRegion;
    });
  }, [countrySearch, selectedCountryRegion]);

  // Languages
  const languageRegions = useMemo(() => {
    const set = new Set<string>();
    ALL_LANGUAGES.forEach((l) => l.region && set.add(l.region));
    return ['all', 'Popular (Top) Only', ...Array.from(set)];
  }, []);

  const filteredLanguages = useMemo(() => {
    return ALL_LANGUAGES.filter((lang) => {
      const matchesSearch =
        languageSearch.trim() === '' ||
        lang.name.toLowerCase().includes(languageSearch.toLowerCase()) ||
        lang.nativeName.toLowerCase().includes(languageSearch.toLowerCase()) ||
        lang.code.toLowerCase().includes(languageSearch.toLowerCase());

      if (!matchesSearch) return false;
      if (selectedLanguageRegion === 'all') return true;
      if (selectedLanguageRegion === 'Popular (Top) Only') return lang.popular;
      return lang.region === selectedLanguageRegion;
    });
  }, [languageSearch, selectedLanguageRegion]);

  // Zodiac
  const filteredZodiacs = useMemo(() => {
    return ALL_ZODIAC_SIGNS.filter((z) => {
      const matchesSearch =
        zodiacSearch.trim() === '' ||
        z.name.toLowerCase().includes(zodiacSearch.toLowerCase()) ||
        z.key.toLowerCase().includes(zodiacSearch.toLowerCase()) ||
        z.element.toLowerCase().includes(zodiacSearch.toLowerCase());

      if (!matchesSearch) return false;
      if (selectedZodiacElement === 'all') return true;
      return z.element === selectedZodiacElement;
    });
  }, [zodiacSearch, selectedZodiacElement]);

  // Interests
  const filteredInterests = useMemo(() => {
    return ALL_INTERESTS.filter((item) => {
      const matchesSearch =
        interestSearch.trim() === '' ||
        item.name.toLowerCase().includes(interestSearch.toLowerCase()) ||
        item.category.toLowerCase().includes(interestSearch.toLowerCase());

      if (!matchesSearch) return false;
      if (selectedInterestCategory === 'all') return true;
      return item.category === selectedInterestCategory;
    });
  }, [interestSearch, selectedInterestCategory]);

  // ==========================================
  // TOGGLE HANDLERS
  // ==========================================

  // Country Toggles
  const toggleCountry = (code: string) => {
    const next = new Set(selectedCountries);
    const upper = code.toUpperCase();
    if (next.has(upper)) next.delete(upper);
    else next.add(upper);
    setSelectedCountries(next);
    setHasUnsavedChanges(true);
  };

  const handleSelectAllCountries = () => {
    setSelectedCountries(new Set(ALL_WORLDWIDE_COUNTRIES.map((c) => c.code.toUpperCase())));
    setHasUnsavedChanges(true);
  };

  const handleDeselectAllCountries = () => {
    setSelectedCountries(new Set());
    setHasUnsavedChanges(true);
  };

  const handleSelectTier1OnlyCountries = () => {
    setSelectedCountries(new Set(ALL_WORLDWIDE_COUNTRIES.filter((c) => c.isTier1).map((c) => c.code.toUpperCase())));
    setHasUnsavedChanges(true);
  };

  // Language Toggles
  const toggleLanguage = (langName: string) => {
    const next = new Set(selectedLanguages);
    const lower = langName.toLowerCase();
    if (next.has(lower)) next.delete(lower);
    else next.add(lower);
    setSelectedLanguages(next);
    setHasUnsavedChanges(true);
  };

  const handleSelectAllLanguages = () => {
    setSelectedLanguages(new Set(ALL_LANGUAGES.map((l) => l.name.toLowerCase())));
    setHasUnsavedChanges(true);
  };

  const handleDeselectAllLanguages = () => {
    setSelectedLanguages(new Set());
    setHasUnsavedChanges(true);
  };

  const handleSelectPopularOnlyLanguages = () => {
    setSelectedLanguages(new Set(ALL_LANGUAGES.filter((l) => l.popular).map((l) => l.name.toLowerCase())));
    setHasUnsavedChanges(true);
  };

  // Zodiac Toggles
  const toggleZodiac = (key: string) => {
    const next = new Set(selectedZodiacs);
    const lower = key.toLowerCase();
    if (next.has(lower)) next.delete(lower);
    else next.add(lower);
    setSelectedZodiacs(next);
    setHasUnsavedChanges(true);
  };

  const handleSelectAllZodiacs = () => {
    setSelectedZodiacs(new Set(ALL_ZODIAC_SIGNS.map((z) => z.key.toLowerCase())));
    setHasUnsavedChanges(true);
  };

  const handleDeselectAllZodiacs = () => {
    setSelectedZodiacs(new Set());
    setHasUnsavedChanges(true);
  };

  // Interest Toggles
  const toggleInterest = (name: string) => {
    const next = new Set(selectedInterests);
    const lower = name.toLowerCase();
    if (next.has(lower)) next.delete(lower);
    else next.add(lower);
    setSelectedInterests(next);
    setHasUnsavedChanges(true);
  };

  const handleSelectAllInterests = () => {
    setSelectedInterests(new Set(ALL_INTERESTS.map((i) => i.name.toLowerCase())));
    setHasUnsavedChanges(true);
  };

  const handleDeselectAllInterests = () => {
    setSelectedInterests(new Set());
    setHasUnsavedChanges(true);
  };

  const handleSelectPopularInterests = () => {
    setSelectedInterests(new Set(ALL_INTERESTS.filter((i) => i.popular).map((i) => i.name.toLowerCase())));
    setHasUnsavedChanges(true);
  };

  // ==========================================
  // MASTER SAVE TO SUPABASE & APP CONTEXT
  // ==========================================
  const handleSaveTaxonomies = () => {
    const countryList = Array.from(selectedCountries);
    const languageList = Array.from(selectedLanguages);
    const zodiacList = Array.from(selectedZodiacs);
    const interestList = Array.from(selectedInterests);

    updateSystemSettings({
      allowedCountryCodes: countryList,
      allowedLanguages: languageList,
      allowedZodiacSigns: zodiacList,
      allowedInterests: interestList,
      flagSizes: flagSizes,
    });
    saveCurrencyConfigs(currencyRows);

    setHasUnsavedChanges(false);
    showToast(
      'Taxonomies & Flag Sizes Saved ⚙️',
      `Updated countries, languages, zodiacs, interests, ${currencyRows.filter((c) => c.enabled).length} currencies, and flag sizing.`,
      'success'
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Globe className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-black text-white tracking-wide">
                Global Taxonomies & Attribute Governance
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Configure which countries (with real vector SVG flags), spoken languages, zodiac signs (with SVG astronomical glyphs), and categorized interests are enabled across Onboarding, User Profiles, Discovery Filters, and Swipe Deck.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              id="admin-save-taxonomies-btn"
              type="button"
              onClick={handleSaveTaxonomies}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 shadow-lg transition-all cursor-pointer ${
                hasUnsavedChanges
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/30 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{hasUnsavedChanges ? 'Save Active Taxonomies *' : 'Save Settings'}</span>
            </button>
          </div>
        </div>

        {/* Global Summary Stats */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Countries</div>
            <div className="text-lg font-black text-indigo-400 font-mono mt-0.5">
              {selectedCountries.size} / {ALL_WORLDWIDE_COUNTRIES.length}
            </div>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Languages</div>
            <div className="text-lg font-black text-amber-400 font-mono mt-0.5">
              {selectedLanguages.size} / {ALL_LANGUAGES.length}
            </div>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Zodiacs</div>
            <div className="text-lg font-black text-purple-400 font-mono mt-0.5">
              {selectedZodiacs.size} / {ALL_ZODIAC_SIGNS.length}
            </div>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Interests</div>
            <div className="text-lg font-black text-pink-400 font-mono mt-0.5">
              {selectedInterests.size} / {ALL_INTERESTS.length}
            </div>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Enabled Currencies</div>
            <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
              {currencyRows.filter((c) => c.enabled).length} / {currencyRows.length}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs — hidden when AdminShell sidebar owns L2 */}
      {navPlacement !== 'sidebar' && (
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 overflow-x-auto select-none scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('countries')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'countries'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Countries & Flags ({selectedCountries.size})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('flag_sizes')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'flag_sizes'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Ruler className="w-3.5 h-3.5 text-amber-400" />
            <span>SVG Flag Sizing (Dynamic)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('languages')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'languages'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>Spoken Languages ({selectedLanguages.size})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('zodiac')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'zodiac'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Zodiac Signs & SVGs ({selectedZodiacs.size})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('interests')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'interests'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Categorized Interests ({selectedInterests.size})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('currencies')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'currencies'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Banknote className="w-3.5 h-3.5 text-emerald-400" />
            <span>Currencies ({currencyRows.filter((c) => c.enabled).length})</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. COUNTRIES TAB */}
      {/* ========================================================================= */}
      {activeTab === 'countries' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={handleSelectAllCountries}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Select All ({ALL_WORLDWIDE_COUNTRIES.length})</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAllCountries}
                className="px-3 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Deselect All</span>
              </button>
              <button
                type="button"
                onClick={handleSelectTier1OnlyCountries}
                className="px-3 py-1.5 rounded-lg bg-amber-600/15 hover:bg-amber-600/25 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Tier 1 Only</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-52">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search country or code..."
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <select
                value={selectedCountryRegion}
                onChange={(e) => setSelectedCountryRegion(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {countryRegions.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg === 'all' ? 'All Regions' : reg}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[580px] overflow-y-auto pr-1">
              {filteredCountries.map((country) => {
                const isSelected = selectedCountries.has(country.code.toUpperCase());
                return (
                  <div
                    key={country.code}
                    onClick={() => toggleCountry(country.code)}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer select-none ${
                      isSelected
                        ? 'bg-slate-800/90 border-indigo-500/50 shadow-md'
                        : 'bg-slate-950/40 border-slate-800/60 opacity-60 hover:opacity-100 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <SvgFlag countryCode={country.code} size="lg" className="rounded shadow" />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-white truncate">{country.name}</span>
                          {country.isTier1 && (
                            <span className="px-1 py-0.2 text-[9px] bg-amber-500/20 text-amber-300 rounded font-mono shrink-0">
                              T1
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {country.code} • {country.region}
                        </div>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCountry(country.code)}
                      className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 rounded focus:ring-indigo-500 cursor-pointer shrink-0 ml-2"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DYNAMIC SVG FLAG SIZES GOVERNANCE TAB */}
      {/* ========================================================================= */}
      {activeTab === 'flag_sizes' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Banner explaining auto width calculation */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Ruler className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-bold text-white">Dynamic SVG Flag Dimension Governance</h3>
                </div>
                <p className="text-xs text-slate-400 max-w-2xl">
                  Adjust the height (in pixels) for each UI flag variant below. The width is <strong className="text-indigo-300">automatically calculated</strong> at the official vector 3:2 flag aspect ratio (<code className="text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded font-mono">Width = Math.round(Height × 1.5)</code>).
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResetFlagSizes}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold font-mono flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Defaults</span>
                </button>
              </div>
            </div>

            {/* Live Flag Preview Picker */}
            <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-400 font-medium flex items-center space-x-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>Test & Preview Country:</span>
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {['US', 'ES', 'GB', 'FR', 'JP', 'DE', 'BR', 'IN', 'CA', 'AU'].map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setPreviewCountryCode(code)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      previewCountryCode === code
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sizing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                key: 'xxs' as const,
                label: 'XXS (Tiny Badges)',
                badge: 'Discovery Card',
                desc: 'Smaller than XS. Discovery card flag on mobile and desktop',
                defaultH: 12,
              },
              {
                key: 'xs' as const,
                label: 'XS (Micro Badges)',
                badge: 'Location & Meta',
                desc: 'Location pills, chat badges, status tags',
                defaultH: 14,
              },
              {
                key: 'sm' as const,
                label: 'SM (Standard Small)',
                badge: 'Lists & Drawers',
                desc: 'User list items, friends drawer, video call header',
                defaultH: 18,
              },
              {
                key: 'card' as const,
                label: 'Card (Discovery & Swipe)',
                badge: 'Discovery & Swipe',
                desc: 'Discovery Grid cards and Swipe Match Deck',
                defaultH: 18,
              },
              {
                key: 'md' as const,
                label: 'MD (Standard Details)',
                badge: 'Profile & Modals',
                desc: 'Profile detail modals and user dialog headers',
                defaultH: 22,
              },
              {
                key: 'lg' as const,
                label: 'LG (Dropdown & Triggers)',
                badge: 'Country Selector',
                desc: 'Country selector trigger and form dropdowns',
                defaultH: 27,
              },
              {
                key: 'admin' as const,
                label: 'Admin (Taxonomy Cards)',
                badge: 'Admin Dashboard',
                desc: 'Country selector cards in admin dashboard',
                defaultH: 27,
              },
              {
                key: 'xl' as const,
                label: 'XL (Large Showcase)',
                badge: 'Hero Showcases',
                desc: 'Large profile showcases and verified badges',
                defaultH: 36,
              },
              {
                key: '2xl' as const,
                label: '2XL (Hero Splash)',
                badge: 'Hero & Splashes',
                desc: 'Hero cards and high-impact landing displays',
                defaultH: 48,
              },
            ].map((variant) => {
              const currentH = flagSizes[variant.key] ?? variant.defaultH;
              const currentW = Math.round(currentH * 1.5);

              return (
                <div
                  key={variant.key}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs font-mono">{variant.label}</span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold">
                        {variant.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{variant.desc}</p>
                  </div>

                  {/* Live SVG Flag Visual Preview */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center min-h-[90px] relative overflow-hidden">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest absolute top-1.5 left-2">Live Preview</span>
                    <div className="mt-3 flex items-center justify-center">
                      <SvgFlag countryCode={previewCountryCode} height={currentH} width={currentW} />
                    </div>
                    <div className="mt-2 text-[10px] font-mono text-emerald-400 font-bold">
                      {currentW}px × {currentH}px (3:2)
                    </div>
                  </div>

                  {/* Height Input & Auto Width Calculation */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-xs">
                      <label className="text-slate-300 font-medium">Height (px):</label>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="8"
                          max="120"
                          value={currentH}
                          onChange={(e) => handleFlagHeightChange(variant.key, parseInt(e.target.value, 10))}
                          className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white text-right focus:outline-none focus:border-indigo-500"
                        />
                        <span className="text-slate-400 font-mono text-[10px]">px</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono bg-slate-950/50 px-2.5 py-1 rounded-lg border border-slate-800/60">
                      <span>Auto Width (3:2):</span>
                      <span className="text-amber-300 font-bold">{currentW} px</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. LANGUAGES TAB */}
      {/* ========================================================================= */}
      {activeTab === 'languages' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={handleSelectAllLanguages}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Select All ({ALL_LANGUAGES.length})</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAllLanguages}
                className="px-3 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Deselect All</span>
              </button>
              <button
                type="button"
                onClick={handleSelectPopularOnlyLanguages}
                className="px-3 py-1.5 rounded-lg bg-amber-600/15 hover:bg-amber-600/25 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Top / Popular Only</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-52">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search language or script..."
                  value={languageSearch}
                  onChange={(e) => setLanguageSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <select
                value={selectedLanguageRegion}
                onChange={(e) => setSelectedLanguageRegion(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {languageRegions.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg === 'all' ? 'All Regions' : reg}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[580px] overflow-y-auto pr-1">
              {filteredLanguages.map((lang) => {
                const isSelected = selectedLanguages.has(lang.name.toLowerCase());
                return (
                  <div
                    key={lang.code}
                    onClick={() => toggleLanguage(lang.name)}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer select-none ${
                      isSelected
                        ? 'bg-slate-800/90 border-indigo-500/50 shadow-md'
                        : 'bg-slate-950/40 border-slate-800/60 opacity-60 hover:opacity-100 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-white truncate">{lang.name}</span>
                        {lang.popular && (
                          <span className="px-1 py-0.2 text-[8px] bg-amber-500/20 text-amber-300 rounded font-mono shrink-0 font-bold">
                            TOP
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {lang.nativeName} • {lang.region}
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleLanguage(lang.name)}
                      className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 rounded focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ZODIAC SIGNS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'zodiac' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={handleSelectAllZodiacs}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Select All 12 Signs</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAllZodiacs}
                className="px-3 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Deselect All</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-52">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search sign or trait..."
                  value={zodiacSearch}
                  onChange={(e) => setZodiacSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <select
                value={selectedZodiacElement}
                onChange={(e) => setSelectedZodiacElement(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 capitalize"
              >
                <option value="all">All Elements</option>
                <option value="fire">Fire 🔥</option>
                <option value="earth">Earth 🌿</option>
                <option value="air">Air 💨</option>
                <option value="water">Water 🌊</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[580px] overflow-y-auto pr-1">
              {filteredZodiacs.map((z) => {
                const isSelected = selectedZodiacs.has(z.key.toLowerCase());
                return (
                  <div
                    key={z.key}
                    onClick={() => toggleZodiac(z.key)}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between cursor-pointer select-none ${
                      isSelected
                        ? 'bg-slate-800/95 border-purple-500/50 shadow-lg'
                        : 'bg-slate-950/40 border-slate-800/60 opacity-60 hover:opacity-100 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
                        <ZodiacIcon sign={z.key} size="md" showElementColor={true} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-white truncate">{z.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 capitalize">
                            {z.element}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{z.dateRange}</div>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleZodiac(z.key)}
                      className="w-4 h-4 text-purple-600 bg-slate-900 border-slate-700 rounded focus:ring-purple-500 cursor-pointer shrink-0 ml-2"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. INTERESTS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'interests' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={handleSelectAllInterests}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Select All ({ALL_INTERESTS.length})</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAllInterests}
                className="px-3 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Deselect All</span>
              </button>
              <button
                type="button"
                onClick={handleSelectPopularInterests}
                className="px-3 py-1.5 rounded-lg bg-amber-600/15 hover:bg-amber-600/25 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Popular Only</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-52">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search interests..."
                  value={interestSearch}
                  onChange={(e) => setInterestSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <select
                value={selectedInterestCategory}
                onChange={(e) => setSelectedInterestCategory(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 capitalize"
              >
                <option value="all">All Categories</option>
                {INTEREST_CATEGORIES.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[580px] overflow-y-auto pr-1">
              {filteredInterests.map((item) => {
                const isSelected = selectedInterests.has(item.name.toLowerCase());
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleInterest(item.name)}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer select-none ${
                      isSelected
                        ? 'bg-slate-800/90 border-indigo-500/50 shadow-md'
                        : 'bg-slate-950/40 border-slate-800/60 opacity-60 hover:opacity-100 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <span className={`p-1.5 rounded-lg shrink-0 ${
                        isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-900 text-slate-400'
                      }`}>
                        {getCategoryIcon(item.category, 'w-3.5 h-3.5')}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1">
                          <span className="text-xs font-bold text-white truncate">{item.name}</span>
                          {item.popular && (
                            <span className="px-1 py-0.2 text-[8px] bg-amber-500/20 text-amber-300 rounded font-mono shrink-0">
                              HOT
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono capitalize">{item.category}</div>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleInterest(item.name)}
                      className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 rounded focus:ring-indigo-500 cursor-pointer shrink-0 ml-2"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. CURRENCIES TAB */}
      {/* ========================================================================= */}
      {activeTab === 'currencies' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-400" />
                Store Display Currencies
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
                Customers pick a currency in the coin store. Package SKUs stay priced in USD; display converts with
                <span className="font-mono text-slate-300"> rate_from_usd</span> (local units per $1). Checkout ledger
                remains USD.
              </p>
              <p className="text-[11px] text-amber-200/90 mt-2 max-w-xl leading-relaxed">
                Display conversion only — this does <span className="font-bold">not</span> redefine Coin USD Peg /
                host payout FX. Edit Fixed Peg in{' '}
                <span className="font-semibold">Admin → Coin Burn &amp; Economy → D</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCurrencyRows(DEFAULT_CURRENCIES.map((c) => ({ ...c })));
                setHasUnsavedChanges(true);
                showToast('Currencies Reset', 'Restored default placeholder FX rates.', 'info');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center space-x-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[640px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-2 font-bold">Code</th>
                  <th className="py-2 pr-2 font-bold">Name</th>
                  <th className="py-2 pr-2 font-bold">Symbol</th>
                  <th className="py-2 pr-2 font-bold">Rate / 1 USD</th>
                  <th className="py-2 pr-2 font-bold">Order</th>
                  <th className="py-2 font-bold">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {currencyRows.map((row, idx) => (
                  <tr key={row.code} className="border-b border-slate-800/60">
                    <td className="py-2 pr-2 font-mono font-bold text-emerald-300">{row.code}</td>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => {
                          const next = [...currencyRows];
                          next[idx] = { ...row, name: e.target.value };
                          setCurrencyRows(next);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full max-w-[160px] px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-white"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={row.symbol}
                        onChange={(e) => {
                          const next = [...currencyRows];
                          next[idx] = { ...row, symbol: e.target.value };
                          setCurrencyRows(next);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-16 px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-white"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="any"
                        min={0.0001}
                        value={row.rateFromUsd}
                        disabled={row.code === 'USD'}
                        onChange={(e) => {
                          const next = [...currencyRows];
                          next[idx] = { ...row, rateFromUsd: Number(e.target.value) || 1 };
                          setCurrencyRows(next);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-28 px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-amber-200 font-mono disabled:opacity-60"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        value={row.orderNum ?? idx}
                        onChange={(e) => {
                          const next = [...currencyRows];
                          next[idx] = { ...row, orderNum: Number(e.target.value) || 0 };
                          setCurrencyRows(next);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-16 px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                      />
                    </td>
                    <td className="py-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.enabled !== false}
                          disabled={row.code === 'USD'}
                          onChange={(e) => {
                            const next = [...currencyRows];
                            next[idx] = { ...row, enabled: e.target.checked };
                            setCurrencyRows(next);
                            setHasUnsavedChanges(true);
                          }}
                          className="rounded border-slate-600"
                        />
                        <span className="text-slate-400">{row.enabled !== false ? 'On' : 'Off'}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-500 mt-3">
              Example: AED rate 3.6725 → $4.99 displays as د.إ18.33. USD cannot be disabled.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
