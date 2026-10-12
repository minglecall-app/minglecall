import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  INITIAL_APP_NAV_ITEMS,
  itemsForSlice,
  NAV_BADGES,
  NAV_DESTINATIONS,
  NAV_SUBMENU_BARS,
  childNavItems,
  topLevelNavItems,
  type AppNavItem,
  type NavAudienceRole,
  type NavBarId,
  type NavBadge,
  type NavSlot,
} from '../../../shared/appNav';
import { NAV_ICON_NAMES, NavIcon } from '../../navigation/appNavConfig';
import { BrandLockup } from '../navigation/ConfiguredChrome';

const ROLES: { id: NavAudienceRole; label: string }[] = [
  { id: 'admin', label: 'Admin' },
  { id: 'team_leader', label: 'Agency' },
  { id: 'male_user', label: 'Male user' },
  { id: 'female_user', label: 'Female user' },
  { id: 'female_host', label: 'Female hosts' },
  { id: 'guest', label: 'Guest' },
];

const BARS: { id: NavBarId; label: string }[] = [
  { id: 'brand', label: 'Brand' },
  { id: 'main_header', label: 'Main header' },
  { id: 'logged_out_header', label: 'Logged-out header' },
  { id: 'subheader', label: 'Sub-header' },
  { id: 'mobile_bottom', label: 'Mobile bottom' },
  { id: 'persona_menu', label: 'Persona menu' },
];

function cloneItems(items: AppNavItem[]): AppNavItem[] {
  return items.map((item) => ({ ...item, meta: item.meta ? { ...item.meta } : null }));
}

function sliceAudience(bar: NavBarId, role: NavAudienceRole): NavAudienceRole {
  if (bar === 'brand') return '*';
  if (bar === 'logged_out_header') return 'guest';
  return role === 'guest' || role === '*' ? 'male_user' : role;
}

