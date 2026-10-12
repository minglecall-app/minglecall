/**
 * Admin Control Center — office roles, feature permissions, create staff users.
 * Does not change marketplace roles (TL / male / female / host).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { OfficeFeatureDef } from '../../../shared/officeRbac/features';
import {
  assignOfficeUserRole,
  createOfficeRole,
  createOfficeUser,
  deleteOfficeRole,
  fetchOfficeRoles,
  fetchOfficeUsers,
  updateOfficeRole,
  type OfficeRoleDto,
  type OfficeUserDto,
} from '../../services/officeRbacApi';

function groupFeatures(features: OfficeFeatureDef[]) {
  const map = new Map<string, OfficeFeatureDef[]>();
  for (const f of features) {
    const list = map.get(f.group) || [];
    list.push(f);
    map.set(f.group, list);
  }
  return [...map.entries()];
}

export const AdminOfficeRbacPage: React.FC = () => {
  const { showToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<OfficeRoleDto[]>([]);
  const [features, setFeatures] = useState<OfficeFeatureDef[]>([]);
  const [users, setUsers] = useState<OfficeUserDto[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftPerms, setDraftPerms] = useState<Set<string>>(new Set());
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    officeRoleId: '',
  });

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [rolesRes, usersRes] = await Promise.all([fetchOfficeRoles(), fetchOfficeUsers()]);
    setLoading(false);
    if (usersRes.success && usersRes.data) {
      setUsers(usersRes.data.users || []);
    }
    if (!rolesRes.success || !rolesRes.data) {
      const code = rolesRes.error?.code || '';
      const detail = rolesRes.error?.message || '';
      if (code === 'OFFICE_RBAC_SCHEMA_MISSING' || /schema|office_roles|does not exist/i.test(detail)) {
        setError(
          `${detail || 'Office RBAC tables are missing.'} Open Supabase → SQL Editor → run the OFFICE RBAC section at the end of supabase_schema.sql (office_roles, office_role_permissions, profiles.office_role_id), then click Refresh.`
        );
      } else {
        setError(detail || 'Failed to load roles.');
      }
      return;
    }
    setRoles(rolesRes.data.roles || []);
    setFeatures(rolesRes.data.features || []);
    if (!selectedRoleId && rolesRes.data.roles?.length) {
      setSelectedRoleId(rolesRes.data.roles[0].id);
    }
  }, [selectedRoleId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDraftLabel(selected.label);
    setDraftDescription(selected.description || '');
    setDraftPerms(new Set(selected.permissions || []));
  }, [selected]);

  const togglePerm = (key: string) => {
    if (selected?.isSuper) return;
    setDraftPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFeatureTree = (feature: OfficeFeatureDef, on: boolean) => {
    if (selected?.isSuper) return;
    setDraftPerms((prev) => {
      const next = new Set(prev);
      const keys = [feature.key, ...(feature.children || []).map((c) => c.key)];
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const saveRole = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await updateOfficeRole(selected.id, {
      label: draftLabel.trim(),
      description: draftDescription.trim(),
      permissions: selected.isSuper ? undefined : [...draftPerms],
    });
    setSaving(false);
    if (!res.success || !res.data?.role) {
      showToast('Save failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast('Role saved', res.data.role.label, 'success');
    await load();
  };

  const addRole = async () => {
    const label = window.prompt('New office role name (e.g. Support, Ops)');
    if (!label?.trim()) return;
    setSaving(true);
    const res = await createOfficeRole({
      label: label.trim(),
      permissions: [],
    });
    setSaving(false);
    if (!res.success || !res.data?.role) {
      showToast('Create failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast('Role created', res.data.role.label, 'success');
    setSelectedRoleId(res.data.role.id);
    await load();
  };

  const removeRole = async () => {
    if (!selected || selected.isSystem || selected.isSuper) return;
    if (!window.confirm(`Delete role “${selected.label}”? Users will keep admin login but lose this role.`)) {
      return;
    }
    setSaving(true);
    const res = await deleteOfficeRole(selected.id);
    setSaving(false);
    if (!res.success) {
      showToast('Delete failed', res.error?.message || 'Error', 'error');
      return;
    }
    setSelectedRoleId(null);
    showToast('Role deleted', selected.label, 'success');
    await load();
  };

  const createUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.officeRoleId) {
      showToast('Missing fields', 'Name, email, and office role are required.', 'warning');
      return;
    }
    setSaving(true);
    const res = await createOfficeUser({
      name: newUser.name.trim(),
      email: newUser.email.trim(),
      password: newUser.password,
      officeRoleId: newUser.officeRoleId,
    });
    setSaving(false);
    if (!res.success) {
      showToast('Create user failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast('Office user created', res.message || newUser.email, 'success');
    setNewUser({ name: '', email: '', password: '', officeRoleId: newUser.officeRoleId });
    await load();
  };

  const changeUserRole = async (userId: string, officeRoleId: string) => {
    setSaving(true);
    const res = await assignOfficeUserRole(userId, officeRoleId || null);
    setSaving(false);
    if (!res.success) {
      showToast('Assign failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast('Role assigned', 'Updated', 'success');
    await load();
  };

  const grouped = useMemo(() => groupFeatures(features), [features]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            Control Center — Roles & Permissions
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 max-w-2xl">
            Create office staff roles (Accounts, Manager, etc.) and grant Admin Control Center
            features. Marketplace roles (Agency, male/female/host) are unchanged.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/50 text-rose-200 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Roles list */}
        <div className="xl:col-span-3 bg-[#12151F] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">Office roles</span>
            <button
              type="button"
              onClick={() => void addRole()}
              className="p-1.5 rounded-lg text-indigo-300 hover:bg-indigo-950/50"
              title="Add role"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-800/70">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                className={`w-full text-left px-3 py-2.5 text-xs ${
                  selectedRoleId === r.id ? 'bg-indigo-950/40 text-white' : 'text-slate-300 hover:bg-slate-900/60'
                }`}
              >
                <div className="font-bold">{r.label}</div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                  {r.key}
                  {r.isSuper ? ' · SUPER' : ''}
                  {r.isSystem ? ' · SYSTEM' : ''}
                </div>
              </button>
            ))}
            {!roles.length && !loading && (
              <p className="p-4 text-[11px] text-slate-500">No roles yet. Run schema seed.</p>
            )}
          </div>
        </div>

        {/* Permission editor */}
        <div className="xl:col-span-5 bg-[#12151F] border border-slate-800 rounded-2xl p-4 space-y-3">
          {!selected ? (
            <p className="text-xs text-slate-500">Select a role to edit permissions.</p>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase text-slate-500">Label</label>
                <input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  disabled={selected.isSuper}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                />
                <label className="block text-[10px] font-bold uppercase text-slate-500">Description</label>
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
              {selected.isSuper ? (
                <p className="text-[11px] text-amber-200/90 bg-amber-950/30 border border-amber-800/40 rounded-xl px-3 py-2">
                  Super Admin always has every feature. Permission checklist is locked.
                </p>
              ) : (
                <div className="max-h-[340px] overflow-y-auto space-y-3 pr-1">
                  {grouped.map(([group, items]) => (
                    <div key={group}>
                      <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">{group}</div>
                      <div className="space-y-1.5">
                        {items.map((f) => {
                          const parentOn = draftPerms.has(f.key);
                          return (
                            <div
                              key={f.key}
                              className="rounded-xl border border-slate-800 bg-slate-950/50 px-2.5 py-2"
                            >
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={parentOn}
                                  onChange={(e) => toggleFeatureTree(f, e.target.checked)}
                                />
                                {f.label}
                                <span className="text-[9px] font-mono text-slate-600">{f.key}</span>
                              </label>
                              {f.children?.length ? (
                                <div className="mt-1.5 ml-5 grid grid-cols-1 gap-1">
                                  {f.children.map((c) => (
                                    <label
                                      key={c.key}
                                      className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={draftPerms.has(c.key) || parentOn}
                                        disabled={parentOn}
                                        onChange={() => togglePerm(c.key)}
                                      />
                                      {c.label}
                                    </label>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void saveRole()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save role
                </button>
                {!selected.isSystem && !selected.isSuper && (
                  <button
                    type="button"
                    onClick={() => void removeRole()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-800/60 text-rose-300 text-xs font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Create users */}
        <div className="xl:col-span-4 space-y-4">
          <div className="bg-[#12151F] border border-slate-800 rounded-2xl p-4 space-y-3">
            <h4 className="text-xs font-black text-white flex items-center gap-2">
              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
              Create office user
            </h4>
            <p className="text-[10px] text-slate-500">
              Creates an Admin login scoped by the selected office role. Not an Agency or host.
            </p>
            <input
              placeholder="Full name"
              value={newUser.name}
              onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
            />
            <input
              placeholder="Login email"
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
            />
            <input
              placeholder="Temporary password"
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
            />
            <select
              value={newUser.officeRoleId}
              onChange={(e) => setNewUser((u) => ({ ...u, officeRoleId: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value="">Select office role…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void createUser()}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Create user
            </button>
          </div>

          <div className="bg-[#12151F] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-800 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-bold uppercase text-slate-400">Office users</span>
              <span className="text-[10px] font-mono text-slate-600 ml-auto">{users.length}</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-800/70">
              {users.map((u) => (
                <div key={u.id} className="px-3 py-2.5 text-xs space-y-1.5">
                  <div className="font-bold text-white">{u.name || '—'}</div>
                  <div className="text-[10px] font-mono text-slate-500">{u.email}</div>
                  <select
                    value={u.officeRoleId || ''}
                    onChange={(e) => void changeUserRole(u.id, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-200"
                  >
                    <option value="">Legacy Super Admin (full)</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {!users.length && !loading && (
                <p className="p-4 text-[11px] text-slate-500">No office admin users yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
