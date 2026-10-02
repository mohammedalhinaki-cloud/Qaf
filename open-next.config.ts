import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * لا يحتاج حُجَّة إلى R2 أو KV أو D1 في النسخة الحالية.
 * جميع مسارات API ديناميكية، وOpenNext يستخدم cache dummy الآمن افتراضيًا
 * إلى أن تُضاف ميزة Next.js ISR فعلية تستدعي تخزين cache دائمًا.
 */
export default defineCloudflareConfig({});
