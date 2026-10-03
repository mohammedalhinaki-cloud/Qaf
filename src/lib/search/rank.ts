import type { Evidence, Madhhab } from '@/lib/types';

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
 * درجة الصلة الأساسية للمقطع. تبقى مستقلة تمامًا عن اختيار المذهب كي لا
 * يتحول الاختيار إلى شرط استبعاد أو يتغلب على صلة نتيجة البحث.
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

  return Math.round(score * 100) / 100;
}

/**
 * ترجيح صغير ومحدود للمذهب بعد حساب الصلة واختيار النتائج الأقرب.
 * أقل من وزن تطابق كلمة واحدة، ولذلك لا يستطيع تعويض فارق صلة معتبر.
 */
const MADHHAB_PRIORITY_BOOST = 0.35;

/**
 * يعيد ترتيب النتائج الموجودة فقط؛ لا يحذف أو يضيف نتيجة ولا يغير درجتها
 * الأساسية أو معرّفاتها. وعند عدم اختيار مذهب يعيد ترتيب الصلة كما هو.
 */
export function rankEvidence(evidence: Evidence[], madhhab: Madhhab): Evidence[] {
  return evidence
    .map((ev, index) => {
      const matchesSelected =
        madhhab !== 'all' && ev.madhhabMatch?.madhhab === madhhab;
      return {
        ev,
        index,
        rankScore: ev.score + (matchesSelected ? MADHHAB_PRIORITY_BOOST : 0),
      };
    })
    .sort(
      (a, b) =>
        b.rankScore - a.rankScore ||
        b.ev.score - a.ev.score ||
        a.index - b.index,
    )
    .map(({ ev }) => ev);
}

/** إزالة التكرار: نفس الكتاب ونفس الصفحة، أو نص شبه متطابق. */
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
