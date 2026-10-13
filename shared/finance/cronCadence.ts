export const FINANCE_CRON_CADENCES = {
  daily: {
    label: 'Daily',
    expression: '0 0 * * *',
    minGapMs: 20 * 60 * 60 * 1000,
    plan: 'hobby',
  },
  every_12h: {
    label: 'Every 12 hours',
    expression: '0 */12 * * *',
    minGapMs: 11 * 60 * 60 * 1000,
    plan: 'pro',
  },
  every_6h: {
    label: 'Every 6 hours',
    expression: '0 */6 * * *',
    minGapMs: 5 * 60 * 60 * 1000,
    plan: 'pro',
  },
  hourly: {
    label: 'Hourly',
    expression: '0 * * * *',
    minGapMs: 50 * 60 * 1000,
    plan: 'pro',
  },
} as const;

export type FinanceCronCadence = keyof typeof FINANCE_CRON_CADENCES;

export function normalizeFinanceCronCadence(raw: unknown): FinanceCronCadence {
  const value = String(raw || '').trim();
  if (value in FINANCE_CRON_CADENCES) return value as FinanceCronCadence;
  return 'daily';
}
