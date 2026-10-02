import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // مطلوب لأن `npm run build` يشغّل OpenNext مع --skipNextBuild بعد انتهاء next build.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // الميكروفون مسموح للموقع نفسه فقط (الإملاء الصوتي في مربع الإدخال).
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

// يهيّئ bindings الخاصة بـ Cloudflare عند استخدام `next dev` محليًا.
// لا يغيّر سلوك Next.js في الإنتاج؛ إنتاج Worker يتم عبر OpenNext.
import('@opennextjs/cloudflare').then((m) => m.initOpenNextCloudflareForDev());
