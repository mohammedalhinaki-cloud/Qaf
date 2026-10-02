import type { Evidence } from '@/lib/types';

/** تطبيع عربي خفيف للمقارنة فقط — لا يُغيّر النص المعروض. */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set([
  'في','من','على','عن','الى','إلى','ما','هل','هو','هي','ان','أن','إن','كان','قد','لا','و','او','أو',
  'التي','الذي','مع','بين','كل','حكم','ماهو','هذا','هذه','ثم','بل','لكن','اذا','إذا','عند','غير',
]);

export function tokens(s: string): string[] {
  return normalizeArabic(s)
    .split(' ')
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/**
 * ترتيب المقطع بناءً على تغطية كلمات السؤال، مع ترجيح المذهب
 * عندما يكون مسنَدًا إلى بيانات المصدر فقط.
 */
export function scoreEvidence(ev: Omit<Evidence, 'score'>, queryTokens: string[]): number {
  const hay = normalizeArabic(`${ev.bookTitle} ${(ev.headings ?? []).join(' ')} ${ev.snippet ?? ''} ${ev.text}`);
  const headHay = normalizeArabic(`${ev.bookTitle} ${(ev.headings ?? []).join(' ')}`);

  let score = 0;
  let matched = 0;
  for (const t of queryTokens) {
    const inBody = hay.includes(t);
    if (inBody) {
      matched += 1;
      score += 1;
    }
    if (headHay.includes(t)) score += 0.8;
  }

  // نسبة التغطية أهم من التكرار
  if (queryTokens.length > 0) score += (matched / queryTokens.length) * 3;

  // المقاطع القصيرة جدًا أقل فائدة كدليل
  if (ev.text.length < 120) score -= 1.2;
  else if (ev.text.length > 400) score += 0.4;

  // توفّر الموضع الدقيق يرفع قيمة الدليل للتوثيق
  if (ev.page !== undefined) score += 0.5;
  if (ev.volume !== undefined) score += 0.2;

  // ترجيح المذهب — فقط عند وجود سند من المصدر
  if (ev.madhhabMatch) {
    score += ev.madhhabMatch.basis === 'source-category' ? 2.5 : 1.2;
  }

  return Math.round(score * 100) / 100;
}

/** إزالة التكرار: نفس المصدر ونفس الكتاب ونفس الصفحة، أو نص شبه متطابق. */
export function dedupe(list: Evidence[]): Evidence[] {
  const seenKey = new Set<string>();
  const seenText = new Set<string>();
  const out: Evidence[] = [];

  for (const ev of list) {
    const key = `${ev.source}|${ev.bookId ?? ev.bookTitle}|${ev.pageId ?? ev.page ?? ''}`;
    if (seenKey.has(key)) continue;

    const fingerprint = normalizeArabic(ev.text).slice(0, 180);
    if (fingerprint && seenText.has(fingerprint)) continue;

    seenKey.add(key);
    if (fingerprint) seenText.add(fingerprint);
    out.push(ev);
  }
  return out;
}

/**
 * توزيع عادل بين المصدرين: نتناوب بينهما حسب الترتيب
 * حتى لا يبتلع مصدر واحد كل المقاعد.
 */
export function interleaveBySource(list: Evidence[], limit: number): Evidence[] {
  const bySource = new Map<string, Evidence[]>();
  for (const ev of list) {
    const arr = bySource.get(ev.source) ?? [];
    arr.push(ev);
    bySource.set(ev.source, arr);
  }
  for (const arr of bySource.values()) arr.sort((a, b) => b.score - a.score);

  const out: Evidence[] = [];
  const queues = [...bySource.values()];
  let i = 0;
  while (out.length < limit && queues.some((q) => q.length > 0)) {
    const q = queues[i % queues.length]!;
    const next = q.shift();
    if (next) out.push(next);
    i += 1;
  }
  return out.sort((a, b) => b.score - a.score);
}
