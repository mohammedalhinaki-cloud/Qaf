/**
 * إعدادات التطبيق. تُقرأ من متغيّرات البيئة على الخادم فقط.
 * لا يوجد أي مفتاح أو سر في هذا الملف، ولا يُستورد من مكوّنات العميل.
 *
 * مهم: كل القيم هنا **كسولة** (getters) وتُقرأ لحظة الاستعمال، لأن أسرار
 * Cloudflare Workers لا تتوفّر وقت تحميل الوحدات. انظر `src/lib/env.ts`.
 */

import { envBool, envInt, envString, resolveGroqKey } from '@/lib/env';

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * جهد «التفكير» (reasoning_effort) في النماذج الاستدلالية مثل gpt-oss:
 * القيمة low تقلّل التفكير كي لا يستهلك النموذج كامل حدّ المخرجات في
 * التفكير ويعيد استجابة فارغة — وهو عطل يُفسَّر خطأً على أنه مشكلة في المفتاح.
 * تُرسل فقط للنماذج التي تدعمها (انظر supportsReasoningEffort في groq.ts).
 */
function reasoningEffort(): string | null {
  const raw = envString('GROQ_REASONING_EFFORT', '').toLowerCase();
  if (/^(low|medium|high)$/.test(raw)) return raw;
  if (raw === 'none' || raw === 'off') return null;
  return 'low';
}

export const config = {
  groq: {
    /** يُقرأ عند كل استعمال من process.env ثم من سياق Cloudflare. */
    get apiKey(): string {
      return resolveGroqKey()?.value ?? '';
    },
    get model(): string {
      return envString('GROQ_MODEL', DEFAULT_GROQ_MODEL);
    },
    get baseUrl(): string {
      return envString('GROQ_BASE_URL', DEFAULT_GROQ_BASE_URL).replace(/\/+$/, '');
    },
    get reasoningEffort(): string | null {
      return reasoningEffort();
    },
  },
  turath: {
    get enabled(): boolean {
      return envBool('TURATH_ENABLED', true);
    },
    get apiBase(): string {
      return envString('TURATH_API_BASE', 'https://api.turath.io');
    },
    get appBase(): string {
      return envString('TURATH_APP_BASE', 'https://app.turath.io');
    },
    apiVersion: 3,
  },
  limits: {
    get ratePerMinute(): number {
      return envInt('RATE_LIMIT_PER_MINUTE', 10);
    },
    get maxQuestionChars(): number {
      return envInt('MAX_QUESTION_CHARS', 500);
    },
    /** أقصى عدد مقاطع تُمرّر إلى النموذج */
    maxEvidence: 12,
    /** أقصى عدد أحرف من نص المقطع الواحد يُمرّر إلى النموذج */
    maxSnippetChars: 1400,
    /** أقصى عدد نتائج تُطلب من تراث لكل استعلام */
    maxResultsPerQuery: 10,
    /** أقصى عدد استعلامات بحث مولّدة */
    maxQueries: 3,
    /** مهلة مصدر البحث بالمللي ثانية */
    sourceTimeoutMs: 15000,
    /** مهلة طلب النموذج */
    aiTimeoutMs: 45000,
    /** أقصى عدد رسائل سياق سابقة تُرسل للنموذج */
    maxHistoryTurns: 4,
  },
  userAgent: 'Hujjah/0.1 (+research assistant; contact via repository)',
} as const;

export type AppConfig = typeof config;
