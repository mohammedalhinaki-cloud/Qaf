import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = 'https://hujjah.maaoun.com';
const SITE_NAME = 'حُجَّة';
const SITE_TAGLINE = 'حُجَّة — الباحث الإسلامي الذكي بالأدلة والمصادر';
const SITE_DESCRIPTION =
  'محرك بحث إسلامي بالذكاء الاصطناعي موثق بالأدلة والمراجع. ابحث في مكتبة تراث واستخرج النصوص ورقم الصفحة والجزء مع استشهادات قابلة للتحقق. حُجَّة مجاني.';
const SITE_KEYWORDS = [
  'حجة',
  'ذكاء اصطناعي إسلامي',
  'تراث',
  'بحث في الكتب الإسلامية',
  'تخريج الأحاديث',
  'الفقه المقارن',
  'المصادر الإسلامية',
  'مساعد إسلامي مجاني',
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TAGLINE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ar',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'شعار حُجَّة' }],
  },
  twitter: {
    card: 'summary',
    title: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    images: ['/icons/icon-512.png'],
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
  // يسمح للواجهة بالامتداد تحت الحواف الآمنة (مع env(safe-area-inset-*))
  viewportFit: 'cover',
  // لوحة المفاتيح تُصغّر المساحة المتاحة بدل أن تغطّي مربع الإدخال
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#111418' },
  ],
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  alternateName: ['Hujjah', 'حُجَّة الباحث الإسلامي'],
  url: SITE_URL,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  inLanguage: 'ar',
  description: SITE_DESCRIPTION,
  logo: `${SITE_URL}/icons/icon-512.png`,
};

/** يضبط السمة قبل أول رسم لتفادي ومضة التبديل. */
const themeScript = `(function(){try{var t=localStorage.getItem('hujjah.theme')||localStorage.getItem('maoun.theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
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
