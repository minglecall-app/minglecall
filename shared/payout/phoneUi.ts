/** Dial codes for payout phone fields. */

/** ISO-2 → E.164 dial prefix (no spaces). */
export const COUNTRY_DIAL_CODES: Record<string, string> = {
  US: '+1',
  CA: '+1',
  GB: '+44',
  AU: '+61',
  NZ: '+64',
  IN: '+91',
  PK: '+92',
  BD: '+880',
  LK: '+94',
  NP: '+977',
  CN: '+86',
  HK: '+852',
  TW: '+886',
  JP: '+81',
  KR: '+82',
  PH: '+63',
  ID: '+62',
  MY: '+60',
  SG: '+65',
  TH: '+66',
  VN: '+84',
  KH: '+855',
  MM: '+95',
  AE: '+971',
  SA: '+966',
  QA: '+974',
  KW: '+965',
  BH: '+973',
  OM: '+968',
  JO: '+962',
  IQ: '+964',
  IR: '+98',
  TR: '+90',
  IL: '+972',
  EG: '+20',
  MA: '+212',
  NG: '+234',
  ZA: '+27',
  KE: '+254',
  GH: '+233',
  ET: '+251',
  TZ: '+255',
  UG: '+256',
  CM: '+237',
  BR: '+55',
  AR: '+54',
  CL: '+56',
  CO: '+57',
  PE: '+51',
  MX: '+52',
  VE: '+58',
  EC: '+593',
  BO: '+591',
  UY: '+598',
  PY: '+595',
  DE: '+49',
  FR: '+33',
  ES: '+34',
  IT: '+39',
  PT: '+351',
  NL: '+31',
  BE: '+32',
  CH: '+41',
  AT: '+43',
  SE: '+46',
  NO: '+47',
  DK: '+45',
  FI: '+358',
  IE: '+353',
  PL: '+48',
  CZ: '+420',
  RO: '+40',
  HU: '+36',
  GR: '+30',
  UA: '+380',
  RU: '+7',
  KZ: '+7',
  AZ: '+994',
  GE: '+995',
  AM: '+374',
  AL: '+355',
  BA: '+387',
  BG: '+359',
  HR: '+385',
  RS: '+381',
  SK: '+421',
  SI: '+386',
  LT: '+370',
  LV: '+371',
  EE: '+372',
  IS: '+354',
  LU: '+352',
  MT: '+356',
  CY: '+357',
  DZ: '+213',
  TN: '+216',
  LY: '+218',
  SD: '+249',
  SN: '+221',
  CI: '+225',
  AO: '+244',
  MZ: '+258',
  ZW: '+263',
  ZM: '+260',
  BW: '+267',
  MU: '+230',
  RE: '+262',
  CR: '+506',
  PA: '+507',
  GT: '+502',
  HN: '+504',
  SV: '+503',
  NI: '+505',
  DO: '+1',
  JM: '+1',
  TT: '+1',
  CU: '+53',
  PR: '+1',
  AF: '+93',
  UZ: '+998',
  MN: '+976',
  LA: '+856',
  BN: '+673',
  FJ: '+679',
  PG: '+675',
};

export function dialSuffixes(fieldKey: string) {
  return {
    dial: `${fieldKey}_dial`,
    national: `${fieldKey}_national`,
  };
}

export function isPhoneMetaKey(key: string): boolean {
  return /_(dial|national|has_chat|chat_apps)$/.test(key);
}

export function combinePhone(dial: string, national: string): string {
  const d = String(dial || '')
    .trim()
    .replace(/\s+/g, '');
  const n = String(national || '')
    .trim()
    .replace(/[\s().-]/g, '');
  if (!d && !n) return '';
  const dialNorm = d.startsWith('+') ? d : d ? `+${d.replace(/^\+/, '')}` : '';
  return `${dialNorm}${n}`;
}

export function splitStoredPhone(
  full: string,
  preferredDial?: string
): { dial: string; national: string } {
  const v = String(full || '').trim();
  if (!v) {
    return { dial: preferredDial || '', national: '' };
  }
  if (v.startsWith('+')) {
    const digits = v.slice(1).replace(/\D/g, '');
    for (const len of [3, 2, 1]) {
      const cand = `+${digits.slice(0, len)}`;
      if (Object.values(COUNTRY_DIAL_CODES).includes(cand)) {
        return { dial: cand, national: digits.slice(len) };
      }
    }
    return { dial: `+${digits.slice(0, 2)}`, national: digits.slice(2) };
  }
  return { dial: preferredDial || '', national: v.replace(/\D/g, '') };
}

/** Human-readable masked details line (omits phone meta keys). */
export function formatMaskedDetailsLine(masked: Record<string, string> | undefined): string {
  const v = masked || {};
  const parts: string[] = [];
  for (const [k, val] of Object.entries(v)) {
    if (isPhoneMetaKey(k)) continue;
    if (!String(val || '').trim()) continue;
    parts.push(`${k}: ${val}`);
  }
  return parts.join(' · ') || '—';
}

/** Unique dial prefixes only (e.g. +1, +91) — no country ISO labels. */
export function uniqueDialCodesOnly(countries: Array<{ code: string }>): string[] {
  const seen = new Set<string>();
  for (const c of countries) {
    const dial = COUNTRY_DIAL_CODES[String(c.code || '').toUpperCase()];
    if (dial) seen.add(dial);
  }
  for (const dial of Object.values(COUNTRY_DIAL_CODES)) {
    seen.add(dial);
  }
  return [...seen].sort((a, b) => {
    const na = Number(a.replace(/\D/g, '')) || 0;
    const nb = Number(b.replace(/\D/g, '')) || 0;
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}
