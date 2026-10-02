/**
 * إعدادات التطبيق. تُقرأ من متغيرات البيئة فقط على الخادم.
 * لا يوجد أي مفتاح أو سر في هذا الملف، ولا يُستورد من مكوّنات العميل.
 */

function envStr(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : fallback;
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
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: envStr('GEMINI_MODEL', 'gemini-2.5-flash'),
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  turath: {
    enabled: envBool('TURATH_ENABLED', true),
    apiBase: envStr('TURATH_API_BASE', 'https://api.turath.io'),
    appBase: envStr('TURATH_APP_BASE', 'https://app.turath.io'),
    apiVersion: 3,
  },
  shamela: {
    enabled: envBool('SHAMELA_ENABLED', true),
    mcpUrl: envStr('SHAMELA_MCP_URL', 'https://shamela.ws/mcp'),
    webBase: envStr('SHAMELA_WEB_BASE', 'https://shamela.ws'),
  },
  limits: {
    ratePerMinute: envInt('RATE_LIMIT_PER_MINUTE', 10),
    maxQuestionChars: envInt('MAX_QUESTION_CHARS', 500),
    /** أقصى عدد مقاطع تُمرّر إلى النموذج */
    maxEvidence: 12,
    /** أقصى عدد أحرف من نص المقطع الواحد يُمرّر إلى النموذج */
    maxSnippetChars: 1400,
    /** أقصى عدد نتائج تُطلب من كل مصدر لكل استعلام */
    maxResultsPerQuery: 10,
    /** أقصى عدد استعلامات بحث مولّدة */
    maxQueries: 3,
    /** مهلة كل مصدر بالمللي ثانية */
    sourceTimeoutMs: 15000,
    /** مهلة طلب النموذج */
    aiTimeoutMs: 45000,
    /** أقصى عدد رسائل سياق سابقة تُرسل للنموذج */
    maxHistoryTurns: 4,
  },
  userAgent: 'Hujjah/0.1 (+research assistant; contact via repository)',
} as const;

export type AppConfig = typeof config;
