import React, { useCallback, useEffect, useState } from 'react';
import { Landmark, RefreshCw, Smartphone, Users, Wallet } from 'lucide-react';
import type { PayoutMethodKey, UserPayoutCard } from '../../../shared/payout/types';
import { formatMaskedDetailsLine } from '../../../shared/payout/phoneUi';
import { fetchPayoutCardsRoster } from '../../services/payoutApi';

const ICON: Record<PayoutMethodKey, React.ReactNode> = {
  paypal: <Wallet className="w-4 h-4 text-blue-400" />,
  bank_account: <Landmark className="w-4 h-4 text-emerald-400" />,
  wallet: <Smartphone className="w-4 h-4 text-amber-400" />,
};

/** Read-only roster of managed hosts' (and own) payout cards for TL/admin payment ops. */
export const PayoutRosterPanel: React.FC<{ title?: string }> = ({
  title = 'Team payout cards',
}) => {
  const [cards, setCards] = useState<UserPayoutCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await fetchPayoutCardsRoster());
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-400" />
          {title}
        </h3>
        <button
          type="button"
          onClick={load}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Masked remittance details for hosts you manage (and your own). Use full details when paying
        locally after period close.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
            <tr>
              <th className="p-2">User</th>
              <th className="p-2">Method</th>
              <th className="p-2">Country</th>
              <th className="p-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {cards.map((c) => (
              <tr key={c.id}>
                <td className="p-2 font-bold text-white">
                  {c.userName || c.userId}
                  {c.isPrimary ? (
                    <span className="ml-1 text-[10px] text-amber-300">★</span>
                  ) : null}
                </td>
                <td className="p-2">
                  <span className="inline-flex items-center gap-1.5 capitalize">
                    {ICON[c.methodKey]}
                    {c.methodKey.replace('_', ' ')}
                  </span>
                </td>
                <td className="p-2 font-mono">{c.countryCode}</td>
                <td className="p-2 font-mono text-[10px] text-slate-400 max-w-xs truncate">
                  {formatMaskedDetailsLine(c.maskedValues)}
                </td>
              </tr>
            ))}
            {!cards.length && !loading && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-500">
                  No payout cards saved by your team yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
