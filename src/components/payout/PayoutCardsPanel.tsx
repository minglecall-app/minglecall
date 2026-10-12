import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Landmark,
  Wallet,
  Smartphone,
  Star,
  Trash2,
  Save,
  Plus,
  RefreshCw,
  CreditCard,
  X,
  ChevronRight,
  ChevronLeft,
  Nfc,
  Lock,
  Check,
  Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { findCountryByCodeOrName, getAllowedCountries } from '../../utils/countries';
import { SvgFlag } from '../common/SvgFlag';
import type {
  PayoutFieldDef,
  PayoutMethodKey,
  PayoutMethodTemplate,
  UserPayoutCard,
} from '../../../shared/payout/types';
import { validateCardValues, validateCardValuesMap } from '../../../shared/payout/validate';
import {
  COUNTRY_DIAL_CODES,
  dialSuffixes,
  isPhoneMetaKey,
  uniqueDialCodesOnly,
} from '../../../shared/payout/phoneUi';
import {
  fetchPayoutTemplates,
  fetchMyPayoutCards,
  saveMyPayoutCard,
  deleteMyPayoutCard,
} from '../../services/payoutApi';

type WizardStep = 'country' | 'method' | 'form';

const METHOD_META: Record<
  PayoutMethodKey,
  { label: string; Icon: React.FC<{ className?: string }>; cardGradient: string; chip: string }
> = {
  paypal: {
    label: 'PAYPAL',
    Icon: Wallet,
    cardGradient: 'from-slate-800 via-slate-700 to-slate-900',
    chip: 'from-amber-200 to-amber-500',
  },
  bank_account: {
    label: 'BANK',
    Icon: Landmark,
    cardGradient: 'from-zinc-800 via-zinc-700 to-zinc-900',
    chip: 'from-yellow-200 to-amber-400',
  },
  wallet: {
    label: 'WALLET',
    Icon: Smartphone,
    cardGradient: 'from-neutral-800 via-neutral-700 to-neutral-900',
    chip: 'from-slate-200 to-slate-400',
  },
};

const STEPS: { id: WizardStep; n: number; label: string }[] = [
  { id: 'country', n: 1, label: 'Country' },
  { id: 'method', n: 2, label: 'Method' },
  { id: 'form', n: 3, label: 'Details' },
];

const DETAIL_LABELS: Record<string, string> = {
  email: 'Email',
  account_name: 'Account name',
  account_holder: 'Account holder',
  bank_name: 'Bank name',
  iban_or_account: 'IBAN / Account',
  account_number: 'Account number',
  swift_bic: 'SWIFT / BIC',
  routing_number: 'Routing number',
  branch: 'Branch',
  wallet_type: 'Wallet type',
  address_or_id: 'Address / ID',
  phone: 'Phone',
  name: 'Name',
};

