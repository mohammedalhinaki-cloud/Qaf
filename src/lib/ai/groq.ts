import { config } from '@/lib/config';
import { resolveGroqKey } from '@/lib/env';

/**
 * عميل Groq عبر واجهة REST المتوافقة مع OpenAI (chat/completions).
 * المفتاح يُقرأ من البيئة على الخادم فقط — لحظة الطلب لا عند تحميل الوحدة —
 * ولا يُرسل إلى المتصفح ولا يُسجَّل في أي مكان.
 *
 * طبقة التطبيع (Adapter): بقية التطبيق تستدعي `generateJson<T>` وتستلم
 * كائن JSON مُحلَّلًا بنفس الصيغة التي كانت تتوقعها سابقًا، بغضّ النظر عن
 * شكل استجابة Groq الداخلي (choices/message/content).
 */

export type GroqErrorCode =
  | 'missing_key'
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'bad_response'
  | 'blocked'
  | 'model_not_found'
  | 'truncated'
  | 'overloaded'
  | 'upstream';

// ملاحظة: نتجنّب خصائص المُنشئ المختصرة (parameter properties) هنا عمدًا؛
// وضع التجريد الخالص للأنواع (type-stripping، مثل --experimental-strip-types
// في Node) لا يدعم هذه الصياغة، وهذا يكسر تحميل الوحدة وقت الاختبار.
export class GroqError extends Error {
  public readonly code: GroqErrorCode;

  constructor(message: string, code: GroqErrorCode) {
    super(message);
    this.name = 'GroqError';
    this.code = code;
  }
}

export function isGroqConfigured(): boolean {
  return resolveGroqKey() !== null;
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

/** صيغة استجابة Groq (متوافقة مع OpenAI chat/completions). */
interface GroqResponse {
  choices?: Array<{
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string; code?: string };
}

/** ينظّف رسائل الأخطاء من أي احتمال لتسريب المفتاح. */
function scrub(message: string, key: string): string {
  let out = message;
  if (key) out = out.split(key).join('«مفتاح محجوب»');
  return out
    .replace(/Bearer\s+[\w-]+/gi, 'Bearer «محجوب»')
    .replace(/gsk_[\w-]+/gi, 'gsk_«محجوب»')
    .slice(0, 400);
}

function requireKey(): string {
  const hit = resolveGroqKey();
  if (!hit) {
    throw new GroqError(
      'مفتاح Groq غير مضبوط على الخادم. أضف GROQ_API_KEY في متغيّرات البيئة (Secret) ثم أعد النشر.',
      'missing_key',
    );
  }
  return hit.value;
}

/** هل يدلّ نص الخطأ على مفتاح غير صالح؟ */
function isInvalidKeyMessage(detail: string): boolean {
  return /api[_\s-]?key|invalid authentication|credential|unauthorized/i.test(detail);
}

/** هل رفض النموذج صيغة json_schema؟ (نماذج لا تدعم المخرجات المهيكلة) */
function isSchemaUnsupported(detail: string): boolean {
  return /json_schema|response_format|structured|schema/i.test(detail);
}

/** هل رفض النموذج حقل reasoning_effort؟ (نماذج لا تدعم ضبط التفكير) */
function isReasoningUnsupported(detail: string): boolean {
  return /reasoning/i.test(detail);
}

/** هل الخطأ يعني أن النموذج غير موجود أو أُوقف؟ */
function isModelUnavailable(result: RawResult): boolean {
  if (result.ok) return false;
  if (result.status === 404) return true;
  const code = result.data.error?.code ?? '';
  return (
    /model_not_found|model_decommissioned/i.test(code) ||
    (result.status === 400 && /decommissioned|does not exist|no longer supported/i.test(result.detail))
  );
}

interface RawResult {
  ok: boolean;
  status: number;
  data: GroqResponse;
  detail: string;
}

/* ———————————————— إعادة المحاولة عند الازدحام المؤقت ————————————————
 * Groq يعيد أحيانًا 503 «Service Unavailable» أو 500/502/504 بسبب ضغط
 * مؤقت على الخوادم، وهذه حالات عابرة تُحلّ عادة خلال ثوانٍ. بدل فشل
 * الطلب فورًا ونزولنا إلى عرض المقاطع الخام بلا صياغة، نعيد المحاولة
 * تلقائيًا عدّة مرّات مع تأخير متصاعد (exponential backoff) ضمن مهلة
 * الطلب نفسها.
 */

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [400, 1000, 2200];

function isOverloadedMessage(detail: string): boolean {
  return /overloaded|over capacity|high demand|unavailable|try again later/i.test(detail);
}

function isRetryableResult(result: RawResult): boolean {
  if (result.ok) return false;
  // status === 0 يعني خطأ اتصال عابر (انظر callGroq).
  return result.status === 0 || RETRYABLE_STATUS.has(result.status) || isOverloadedMessage(result.detail);
}

/** ينتظر `ms` أو يعود فورًا إن أُلغيت الإشارة أثناء الانتظار. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** يستدعي Groq مع إعادة محاولات تلقائية عند 503/ازدحام مؤقت. */
async function callGroqWithRetry(
  key: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<RawResult> {
  let result = await callGroq(key, body, signal);
  let attempt = 1;

  while (isRetryableResult(result) && attempt < MAX_ATTEMPTS && !signal.aborted) {
    await delay(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)], signal);
    if (signal.aborted) break;
    result = await callGroq(key, body, signal);
    attempt += 1;
  }

  return result;
}

