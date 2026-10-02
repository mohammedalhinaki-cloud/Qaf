import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'حُجَّة — الذكاء الاصطناعي للتحقق العلمي والبحث في المراجع الإسلامية الصحيحة',
    short_name: 'حُجَّة',
    description:
      'باحث ذكي يبحث في المراجع الإسلامية، ويعرض الإجابة مع مصادرها الأصلية للتحقق منها.',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#fafaf9',
    icons: [{ src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' }],
  };
}