function humanizeKey(key: string): string {
  if (DETAIL_LABELS[key]) return DETAIL_LABELS[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPhoneFieldDef(field: PayoutFieldDef): boolean {
  return field.type === 'phone' || /phone|mobile|whatsapp/i.test(field.key);
}

function holderName(card: UserPayoutCard): string {
  const v = card.values || {};
  return v.account_name || v.account_holder || v.name || 'CARDHOLDER';
}

function detailEntries(card: UserPayoutCard): Array<{ key: string; label: string; value: string }> {
  const v = card.values || {};
  const rows: Array<{ key: string; label: string; value: string }> = [];
  const phoneKeys = new Set<string>();
  for (const key of Object.keys(v)) {
    if (isPhoneMetaKey(key)) {
      const base = key.replace(/_(dial|national|has_chat|chat_apps)$/, '');
      phoneKeys.add(base);
    } else if (/phone|mobile/i.test(key) && !isPhoneMetaKey(key)) {
      phoneKeys.add(key);
    }
  }
  for (const [key, value] of Object.entries(v)) {
    if (isPhoneMetaKey(key) || phoneKeys.has(key)) continue;
    if (!String(value || '').trim()) continue;
    rows.push({ key, label: humanizeKey(key), value: String(value) });
  }
  for (const pk of phoneKeys) {
    const phone = String(v[pk] || '').trim();
    if (phone) rows.push({ key: pk, label: humanizeKey(pk), value: phone });
  }
  return rows;
}

const CARD_FACE =
  'w-[300px] sm:w-[340px] h-[214px] sm:h-[214px] shrink-0 rounded-2xl';

function AtmPayoutCard(props: { card: UserPayoutCard; onRemove: () => void }) {
  const meta = METHOD_META[props.card.methodKey];
  const Icon = meta.Icon;
  const country = findCountryByCodeOrName(props.card.countryCode);
  const details = detailEntries(props.card);
  const holder = holderName(props.card);

  return (
    <div className="w-[300px] sm:w-[340px] shrink-0 space-y-2">
      <div
        className={`relative ${CARD_FACE} bg-gradient-to-br ${meta.cardGradient} p-4 text-white shadow-xl shadow-black/30 overflow-hidden border border-white/10 flex flex-col`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_45%,rgba(0,0,0,0.15)_100%)]" />
        <div className="relative flex flex-col gap-2 h-full min-h-0">
          <div className="flex items-start justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`h-8 w-11 shrink-0 rounded-md bg-gradient-to-br ${meta.chip} shadow-inner border border-white/30`}
              >
                <div className="mt-1 grid grid-cols-3 gap-px px-1 opacity-60">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-1 rounded-[1px] bg-black/25" />
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold tracking-[0.18em] text-white/55">MINGLECALL</div>
                <div className="text-xs font-black tracking-wider flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-white/80" />
                  {meta.label}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {props.card.isPrimary && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-bold text-amber-200">
                  <Star className="h-2.5 w-2.5 fill-amber-200" />
                  PRIMARY
                </span>
              )}
              <Lock className="h-3.5 w-3.5 text-white/45" aria-label="Locked after save" />
              <Nfc className="h-4 w-4 text-white/65" />
            </div>
          </div>

          <div className="rounded-xl bg-black/25 border border-white/10 px-3 py-2 space-y-1 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            {details.length ? (
              details.map((d) => (
                <div key={d.key} className="flex items-start justify-between gap-3 text-[11px]">
                  <span className="text-white/50 shrink-0">{d.label}</span>
                  <span className="font-semibold text-right break-all text-white/95 line-clamp-2">
                    {d.value}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-white/50">No details saved.</p>
            )}
          </div>

          <div className="flex items-end justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-white/45">Cardholder</div>
              <div className="text-xs font-bold uppercase tracking-wide truncate">{holder}</div>
            </div>
            <div className="text-right shrink-0 max-w-[55%]">
              <div className="text-[9px] uppercase tracking-wider text-white/45">Country</div>
              <div className="text-xs font-bold flex items-center justify-end gap-1.5 min-w-0">
                <SvgFlag
                  countryCode={props.card.countryCode}
                  size="sm"
                  className="rounded shadow-sm shrink-0"
                />
                <span className="truncate">
                  {country?.name || props.card.countryCode}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 h-7">
        <span className="text-[10px] text-slate-500 inline-flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Locked — contact admin to change
        </span>
        <button
          type="button"
          onClick={props.onRemove}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      </div>
    </div>
  );
}

