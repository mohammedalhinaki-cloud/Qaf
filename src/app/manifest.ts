import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'حُجَّة — الباحث الإسلامي الذكي بالأدلة والمصادر',
    short_name: 'حُجَّة',
    description:
      'محرك بحث بالذكاء الاصطناعي موثق بالأدلة من مكتبة تراث، مع استخراج النصوص ورقم الصفحة والجزء بدقة واستشهادات قابلة للضغط داخل الإجابة.',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#fafaf9',
    icons: [{ src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' }],
  };
}
