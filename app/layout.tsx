import type { Metadata, Viewport } from 'next';
import '../src/index.css';
import { DEFAULT_SITE_BRANDING } from '../shared/cms/siteBranding';

/** Static defaults; client hydrates CMS overrides via AppContext → applySiteBrandingToDocument. */
export const metadata: Metadata = {
  title: DEFAULT_SITE_BRANDING.pageTitle,
  description: DEFAULT_SITE_BRANDING.metaDescription,
  applicationName: DEFAULT_SITE_BRANDING.siteName,
  icons: {
    icon: DEFAULT_SITE_BRANDING.faviconUrl,
    apple: DEFAULT_SITE_BRANDING.faviconUrl,
  },
  openGraph: {
    title: DEFAULT_SITE_BRANDING.pageTitle,
    description: DEFAULT_SITE_BRANDING.metaDescription,
    siteName: DEFAULT_SITE_BRANDING.siteName,
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: DEFAULT_SITE_BRANDING.themeColor,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content={DEFAULT_SITE_BRANDING.themeColor} />
      </head>
      <body>{children}</body>
    </html>
  );
}
