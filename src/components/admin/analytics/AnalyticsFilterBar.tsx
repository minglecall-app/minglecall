import React, { useState } from 'react';
import { Calendar, Filter, Search, Building2, Globe, Loader2 } from 'lucide-react';
import {
  AdminAnalyticsFilters,
  AdminAnalyticsRole,
  DatePreset,
  buildDateRange,
  buildSettlementPeriodRange,
  formatDateRangeUtcLabel,
} from '../../../utils/adminAnalytics';
import { UserProfile } from '../../../types';
import { fetchCurrentFinancePeriod } from '../../../services/financeApi';

interface AnalyticsFilterBarProps {
  filters: AdminAnalyticsFilters;
  onChange: (next: AdminAnalyticsFilters) => void;
  teamLeaders: UserProfile[];
  countries: string[];
  /** `full` = date + list filters; `date` = date presets only. */
  mode?: 'full' | 'date';
}

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7d' },
  { id: '15d', label: '15d' },
  { id: '30d', label: '30d' },
  { id: '365d', label: '365d' },
  { id: 'settlement_period', label: 'Settlement period' },
  { id: 'custom', label: 'Custom' },
];

const ROLES: { id: AdminAnalyticsRole | 'all'; label: string }[] = [
  { id: 'all', label: 'All roles' },
  { id: 'male_user', label: 'Male' },
  { id: 'female_user', label: 'Regular Female' },
  { id: 'female_creator', label: 'Creator' },
  { id: 'team_leader', label: 'Agency' },
];

export const AnalyticsFilterBar: React.FC<AnalyticsFilterBarProps> = ({
  filters,
  onChange,
  teamLeaders,
  countries,
  mode = 'full',
}) => {
  const [periodBusy, setPeriodBusy] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);

  const setPreset = async (preset: DatePreset) => {
    setPeriodError(null);
    if (preset === 'settlement_period') {
      setPeriodBusy(true);
      const res = await fetchCurrentFinancePeriod();
      setPeriodBusy(false);
      if (!res.success || !res.data?.bounds) {
        setPeriodError(res.error?.message || 'Could not load current settlement period');
        return;
      }
      const { periodStart, periodEnd } = res.data.bounds;
      onChange({
        ...filters,
        range: buildSettlementPeriodRange(periodStart, periodEnd),
      });
      return;
    }

    onChange({
      ...filters,
      range: buildDateRange(
        preset,
        filters.range.start.toISOString().slice(0, 10),
        filters.range.end.toISOString().slice(0, 10)
      ),
    });
  };

  return (
    <div className="sticky top-0 z-20 bg-[#0B0F17]/95 backdrop-blur-md border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xl">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
          <Filter className="w-3.5 h-3.5 text-indigo-400" />
          Filters
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={periodBusy && p.id === 'settlement_period'}
              onClick={() => void setPreset(p.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer disabled:opacity-50 ${
                filters.range.preset === p.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {p.id === 'settlement_period' && periodBusy ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Period…
                </span>
              ) : (
                p.label
              )}
            </button>
          ))}
        </div>

        {filters.range.preset === 'custom' && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={filters.range.start.toISOString().slice(0, 10)}
              onChange={(e) =>
                onChange({
                  ...filters,
                  range: buildDateRange(
                    'custom',
                    e.target.value,
                    filters.range.end.toISOString().slice(0, 10)
                  ),
                })
              }
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
            />
            <span className="text-slate-500">→</span>
            <input
              type="date"
              value={filters.range.end.toISOString().slice(0, 10)}
              onChange={(e) =>
                onChange({
                  ...filters,
                  range: buildDateRange(
                    'custom',
                    filters.range.start.toISOString().slice(0, 10),
                    e.target.value
                  ),
                })
              }
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
            />
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
        Date bounds are <span className="text-slate-300">UTC</span> (aligned with Financial Module
        periods). Active range:{' '}
        <span className="text-indigo-300">{formatDateRangeUtcLabel(filters.range)}</span>
        {filters.range.preset === 'settlement_period' ? ' · current open settlement window' : ''}.
      </p>
      {periodError && (
        <p className="text-[10px] text-rose-300 font-mono">{periodError}</p>
      )}

      {mode === 'full' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Search name, email, ID…"
              className="bg-transparent outline-none text-slate-200 w-full placeholder:text-slate-600"
            />
          </label>

          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <span className="text-slate-500 font-mono shrink-0">Role</span>
            <select
              value={filters.role}
              onChange={(e) =>
                onChange({ ...filters, role: e.target.value as AdminAnalyticsFilters['role'] })
              }
              className="bg-transparent outline-none text-slate-200 w-full cursor-pointer"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id} className="bg-slate-900">
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              value={filters.country}
              onChange={(e) => onChange({ ...filters, country: e.target.value })}
              className="bg-transparent outline-none text-slate-200 w-full cursor-pointer"
            >
              <option value="all" className="bg-slate-900">
                All countries
              </option>
              {countries.map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <select
              value={filters.agencyId}
              onChange={(e) => onChange({ ...filters, agencyId: e.target.value })}
              className="bg-transparent outline-none text-slate-200 w-full cursor-pointer"
            >
              <option value="all" className="bg-slate-900">
                All agencies
              </option>
              {teamLeaders.map((tl) => (
                <option key={tl.id} value={tl.id} className="bg-slate-900">
                  {tl.agencyName || tl.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
};
