import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  LayoutTemplate,
  Monitor,
  RotateCcw,
  Save,
  Smartphone,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserProfile } from '../../types';
import { DiscoveryCard } from '../discovery/DiscoveryCard';
import {
  DEFAULT_DISCOVERY_CARD_LAYOUT,
  DISCOVERY_CARD_WIDGETS,
  DiscoveryCardLayout,
  DiscoveryCardSlotId,
  DiscoveryCardViewportId,
  DiscoveryCardViewportLayout,
  DiscoveryCardWidgetId,
  SIZE_BOUNDS,
  PAD_BOUNDS,
  WIDTH_BOUNDS,
  SLOT_LABELS,
  H_ALIGN_LABELS,
  BOX_ALIGN_H_LABELS,
  BOX_ALIGN_V_LABELS,
  DiscoveryHAlign,
  DiscoveryBoxAlignH,
  DiscoveryBoxAlignV,
  WIDGET_ALLOWED_SLOTS,
  WIDGET_LABELS,
  discoveryCardLayoutBlocksSave,
  getDiscoveryCardConflicts,
  groupWidgetsBySlot,
  parseDiscoveryCardLayout,
} from '../../../shared/discoveryCardLayout';

const PREVIEW_USER = {
  id: 'preview-discovery-card',
  name: 'Ava Sterling',
  email: 'preview@minglecall.local',
  age: 24,
  dob: '2000-01-01',
  gender: 'female' as const,
  genderLocked: true,
  role: 'female_creator' as const,
  onlineStatus: 'online' as const,
  isVerified: true,
  nationality: 'United States',
  countryCode: 'US',
  bio: '',
  avatarUrl:
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=600',
  gallery: [
    'https://images.unsplash.com/photo-1529626455594-64432c72bba4?auto=format&fit=crop&q=80&w=600',
  ] as string[],
  interests: [] as string[],
  spokenLanguages: ['English'],
  createdAt: new Date().toISOString(),
  coinBalance: 0,
  hourlyCoinRate: 0,
  earningsCoins: 0,
  totalUSDEarnedUSD: 0,
} as unknown as UserProfile;

function cloneLayout(raw: unknown): DiscoveryCardLayout {
  return parseDiscoveryCardLayout(
    typeof raw === 'string' ? raw : JSON.parse(JSON.stringify(raw ?? DEFAULT_DISCOVERY_CARD_LAYOUT))
  );
}

function patchViewport(
  layout: DiscoveryCardLayout,
  viewport: DiscoveryCardViewportId,
  patch: Partial<DiscoveryCardViewportLayout> & { widgets?: DiscoveryCardViewportLayout['widgets'] }
): DiscoveryCardLayout {
  return parseDiscoveryCardLayout({
    ...layout,
    [viewport]: { ...layout[viewport], ...patch },
  });
}

