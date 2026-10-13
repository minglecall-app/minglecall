import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  FINANCE_CRON_CADENCES,
  normalizeFinanceCronCadence,
  type FinanceCronCadence,
} from '../../../shared/finance/cronCadence';

const OPTIONS = Object.entries(FINANCE_CRON_CADENCES) as Array<
  [FinanceCronCadence, (typeof FINANCE_CRON_CADENCES)[FinanceCronCadence]]
>;

export const AdminCronSchedulePanel: React.FC = () => {
  const { systemSettings, updateSystemSettings, showToast } = useApp();
  const current = normalizeFinanceCronCadence(systemSettings.financeCronCadence);
  const [selected, setSelected] = useState<FinanceCronCadence>(current);
  const choice = FINANCE_CRON_CADENCES[selected];

  const save = () => {
    updateSystemSettings({ financeCronCadence: selected });
    showToast?.(
      'Close job schedule saved',
      selected === 'daily'
        ? 'Daily is active. Keep vercel.json on 0 0 * * * for the Hobby plan.'
        : `${choice.label} is saved. After the Vercel project is on Pro, set vercel.json to ${choice.expression} and push again.`,
      'success'
    );
  };

  return (
    <div className="max-w-xl space-y-5 text-app">
      <div>
        <h2 className="font-display text-xl text-app-heading">Close job schedule</h2>
        <p className="mt-1 text-sm text-app-muted">
          Hobby deploys must stay on Daily. Hourly, 12 hours, and 6 hours need Vercel Pro and a new push so vercel.json matches this choice.
        </p>
      </div>

      <div className="space-y-2">
        {OPTIONS.map(([id, option]) => (
          <label
            key={id}
            className="flex items-start gap-3 rounded-app border border-app bg-app-card px-3 py-3 cursor-pointer"
          >
            <input
              type="radio"
              name="finance-cron-cadence"
              checked={selected === id}
              onChange={() => setSelected(id)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm text-app-heading">{option.label}</span>
              <span className="block text-xs text-app-muted">
                {option.plan === 'hobby' ? 'Hobby-safe' : 'Pro only'} · {option.expression}
              </span>
            </span>
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        className="rounded-app bg-brand px-4 py-2 text-sm font-medium text-white"
      >
        Save schedule
      </button>

      <p className="text-xs text-app-muted">
        Saved value: {current}. Vercel calls the job from the cron line in vercel.json. This setting also skips a run that arrives sooner than the selected gap.
      </p>
    </div>
  );
};
