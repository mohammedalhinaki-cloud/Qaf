import { config } from '@/lib/config';
import { resolveGeminiKey } from '@/lib/env';

/**
 * عميل Gemini عبر REST. المفتاح يُقرأ من البيئة على الخادم فقط — لحظة الطلب لا
 * عند تحميل الوحدة — ولا يُرسل إلى المتصفح ولا يُسجَّل في أي مكان.
 */

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'missing_key'
      | 'auth'
      | 'rate_limit'
      | 'timeout'
      | 'bad_response'
      | 'blocked'
      | 'model_not_found'
      | 'truncated'
      | 'upstream',
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function isGeminiConfigured(): boolean {
  return resolveGeminiKey() !== null;
}

interface GenerateOptions {
  system: string;
  user: string;
  /** مخطط JSON للمخرجات المهيكلة */
  schema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

/** ينظّف رسائل الأخطاء من أي احتمال لتسريب المفتاح. */
function scrub(message: string, key: string): string {
  let out = message;
  if (key) out = out.split(key).join('«مفتاح محجوب»');
  return out.replace(/key=[\w-]+/gi, 'key=«محجوب»').slice(0, 400);
}

function requireKey(): string {
  const hit = resolveGeminiKey();
  if (!hit) {
    throw new GeminiError(
      'مفتاح Gemini غير مضبوط على الخادم. أضف GEMINI_API_KEY في متغيّرات البيئة (Secret) ثم أعد النشر.',
      'missing_key',
    );
  }
  return hit.value;
}

/** هل يدلّ نص خطأ 400 على مفتاح غير صالح؟ (Gemini يعيد 400 لا 401) */
function isInvalidKeyMessage(detail: string): boolean {
  return /api[_\s-]?key|api key not valid|invalid authentication|credential/i.test(detail);
}

/** هل رفض النموذج حقل thinkingConfig؟ (نماذج لا تدعم التفكير) */
function isThinkingUnsupported(detail: string): boolean {
  return /thinking/i.test(detail);
}

interface RawResult {
  ok: boolean;
  status: number;
  data: GeminiResponse;
  detail: string;
}

/* ———————————————— اكتشاف نموذج بديل تلقائيًا ————————————————
 * بعض المفاتيح لا تتاح لها كل النماذج (مشاريع مقيّدة، إصدارات قديمة…).
 * عند 404 على النموذج المضبوط، نسأل Google عن النماذج المتاحة فعلًا لهذا
 * المفتاح ونختار أفضل بديل، ثم نحفظه في الذاكرة كي لا نكرّر الاستعلام.
 */

/** ترتيب التفضيل عند البحث عن بديل. */
const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-2.5-pro',
  'gemini-pro-latest',
  'gemini-1.5-pro',
];

/** نماذج لا تصلح للتوليد النصي المهيكل. */
const UNSUITABLE_MODEL = /embedding|imagen|veo|-tts|-live|audio|image-generation|aqa/i;

let modelCache: { fingerprint: string; model: string } | null = null;

function cacheFingerprint(key: string): string {
  return `${config.gemini.baseUrl}|${config.gemini.model}|${key.slice(-6)}`;
}

/** النموذج الفعلي المستعمل: المضبوط، أو البديل المكتشف سابقًا لهذا المفتاح. */
function activeModel(key: string): string {
  return modelCache && modelCache.fingerprint === cacheFingerprint(key)
    ? modelCache.model
    : config.gemini.model;
}

interface ListedModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

