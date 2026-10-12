import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Landmark,
  Wallet,
  Smartphone,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Globe2,
  CreditCard,
  Eye,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getAllowedCountries } from '../../utils/countries';
import { DEFAULT_PAYOUT_TEMPLATES } from '../../../shared/payout/defaults';
import type {
  PayoutFieldDef,
  PayoutFieldType,
  PayoutMethodKey,
  PayoutMethodTemplate,
  UserPayoutCard,
} from '../../../shared/payout/types';
import {
  fetchAdminPayoutTemplates,
  saveAdminPayoutTemplates,
  fetchPayoutCardsRoster,
} from '../../services/payoutApi';
import { formatMaskedDetailsLine } from '../../../shared/payout/phoneUi';

const METHOD_META: Record<
  PayoutMethodKey,
  { icon: React.ReactNode; accent: string; tile: string }
> = {
  paypal: {
    icon: <Wallet className="w-6 h-6" />,
    accent: 'text-blue-300 border-blue-500/40',
    tile: 'from-blue-950/80 to-slate-950',
  },
  bank_account: {
    icon: <Landmark className="w-6 h-6" />,
    accent: 'text-emerald-300 border-emerald-500/40',
    tile: 'from-emerald-950/80 to-slate-950',
  },
  wallet: {
    icon: <Smartphone className="w-6 h-6" />,
    accent: 'text-amber-300 border-amber-500/40',
    tile: 'from-amber-950/80 to-slate-950',
  },
};

const FIELD_TYPES: PayoutFieldType[] = ['text', 'phone', 'email', 'number', 'select'];