/* ———————————————— اكتشاف نموذج بديل تلقائيًا ————————————————
 * Groq يوقف نماذج قديمة من حين لآخر (model_decommissioned)، وبعض المفاتيح
 * قد لا تتاح لها كل النماذج. عند تعذّر النموذج المضبوط، نسأل Groq عن
 * النماذج المتاحة فعلًا لهذا المفتاح ونختار أفضل بديل، ثم نحفظه في
 * الذاكرة كي لا نكرّر الاستعلام.
 */

/** ترتيب التفضيل عند البحث عن بديل (نماذج إنتاجية نصية مناسبة للعربية أولًا). */
const FALLBACK_MODELS = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'moonshotai/kimi-k2-instruct-0905',
  'moonshotai/kimi-k2-instruct',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
];

/** نماذج لا تصلح للتوليد النصي المهيكل (صوت، حراسة، أنظمة وكيلة…). */
const UNSUITABLE_MODEL = /whisper|tts|guard|moderation|embedding|compound|safety/i;

let modelCache: { fingerprint: string; model: string } | null = null;

function cacheFingerprint(key: string): string {
  return `${config.groq.baseUrl}|${config.groq.model}|${key.slice(-6)}`;
}

/** النموذج الفعلي المستعمل: المضبوط، أو البديل المكتشف سابقًا لهذا المفتاح. */
function activeModel(key: string): string {
  return modelCache && modelCache.fingerprint === cacheFingerprint(key)
    ? modelCache.model
    : config.groq.model;
}

interface ListedModel {
  id?: string;
  active?: boolean;
}

/** يسأل Groq عن النماذج المتاحة لهذا المفتاح ويعيد معرّفاتها. */
async function listAvailableModels(key: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch(`${config.groq.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: signal ?? AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: ListedModel[] };
    return (data.data ?? [])
      .filter((m) => m.active !== false)
      .map((m) => m.id ?? '')
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
  // أي نموذج llama/gpt-oss متاح، ثم أي نموذج توليد نصي.
  const general = available.find((n) => n !== exclude && /llama|gpt-oss|qwen|kimi/i.test(n));
  if (general) return general;
  return available.find((n) => n !== exclude) ?? null;
}

/**
 * عند تعذّر النموذج: يكتشف بديلًا متاحًا ويحفظه. يعيد اسم البديل أو null.
 */
async function discoverFallbackModel(key: string, signal?: AbortSignal): Promise<string | null> {
  const available = await listAvailableModels(key, signal);
  const fallback = pickFallback(available, config.groq.model);
  if (fallback) {
    modelCache = { fingerprint: cacheFingerprint(key), model: fallback };
    console.warn(
      `[groq] النموذج «${config.groq.model}» غير متاح لهذا المفتاح؛ تم التحويل تلقائيًا إلى «${fallback}».`,
    );
  }
  return fallback;
}

async function callGroq(
  key: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<RawResult> {
  const url = `${config.groq.baseUrl}/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new GroqError('انتهت مهلة الاتصال بنموذج Groq.', 'timeout');
    }
    // خطأ اتصال عابر (شبكة/DNS/إعادة تعيين): نرجعه كنتيجة لا كاستثناء كي
    // تلتقطه حلقة إعادة المحاولة بدل إفشال الطلب من أول عثرة.
    return { ok: false, status: 0, data: {}, detail: 'تعذّر الاتصال بنموذج Groq.' };
  }

  let data: GroqResponse = {};
  try {
    data = (await res.json()) as GroqResponse;
  } catch {
    /* استجابة بلا JSON */
  }

  return { ok: res.ok, status: res.status, data, detail: data.error?.message ?? '' };
}