/** يسأل Google عن النماذج المتاحة لهذا المفتاح ويعيد أسماءها المختصرة. */
async function listAvailableModels(key: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch(`${config.gemini.baseUrl}/models?pageSize=200`, {
      headers: { 'x-goog-api-key': key },
      signal: signal ?? AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: ListedModel[] };
    return (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter((n) => n && !UNSUITABLE_MODEL.test(n));
  } catch {
    return [];
  }
}

/** يختار أفضل بديل من قائمة النماذج المتاحة، أو null إن لم يوجد. */
function pickFallback(available: string[], exclude: string): string | null {
  const set = new Set(available);
  for (const name of FALLBACK_MODELS) {
    if (name !== exclude && set.has(name)) return name;
  }
  // أي نموذج flash متاح، ثم أي نموذج توليد نصي.
  const flash = available.find((n) => n !== exclude && /flash/i.test(n));
  if (flash) return flash;
  return available.find((n) => n !== exclude) ?? null;
}

/**
 * عند 404: يكتشف بديلًا متاحًا ويحفظه. يعيد اسم البديل أو null.
 */
async function discoverFallbackModel(key: string, signal?: AbortSignal): Promise<string | null> {
  const available = await listAvailableModels(key, signal);
  const fallback = pickFallback(available, config.gemini.model);
  if (fallback) {
    modelCache = { fingerprint: cacheFingerprint(key), model: fallback };
    console.warn(
      `[gemini] النموذج «${config.gemini.model}» غير متاح لهذا المفتاح؛ تم التحويل تلقائيًا إلى «${fallback}».`,
    );
  }
  return fallback;
}

async function callGemini(
  key: string,
  model: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<RawResult> {
  const url = `${config.gemini.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new GeminiError('انتهت مهلة الاتصال بنموذج Gemini.', 'timeout');
    }
    throw new GeminiError('تعذّر الاتصال بنموذج Gemini.', 'upstream');
  }

  let data: GeminiResponse = {};
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    /* استجابة بلا JSON */
  }

  return { ok: res.ok, status: res.status, data, detail: data.error?.message ?? '' };
}

export async function generateJson<T>(opts: GenerateOptions): Promise<T> {
  const key = requireKey();

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.2,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
    responseMimeType: 'application/json',
    ...(opts.schema ? { responseSchema: opts.schema } : {}),
  };

  const budget = config.gemini.thinkingBudget;
  if (budget !== null) generationConfig.thinkingConfig = { thinkingBudget: budget };

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: 'user', parts: [{ text: opts.user }] }],
    generationConfig,
    safetySettings: [],
  };

  const timeout = AbortSignal.timeout(config.limits.aiTimeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let model = activeModel(key);
  let result = await callGemini(key, model, body, signal);

  // النموذج المضبوط غير متاح لهذا المفتاح: نكتشف بديلًا متاحًا ونعيد المحاولة.
  if (!result.ok && result.status === 404) {
    const fallback = await discoverFallbackModel(key, signal);
    if (fallback && fallback !== model) {
      model = fallback;
      result = await callGemini(key, model, body, signal);
    }
  }

  // بعض النماذج لا تقبل thinkingConfig: نعيد المحاولة مرة واحدة بدونه.
  if (!result.ok && result.status === 400 && isThinkingUnsupported(result.detail)) {
    delete (body.generationConfig as Record<string, unknown>).thinkingConfig;
    result = await callGemini(key, model, body, signal);
  }

  const { ok, status, data, detail } = result;

  if (status === 401 || status === 403 || (status === 400 && isInvalidKeyMessage(detail))) {
    throw new GeminiError(
      'مفتاح Gemini مرفوض من Google (غير صالح، أو مقيَّد، أو واجهة Generative Language غير مفعّلة لمشروعه).',
      'auth',
    );
  }
  if (status === 429) {
    throw new GeminiError('تم تجاوز حدّ الاستخدام لدى Gemini. حاول بعد قليل.', 'rate_limit');
  }
  if (status === 404) {
    throw new GeminiError(
      `النموذج «${config.gemini.model}» غير متاح لهذا المفتاح، ولم يُعثر على أي نموذج بديل متاح له. تحقّق من المفتاح أو غيّر GEMINI_MODEL.`,
      'model_not_found',
    );
  }
  if (!ok) {
    throw new GeminiError(scrub(`خطأ من Gemini (${status}) ${detail}`.trim(), key), 'upstream');
  }

  if (data.promptFeedback?.blockReason) {
    throw new GeminiError('رفض النموذج معالجة هذا الطلب.', 'blocked');
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

  if (!text.trim()) {
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new GeminiError(
        'استهلك النموذج حدّ المخرجات قبل إنتاج نص. قلّل حجم الطلب أو ارفع GEMINI_THINKING_BUDGET/الحدّ.',
        'truncated',
      );
    }
    throw new GeminiError('أعاد النموذج استجابة فارغة.', 'bad_response');
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // محاولة أخيرة: انتزاع أول كتلة JSON
    const m = /[{[][\s\S]*[}\]]/.exec(text);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        /* يسقط للأسفل */
      }
    }
    throw new GeminiError('تعذّر تحليل استجابة النموذج.', 'bad_response');
  }
}

/* ———————————————— فحص تشخيصي ———————————————— */

export interface GeminiPing {
  ok: boolean;
  status: number | null;
  /** تصنيف مختصر للعطل، مطابق لرموز GeminiError */
  code: GeminiError['code'] | null;
  message: string;
  tookMs: number;
}

/**
 * فحص خفيف للمفتاح: يسأل Google عن بيانات النموذج فقط (بلا توليد ولا استهلاك).
 * يُستعمل في `/api/health?probe=1` لتمييز «مفتاح مفقود» عن «مفتاح مرفوض»
 * عن «نموذج غير متاح» بدقّة، دون كشف المفتاح.
 */
export async function pingGemini(): Promise<GeminiPing> {
  const t0 = Date.now();
  const hit = resolveGeminiKey();

  if (!hit) {
    return {
      ok: false,
      status: null,
      code: 'missing_key',
      message: 'المفتاح غير مضبوط على الخادم.',
      tookMs: 0,
    };
  }

  const model = activeModel(hit.value);
  const url = `${config.gemini.baseUrl}/models/${encodeURIComponent(model)}`;

  try {
    const res = await fetch(url, {
      headers: { 'x-goog-api-key': hit.value },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });

    const tookMs = Date.now() - t0;

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        code: null,
        message:
          model === config.gemini.model
            ? 'المفتاح يعمل والنموذج متاح.'
            : `المفتاح يعمل. النموذج المضبوط «${config.gemini.model}» غير متاح، ويُستعمل بدلًا منه «${model}» تلقائيًا.`,
        tookMs,
      };
    }

    // النموذج المضبوط غير متاح: نحاول اكتشاف بديل متاح لهذا المفتاح.
    if (res.status === 404) {
      const fallback = await discoverFallbackModel(hit.value);
      if (fallback) {
        return {
          ok: true,
          status: 200,
          code: null,
          message: `النموذج «${config.gemini.model}» غير متاح لهذا المفتاح؛ سيُستعمل «${fallback}» تلقائيًا.`,
          tookMs: Date.now() - t0,
        };
      }
    }

    let detail = '';
    try {
      const j = (await res.json()) as GeminiResponse;
      detail = j.error?.message ?? '';
    } catch {
      /* تجاهل */
    }

    const code: GeminiError['code'] =
      res.status === 404
        ? 'model_not_found'
        : res.status === 429
          ? 'rate_limit'
          : res.status === 401 || res.status === 403 || isInvalidKeyMessage(detail)
            ? 'auth'
            : 'upstream';

    const message =
      code === 'auth'
        ? 'المفتاح موجود لكن Google رفضه (غير صالح أو مقيَّد أو الواجهة غير مفعّلة).'
        : code === 'model_not_found'
          ? `النموذج «${config.gemini.model}» غير متاح لهذا المفتاح، ولا يوجد بديل متاح له.`
          : code === 'rate_limit'
            ? 'تم تجاوز حدّ الاستخدام مؤقتًا.'
            : scrub(detail || `استجابة غير متوقّعة (${res.status}).`, hit.value);

    return { ok: false, status: res.status, code, message, tookMs };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return {
      ok: false,
      status: null,
      code: timedOut ? 'timeout' : 'upstream',
      message: timedOut ? 'انتهت مهلة الاتصال بـ Google.' : 'تعذّر الاتصال بـ Google من الخادم.',
      tookMs: Date.now() - t0,
    };
  }
}