export const AdminDiscoveryCardDesigner: React.FC = () => {
  const { systemSettings, updateSystemSettings, showToast } = useApp();
  const [draft, setDraft] = useState<DiscoveryCardLayout>(() =>
    cloneLayout(systemSettings.discoveryCardLayout ?? DEFAULT_DISCOVERY_CARD_LAYOUT)
  );
  const [editorViewport, setEditorViewport] = useState<DiscoveryCardViewportId>('mobile');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(cloneLayout(systemSettings.discoveryCardLayout ?? DEFAULT_DISCOVERY_CARD_LAYOUT));
  }, [systemSettings.discoveryCardLayout]);

  const vp = draft[editorViewport];
  const conflicts = useMemo(() => getDiscoveryCardConflicts(vp), [vp]);
  const blocksSave = discoveryCardLayoutBlocksSave(draft);
  const bySlot = useMemo(() => groupWidgetsBySlot(vp), [vp]);

  const updateWidget = (
    id: DiscoveryCardWidgetId,
    patch: Partial<{
      enabled: boolean;
      slot: DiscoveryCardSlotId;
      order: number;
      nextLine: boolean;
      hAlign: DiscoveryHAlign;
      boxAlignH: DiscoveryBoxAlignH;
      boxAlignV: DiscoveryBoxAlignV;
      padT: number;
      padR: number;
      padB: number;
      padL: number;
      widthPercent: number;
    }>
  ) => {
    setDraft((prev) => {
      const current = prev[editorViewport];
      const widgets = current.widgets.map((w) => {
        if (w.id !== id) return w;
        let slot = patch.slot ?? w.slot;
        if (!WIDGET_ALLOWED_SLOTS[id].includes(slot)) {
          slot = WIDGET_ALLOWED_SLOTS[id][0];
        }
        return {
          ...w,
          enabled: patch.enabled !== undefined ? patch.enabled : w.enabled,
          slot,
          order: patch.order !== undefined ? patch.order : w.order,
          nextLine: patch.nextLine !== undefined ? patch.nextLine : w.nextLine,
          hAlign: patch.hAlign !== undefined ? patch.hAlign : w.hAlign,
          boxAlignH: patch.boxAlignH !== undefined ? patch.boxAlignH : w.boxAlignH,
          boxAlignV: patch.boxAlignV !== undefined ? patch.boxAlignV : w.boxAlignV,
          padT: patch.padT !== undefined ? patch.padT : w.padT,
          padR: patch.padR !== undefined ? patch.padR : w.padR,
          padB: patch.padB !== undefined ? patch.padB : w.padB,
          padL: patch.padL !== undefined ? patch.padL : w.padL,
          widthPercent: patch.widthPercent !== undefined ? patch.widthPercent : w.widthPercent,
        };
      });
      return patchViewport(prev, editorViewport, { widgets });
    });
  };

  const moveInSlot = (slot: DiscoveryCardSlotId, widgetId: DiscoveryCardWidgetId, dir: -1 | 1) => {
    const list = [...bySlot[slot]];
    const idx = list.findIndex((w) => w.id === widgetId);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= list.length) return;
    const a = list[idx];
    const b = list[swap];
    setDraft((prev) => {
      const current = prev[editorViewport];
      const widgets = current.widgets.map((w) => {
        if (w.id === a.id) return { ...w, order: b.order };
        if (w.id === b.id) return { ...w, order: a.order };
        return w;
      });
      const slotWidgets = widgets
        .filter((w) => w.enabled && w.slot === slot)
        .sort((x, y) => x.order - y.order);
      slotWidgets.forEach((w, i) => {
        const target = widgets.find((x) => x.id === w.id);
        if (target) target.order = i;
      });
      return patchViewport(prev, editorViewport, { widgets });
    });
  };

  const updateVpField = <K extends keyof DiscoveryCardViewportLayout>(
    key: K,
    value: DiscoveryCardViewportLayout[K]
  ) => {
    setDraft((prev) => patchViewport(prev, editorViewport, { [key]: value }));
  };

  const handleSave = async () => {
    if (blocksSave) {
      showToast(
        'Cannot save',
        'Fix overcrowded top corners on Mobile and Desktop (max 2 chip widgets per corner).',
        'error'
      );
      return;
    }
    const safe = parseDiscoveryCardLayout(draft);
    setSaving(true);
    try {
      updateSystemSettings({ discoveryCardLayout: safe });
    } catch (e: any) {
      showToast('Save failed', e?.message || 'Failed to save layout', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(cloneLayout(DEFAULT_DISCOVERY_CARD_LAYOUT));
    showToast('Reset', 'Default layout restored in the editor (not saved yet).', 'info');
  };

  const viewportToggle = (
    <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/80 p-0.5">
      <button
        type="button"
        onClick={() => setEditorViewport('mobile')}
        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
          editorViewport === 'mobile'
            ? 'bg-pink-600 text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Smartphone className="w-3.5 h-3.5" />
        Mobile
      </button>
      <button
        type="button"
        onClick={() => setEditorViewport('desktop')}
        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
          editorViewport === 'desktop'
            ? 'bg-pink-600 text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Monitor className="w-3.5 h-3.5" />
        Desktop
      </button>
    </div>
  );

  return (
    <div id="admin-discovery-card-designer" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-pink-400" />
            Discovery Card Designer
          </h3>
          <p className="text-xs text-slate-400 max-w-xl">
            Edit Mobile and Desktop layouts separately. Widget placement, sizes, and aspect apply per
            breakpoint; photo settings are shared. Invalid config never crashes the live grid.
          </p>
        </div>
        {viewportToggle}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        {/* Controls */}
        <div className="space-y-4">
          {/* Widgets */}
          <div className="rounded-2xl border border-slate-800 bg-[#0F1115] p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Widgets — {editorViewport === 'mobile' ? 'Mobile' : 'Desktop'}
            </h4>
            <p className="text-[10px] text-slate-500">
              Zone + Next line + Align + <strong className="text-slate-400">Width %</strong> (0=auto,
              100=full row). Changes apply only to the selected breakpoint.
            </p>
            <div className="space-y-2">
              {DISCOVERY_CARD_WIDGETS.map((id) => {
                const w = vp.widgets.find((x) => x.id === id)!;
                const allowed = WIDGET_ALLOWED_SLOTS[id];
                return (
                  <div
                    key={id}
                    className="flex flex-col gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800"
                  >
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <label className="flex items-center gap-2 min-w-[120px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={w.enabled}
                          onChange={(e) => updateWidget(id, { enabled: e.target.checked })}
                          className="accent-pink-500 w-4 h-4"
                        />
                        <span className="text-xs font-semibold text-slate-200">{WIDGET_LABELS[id]}</span>
                      </label>
                      <select
                        disabled={!w.enabled}
                        value={w.slot}
                        onChange={(e) => updateWidget(id, { slot: e.target.value as DiscoveryCardSlotId })}
                        className="flex-1 min-w-[130px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 disabled:opacity-40"
                        title="Zone"
                      >
                        {allowed.map((slot) => (
                          <option key={slot} value={slot}>
                            {SLOT_LABELS[slot]}
                          </option>
                        ))}
                      </select>
                      <select
                        disabled={!w.enabled}
                        value={w.hAlign}
                        onChange={(e) => updateWidget(id, { hAlign: e.target.value as DiscoveryHAlign })}
                        className="w-[96px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 disabled:opacity-40"
                        title="Line align (Left / Right)"
                      >
                        {(Object.keys(H_ALIGN_LABELS) as DiscoveryHAlign[]).map((a) => (
                          <option key={a} value={a}>
                            {H_ALIGN_LABELS[a]}
                          </option>
                        ))}
                      </select>
                      <label
                        className={`flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer shrink-0 ${
                          w.enabled ? 'text-slate-300' : 'text-slate-600'
                        }`}
                        title="Start this widget on a new line within its zone"
                      >
                        <input
                          type="checkbox"
                          disabled={!w.enabled}
                          checked={w.nextLine}
                          onChange={(e) => updateWidget(id, { nextLine: e.target.checked })}
                          className="accent-pink-500 w-3.5 h-3.5"
                        />
                        Next line
                      </label>
                    </div>
                    <label
                      className={`space-y-0.5 ${w.enabled ? '' : 'opacity-40 pointer-events-none'}`}
                    >
                      <span className="text-[9px] font-bold text-slate-500 uppercase flex justify-between">
                        <span>Line width</span>
                        <span className="font-mono text-slate-400">
                          {w.widthPercent <= 0 ? 'Auto' : `${w.widthPercent}%`}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={WIDTH_BOUNDS.min}
                        max={WIDTH_BOUNDS.max}
                        step={5}
                        value={w.widthPercent}
                        disabled={!w.enabled}
                        onChange={(e) => updateWidget(id, { widthPercent: Number(e.target.value) })}
                        className="w-full accent-pink-500"
                        title="0 = auto; 100 = full width line"
                      />
                    </label>
                    <div
                      className={`flex flex-wrap items-center gap-2 ${
                        w.enabled ? '' : 'opacity-40 pointer-events-none'
                      }`}
                    >
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span className="font-bold uppercase shrink-0">In box</span>
                        <select
                          disabled={!w.enabled}
                          value={w.boxAlignH}
                          onChange={(e) =>
                            updateWidget(id, { boxAlignH: e.target.value as DiscoveryBoxAlignH })
                          }
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
                          title="Horizontal position inside width box"
                        >
                          {(Object.keys(BOX_ALIGN_H_LABELS) as DiscoveryBoxAlignH[]).map((a) => (
                            <option key={a} value={a}>
                              {BOX_ALIGN_H_LABELS[a]}
                            </option>
                          ))}
                        </select>
                        <select
                          disabled={!w.enabled}
                          value={w.boxAlignV}
                          onChange={(e) =>
                            updateWidget(id, { boxAlignV: e.target.value as DiscoveryBoxAlignV })
                          }
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
                          title="Vertical position inside width box / on the line"
                        >
                          {(Object.keys(BOX_ALIGN_V_LABELS) as DiscoveryBoxAlignV[]).map((a) => (
                            <option key={a} value={a}>
                              {BOX_ALIGN_V_LABELS[a]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div
                      className={`grid grid-cols-4 gap-2 ${w.enabled ? '' : 'opacity-40 pointer-events-none'}`}
                    >
                      {(
                        [
                          ['padT', 'Off T', w.padT],
                          ['padR', 'Off R', w.padR],
                          ['padB', 'Off B', w.padB],
                          ['padL', 'Off L', w.padL],
                        ] as const
                      ).map(([key, label, value]) => (
                        <label key={key} className="space-y-0.5">
                          <span className="text-[9px] font-bold text-slate-500 uppercase flex justify-between">
                            <span>{label}</span>
                            <span className="font-mono text-slate-400">
                              {value > 0 ? `+${value}` : value}px
                            </span>
                          </span>
                          <input
                            type="range"
                            min={PAD_BOUNDS.min}
                            max={PAD_BOUNDS.max}
                            value={value}
                            disabled={!w.enabled}
                            onChange={(e) => updateWidget(id, { [key]: Number(e.target.value) })}
                            className="w-full accent-pink-500"
                            title={`Offset ${label} (${PAD_BOUNDS.min}…${PAD_BOUNDS.max}px). Negative pulls; positive pushes.`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Slot order */}
          <div className="rounded-2xl border border-slate-800 bg-[#0F1115] p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Slot order — {editorViewport === 'mobile' ? 'Mobile' : 'Desktop'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(bySlot) as DiscoveryCardSlotId[]).map((slot) => {
                const list = bySlot[slot];
                if (!list.length) return null;
                return (
                  <div key={slot} className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5 space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">{SLOT_LABELS[slot]}</div>
                    {list.map((w) => (
                      <div key={w.id} className="flex items-center justify-between gap-2 text-xs text-slate-200">
                        <span className="truncate">
                          {w.nextLine ? '↳ ' : ''}
                          {WIDGET_LABELS[w.id]}
                          <span className="text-slate-500 ml-1">
                            ({w.hAlign}
                            {w.widthPercent > 0 ? ` · ${w.widthPercent}%` : ''})
                          </span>
                        </span>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveInSlot(slot, w.id, -1)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700"
                            title="Move earlier (up)"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveInSlot(slot, w.id, 1)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700"
                            title="Move later (down)"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overlap */}
          {conflicts.length > 0 && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 space-y-2">
              <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Overlap / shared slots ({editorViewport === 'mobile' ? 'Mobile' : 'Desktop'})
              </h4>
              {conflicts.map((c) => (
                <div key={c.slot} className="text-xs text-amber-100/90 space-y-1.5">
                  <div>
                    <strong>{SLOT_LABELS[c.slot]}</strong>: {c.widgets.map((id) => WIDGET_LABELS[id]).join(' + ')}
                    {c.blocksSave
                      ? ' — too crowded (max 2 chips). Move or disable one.'
                      : ' — move one or turn one off if crowded.'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.widgets.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => updateWidget(id, { enabled: false })}
                        className="px-2 py-0.5 rounded-lg bg-amber-900/60 border border-amber-600/40 text-amber-100 text-[10px] font-bold"
                      >
                        Disable {WIDGET_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sizes */}
          <div className="rounded-2xl border border-slate-800 bg-[#0F1115] p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Sizes — {editorViewport === 'mobile' ? 'Mobile' : 'Desktop'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {(
                [
                  ['nameFontPx', 'Name font (px)'],
                  ['metaFontPx', 'Meta / country font (px)'],
                  ['badgeFontPx', 'Badge font (px)'],
                  ['verifiedIconPx', 'Verified icon (px)'],
                  ['callButtonPx', 'Call button (px)'],
                  ['callIconPx', 'Call icon (px)'],
                ] as const
              ).map(([key, label]) => {
                const bounds = SIZE_BOUNDS[key];
                return (
                  <label key={key} className="space-y-1">
                    <span className="text-slate-400 font-semibold flex justify-between">
                      <span>{label}</span>
                      <span className="font-mono text-slate-300">{vp[key]}</span>
                    </span>
                    <input
                      type="range"
                      min={bounds.min}
                      max={bounds.max}
                      value={vp[key]}
                      onChange={(e) => updateVpField(key, Number(e.target.value))}
                      className="w-full accent-pink-500"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">
                      {bounds.min}–{bounds.max}
                    </span>
                  </label>
                );
              })}

              <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={vp.statusBadgePing}
                  onChange={(e) => updateVpField('statusBadgePing', e.target.checked)}
                  className="accent-pink-500 w-4 h-4"
                />
                <span className="text-slate-300 font-semibold">Online badge status dot</span>
              </label>

              <label className="space-y-1">
                <span className="text-slate-400 font-semibold">Flag size</span>
                <select
                  value={vp.flagSize}
                  onChange={(e) => updateVpField('flagSize', e.target.value as DiscoveryCardViewportLayout['flagSize'])}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200"
                >
                  <option value="xxs">xxs</option>
                  <option value="xs">xs</option>
                  <option value="sm">sm</option>
                  <option value="md">md</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-slate-400 font-semibold">Call style</span>
                <select
                  value={vp.callStyle}
                  onChange={(e) =>
                    updateVpField('callStyle', e.target.value as DiscoveryCardViewportLayout['callStyle'])
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200"
                >
                  <option value="circle">Circle</option>
                  <option value="pill">Pill</option>
                </select>
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-slate-400 font-semibold">
                  {editorViewport === 'mobile' ? 'Mobile' : 'Desktop'} aspect
                </span>
                <select
                  value={vp.cardAspect}
                  onChange={(e) =>
                    updateVpField(
                      'cardAspect',
                      e.target.value as DiscoveryCardViewportLayout['cardAspect']
                    )
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200"
                >
                  {editorViewport === 'mobile' ? (
                    <>
                      <option value="9/16">9/16 (tall)</option>
                      <option value="2/3">2/3</option>
                    </>
                  ) : (
                    <>
                      <option value="3/4">3/4</option>
                      <option value="2/3">2/3</option>
                    </>
                  )}
                </select>
              </label>
            </div>
          </div>

          {/* Picture — shared */}
          <div className="rounded-2xl border border-slate-800 bg-[#0F1115] p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Card picture <span className="text-slate-500 font-semibold normal-case">(shared)</span>
            </h4>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.showPhoto}
                onChange={(e) =>
                  setDraft((prev) =>
                    parseDiscoveryCardLayout({ ...prev, showPhoto: e.target.checked })
                  )
                }
                className="accent-pink-500 w-4 h-4"
              />
              Show host photo
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-slate-400 font-semibold">Photo source</span>
                <select
                  disabled={!draft.showPhoto}
                  value={draft.photoSource}
                  onChange={(e) =>
                    setDraft((prev) =>
                      parseDiscoveryCardLayout({ ...prev, photoSource: e.target.value })
                    )
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 disabled:opacity-40"
                >
                  <option value="avatarThenGallery">Avatar, then gallery</option>
                  <option value="avatar">Avatar only</option>
                  <option value="galleryFirst">Gallery first</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-400 font-semibold">Fit</span>
                <select
                  disabled={!draft.showPhoto}
                  value={draft.photoFit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      parseDiscoveryCardLayout({ ...prev, photoFit: e.target.value })
                    )
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 disabled:opacity-40"
                >
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-400 font-semibold">Position</span>
                <select
                  disabled={!draft.showPhoto}
                  value={draft.photoPosition}
                  onChange={(e) =>
                    setDraft((prev) =>
                      parseDiscoveryCardLayout({ ...prev, photoPosition: e.target.value })
                    )
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 disabled:opacity-40"
                >
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* Preview — sticky with Save/Reset */}
        <div className="rounded-2xl border border-slate-800 bg-[#0F1115] p-4 space-y-3 xl:sticky xl:top-24 xl:z-30 xl:self-start h-fit shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live preview</h4>
            <span className="text-[10px] font-bold text-pink-300">
              Editing: {editorViewport === 'mobile' ? 'Mobile' : 'Desktop'}
            </span>
          </div>
          <div className="flex justify-center">{viewportToggle}</div>
          <div className="max-w-[220px] mx-auto">
            <DiscoveryCard
              user={PREVIEW_USER}
              layout={draft}
              onStartCall={() => undefined}
              onOpenProfile={() => undefined}
              previewMode
              previewViewport={editorViewport}
              peakHoursStart="00:00"
              peakHoursEnd="00:00"
            />
          </div>
          <p className="text-[10px] text-slate-500 text-center">
            Preview uses a sample Online + Verified host. Save applies both Mobile and Desktop to
            Discovery.
          </p>
          <div className="flex flex-col gap-2 pt-1 border-t border-slate-800">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || blocksSave}
              className="w-full px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save layout'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-700"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