export const AdminNavBarEditor: React.FC = () => {
  const { appNavItems, saveAppNavSlice } = useApp();
  const [role, setRole] = useState<NavAudienceRole>('male_user');
  const [bar, setBar] = useState<NavBarId>('main_header');
  const [slot, setSlot] = useState<NavSlot>('left');
  const [draft, setDraft] = useState<AppNavItem[]>([]);
  const [baseline, setBaseline] = useState('[]');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [submenuFor, setSubmenuFor] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<NavAudienceRole>('admin');

  const audience = sliceAudience(bar, role);
  const slotFilter: NavSlot | null = bar === 'main_header' ? slot : null;

  useEffect(() => {
    const next = cloneItems(itemsForSlice(appNavItems, audience, bar, slotFilter));
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, [appNavItems, audience, bar, slotFilter]);

  const dirty = JSON.stringify(draft) !== baseline;
  const supportsSubmenu = NAV_SUBMENU_BARS.has(bar);
  const activeCount = draft.filter((item) => item.active && !item.parentId).length;
  const logoutHidden = bar === 'persona_menu' && !draft.some((item) => item.active && item.actionTarget === 'logout');

  const destinations = NAV_DESTINATIONS.filter((dest) =>
    bar === 'brand' ? dest.actionType === 'tab' : dest.bars.includes(bar)
  );
  const submenuDestinations = destinations.filter((dest) => dest.actionTarget !== 'none');

  const confirmSwitch = () => {
    if (!dirty) return true;
    return window.confirm('You have unsaved navigation changes. Discard them?');
  };

  const selectRole = (next: NavAudienceRole) => {
    if (next === role) return;
    if (!confirmSwitch()) return;
    setRole(next);
  };

  const selectBar = (next: NavBarId) => {
    if (next === bar) return;
    if (!confirmSwitch()) return;
    setBar(next);
  };

  const moveSibling = (id: string, dir: -1 | 1) => {
    setDraft((prev) => {
      const current = prev.find((item) => item.id === id);
      if (!current) return prev;
      const siblings = prev
        .filter((item) => (item.parentId || null) === (current.parentId || null))
        .slice()
        .sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((item) => item.id === id);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= siblings.length) return prev;
      const nextSiblings = siblings.slice();
      const [row] = nextSiblings.splice(index, 1);
      nextSiblings.splice(target, 0, row);
      const orderById = new Map(nextSiblings.map((item, order) => [item.id, order + 1]));
      return prev.map((item) => (orderById.has(item.id) ? { ...item, order: orderById.get(item.id)! } : item));
    });
  };

  const removeItem = (id: string) => {
    setDraft((prev) => prev.filter((item) => item.id !== id && item.parentId !== id));
  };

  const updateItem = (id: string, patch: Partial<AppNavItem>) => {
    setDraft((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch, meta: patch.meta ?? item.meta } : item)));
  };

  const addDestination = (actionTarget: string) => {
    const dest = destinations.find((item) => item.actionTarget === actionTarget);
    if (!dest) return;
    const itemSlot: NavSlot = bar === 'main_header' ? slot : 'default';
    const item: AppNavItem = {
      id: `nav_${audience}_${bar}_${itemSlot}_${dest.actionTarget}_${Date.now()}`,
      audienceRole: audience,
      bar,
      slot: itemSlot,
      label: dest.label,
      icon: dest.icon,
      actionType: dest.actionType,
      actionTarget: dest.actionTarget,
      badge: dest.badge,
      meta: bar === 'subheader' ? { group: 'primary' } : null,
      order: draft.filter((row) => !row.parentId).length + 1,
      active: true,
      parentId: null,
    };
    setDraft((prev) => [...prev, item]);
    setAdding(false);
  };

  const addSubmenuItem = (parentId: string, actionTarget: string) => {
    const dest = destinations.find((item) => item.actionTarget === actionTarget);
    const parent = draft.find((item) => item.id === parentId);
    if (!dest || !parent || parent.parentId) return;
    const itemSlot: NavSlot = bar === 'main_header' ? slot : 'default';
    const item: AppNavItem = {
      id: `nav_${audience}_${bar}_${itemSlot}_${dest.actionTarget}_sub_${Date.now()}`,
      audienceRole: audience,
      bar,
      slot: itemSlot,
      label: dest.label,
      icon: dest.icon,
      actionType: dest.actionType,
      actionTarget: dest.actionTarget,
      badge: dest.badge,
      meta: null,
      order: childNavItems(draft, parentId).length + 1,
      active: true,
      parentId,
    };
    setDraft((prev) => [...prev, item]);
    setSubmenuFor(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const items = draft.map((item) => ({
        ...item,
        audienceRole: audience,
        bar,
        slot: bar === 'main_header' ? slot : 'default',
      }));
      await saveAppNavSlice({
        audienceRole: audience,
        bar,
        slot: bar === 'main_header' ? slot : null,
        items,
      });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    const next = cloneItems(itemsForSlice(appNavItems, audience, bar, slotFilter));
    setDraft(next);
    setBaseline(JSON.stringify(next));
  };

  const resetDefaults = () => {
    const next = cloneItems(itemsForSlice(INITIAL_APP_NAV_ITEMS, audience, bar, slotFilter));
    setDraft(next);
  };

  const copyRole = () => {
    if (copyFrom === audience) return;
    const source = cloneItems(itemsForSlice(appNavItems, copyFrom, bar, slotFilter));
    const idMap = new Map<string, string>();
    source.forEach((item, index) => {
      idMap.set(item.id, `nav_${audience}_${bar}_${item.slot}_${item.actionTarget}_${index}_${Date.now()}`);
    });
    setDraft(
      source.map((item, index) => ({
        ...item,
        id: idMap.get(item.id) || item.id,
        parentId: item.parentId ? idMap.get(item.parentId) || null : null,
        audienceRole: audience,
        order: item.order || index + 1,
      }))
    );
  };

  const previewItems = useMemo(() => topLevelNavItems(draft).filter((item) => item.active), [draft]);

  const renderNavDraftRow = (item: AppNavItem, nested: boolean) => (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl border border-hairline p-2 ${item.active ? '' : 'opacity-50'}`}>
      <NavIcon name={item.icon} className="w-4 h-4" />
      <input
        className="bg-app-input border border-hairline rounded-lg px-2 py-1 text-xs w-36"
        value={item.label}
        onChange={(e) => updateItem(item.id, { label: e.target.value })}
      />
      <select
        className="bg-app-input border border-hairline rounded-lg px-2 py-1 text-xs"
        value={item.icon}
        onChange={(e) => updateItem(item.id, { icon: e.target.value })}
      >
        {NAV_ICON_NAMES.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <span className="text-[11px] text-app-muted">{item.actionTarget}</span>
      <select
        className="bg-app-input border border-hairline rounded-lg px-2 py-1 text-xs"
        value={item.badge}
        onChange={(e) => updateItem(item.id, { badge: e.target.value as NavBadge })}
      >
        {Array.from(NAV_BADGES).map((badge) => (
          <option key={badge} value={badge}>{badge}</option>
        ))}
      </select>
      <label className="text-[11px] flex items-center gap-1">
        <input type="checkbox" checked={item.active} onChange={(e) => updateItem(item.id, { active: e.target.checked })} />
        Active
      </label>
      <button type="button" className="p-1" onClick={() => moveSibling(item.id, -1)} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
      <button type="button" className="p-1" onClick={() => moveSibling(item.id, 1)} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
      {!nested && supportsSubmenu && bar !== 'brand' && (
        <button
          type="button"
          className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-hairline"
          onClick={() => setSubmenuFor((current) => (current === item.id ? null : item.id))}
        >
          Add submenu item
        </button>
      )}
      {bar !== 'brand' && (
        <button type="button" className="p-1 text-rose-500" onClick={() => removeItem(item.id)} aria-label="Remove">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      {!nested && submenuFor === item.id && (
        <select
          className="bg-app-input border border-hairline rounded-lg px-2 py-1 text-xs"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) addSubmenuItem(item.id, e.target.value);
          }}
        >
          <option value="" disabled>Choose submenu destination</option>
          {submenuDestinations.map((dest) => (
            <option key={dest.actionTarget} value={dest.actionTarget}>{dest.label}</option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-app-heading">Navigation Editor</h2>
        <p className="text-xs text-app-muted mt-1">
          Configure chrome per role. Changes stay in a draft until you save. Page access rules still apply even if a button is shown.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {BARS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => selectBar(entry.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              bar === entry.id ? 'bg-brand text-white border-brand' : 'border-hairline text-app-muted'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {bar !== 'brand' && bar !== 'logged_out_header' && (
        <div className="flex flex-wrap gap-2">
          {ROLES.filter((entry) => entry.id !== 'guest').map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => selectRole(entry.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                role === entry.id ? 'bg-app-card text-app-heading border-brand' : 'border-hairline text-app-muted'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      {bar === 'main_header' && (
        <div className="flex gap-2">
          {(['left', 'right'] as NavSlot[]).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => {
                if (entry === slot || !confirmSwitch()) return;
                setSlot(entry);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                slot === entry ? 'border-brand text-app-heading' : 'border-hairline text-app-muted'
              }`}
            >
              {entry === 'left' ? 'Left nav' : 'Right actions'}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-hairline bg-app-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">Preview before save</p>
          {dirty && <span className="text-[11px] font-semibold text-amber-500">Unsaved changes</span>}
        </div>
        {bar === 'brand' ? (
          <div className="bg-chrome border border-hairline rounded-xl px-3 py-2">
            <BrandLockup item={previewItems[0]} onNavigate={() => undefined} />
          </div>
        ) : (
          <div className={`flex flex-wrap items-end gap-2 ${bar === 'mobile_bottom' ? 'rounded-full bg-chrome border border-hairline p-2' : ''}`}>
            {previewItems.map((item) => {
              const children = childNavItems(draft, item.id, true);
              return (
                <div key={item.id} className="relative flex flex-col items-center gap-1">
                  {children.length > 0 && bar === 'mobile_bottom' && (
                    <div className="flex flex-col-reverse items-center gap-1">
                      {children.map((child) => (
                        <span key={child.id} className="inline-flex flex-col items-center rounded-xl border border-hairline bg-app-card px-2 py-1 text-[10px] font-semibold">
                          <NavIcon name={child.icon} className="h-3.5 w-3.5" />
                          {child.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-app-card-subtle border border-hairline text-xs font-semibold text-app-heading">
                    <NavIcon name={item.icon} className="w-3.5 h-3.5" />
                    {item.label}
                    {item.badge !== 'none' && <span className="text-[9px] text-brand">{item.badge}</span>}
                  </span>
                  {children.length > 0 && bar !== 'mobile_bottom' && (
                    <div className="min-w-[8rem] rounded-xl border border-hairline bg-chrome p-1 shadow-app-lg">
                      {children.map((child) => (
                        <span key={child.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold">
                          <NavIcon name={child.icon} className="h-3 w-3" />
                          {child.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {bar === 'mobile_bottom' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-hairline text-xs font-semibold">
                Exit
              </span>
            )}
            {bar === 'main_header' && <span className="text-[11px] text-app-muted self-center">+ profile</span>}
          </div>
        )}
        {bar === 'mobile_bottom' && activeCount > 7 && (
          <p className="text-xs text-amber-500">More than 7 buttons may crowd the mobile bar. You can still save.</p>
        )}
        {logoutHidden && (
          <p className="text-xs text-amber-500">Logout is hidden. Users may have no menu path to sign out.</p>
        )}
        {draft.some((item) => item.active && !item.parentId && item.actionTarget === 'none' && childNavItems(draft, item.id, true).length === 0) && (
          <p className="text-xs text-amber-500">A None button only opens a submenu. Add at least one submenu item.</p>
        )}
      </div>

      {bar === 'brand' && draft[0] && (
        <div className="grid sm:grid-cols-2 gap-3 rounded-2xl border border-hairline p-4">
          <label className="text-xs space-y-1">
            <span className="text-app-muted">Mark</span>
            <input
              className="w-full bg-app-input border border-hairline rounded-lg px-2 py-1.5"
              value={draft[0].meta?.markText || ''}
              onChange={(e) => updateItem(draft[0].id, { meta: { ...(draft[0].meta || {}), markText: e.target.value } })}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-app-muted">Wordmark</span>
            <input
              className="w-full bg-app-input border border-hairline rounded-lg px-2 py-1.5"
              value={draft[0].meta?.wordmarkPrimary || ''}
              onChange={(e) => updateItem(draft[0].id, { meta: { ...(draft[0].meta || {}), wordmarkPrimary: e.target.value } })}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-app-muted">Accent</span>
            <input
              className="w-full bg-app-input border border-hairline rounded-lg px-2 py-1.5"
              value={draft[0].meta?.wordmarkAccent || ''}
              onChange={(e) => updateItem(draft[0].id, { meta: { ...(draft[0].meta || {}), wordmarkAccent: e.target.value } })}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-app-muted">Image URL</span>
            <input
              className="w-full bg-app-input border border-hairline rounded-lg px-2 py-1.5"
              value={draft[0].meta?.imageUrl || ''}
              onChange={(e) => updateItem(draft[0].id, { meta: { ...(draft[0].meta || {}), imageUrl: e.target.value } })}
            />
          </label>
          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft[0].meta?.showMark !== false}
              onChange={(e) => updateItem(draft[0].id, { meta: { ...(draft[0].meta || {}), showMark: e.target.checked } })}
            />
            Show mark
          </label>
          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft[0].meta?.showWordmark !== false}
              onChange={(e) => updateItem(draft[0].id, { meta: { ...(draft[0].meta || {}), showWordmark: e.target.checked } })}
            />
            Show wordmark
          </label>
        </div>
      )}

      <div className="space-y-2">
        {topLevelNavItems(draft).map((item) => (
          <div key={item.id} className="space-y-2">
            {renderNavDraftRow(item, false)}
            {childNavItems(draft, item.id).map((child) => (
              <div key={child.id} className="ml-6">{renderNavDraftRow(child, true)}</div>
            ))}
          </div>
        ))}
      </div>

      {bar !== 'brand' && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-hairline">
            <Plus className="w-3.5 h-3.5" /> Add button
          </button>
          {adding && (
            <select
              className="bg-app-input border border-hairline rounded-lg px-2 py-1.5 text-xs"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addDestination(e.target.value);
              }}
            >
              <option value="" disabled>Choose destination</option>
              {destinations.map((dest) => (
                <option key={dest.actionTarget} value={dest.actionTarget}>
                  {dest.actionTarget === 'none' ? 'None' : dest.label}
                </option>
              ))}
            </select>
          )}
          {bar !== 'logged_out_header' && (
            <>
              <select
                className="bg-app-input border border-hairline rounded-lg px-2 py-1.5 text-xs"
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value as NavAudienceRole)}
              >
                {ROLES.filter((entry) => entry.id !== 'guest' && entry.id !== audience).map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
              <button type="button" onClick={copyRole} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-hairline">
                Copy into draft
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="inline-flex items-center gap-1 text-xs font-bold px-4 py-2 rounded-lg bg-brand text-white disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={!dirty || saving} onClick={discard} className="text-xs font-semibold px-3 py-2 rounded-lg border border-hairline disabled:opacity-40">
          Discard
        </button>
        <button type="button" onClick={resetDefaults} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border border-hairline">
          <RotateCcw className="w-3.5 h-3.5" /> Reset draft to defaults
        </button>
      </div>
    </div>
  );
};
