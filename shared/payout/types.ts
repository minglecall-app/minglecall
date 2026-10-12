/** Shared payout method template + user card types (CMS + Host/TL UI). */

export type PayoutMethodKey = 'paypal' | 'bank_account' | 'wallet';

export type PayoutFieldType = 'text' | 'phone' | 'email' | 'number' | 'select';

export type PayoutCountriesMode = 'all' | 'selected';

export interface PayoutFieldDef {
  id: string;
  key: string;
  label: string;
  type: PayoutFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface PayoutMethodTemplate {
  methodKey: PayoutMethodKey;
  label: string;
  icon: string;
  description: string;
  isEnabled: boolean;
  countriesMode: PayoutCountriesMode;
  countryCodes: string[];
  fields: PayoutFieldDef[];
  sortOrder: number;
  updatedAt?: string;
}

export interface UserPayoutCard {
  id: string;
  userId: string;
  methodKey: PayoutMethodKey;
  countryCode: string;
  values: Record<string, string>;
  isPrimary: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** Present on roster responses */
  userName?: string;
  userRole?: string;
  /** Masked summary fields for roster */
  maskedValues?: Record<string, string>;
}

export const PAYOUT_METHOD_KEYS: PayoutMethodKey[] = ['paypal', 'bank_account', 'wallet'];

export function isPayoutMethodKey(v: unknown): v is PayoutMethodKey {
  return v === 'paypal' || v === 'bank_account' || v === 'wallet';
}

export function isPayoutFieldType(v: unknown): v is PayoutFieldType {
  return v === 'text' || v === 'phone' || v === 'email' || v === 'number' || v === 'select';
}
