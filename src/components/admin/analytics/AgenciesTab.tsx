import React, { useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Eye, Landmark } from 'lucide-react';
import { UserProfile, CallLogItem } from '../../../types';
import {
  AgencyPnLRow,
  DateRange,
  filterCallLogsByRange,
  formatCoins,
} from '../../../utils/adminAnalytics';
import { RoleBadge } from './RoleBadge';

interface AgenciesTabProps {
  agencies: AgencyPnLRow[];
  callLogs: CallLogItem[];
  range: DateRange;
  onInspectUser: (user: UserProfile) => void;
  onOpenFinancialModule?: () => void;
}

export const AgenciesTab: React.FC<AgenciesTabProps> = ({
  agencies,
  callLogs,
  range,
  onInspectUser,
  onOpenFinancialModule,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const periodLogs = filterCallLogsByRange(callLogs, range);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-black text-white font-mono uppercase">
            Agencies ({agencies.length})
          </h3>
        </div>
        {onOpenFinancialModule && (
          <button
            type="button"
            onClick={onOpenFinancialModule}
            className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
          >
            <Landmark className="w-3 h-3" /> Settlement / remittance → Financial Module
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 font-mono">
        Operational agency metrics (roster, online, calls, minutes). Host/TL remittance and period P&amp;L
        stay in Financial Module.
      </p>

      {agencies.length === 0 ? (
        <div className="p-8 text-center text-xs font-mono text-slate-500 border border-dashed border-slate-800 rounded-2xl">
          No Agencies registered yet.
        </div>
      ) : (
        <div className="space-y-3">
          {agencies.map((a) => {
            const open = expandedId === a.leader.id;
            return (
              <div key={a.leader.id} className="bg-[#13161F] border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : a.leader.id)}
                      className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <img src={a.leader.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover ring-1 ring-amber-500/40" />
                    <div className="min-w-0">
                      <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                        {a.leader.name} <RoleBadge user={a.leader} />
                      </div>
                      <div className="text-[11px] font-mono text-amber-300">
                        {a.leader.agencyName || 'Talent Agency'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 text-[10px] font-mono flex-1">
                    <div>
                      <div className="text-slate-500">Roster</div>
                      <div className="text-white font-bold">{a.rosterSize}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Online %</div>
                      <div className="text-emerald-400 font-bold">{a.onlinePercent}%</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Period calls</div>
                      <div className="text-white font-bold">{a.periodCalls}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Period mins</div>
                      <div className="text-slate-200 font-bold">{a.periodMinutes}m</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Top-3 conc.</div>
                      <div className="text-rose-300 font-bold">
                        {a.top3ConcentrationPercent == null ? '—' : `${a.top3ConcentrationPercent}%`}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onInspectUser(a.leader)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Eye className="w-3 h-3 text-amber-400" /> Inspect TL
                  </button>
                </div>

                {open && (
                  <div className="border-t border-slate-800 bg-slate-950/50 p-4 overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono min-w-[640px]">
                      <thead className="text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="py-2 px-2">Host</th>
                          <th className="py-2 px-2">Period calls</th>
                          <th className="py-2 px-2">Hours</th>
                          <th className="py-2 px-2">Health</th>
                          <th className="py-2 px-2">Last active</th>
                          <th className="py-2 px-2">Earnings bal.</th>
                          <th className="py-2 px-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {a.roster.map((host) => {
                          const logs = periodLogs.filter((l) => l.receiverId === host.id);
                          const mins = Math.round(
                            logs.reduce((sum, l) => sum + (l.durationSeconds || 0), 0) / 60
                          );
                          const last = logs
                            .map((l) => l.startTime || Date.parse(l.timestamp || ''))
                            .filter((n) => Number.isFinite(n) && n > 0)
                            .sort((x, y) => y - x)[0];
                          const acceptance =
                            typeof host.acceptanceRatePercent === 'number'
                              ? `${host.acceptanceRatePercent}%`
                              : '—';
                          return (
                            <tr key={host.id}>
                              <td className="py-2 px-2">
                                <div className="flex items-center gap-2">
                                  <img src={host.avatarUrl} alt="" className="w-7 h-7 rounded-lg object-cover" />
                                  <span className="text-white font-bold font-sans">{host.name}</span>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-slate-300">{logs.length}</td>
                              <td className="py-2 px-2 text-slate-300">{(mins / 60).toFixed(1)}h</td>
                              <td className="py-2 px-2 text-slate-400">Acc {acceptance}</td>
                              <td className="py-2 px-2 text-slate-400">
                                {last ? new Date(last).toLocaleDateString() : '—'}
                              </td>
                              <td className="py-2 px-2 text-amber-300">{formatCoins(host.earningsCoins || 0)}</td>
                              <td className="py-2 px-2">
                                <button
                                  type="button"
                                  onClick={() => onInspectUser(host)}
                                  className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {a.roster.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-slate-500">
                              Empty roster.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <div className="mt-2 text-[10px] text-slate-500 font-mono">
                      Period {a.periodCalls} calls / {a.periodMinutes}m · Remittance &amp; commission in Financial Module
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
