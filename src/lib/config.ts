/**
 * إعدادات التطبيق. تُقرأ من متغيّرات البيئة على الخادم فقط.
 * لا يوجد أي مفتاح أو سر في هذا الملف، ولا يُستورد من مكوّنات العميل.
 *
 * مهم: كل القيم هنا **كسولة** (getters) وتُقرأ لحظة الاستعمال، لأن أسرار
 * Cloudflare Workers لا تتوفّر وقت تحميل الوحدات. انظر `src/lib/env.ts`.
 */

import { envBool, envInt, envString, resolveGeminiKey } from '@/lib/env';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * ميزانية «التفكير» في نماذج 2.5: القيمة 0 تعطّل التفكير.
 * بدون تعطيله قد يستهلك النموذج كامل maxOutputTokens في التفكير
 * ويعيد استجابة فارغة — وهو عطل يُفسَّر خطأً على أنه مشكلة في المفتاح.
 */
function thinkingBudget(): number | null {
  const raw = envString('GEMINI_THINKING_BUDGET', '');
  if (raw.length > 0) {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  // الافتراضي: تعطيل التفكير على نماذج flash فقط (pro لا يقبل 0).
  const model = envString('GEMINI_MODEL', DEFAULT_GEMINI_MODEL).toLowerCase();
  return /(^|[-/])gemini-(2\.5|3)[^/]*flash/.test(model) ? 0 : null;
}

export const config = {
  gemini: {
    /** يُقرأ عند كل استعمال من process.env ثم من سياق Cloudflare. */
    get apiKey(): string {
      return resolveGeminiKey()?.value ?? '';
    },
    get model(): string {
      return envString('GEMINI_MODEL', DEFAULT_GEMINI_MODEL);
    },
    get baseUrl(): string {
      return envString('GEMINI_BASE_URL', DEFAULT_GEMINI_BASE_URL).replace(/\/+$/, '');
    },
    get thinkingBudget(): number | null {
      return thinkingBudget();
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
