/**
 * إعدادات التطبيق. تُقرأ من متغيرات البيئة فقط على الخادم.
 * لا يوجد أي مفتاح أو سر في هذا الملف، ولا يُستورد من مكوّنات العميل.
 */

function cleanSecret(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  // بعض لوحات الاستضافة تحفظ علامتَي الاقتباس عند لصق السر.
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function envStr(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

function geminiApiKey(): string {
  // GEMINI_API_KEY هو الاسم الأساسي، والاسمان الآخران للتوافق مع أشهر منصات النشر.
  return cleanSecret(
    process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_API_KEY ??
      process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  );
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function envInt(key: string, fallback: number): number {
  const v = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  gemini: {
    apiKey: geminiApiKey(),
    model: envStr('GEMINI_MODEL', 'gemini-2.5-flash'),
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  turath: {
    enabled: envBool('TURATH_ENABLED', true),
    apiBase: envStr('TURATH_API_BASE', 'https://api.turath.io'),
    appBase: envStr('TURATH_APP_BASE', 'https://app.turath.io'),
    apiVersion: 3,
  },
  limits: {
    ratePerMinute: envInt('RATE_LIMIT_PER_MINUTE', 10),
    maxQuestionChars: envInt('MAX_QUESTION_CHARS', 500),
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
