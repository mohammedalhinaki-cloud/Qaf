import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = 'https://hujjah.maaoun.com';
const SITE_NAME = 'حُجَّة';
const SITE_TAGLINE = 'حُجَّة — الذكاء الاصطناعي للتحقق العلمي والبحث في المراجع الإسلامية الصحيحة';
const SITE_DESCRIPTION =
  'باحث ذكي يبحث في المراجع الإسلامية، ويعرض الإجابة مع مصادرها الأصلية للتحقق منها.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TAGLINE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: '/manifest.webmanifest',
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ar',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#111418' },
  ],
};

/** يضبط السمة قبل أول رسم لتفادي ومضة التبديل. */
const themeScript = `(function(){try{var t=localStorage.getItem('hujjah.theme')||localStorage.getItem('maoun.theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* خط عربي للويب. في حال تعذّر تحميله يعود التطبيق إلى خطوط النظام العربية. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