function PhoneFieldInputs(props: {
  field: PayoutFieldDef;
  values: Record<string, string>;
  countryCode: string;
  countries: Array<{ code: string; name: string; flag: string }>;
  error?: string;
  onPatch: (patch: Record<string, string>) => void;
}) {
  const s = dialSuffixes(props.field.key);
  const dialOpts = useMemo(() => uniqueDialCodesOnly(props.countries), [props.countries]);
  const preferredDial =
    COUNTRY_DIAL_CODES[props.countryCode.toUpperCase()] ||
    props.values[s.dial] ||
    '';
  const dial = props.values[s.dial] || preferredDial;
  const national = props.values[s.national] || '';

  const push = (patch: Record<string, string>) => {
    const nextDial = patch[s.dial] ?? dial;
    const nextNat = (patch[s.national] ?? national).replace(/\D/g, '');
    const combined = nextDial && nextNat ? `${nextDial}${nextNat}` : '';
    props.onPatch({
      ...patch,
      [s.dial]: nextDial,
      [s.national]: nextNat,
      [props.field.key]: combined,
    });
  };

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-bold uppercase text-slate-500">
        {props.field.label}
        {props.field.required ? ' *' : ''}
      </span>
      <div className="grid grid-cols-[5.5rem_1fr] gap-2">
        <select
          value={dial}
          onChange={(e) => push({ [s.dial]: e.target.value })}
          className={`bg-slate-950 border rounded-xl px-2 py-2.5 text-sm font-mono text-white ${
            props.error && !dial ? 'border-rose-500' : 'border-slate-800'
          }`}
        >
          <option value="">+</option>
          {dialOpts.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          value={national}
          placeholder="Local number"
          onChange={(e) => push({ [s.national]: e.target.value.replace(/\D/g, '') })}
          className={`bg-slate-950 border rounded-xl px-3 py-2.5 text-sm text-white ${
            props.error ? 'border-rose-500' : 'border-slate-800'
          }`}
        />
      </div>
      {dial && national ? (
        <p className="text-[10px] text-slate-500 font-mono">
          Full number: {dial}
          {national}
        </p>
      ) : (
        <p className="text-[10px] text-slate-600">Country code + local digits (no leading 0).</p>
      )}
      {props.error ? (
        <span className="text-[10px] text-rose-400 font-medium">{props.error}</span>
      ) : null}
    </div>
  );
}

