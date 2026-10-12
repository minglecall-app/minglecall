import React, { useId, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Tooltip,
} from 'recharts';
import { Users, PhoneCall, Clock, Coins, DollarSign, Percent } from 'lucide-react';
import { TlKpiDayPoint } from '../../utils/teamLeaderKpiSeries';

export interface TeamLeaderKpiBoardProps {
  series: TlKpiDayPoint[];
  creatorsTotal: number;
  creatorsOnline: number;
  totalCalls: number;
  totalMinutes: number;
  hostCoins: number;
  hostUsd: number;
  tlUsd: number;
  tlCoins: number;
  tlLoading?: boolean;
}

const MiniSpark: React.FC<{
  data: TlKpiDayPoint[];
  dataKey: keyof TlKpiDayPoint;
  color: string;
  gradId: string;
}> = ({ data, dataKey, color, gradId }) => {
  const hasActivity = data.some((d) => Number(d[dataKey]) > 0);
  if (!hasActivity) {
    return <div className="h-10 w-full rounded-lg bg-slate-900/60 border border-dashed border-slate-800" />;
  }
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            contentStyle={{
              backgroundColor: '#0F172A',
              borderColor: '#334155',
              borderRadius: 10,
              fontSize: 10,
              color: '#F8FAFC',
            }}
            labelFormatter={(_, payload) => (payload?.[0]?.payload?.label as string) || ''}
          />
          <Area
            type="monotone"
            dataKey={dataKey as string}
            stroke={color}
            fill={`url(#${gradId})`}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const SmallKpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  accent: string;
  icon: React.ReactNode;
  chart: React.ReactNode;
}> = ({ label, value, sub, accent, icon, chart }) => (
  <div
    className={`bg-[#13161F] border border-slate-800 border-l-[3px] ${accent} rounded-2xl p-3.5 flex flex-col gap-2 min-h-[118px]`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      {icon}
    </div>
    <div>
      <div className="text-xl font-black font-mono text-white tracking-tight">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{sub}</div>}
    </div>
    <div className="mt-auto">{chart}</div>
  </div>
);

export const TeamLeaderKpiBoard: React.FC<TeamLeaderKpiBoardProps> = ({
  series,
  creatorsTotal,
  creatorsOnline,
  totalCalls,
  totalMinutes,
  hostCoins,
  hostUsd,
  tlUsd,
  tlCoins,
  tlLoading,
}) => {
  const uid = useId().replace(/:/g, '');
  const creatorsOffline = Math.max(0, creatorsTotal - creatorsOnline);
  const composition = useMemo(
    () => [
      { name: 'Online', value: creatorsOnline },
      { name: 'Offline', value: creatorsOffline },
    ],
    [creatorsOnline, creatorsOffline]
  );
  const hasHeroActivity = series.some((d) => d.tlUsd > 0 || d.tlCoins > 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Hero — TL Earnings */}
        <div className="lg:col-span-2 lg:row-span-2 bg-[#13161F] border border-amber-500/40 border-l-[3px] border-l-amber-400 rounded-2xl p-4 sm:p-5 flex flex-col min-h-[220px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300/90">
                <Percent className="w-3.5 h-3.5" />
                Agency Earnings
              </div>
              <div className="mt-2 text-3xl sm:text-4xl font-black font-mono text-amber-300 tracking-tight">
                {tlLoading ? '…' : `$${tlUsd.toFixed(2)}`}
              </div>
              <p className="mt-1 text-xs text-amber-400/80 font-mono">
                {tlCoins.toLocaleString()} coins · from call splits · last 7d trend
              </p>
            </div>
            <div className="hidden sm:flex px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono text-amber-300">
              Hero KPI
            </div>
          </div>

          <div className="mt-4 flex-1 min-h-[120px]">
            {!hasHeroActivity ? (
              <div className="h-[120px] flex items-center justify-center text-[11px] font-mono text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No call-split activity in the last 7 days
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={series} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`tlHeroGrad-${uid}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: 12,
                      fontSize: 11,
                      color: '#F8FAFC',
                    }}
                    formatter={(value: number | string) => [
                      `$${Number(value).toFixed(2)}`,
                      'Agency USD',
                    ]}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload?.label as string) || ''
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="tlUsd"
                    name="Agency USD"
                    stroke="#F59E0B"
                    fill={`url(#tlHeroGrad-${uid})`}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Side stack — Creators + Calls */}
        <div className="flex flex-col gap-3">
          <SmallKpiCard
            label="Managed Creators"
            value={String(creatorsTotal)}
            sub={`${creatorsOnline} online · ${creatorsOffline} offline`}
            accent="border-l-pink-500/70"
            icon={<Users className="w-4 h-4 text-pink-400" />}
            chart={
              creatorsTotal === 0 ? (
                <div className="h-10 w-full rounded-lg bg-slate-900/60 border border-dashed border-slate-800" />
              ) : (
                <div className="h-10 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={composition} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <Bar dataKey="value" fill="#EC4899" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            }
          />
          <SmallKpiCard
            label="Video Calls"
            value={String(totalCalls)}
            sub="sessions (all time)"
            accent="border-l-emerald-500/70"
            icon={<PhoneCall className="w-4 h-4 text-emerald-400" />}
            chart={
              <MiniSpark
                data={series}
                dataKey="calls"
                color="#34D399"
                gradId={`tlCallsGrad-${uid}`}
              />
            }
          />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SmallKpiCard
          label="Live Minutes"
          value={totalMinutes.toLocaleString()}
          sub="mins hosted"
          accent="border-l-sky-500/70"
          icon={<Clock className="w-4 h-4 text-sky-400" />}
          chart={
            <MiniSpark
              data={series}
              dataKey="minutes"
              color="#38BDF8"
              gradId={`tlMinsGrad-${uid}`}
            />
          }
        />
        <SmallKpiCard
          label="Host Coins"
          value={hostCoins.toLocaleString()}
          sub="accumulated"
          accent="border-l-amber-500/70"
          icon={<Coins className="w-4 h-4 text-amber-400" />}
          chart={
            <MiniSpark
              data={series}
              dataKey="hostCoins"
              color="#FBBF24"
              gradId={`tlHostCoinsGrad-${uid}`}
            />
          }
        />
        <SmallKpiCard
          label="Host Revenue"
          value={`$${hostUsd.toFixed(2)}`}
          sub="@ Coin USD Peg"
          accent="border-l-emerald-500/70"
          icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
          chart={
            <MiniSpark
              data={series}
              dataKey="hostUsd"
              color="#10B981"
              gradId={`tlHostUsdGrad-${uid}`}
            />
          }
        />
      </div>
    </div>
  );
};
