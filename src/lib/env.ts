/**
 * قراءة متغيّرات البيئة والأسرار **في وقت الطلب** لا عند تحميل الوحدات.
 *
 * لماذا هذا الملف؟
 * على Cloudflare Workers (OpenNext) لا تكون الأسرار جاهزة أثناء تقييم الوحدات
 * (module scope)؛ فهي تُحقن في `process.env` عند أول طلب فقط، كما تتوفّر دائمًا
 * داخل «سياق Cloudflare». أي قراءة مبكّرة تُنتج قيمة فارغة تبقى فارغة إلى الأبد،
 * وهذا سبب شائع جدًا لرسالة «مفتاح Gemini غير مضبوط» رغم ضبط السر في اللوحة.
 *
 * لذلك: كل قراءة هنا تحدث عند الاستعمال، ومن مصدرين معًا:
 *   1) process.env            (nodejs_compat / next dev / Node)
 *   2) سياق Cloudflare        (env الممرّر إلى الـ Worker)
 *
 * ملف خادمي بحت: لا يجوز استيراده من أي مكوّن عميل.
 */

export type EnvSource = 'process.env' | 'cloudflare';

export interface EnvHit {
  /** اسم المتغيّر الذي وُجدت فيه القيمة فعلًا */
  name: string;
  value: string;
  source: EnvSource;
}

/** المفتاح نفسه الذي يستعمله OpenNext لتخزين سياق Cloudflare في النطاق العام. */
const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__');

type UnknownRecord = Record<string, unknown>;

/** يعيد كائن env الخاص بـ Cloudflare إن كنّا داخل Worker، وإلا undefined. */
function cloudflareEnv(): UnknownRecord | undefined {
  try {
    const ctx = (globalThis as unknown as Record<symbol, { env?: UnknownRecord } | undefined>)[
      CLOUDFLARE_CONTEXT_SYMBOL
    ];
    const env = ctx?.env;
    return env && typeof env === 'object' ? env : undefined;
  } catch {
    return undefined;
  }
}

function processEnv(): UnknownRecord | undefined {
  try {
    return typeof process !== 'undefined' && process.env
      ? (process.env as UnknownRecord)
      : undefined;
  } catch {
    return undefined;
  }
}

/** هل نعمل الآن داخل Cloudflare Worker؟ (للتشخيص فقط) */
export function onCloudflareWorker(): boolean {
  return cloudflareEnv() !== undefined;
}

/** تنظيف قيمة نصّية عادية: مسافات زائدة واقتباسات لاصقة من لوحات الاستضافة. */
export function cleanValue(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * تنظيف سرّ (مفتاح API). يعالج أشهر أخطاء اللصق:
 *   - مسافات أو سطر جديد في الطرفين أو الوسط
 *   - اقتباسات محيطة
 *   - لصق السطر كاملًا: `GEMINI_API_KEY=AIza...`
 */
export function cleanSecret(raw: unknown): string {
  let value = cleanValue(raw);
  if (!value) return '';

  const pasted = /^[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.+)$/s.exec(value);
  if (pasted) value = cleanValue(pasted[1]);

  // مفاتيح Google لا تحتوي أي فراغ؛ أي فراغ هنا خطأ لصق.
  return value.replace(/\s+/gu, '');
}

/** يبحث عن أول اسم متغيّر له قيمة، في process.env ثم في سياق Cloudflare. */
export function lookupEnv(names: readonly string[], secret = false): EnvHit | null {
  const clean = secret ? cleanSecret : cleanValue;
  const sources: Array<[EnvSource, UnknownRecord | undefined]> = [
    ['process.env', processEnv()],
    ['cloudflare', cloudflareEnv()],
  ];

  for (const [source, bag] of sources) {
    if (!bag) continue;
    for (const name of names) {
      const value = clean(bag[name]);
      if (value.length > 0) return { name, value, source };
    }
  }

  return null;
}

export function envString(name: string, fallback: string): string {
  return lookupEnv([name])?.value ?? fallback;
}

export function envBool(name: string, fallback: boolean): boolean {
  const hit = lookupEnv([name]);
  if (!hit) return fallback;
  if (/^(1|true|yes|on)$/i.test(hit.value)) return true;
  if (/^(0|false|no|off)$/i.test(hit.value)) return false;
  return fallback;
}

export function envInt(name: string, fallback: number): number {
  const hit = lookupEnv([name]);
  if (!hit) return fallback;
  const n = Number.parseInt(hit.value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/* ———————————————— مفتاح Gemini ———————————————— */

/**
 * أسماء مقبولة للمفتاح. `GEMINI_API_KEY` هو الاسم الرسمي، والبقية للتوافق مع
 * منصات النشر المختلفة. `GEMINI_API_KEY_BUILD` آخر الاحتياطات: يُحقن من بيئة
 * البناء (Workers Builds) حين لا يوجد سرّ وقت تشغيل، ولا يطغى أبدًا على السرّ.
 */
export const GEMINI_KEY_NAMES = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_AI_API_KEY',
  'GEMINI_API_KEY_BUILD',
] as const;

/** يحلّ مفتاح Gemini عند الطلب. يعيد null إن لم يوجد في أي مصدر. */
export function resolveGeminiKey(): EnvHit | null {
  return lookupEnv(GEMINI_KEY_NAMES, true);
}

export interface KeyDiagnostics {
  configured: boolean;
  /** اسم المتغيّر الذي قُرئ منه المفتاح (لا قيمته) */
  name: string | null;
  source: EnvSource | null;
  length: number;
  /** هل يشبه شكل مفاتيح Google AI Studio (AIza…)؟ */
  looksLikeGoogleKey: boolean;
  /** الأسماء التي بحثنا عنها، لتسهيل التشخيص */
  checkedNames: string[];
  onCloudflare: boolean;
  hint: string;
}

/** تشخيص آمن للمفتاح: لا يكشف القيمة إطلاقًا، فقط ما يكفي لمعرفة سبب العطل. */
export function geminiKeyDiagnostics(): KeyDiagnostics {
  const hit = resolveGeminiKey();
  const base = {
    checkedNames: [...GEMINI_KEY_NAMES],
    onCloudflare: onCloudflareWorker(),
  };

  if (!hit) {
    return {
      ...base,
      configured: false,
      name: null,
      source: null,
      length: 0,
      looksLikeGoogleKey: false,
      hint:
        'لم يُعثر على المفتاح في أي مصدر. على Cloudflare: Workers → qaf → Settings → ' +
        'Variables and Secrets → Add → نوع Secret باسم GEMINI_API_KEY ثم Deploy. ' +
        'انتبه: متغيّرات «Build» لا تصل إلى وقت التشغيل.',
    };
  }

  const looksLikeGoogleKey = /^AIza[0-9A-Za-z_-]{30,}$/.test(hit.value);
  const suspiciousLength = hit.value.length < 30 || hit.value.length > 120;

  return {
    ...base,
    configured: true,
    name: hit.name,
    source: hit.source,
    length: hit.value.length,
    looksLikeGoogleKey,
    hint: looksLikeGoogleKey
      ? 'المفتاح موجود وشكله سليم.'
      : suspiciousLength
        ? 'المفتاح موجود لكن طوله غير معتاد؛ تأكّد أنك نسخت المفتاح كاملًا بلا مسافات.'
        : 'المفتاح موجود لكنه لا يبدأ بـ AIza؛ تأكّد أنه مفتاح Google AI Studio وليس مفتاحًا آخر.',
  };
}
