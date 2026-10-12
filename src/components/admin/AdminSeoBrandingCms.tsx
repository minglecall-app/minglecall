/**
 * Admin CMS — SEO & branding: page title, description, logo, favicon, OG image.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Globe, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { authFetch } from '../../utils/apiClient';
import { UnifiedImageUploader } from '../common/UnifiedImageUploader';
import {
  DEFAULT_SITE_BRANDING,
  type SiteBranding,
} from '../../../shared/cms/siteBranding';

export const AdminSeoBrandingCms: React.FC = () => {
  const { showToast, reloadSiteBranding } = useApp();
  const [draft, setDraft] = useState<SiteBranding>({ ...DEFAULT_SITE_BRANDING });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/cms/seo-branding');
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        setError(body?.error?.message || body?.error || `HTTP ${res.status}`);
        setDraft({ ...DEFAULT_SITE_BRANDING });
        return;
      }
      setDraft({ ...DEFAULT_SITE_BRANDING, ...(body.data || {}) });
    } catch (e: any) {
      setError(e?.message || 'Failed to load SEO branding');
      setDraft({ ...DEFAULT_SITE_BRANDING });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/api/admin/cms/seo-branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageTitle: draft.pageTitle,
          metaDescription: draft.metaDescription,
          siteName: draft.siteName,
          logoUrl: draft.logoUrl,
          faviconUrl: draft.faviconUrl,
          ogImageUrl: draft.ogImageUrl,
          themeColor: draft.themeColor,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        showToast('Save failed', body?.error?.message || body?.error || 'Error', 'error');
        return;
      }
      setDraft({ ...DEFAULT_SITE_BRANDING, ...(body.data || {}) });
      await reloadSiteBranding?.();
      showToast('SEO saved', 'Page title, meta, and brand assets updated.', 'success');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-sky-400" />
            SEO & branding
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Edit browser tab title, meta description, favicon, app logo, and social preview image.
            Changes apply on the next page load after save.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 text-slate-200 text-xs font-bold px-3 py-2 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black px-3 py-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
          <h4 className="text-sm font-bold text-white">Search & browser</h4>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase text-slate-500 font-semibold">Page title</span>
            <input
              value={draft.pageTitle}
              onChange={(e) => setDraft({ ...draft, pageTitle: e.target.value })}
              maxLength={200}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase text-slate-500 font-semibold">
              Meta description
            </span>
            <textarea
              value={draft.metaDescription}
              onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
              maxLength={500}
              rows={3}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500 font-semibold">Site name</span>
              <input
                value={draft.siteName}
                onChange={(e) => setDraft({ ...draft, siteName: e.target.value })}
                maxLength={80}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500 font-semibold">Theme color</span>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(draft.themeColor) ? draft.themeColor : '#09090C'}
                  onChange={(e) => setDraft({ ...draft, themeColor: e.target.value })}
                  className="w-10 h-9 rounded-lg border border-slate-700 bg-slate-950 cursor-pointer"
                />
                <input
                  value={draft.themeColor}
                  onChange={(e) => setDraft({ ...draft, themeColor: e.target.value })}
                  className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-4">
          <h4 className="text-sm font-bold text-white">Brand assets</h4>
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-semibold block mb-2">
              App logo (header)
            </span>
            <UnifiedImageUploader
              currentImageUrl={draft.logoUrl || ''}
              onImageUploaded={(url) => setDraft({ ...draft, logoUrl: url })}
              category="moment"
              aspectRatio="1:1"
              accentColor="indigo"
              title="App logo"
              subtitle="Square logo shown in the header when Navigation Editor image is empty"
              showPresets={false}
              showUrlInput={true}
            />
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-semibold block mb-2">
              Favicon
            </span>
            <UnifiedImageUploader
              currentImageUrl={draft.faviconUrl || ''}
              onImageUploaded={(url) => setDraft({ ...draft, faviconUrl: url })}
              category="moment"
              aspectRatio="1:1"
              accentColor="amber"
              title="Favicon"
              subtitle="Browser tab icon (SVG/PNG/ICO URL or upload)"
              showPresets={false}
              showUrlInput={true}
            />
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-semibold block mb-2">
              Open Graph / social image
            </span>
            <UnifiedImageUploader
              currentImageUrl={draft.ogImageUrl || ''}
              onImageUploaded={(url) => setDraft({ ...draft, ogImageUrl: url })}
              category="moment"
              aspectRatio="16:9"
              accentColor="pink"
              title="OG image"
              subtitle="Preview image for link shares (recommended 1200×630)"
              showPresets={false}
              showUrlInput={true}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2">Preview</p>
        <div className="flex items-start gap-3">
          {(draft.faviconUrl || draft.logoUrl) && (
            <img
              src={draft.faviconUrl || draft.logoUrl}
              alt=""
              className="w-10 h-10 rounded-lg object-cover border border-slate-700"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-sky-300 truncate">{draft.pageTitle || '—'}</p>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
              {draft.metaDescription || '—'}
            </p>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">{draft.siteName}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
