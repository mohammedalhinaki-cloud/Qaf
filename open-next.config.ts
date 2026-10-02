import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * لا يحتاج حُجَّة إلى R2 أو KV أو D1 في النسخة الحالية.
 * جميع مسارات API ديناميكية، وOpenNext يستخدم cache dummy الآمن افتراضيًا
 * إلى أن تُضاف ميزة Next.js ISR فعلية تستدعي تخزين cache دائمًا.
 */
const config = defineCloudflareConfig({});

// `npm run build` يستدعي `opennextjs-cloudflare build`، والافتراضي لدى OpenNext
// هو تشغيل `npm run build` داخليًا لبناء Next.js — ما يسبب حلقة لا نهائية.
// نحدد أمر البناء الداخلي صراحةً لكسر الحلقة.
config.buildCommand = 'npx next build';

export default config;
