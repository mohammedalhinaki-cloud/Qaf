/**
 * إعدادات التطبيق. تُقرأ من متغيّرات البيئة على الخادم فقط.
 * الإعدادات خادمية، ولا تُستورد من مكوّنات العميل.
 *
 * مهم: كل القيم هنا **كسولة** (getters) وتُقرأ لحظة الاستعمال، لأن أسرار
 * Cloudflare Workers لا تتوفّر وقت تحميل الوحدات. انظر `src/lib/env.ts`.
 */

import { envBool, envInt, envString, resolveOpenRouterKey } from '@/lib/env';

export const DEFAULT_TUA_MODEL = 'llama-3.3-70b-versatile';
export const DEFAULT_TUA_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * جهد «التفكير» (reasoning_effort) في النماذج الاستدلالية مثل gpt-oss:
 * القيمة low تقلّل التفكير كي لا يستهلك النموذج كامل حدّ المخرجات في
 * التفكير ويعيد استجابة فارغة — وهو عطل يُفسَّر خطأً على أنه مشكلة في المفتاح.
 * تُرسل فقط للنماذج التي تدعمها (انظر supportsReasoningEffort في openrouter.ts).
 */
function reasoningEffort(): string | null {
  const raw = envString('TUA_REASONING_EFFORT', '').toLowerCase();
  if (/^(low|medium|high)$/.test(raw)) return raw;
  if (raw === 'none' || raw === 'off') return null;
  return 'low';
}

export const config = {
  openrouter: {
    /** يُقرأ عند كل استعمال من process.env ثم من سياق Cloudflare. */
    get apiKey(): string {
      return resolveOpenRouterKey()?.value ?? '';
    },
    get model(): string {
      return DEFAULT_TUA_MODEL;
    },
    get baseUrl(): string {
      return DEFAULT_TUA_BASE_URL;
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
    /** أقصى عدد مقاطع تُمرّر إلى النموذج (كل ما أعادته الاستعلامات الخمسة). */
    maxEvidence: 50,
    /** أقصى عدد أحرف من نص المقطع الواحد يُمرّر إلى النموذج */
    maxSnippetChars: 1400,
    /** أقصى عدد نتائج تُطلب من تراث لكل استعلام */
    maxResultsPerQuery: 10,
    /** يسمح بتفكيك السؤال المركّب إلى زواياه من غير تغيير بحث تراث نفسه. */
    maxQueries: 5,
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
