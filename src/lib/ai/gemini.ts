import { config } from '@/lib/config';

/**
 * عميل Gemini عبر REST. المفتاح يُقرأ من البيئة على الخادم فقط
 * ولا يُرسل إلى المتصفح ولا يُسجَّل في أي مكان.
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
      | 'upstream',
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function isGeminiConfigured(): boolean {
  return config.gemini.apiKey.trim().length > 0;
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
function scrub(message: string): string {
  const key = config.gemini.apiKey;
  let out = message;
  if (key) out = out.split(key).join('«مفتاح محجوب»');
  return out.replace(/key=[\w-]+/gi, 'key=«محجوب»');
}

export async function generateJson<T>(opts: GenerateOptions): Promise<T> {
  if (!isGeminiConfigured()) {
    throw new GeminiError(
      'مفتاح Gemini غير مضبوط على الخادم. أضف GEMINI_API_KEY في متغيرات البيئة.',
      'missing_key',
    );
  }

  const url = `${config.gemini.baseUrl}/models/${encodeURIComponent(config.gemini.model)}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: 'user', parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      responseMimeType: 'application/json',
      ...(opts.schema ? { responseSchema: opts.schema } : {}),
    },
    safetySettings: [],
  };

  const timeout = AbortSignal.timeout(config.limits.aiTimeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.gemini.apiKey,
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

  if (res.status === 401 || res.status === 403) {
    throw new GeminiError('مفتاح Gemini غير صالح أو لا يملك صلاحية.', 'auth');
  }
  if (res.status === 429) {
    throw new GeminiError('تم تجاوز حدّ الاستخدام لدى Gemini. حاول بعد قليل.', 'rate_limit');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as GeminiResponse;
      detail = j.error?.message ?? '';
    } catch {
      /* تجاهل */
    }
    throw new GeminiError(scrub(`خطأ من Gemini (${res.status}) ${detail}`.trim()), 'upstream');
  }

  const data = (await res.json()) as GeminiResponse;

  if (data.promptFeedback?.blockReason) {
    throw new GeminiError('رفض النموذج معالجة هذا الطلب.', 'blocked');
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) {
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