function newField(): PayoutFieldDef {
  const id = `f_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    key: id,
    label: 'New field',
    type: 'text',
    required: false,
    placeholder: '',
  };
}

function cloneTemplate(t: PayoutMethodTemplate): PayoutMethodTemplate {
  return {
    ...t,
    countryCodes: [...(t.countryCodes || [])],
    fields: (t.fields || []).map((f) => ({
      ...f,
      options: f.options ? [...f.options] : undefined,
    })),
  };
}

function mergeWithDefaults(loaded: PayoutMethodTemplate[]): PayoutMethodTemplate[] {
  const byKey = Object.fromEntries(loaded.map((t) => [t.methodKey, t]));
  return DEFAULT_PAYOUT_TEMPLATES.map((d) =>
    cloneTemplate(byKey[d.methodKey] || d)
  );
}

export const AdminPayoutCardsCMS: React.FC = () => {
  const { systemSettings, showToast } = useApp();
  const countries = useMemo(
    () => getAllowedCountries(systemSettings.allowedCountryCodes),
    [systemSettings.allowedCountryCodes]
  );

  const [templates, setTemplates] = useState<PayoutMethodTemplate[]>(() =>
    DEFAULT_PAYOUT_TEMPLATES.map(cloneTemplate)
  );
  const [selected, setSelected] = useState<PayoutMethodKey>('paypal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roster, setRoster] = useState<UserPayoutCard[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [showRoster, setShowRoster] = useState(true);

  const draft = templates.find((t) => t.methodKey === selected) || templates[0];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchAdminPayoutTemplates();
      setTemplates(mergeWithDefaults(list));
    } catch (e: any) {
      showToast('Payout CMS', e?.message || 'Failed to load templates', 'error');
      setTemplates(DEFAULT_PAYOUT_TEMPLATES.map((d) => ({ ...d, fields: [...d.fields] })));
    } finally {
      setLoading(false);
    }
    // showToast is unstable in AppContext — do not list it as a dependency or edits reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRoster = useCallback(async () => {
    setRosterLoading(true);
    try {
      setRoster(await fetchPayoutCardsRoster());
    } catch {
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  }, []);

  // Load once on mount only — never re-fetch on parent re-renders (wipes unsaved edits).
  useEffect(() => {
    void load();
    void loadRoster();
  }, [load, loadRoster]);

  const updateDraft = useCallback(
    (patch: Partial<PayoutMethodTemplate>) => {
      setTemplates((prev) =>
        prev.map((t) => (t.methodKey === selected ? { ...t, ...patch } : t))
      );
    },
    [selected]
  );

  const updateField = useCallback(
    (index: number, patch: Partial<PayoutFieldDef>) => {
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.methodKey !== selected) return t;
          const fields = t.fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
          return { ...t, fields };
        })
      );
    },
    [selected]
  );

  const addField = useCallback(() => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.methodKey === selected ? { ...t, fields: [...t.fields, newField()] } : t
      )
    );
  }, [selected]);

  const removeField = useCallback(
    (index: number) => {
      setTemplates((prev) =>
        prev.map((t) =>
          t.methodKey === selected
            ? { ...t, fields: t.fields.filter((_, i) => i !== index) }
            : t
        )
      );
    },
    [selected]
  );

  const setCountriesMode = useCallback(
    (mode: 'all' | 'selected') => {
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.methodKey !== selected) return t;
          if (mode === 'all') {
            return { ...t, countriesMode: 'all', countryCodes: [] };
          }
          const codes =
            t.countryCodes.length > 0
              ? t.countryCodes
              : countries.slice(0, 5).map((c) => c.code);
          return { ...t, countriesMode: 'selected', countryCodes: [...codes] };
        })
      );
    },
    [selected, countries]
  );

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await saveAdminPayoutTemplates([draft]);
      setTemplates((prev) => {
        const next = [...prev];
        for (const s of saved) {
          const i = next.findIndex((t) => t.methodKey === s.methodKey);
          if (i >= 0) next[i] = s;
          else next.push(s);
        }
        return mergeWithDefaults(next);
      });
      showToast('Payout CMS', `${draft.label} template saved.`, 'success');
      loadRoster();
    } catch (e: any) {
      showToast('Payout CMS', e?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleCountry = useCallback(
    (code: string) => {
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.methodKey !== selected) return t;
          const set = new Set(t.countryCodes || []);
          if (set.has(code)) set.delete(code);
          else set.add(code);
          return { ...t, countriesMode: 'selected', countryCodes: [...set] };
        })
      );
    },
    [selected]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            Payout / Bank Cards
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Define field templates for PayPal, Bank Account, and Wallets. Hosts and agencies fill
            these for local salary remittance. Choose countries where each method is available.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 hover:bg-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Reload
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {templates.map((t) => {
          const meta = METHOD_META[t.methodKey];
          const active = selected === t.methodKey;
          return (
            <button
              key={t.methodKey}
              type="button"
              onClick={() => setSelected(t.methodKey)}
              className={`text-left p-4 rounded-2xl border bg-gradient-to-br ${meta.tile} transition-all ${
                active ? `${meta.accent} ring-1 ring-white/10` : 'border-slate-800 opacity-80 hover:opacity-100'
              }`}
            >
              <div className={`flex items-center gap-2 ${meta.accent.split(' ')[0]}`}>
                {meta.icon}
                <span className="font-black text-white text-sm">{t.label}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{t.description}</p>
              <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span>{t.fields.length} fields</span>
                <span>·</span>
                <span>
                  {t.countriesMode === 'all' ? 'All countries' : `${t.countryCodes.length} countries`}
                </span>
                {!t.isEnabled && <span className="text-rose-400">· disabled</span>}
              </div>
            </button>
          );
        })}
      </div>

      {draft && (
        <div className="bg-[#13161F] border border-slate-800 rounded-3xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Edit · {draft.label}
            </h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.isEnabled}
                  onChange={(e) => updateDraft({ isEnabled: e.target.checked })}
                  className="rounded border-slate-600"
                />
                Enabled
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">Label</span>
              <input
                value={draft.label}
                onChange={(e) => updateDraft({ label: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">Icon name</span>
              <input
                value={draft.icon}
                onChange={(e) => updateDraft({ icon: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-[10px] font-bold uppercase text-slate-500">Description</span>
              <input
                value={draft.description}
                onChange={(e) => updateDraft({ description: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1.5">
                <Globe2 className="w-3.5 h-3.5" />
                Countries
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCountriesMode('all')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                    draft.countriesMode === 'all'
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setCountriesMode('selected')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                    draft.countriesMode === 'selected'
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  Selected list
                </button>
              </div>
            </div>
            {draft.countriesMode === 'selected' && (
              <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                {countries.map((c) => {
                  const on = draft.countryCodes.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggleCountry(c.code)}
                      className={`text-left px-2 py-1.5 rounded-lg text-[11px] font-mono border ${
                        on
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                          : 'border-transparent text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      {c.flag} {c.code}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-500">Fields</span>
              <button
                type="button"
                onClick={addField}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-200"
              >
                <Plus className="w-3 h-3" />
                Add field
              </button>
            </div>
            <div className="space-y-2">
              {draft.fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800"
                >
                  <input
                    value={field.label}
                    onChange={(e) => updateField(idx, { label: e.target.value })}
                    placeholder="Label"
                    className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                  <input
                    value={field.key}
                    onChange={(e) =>
                      updateField(idx, {
                        key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                      })
                    }
                    placeholder="key"
                    className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                  />
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateField(idx, {
                        type: e.target.value as PayoutFieldType,
                        options:
                          e.target.value === 'select'
                            ? field.options?.length
                              ? field.options
                              : ['Option A', 'Option B']
                            : undefined,
                      })
                    }
                    className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    value={field.placeholder || ''}
                    onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                    placeholder="Placeholder"
                    className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                  <label className="md:col-span-1 flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                    />
                    Req
                  </label>
                  <button
                    type="button"
                    onClick={() => removeField(idx)}
                    className="md:col-span-1 flex items-center justify-center text-rose-400 hover:bg-rose-500/10 rounded-lg"
                    title="Remove field"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {field.type === 'select' && (
                    <input
                      value={(field.options || []).join(', ')}
                      onChange={(e) =>
                        updateField(idx, {
                          options: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Options (comma-separated)"
                      className="md:col-span-12 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                    />
                  )}
                </div>
              ))}
              {!draft.fields.length && (
                <p className="text-xs text-slate-500">No fields yet — add at least one before hosts can fill this method.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#13161F] border border-slate-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-400" />
            Saved payout cards roster
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowRoster((v) => !v)}
              className="text-[10px] font-bold text-slate-400 uppercase"
            >
              {showRoster ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              onClick={loadRoster}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-200"
            >
              <RefreshCw className={`w-3 h-3 ${rosterLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        {showRoster && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="p-2">User</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Method</th>
                  <th className="p-2">Country</th>
                  <th className="p-2">Details (masked)</th>
                  <th className="p-2">Primary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {roster.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-900/50">
                    <td className="p-2 font-bold text-white">{c.userName || c.userId}</td>
                    <td className="p-2 font-mono text-[10px]">{c.userRole || '—'}</td>
                    <td className="p-2 capitalize">{c.methodKey.replace('_', ' ')}</td>
                    <td className="p-2 font-mono">{c.countryCode}</td>
                    <td className="p-2 font-mono text-[10px] text-slate-400 max-w-xs truncate">
                      {formatMaskedDetailsLine(c.maskedValues)}
                    </td>
                    <td className="p-2">{c.isPrimary ? '★' : ''}</td>
                  </tr>
                ))}
                {!roster.length && !rosterLoading && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500">
                      No saved payout cards yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
