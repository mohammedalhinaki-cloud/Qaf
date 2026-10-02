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

async function callGemini(
  key: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<RawResult> {
  const url = `${config.gemini.baseUrl}/models/${encodeURIComponent(config.gemini.model)}:generateContent`;

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

  let result = await callGemini(key, body, signal);

  // بعض النماذج لا تقبل thinkingConfig: نعيد المحاولة مرة واحدة بدونه.
  if (!result.ok && result.status === 400 && isThinkingUnsupported(result.detail)) {
    delete (body.generationConfig as Record<string, unknown>).thinkingConfig;
    result = await callGemini(key, body, signal);
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
      `النموذج «${config.gemini.model}» غير متاح لهذا المفتاح. غيّر GEMINI_MODEL إلى نموذج متاح.`,
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

  const url = `${config.gemini.baseUrl}/models/${encodeURIComponent(config.gemini.model)}`;

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
        message: 'المفتاح يعمل والنموذج متاح.',
        tookMs,
      };
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
          ? `النموذج «${config.gemini.model}» غير متاح لهذا المفتاح.`
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
