/**
 * Default site SEO & branding (Admin → CMS → SEO & branding).
 * DB row id `default` overlays these values at runtime.
 */

export type SiteBranding = {
  id: string;
  pageTitle: string;
  metaDescription: string;
  siteName: string;
  logoUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  themeColor: string;
  updatedAt?: string | null;
};

export const DEFAULT_SITE_BRANDING: SiteBranding = {
  id: 'default',
  pageTitle: 'LiveCall - 1-on-1 Video & Monetization',
  metaDescription:
    'Live 1-on-1 video calling, creator monetization, interactive matching, and discovery platform.',
  siteName: 'LiveCall',
  logoUrl: '',
  faviconUrl: '/pwa-icon.svg',
  ogImageUrl: '',
  themeColor: '#09090C',
  updatedAt: null,
};

export function mapSiteBrandingRow(row: any | null | undefined): SiteBranding {
  if (!row) return { ...DEFAULT_SITE_BRANDING };
  return {
    id: String(row.id || 'default'),
    pageTitle: String(row.page_title ?? row.pageTitle ?? DEFAULT_SITE_BRANDING.pageTitle).trim()
      || DEFAULT_SITE_BRANDING.pageTitle,
    metaDescription: String(
      row.meta_description ?? row.metaDescription ?? DEFAULT_SITE_BRANDING.metaDescription
    ).trim() || DEFAULT_SITE_BRANDING.metaDescription,
    siteName: String(row.site_name ?? row.siteName ?? DEFAULT_SITE_BRANDING.siteName).trim()
      || DEFAULT_SITE_BRANDING.siteName,
    logoUrl: String(row.logo_url ?? row.logoUrl ?? '').trim(),
    faviconUrl: String(row.favicon_url ?? row.faviconUrl ?? DEFAULT_SITE_BRANDING.faviconUrl).trim()
      || DEFAULT_SITE_BRANDING.faviconUrl,
    ogImageUrl: String(row.og_image_url ?? row.ogImageUrl ?? '').trim(),
    themeColor: String(row.theme_color ?? row.themeColor ?? DEFAULT_SITE_BRANDING.themeColor).trim()
      || DEFAULT_SITE_BRANDING.themeColor,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLinkRel(rel: string, href: string, type?: string) {
  if (typeof document === 'undefined' || !href) return;
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  if (type) el.setAttribute('type', type);
  else el.removeAttribute('type');
}

/** Apply branding to document head (SPA / client). Safe no-op on server. */
export function applySiteBrandingToDocument(branding: SiteBranding) {
  if (typeof document === 'undefined') return;
  const b = { ...DEFAULT_SITE_BRANDING, ...branding };
  document.title = b.pageTitle;
  upsertMeta('name', 'description', b.metaDescription);
  upsertMeta('name', 'theme-color', b.themeColor);
  upsertMeta('name', 'apple-mobile-web-app-title', b.siteName);
  upsertMeta('property', 'og:title', b.pageTitle);
  upsertMeta('property', 'og:description', b.metaDescription);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', b.siteName);
  if (b.ogImageUrl) upsertMeta('property', 'og:image', b.ogImageUrl);
  upsertMeta('name', 'twitter:card', b.ogImageUrl ? 'summary_large_image' : 'summary');
  upsertMeta('name', 'twitter:title', b.pageTitle);
  upsertMeta('name', 'twitter:description', b.metaDescription);
  if (b.ogImageUrl) upsertMeta('name', 'twitter:image', b.ogImageUrl);
  const favicon = b.faviconUrl || DEFAULT_SITE_BRANDING.faviconUrl;
  const isSvg = favicon.toLowerCase().includes('.svg');
  upsertLinkRel('icon', favicon, isSvg ? 'image/svg+xml' : undefined);
  upsertLinkRel('apple-touch-icon', favicon);
}
