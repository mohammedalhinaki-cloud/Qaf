import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ماعون — بحث موثّق في المكتبة الشاملة وتراث',
  description:
    'مساعد بحثي يبحث في المكتبة الشاملة وتراث، ويصوغ إجابة مستندة إلى المقاطع المسترجَعة مع عرض الأدلة وروابط المصادر الأصلية.',
  applicationName: 'ماعون',
  robots: { index: true, follow: true },
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
const themeScript = `(function(){try{var t=localStorage.getItem('maoun.theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

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