function StepRail({ step }: { step: WizardStep }) {
  const activeN = STEPS.find((s) => s.id === step)?.n || 1;
  return (
    <div className="flex items-center justify-between gap-1 px-1">
      {STEPS.map((s, idx) => {
        const done = s.n < activeN;
        const active = s.n === activeN;
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1 min-w-[64px]">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-black border ${
                  done
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : active
                      ? 'bg-slate-100 border-slate-100 text-slate-900'
                      : 'bg-slate-900 border-slate-700 text-slate-500'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : s.n}
              </div>
              <span
                className={`text-[10px] font-bold ${
                  active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-600'
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mb-4 ${done ? 'bg-emerald-600' : 'bg-slate-800'}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function fieldInputType(field: PayoutFieldDef): string {
  if (field.type === 'email' || field.key.toLowerCase().includes('email')) return 'email';
  if (field.type === 'phone' || /phone|mobile|whatsapp/i.test(field.key)) return 'tel';
  if (field.type === 'number') return 'number';
  return 'text';
}

function fieldPlaceholder(field: PayoutFieldDef): string {
  if (field.placeholder) return field.placeholder;
  if (field.type === 'phone' || /phone|mobile/i.test(field.key)) return '+92 300 1234567';
  if (field.type === 'email' || /email/i.test(field.key)) return 'name@example.com';
  return '';
}

export interface PayoutCardsPanelProps {
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export const PayoutCardsPanel: React.FC<PayoutCardsPanelProps> = ({
  title = 'Payout cards',
  subtitle = 'Add a payout method once. Cards are locked after save so admin can pay safely.',
  compact = false,
}) => {
  const { currentUser, systemSettings, showToast } = useApp();
  const countries = useMemo(
    () => getAllowedCountries(systemSettings.allowedCountryCodes),
    [systemSettings.allowedCountryCodes]
  );

  const [cards, setCards] = useState<UserPayoutCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('country');
  const [country, setCountry] = useState(
    () => String(currentUser.countryCode || '').toUpperCase() || ''
  );
  const [countryQuery, setCountryQuery] = useState('');
  const [templates, setTemplates] = useState<PayoutMethodTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [method, setMethod] = useState<PayoutMethodKey | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPrimary, setIsPrimary] = useState(true);
  const [saving, setSaving] = useState(false);

  const activeTemplate = templates.find((t) => t.methodKey === method) || null;
  const savedMethodKeys = useMemo(
    () => new Set(cards.map((c) => c.methodKey)),
    [cards]
  );

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await fetchMyPayoutCards());
    } catch (e: any) {
      showToast('Payout', e?.message || 'Failed to load cards', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const loadTemplatesForCountry = useCallback(async (code: string) => {
    setTemplatesLoading(true);
    try {
      setTemplates(await fetchPayoutTemplates(code));
    } catch (e: any) {
      setTemplates([]);
      showToast('Payout', e?.message || 'Failed to load methods', 'error');
    } finally {
      setTemplatesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countries, countryQuery]);

  const closeModal = () => {
    setModalOpen(false);
    setStep('country');
    setMethod(null);
    setValues({});
    setFieldErrors({});
    setCountryQuery('');
  };

  const openAddModal = () => {
    setCountry(String(currentUser.countryCode || '').toUpperCase() || '');
    setCountryQuery('');
    setMethod(null);
    setValues({});
    setFieldErrors({});
    setIsPrimary(cards.length === 0);
    setTemplates([]);
    setStep('country');
    setModalOpen(true);
  };

  const goToMethods = async () => {
    if (!country) {
      showToast('Payout', 'Select a country first.', 'error');
      return;
    }
    await loadTemplatesForCountry(country);
    setStep('method');
  };

  const selectMethod = (m: PayoutMethodKey) => {
    if (savedMethodKeys.has(m)) {
      showToast(
        'Payout',
        'This method is already saved and locked. Remove it first or contact admin to change.',
        'warning'
      );
      return;
    }
    setMethod(m);
    const tpl = templates.find((t) => t.methodKey === m);
    const seed: Record<string, string> = {};
    const dial = COUNTRY_DIAL_CODES[country.toUpperCase()] || '';
    for (const f of tpl?.fields || []) {
      if (!isPhoneFieldDef(f)) continue;
      const s = dialSuffixes(f.key);
      if (dial) seed[s.dial] = dial;
    }
    setValues(seed);
    setIsPrimary(cards.length === 0);
    setFieldErrors({});
    setStep('form');
  };

  const onFieldChange = (field: PayoutFieldDef, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [field.key]: value };
      if (activeTemplate) {
        setFieldErrors(validateCardValuesMap(activeTemplate, next));
      }
      return next;
    });
  };

  const onValuesPatch = (patch: Record<string, string>) => {
    setValues((prev) => {
      const next = { ...prev, ...patch };
      if (activeTemplate) {
        setFieldErrors(validateCardValuesMap(activeTemplate, next));
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!method || !activeTemplate || !country) return;
    if (savedMethodKeys.has(method)) {
      showToast('Payout', 'This card is locked and cannot be edited.', 'error');
      return;
    }
    const validated = validateCardValues(activeTemplate, values);
    if (validated.ok === false) {
      setFieldErrors(validateCardValuesMap(activeTemplate, values));
      showToast('Payout', validated.message, 'error');
      return;
    }
    setSaving(true);
    try {
      await saveMyPayoutCard({
        methodKey: method,
        countryCode: country,
        values: validated.values,
        isPrimary,
      });
      showToast('Payout', 'Payout card saved and locked.', 'success');
      closeModal();
      await loadCards();
    } catch (e: any) {
      showToast('Payout', e?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (card: UserPayoutCard) => {
    const ok = window.confirm(
      'Remove this payout card? You can add it again later. If a payment is in progress, contact admin first.'
    );
    if (!ok) return;
    try {
      await deleteMyPayoutCard({ id: card.id, methodKey: card.methodKey });
      showToast('Payout', 'Payout card removed.', 'success');
      await loadCards();
    } catch (e: any) {
      showToast('Payout', e?.message || 'Delete failed', 'error');
    }
  };

  const formValid =
    activeTemplate &&
    Object.keys(validateCardValuesMap(activeTemplate, values)).length === 0 &&
    activeTemplate.fields
      .filter((f) => f.required)
      .every((f) => String(values[f.key] || '').trim());

  const allMethodsSaved =
    templates.length > 0 && templates.every((t) => savedMethodKeys.has(t.methodKey));

  return (
    <div
      className={`space-y-5 ${
        compact ? '' : 'p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl shadow-xl'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-300" />
            {title}
          </h3>
          {subtitle ? <p className="text-xs text-slate-400 mt-1 max-w-xl">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => loadCards()}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        {cards.map((card) => (
          <AtmPayoutCard key={card.id} card={card} onRemove={() => void handleDelete(card)} />
        ))}

        <div className="w-[300px] sm:w-[340px] shrink-0 space-y-2">
          <button
            type="button"
            onClick={openAddModal}
            className={`${CARD_FACE} border border-dashed border-slate-600 bg-slate-950/50 hover:border-slate-400 hover:bg-slate-900/60 transition-colors flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-slate-200`}
          >
            <div className="h-10 w-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider">Add payout method</span>
          </button>
          <div className="h-7" aria-hidden />
        </div>
      </div>

      {!cards.length && !loading && (
        <p className="text-xs text-slate-500">
          No cards yet. Add a method once — it locks after save so salary payments stay consistent.
        </p>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={closeModal}
          />
          <div className="relative w-full sm:max-w-md h-[min(92vh,640px)] sm:h-[min(88vh,620px)] flex flex-col rounded-t-3xl sm:rounded-2xl bg-[#12151c] border border-slate-700/80 shadow-2xl overflow-hidden">
            <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-black text-white">Add payout method</div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <StepRail step={step} />
            </div>

            {/* Body: only the list region scrolls — header/footer stay fixed */}
            <div className="flex-1 min-h-0 flex flex-col">
              {step === 'country' && (
                <>
                  <div className="shrink-0 px-4 pt-3 pb-2 space-y-2 border-b border-slate-800/80">
                    <p className="text-xs text-slate-400">
                      Type to find your country, then tap it to select.
                    </p>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={countryQuery}
                        onChange={(e) => setCountryQuery(e.target.value)}
                        placeholder="Search country or code…"
                        className="w-full pl-9 pr-9 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
                      />
                      {countryQuery ? (
                        <button
                          type="button"
                          onClick={() => setCountryQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {country ? (
                      <div className="flex items-center gap-2 text-[11px] text-emerald-300 font-bold">
                        <Check className="w-3.5 h-3.5" />
                        Selected:{' '}
                        {findCountryByCodeOrName(country)?.name || country} ({country})
                      </div>
                    ) : null}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5 overscroll-contain">
                    {filteredCountries.map((c) => {
                      const selected = country === c.code.toUpperCase();
                      return (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => setCountry(c.code.toUpperCase())}
                          className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-left transition-colors ${
                            selected
                              ? 'bg-slate-100 text-slate-900'
                              : 'hover:bg-slate-800/80 text-slate-200'
                          }`}
                        >
                          <SvgFlag countryCode={c.code} size="sm" className="rounded shadow-sm" />
                          <span className={`text-sm font-bold truncate flex-1 ${selected ? 'text-slate-900' : 'text-white'}`}>
                            {c.name}
                          </span>
                          <span
                            className={`text-[10px] font-mono shrink-0 ${
                              selected ? 'text-slate-600' : 'text-slate-500'
                            }`}
                          >
                            {c.code}
                          </span>
                          {selected ? <Check className="w-4 h-4 shrink-0 text-slate-800" /> : null}
                        </button>
                      );
                    })}
                    {!filteredCountries.length && (
                      <p className="py-8 text-center text-xs text-slate-500">
                        No countries match “{countryQuery}”
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 p-4 border-t border-slate-800 bg-[#12151c]">
                    <button
                      type="button"
                      disabled={!country}
                      onClick={() => void goToMethods()}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-white disabled:opacity-40 text-slate-900 text-xs font-black py-3"
                    >
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}

              {step === 'method' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCountryQuery('');
                      setStep('country');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    {findCountryByCodeOrName(country)?.flag}{' '}
                    {findCountryByCodeOrName(country)?.name || country}
                  </button>
                  <p className="text-xs text-slate-400">Choose one payment method for this country.</p>
                  {templatesLoading ? (
                    <p className="text-xs text-slate-500 py-8 text-center">Loading methods…</p>
                  ) : (
                    <div className="space-y-2">
                      {templates.map((t) => {
                        const meta = METHOD_META[t.methodKey];
                        const Icon = meta.Icon;
                        const locked = savedMethodKeys.has(t.methodKey);
                        return (
                          <button
                            key={t.methodKey}
                            type="button"
                            disabled={locked}
                            onClick={() => selectMethod(t.methodKey)}
                            className={`w-full text-left rounded-xl border px-3.5 py-3.5 flex items-center gap-3 transition ${
                              locked
                                ? 'border-slate-800 bg-slate-950/50 opacity-60 cursor-not-allowed'
                                : 'border-slate-700 bg-slate-900/80 hover:border-slate-500 hover:bg-slate-900'
                            }`}
                          >
                            <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 shrink-0">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-white">{t.label}</div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {locked
                                  ? 'Already saved — locked'
                                  : t.description || 'Fill details next'}
                              </div>
                            </div>
                            {locked ? (
                              <Lock className="h-4 w-4 text-slate-500 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                      {!templates.length && (
                        <p className="text-xs text-slate-500 text-center py-6">
                          No payout methods available for this country.
                        </p>
                      )}
                      {allMethodsSaved && (
                        <p className="text-[11px] text-amber-200/90 bg-amber-950/30 border border-amber-800/40 rounded-xl px-3 py-2">
                          All methods for this country are already saved and locked.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 'form' && activeTemplate && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3">
                    <button
                      type="button"
                      onClick={() => setStep('method')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      {activeTemplate.label}
                    </button>
                    <p className="text-[11px] text-slate-500">
                      Double-check details — this card locks after save and cannot be edited.
                    </p>
                    <div className="space-y-3">
                      {activeTemplate.fields.map((field) => {
                        const err = fieldErrors[field.key];
                        if (isPhoneFieldDef(field)) {
                          return (
                            <PhoneFieldInputs
                              key={field.id}
                              field={field}
                              values={values}
                              countryCode={country}
                              countries={countries}
                              error={err}
                              onPatch={onValuesPatch}
                            />
                          );
                        }
                        return (
                          <label key={field.id} className="block space-y-1">
                            <span className="text-[10px] font-bold uppercase text-slate-500">
                              {field.label}
                              {field.required ? ' *' : ''}
                            </span>
                            {field.type === 'select' ? (
                              <select
                                value={values[field.key] || ''}
                                onChange={(e) => onFieldChange(field, e.target.value)}
                                className={`w-full bg-slate-950 border rounded-xl px-3 py-2.5 text-sm text-white ${
                                  err ? 'border-rose-500' : 'border-slate-800'
                                }`}
                              >
                                <option value="">Select…</option>
                                {(field.options || []).map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={fieldInputType(field)}
                                value={values[field.key] || ''}
                                placeholder={fieldPlaceholder(field)}
                                onChange={(e) => onFieldChange(field, e.target.value)}
                                onBlur={() =>
                                  activeTemplate &&
                                  setFieldErrors(validateCardValuesMap(activeTemplate, values))
                                }
                                className={`w-full bg-slate-950 border rounded-xl px-3 py-2.5 text-sm text-white ${
                                  err ? 'border-rose-500' : 'border-slate-800'
                                }`}
                              />
                            )}
                            {err ? (
                              <span className="text-[10px] text-rose-400 font-medium">{err}</span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-300 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPrimary}
                        onChange={(e) => setIsPrimary(e.target.checked)}
                      />
                      Set as primary payout method
                    </label>
                  </div>
                  <div className="shrink-0 p-4 border-t border-slate-800">
                    <button
                      type="button"
                      disabled={saving || !formValid}
                      onClick={() => void handleSave()}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-white disabled:opacity-40 text-slate-900 text-xs font-black py-3"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'Saving…' : 'Save & lock card'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
