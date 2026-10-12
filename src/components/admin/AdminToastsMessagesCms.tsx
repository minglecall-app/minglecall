/**
 * Admin CMS — Toasts & messages: edit all catalogued app feedback copy.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Edit2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { authFetch } from '../../utils/apiClient';
import {
  buildAdminFeedbackList,
  DEFAULT_FEEDBACK_CATALOG,
  FEEDBACK_CATEGORIES,
  type FeedbackDbRow,
  type FeedbackKind,
  type FeedbackType,
} from '../../../shared/cms/feedbackCatalog';

type DbRow = {
  key: string;
  kind?: string;
  category?: string;
  title?: string;
  message?: string;
  defaultType?: string;
  active?: boolean;
  updatedAt?: string | null;
};

export const AdminToastsMessagesCms: React.FC = () => {
  const { showToast, reloadFeedbackCatalog } = useApp();
  const [dbRows, setDbRows] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [kind, setKind] = useState<string>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<FeedbackDbRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/cms/feedback');
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        setError(body?.error?.message || body?.error || `HTTP ${res.status}`);
        setDbRows([]);
        return;
      }
      setDbRows(body.data?.rows || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load feedback catalog');
      setDbRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => buildAdminFeedbackList(DEFAULT_FEEDBACK_CATALOG, dbRows),
    [dbRows]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== 'all' && r.category !== category) return false;
      if (kind !== 'all' && r.kind !== kind) return false;
      if (!needle) return true;
      return (
        r.key.toLowerCase().includes(needle) ||
        r.title.toLowerCase().includes(needle) ||
        r.message.toLowerCase().includes(needle)
      );
    });
  }, [rows, category, kind, q]);

  const seedMissing = async () => {
    setSeeding(true);
    try {
      const res = await authFetch('/api/admin/cms/feedback/seed', { method: 'POST', body: '{}' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        showToast('Seed failed', body?.error?.message || body?.error || 'Error', 'error');
        return;
      }
      showToast(
        'Feedback seeded',
        `Inserted ${body.data?.inserted ?? 0} missing keys.`,
        'success'
      );
      await load();
      await reloadFeedbackCatalog?.();
    } finally {
      setSeeding(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/admin/cms/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: editing.key,
          kind: editing.kind,
          category: editing.category,
          title: editing.title,
          message: editing.message,
          defaultType: editing.defaultType,
          active: editing.active,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        showToast('Save failed', body?.error?.message || body?.error || 'Error', 'error');
        return;
      }
      showToast('Toast saved', `Updated ${editing.key}`, 'success');
      setEditing(null);
      await load();
      await reloadFeedbackCatalog?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-violet-400" />
            Toasts & messages
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            All catalogued app feedback ({DEFAULT_FEEDBACK_CATALOG.length} defaults). Edit title/message;
            after save, matching frontend toasts use the new copy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void seedMissing()}
            disabled={seeding || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 cursor-pointer"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Seed missing
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 text-slate-200 text-xs font-bold px-3 py-2 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200 flex gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <label className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 space-y-1">
          <span className="text-[10px] uppercase text-slate-500 font-semibold">Search</span>
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 bg-transparent text-xs text-white outline-none"
              placeholder="key, title, message…"
            />
          </div>
        </label>
        <label className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 space-y-1">
          <span className="text-[10px] uppercase text-slate-500 font-semibold">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs text-white px-2 py-1.5"
          >
            <option value="all">All</option>
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 space-y-1">
          <span className="text-[10px] uppercase text-slate-500 font-semibold">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs text-white px-2 py-1.5"
          >
            <option value="all">All</option>
            {(['toast', 'alert', 'modal', 'inline'] as FeedbackKind[]).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/40">
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-950 text-slate-500 sticky top-0">
              <tr>
                <th className="p-2.5 font-mono">Key</th>
                <th className="p-2.5">Title</th>
                <th className="p-2.5">Message</th>
                <th className="p-2.5">Type</th>
                <th className="p-2.5">Active</th>
                <th className="p-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.key} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                  <td className="p-2.5 font-mono text-violet-300 whitespace-nowrap">{r.key}</td>
                  <td className="p-2.5 text-slate-200 max-w-[160px] truncate">{r.title}</td>
                  <td className="p-2.5 text-slate-400 max-w-[280px] truncate">{r.message}</td>
                  <td className="p-2.5 font-mono text-slate-400">{r.defaultType}</td>
                  <td className="p-2.5">
                    <span
                      className={`px-2 py-0.5 rounded border text-[10px] ${
                        r.active
                          ? 'border-emerald-600/40 text-emerald-300'
                          : 'border-slate-600 text-slate-500'
                      }`}
                    >
                      {r.active ? 'on' : 'off'}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <button
                      type="button"
                      onClick={() => setEditing({ ...r })}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 text-slate-200 text-[10px] font-bold cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No entries match filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-800 text-[10px] text-slate-500 font-mono">
          Showing {filtered.length} / {rows.length}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close"
            onClick={() => setEditing(null)}
          />
          <div className="relative z-10 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-[#12151F] border border-slate-700 p-4 space-y-3 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-white">Edit feedback</h4>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">{editing.key}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Title</span>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Message</span>
              <textarea
                value={editing.message}
                onChange={(e) => setEditing({ ...editing, message: e.target.value })}
                rows={3}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Type</span>
                <select
                  value={editing.defaultType}
                  onChange={(e) =>
                    setEditing({ ...editing, defaultType: e.target.value as FeedbackType })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
                >
                  {(['success', 'error', 'info', 'warning'] as FeedbackType[]).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                <span className="text-xs text-slate-300">Active overlay</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() =>
                  showToast(editing.title, editing.message, editing.defaultType || 'info')
                }
                className="px-3 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Preview
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveEdit()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