/* ———————————————— بناء الطلب ———————————————— */

type JsonMode = 'json_schema' | 'json_object';

/** هل يدعم هذا النموذج ضبط جهد التفكير (reasoning_effort)؟ */
function supportsReasoningEffort(model: string): boolean {
  return /gpt-oss|qwen3/i.test(model);
}

/**
 * يبني جسم طلب chat/completions.
 * عند json_schema: نسلّم المخطط لـ Groq للمخرجات المهيكلة.
 * عند json_object (نماذج لا تدعم المخطط): نضمّن المخطط نصًا في التعليمات
 * ليبقى شكل المخرجات مطابقًا لما تتوقعه بقية أجزاء التطبيق.
 */
function buildBody(opts: GenerateOptions, model: string, mode: JsonMode): Record<string, unknown> {
  const useSchema = mode === 'json_schema' && opts.schema !== undefined;

  const schemaNote =
    !useSchema && opts.schema
      ? `\n\nأعد كائن JSON واحدًا فقط، دون أي نص خارج الكائن، مطابقًا تمامًا لهذا المخطط:\n${JSON.stringify(opts.schema)}`
      : '';

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: opts.system + schemaNote },
      { role: 'user', content: opts.user },
    ],
    temperature: opts.temperature ?? 0.2,
    max_completion_tokens: opts.maxOutputTokens ?? 2048,
    response_format: useSchema
      ? { type: 'json_schema', json_schema: { name: 'result', schema: opts.schema } }
      : { type: 'json_object' },
    stream: false,
  };

  // تقليل «التفكير» على النماذج الاستدلالية كي لا يُستهلك حدّ المخرجات قبل
  // إنتاج JSON (يقابل تعطيل thinkingBudget سابقًا).
  const effort = config.groq.reasoningEffort;
  if (effort !== null && supportsReasoningEffort(model)) {
    body.reasoning_effort = effort;
  }

  return body;
}

