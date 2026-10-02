/**
 * تحديد معدّل بسيط في الذاكرة (نافذة منزلقة لكل عنوان IP).
 * مناسب لنسخة MVP بلا قاعدة بيانات. على بيئة متعددة النسخ (Vercel)
 * يحدّ من الإساءة داخل كل نسخة؛ ولتشديد أقوى يُستبدل لاحقًا بمخزن مشترك.
 */

const WINDOW_MS = 60_000;
const MAX_KEYS = 5000;

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limitPerMinute: number): RateLimitResult {
  const now = Date.now();

  if (hits.size > MAX_KEYS) {
    for (const [k, times] of hits) {
      if (times.length === 0 || now - times[times.length - 1] > WINDOW_MS) hits.delete(k);
    }
  }

  const prev = hits.get(key) ?? [];
  const recent = prev.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= limitPerMinute) {
    const oldest = recent[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  recent.push(now);
  hits.set(key, recent);
  return { allowed: true, remaining: limitPerMinute - recent.length, retryAfterSeconds: 0 };
}

/** استخراج معرّف العميل من ترويسات الطلب. */
export function clientKey(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? headers.get('cf-connecting-ip') ?? 'local';
}