export async function generateJson<T>(opts: GenerateOptions): Promise<T> {
  const key = requireKey();

  const timeout = AbortSignal.timeout(config.limits.aiTimeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let model = activeModel(key);
  let mode: JsonMode = opts.schema ? 'json_schema' : 'json_object';
  let result = await callGroqWithRetry(key, buildBody(opts, model, mode), signal);

  // النموذج المضبوط غير متاح (أُوقف أو غير متاح لهذا المفتاح): نكتشف بديلًا.
  if (isModelUnavailable(result)) {
    const fallback = await discoverFallbackModel(key, signal);
    if (fallback && fallback !== model) {
      model = fallback;
      result = await callGroqWithRetry(key, buildBody(opts, model, mode), signal);
    }
  }

  // بعض النماذج لا تدعم json_schema: نعيد المحاولة بوضع json_object.
  if (!result.ok && result.status === 400 && mode === 'json_schema' && isSchemaUnsupported(result.detail)) {
    mode = 'json_object';
    result = await callGroqWithRetry(key, buildBody(opts, model, mode), signal);
  }

  // بعض النماذج لا تقبل reasoning_effort: نعيد المحاولة مرة واحدة بدونه.
  if (!result.ok && result.status === 400 && isReasoningUnsupported(result.detail)) {
    const body = buildBody(opts, model, mode);
    delete body.reasoning_effort;
    result = await callGroqWithRetry(key, body, signal);
  }

  const { ok, status, data, detail } = result;

  if (status === 401 || status === 403 || (status === 400 && isInvalidKeyMessage(detail))) {
    throw new GroqError(
      'مفتاح Groq مرفوض (غير صالح أو مقيَّد أو منتهي الصلاحية). تحقّق من GROQ_API_KEY.',
      'auth',
    );
  }
  if (status === 429) {
    throw new GroqError('تم تجاوز حدّ الاستخدام لدى Groq. حاول بعد قليل.', 'rate_limit');
  }
  if (isModelUnavailable(result)) {
    throw new GroqError(
      `النموذج «${config.groq.model}» غير متاح لهذا المفتاح، ولم يُعثر على أي نموذج بديل متاح له. تحقّق من المفتاح أو غيّر GROQ_MODEL.`,
      'model_not_found',
    );
  }
  if (!ok && status === 0) {
    throw new GroqError(
      'تعذّر الاتصال بنموذج Groq بعد عدّة محاولات تلقائية. تحقّق من الاتصال وحاول مرة أخرى.',
      'upstream',
    );
  }
  if (!ok && (RETRYABLE_STATUS.has(status) || isOverloadedMessage(detail))) {
    throw new GroqError(
      'نموذج Groq مزدحم حاليًا (ضغط مرتفع على الخوادم). تمت إعادة المحاولة عدّة مرّات تلقائيًا دون نجاح، فحاول مرة أخرى خلال لحظات.',
      'overloaded',
    );
  }
  if (!ok) {
    throw new GroqError(scrub(`خطأ من Groq (${status}) ${detail}`.trim(), key), 'upstream');
  }

  const choice = data.choices?.[0];

  if (choice?.message?.refusal) {
    throw new GroqError('رفض النموذج معالجة هذا الطلب.', 'blocked');
  }

  const text = choice?.message?.content ?? '';

  if (!text.trim()) {
    if (choice?.finish_reason === 'length') {
      throw new GroqError(
        'استهلك النموذج حدّ المخرجات قبل إنتاج نص. قلّل حجم الطلب أو ارفع الحدّ.',
        'truncated',
      );
    }
    throw new GroqError('أعاد النموذج استجابة فارغة.', 'bad_response');
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
    throw new GroqError('تعذّر تحليل استجابة النموذج.', 'bad_response');
  }
}

/* ———————————————— فحص تشخيصي ———————————————— */

export interface GroqPing {
  ok: boolean;
  status: number | null;
  /** تصنيف مختصر للعطل، مطابق لرموز GroqError */
  code: GroqError['code'] | null;
  message: string;
  tookMs: number;
}

/**
 * فحص خفيف للمفتاح: يسأل Groq عن بيانات النموذج فقط (بلا توليد ولا استهلاك).
 * يُستعمل في `/api/health?probe=1` لتمييز «مفتاح مفقود» عن «مفتاح مرفوض»
 * عن «نموذج غير متاح» بدقّة، دون كشف المفتاح.
 */
export async function pingGroq(): Promise<GroqPing> {
  const t0 = Date.now();
  const hit = resolveGroqKey();

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
  const url = `${config.groq.baseUrl}/models/${encodeURIComponent(model)}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${hit.value}` },
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
          model === config.groq.model
            ? 'المفتاح يعمل والنموذج متاح.'
            : `المفتاح يعمل. النموذج المضبوط «${config.groq.model}» غير متاح، ويُستعمل بدلًا منه «${model}» تلقائيًا.`,
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
          message: `النموذج «${config.groq.model}» غير متاح لهذا المفتاح؛ سيُستعمل «${fallback}» تلقائيًا.`,
          tookMs: Date.now() - t0,
        };
      }
    }

    let detail = '';
    try {
      const j = (await res.json()) as GroqResponse;
      detail = j.error?.message ?? '';
    } catch {
      /* تجاهل */
    }

    const code: GroqError['code'] =
      res.status === 404
        ? 'model_not_found'
        : res.status === 429
          ? 'rate_limit'
          : res.status === 401 || res.status === 403 || isInvalidKeyMessage(detail)
            ? 'auth'
            : 'upstream';

    const message =
      code === 'auth'
        ? 'المفتاح موجود لكن Groq رفضه (غير صالح أو مقيَّد أو منتهي الصلاحية).'
        : code === 'model_not_found'
          ? `النموذج «${config.groq.model}» غير متاح لهذا المفتاح، ولا يوجد بديل متاح له.`
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
      message: timedOut ? 'انتهت مهلة الاتصال بـ Groq.' : 'تعذّر الاتصال بـ Groq من الخادم.',
      tookMs: Date.now() - t0,
    };
  }
}
