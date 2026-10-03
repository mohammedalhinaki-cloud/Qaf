import type { Evidence } from '@/lib/types';

/**
 * منطق الاستشهادات الداخلية داخل نص الإجابة.
 *
 * الإجابة القادمة من النموذج تحمل إشارات بالمعرّفات بين قوسين مربعين
 * مثل «... [ن2]» أو «... [ن1، ن3]». هذه الوحدة تحوّل النص إلى مقاطع
 * قابلة للعرض، وتفصل كل معرّف صالح إلى استشهاد مستقل قابل للضغط.
 * المعرّف غير الموجود في الأدلة الحقيقية لا يُعرض كاستشهاد أبدًا.
 */

/** جزء من نص الإجابة: نص عادي أو استشهاد مرتبط بدليل حقيقي. */
export type AnswerSegment =
  | { type: 'text'; text: string }
  | { type: 'cite'; id: string };

/**
 * يقصّ عنوان الكتاب إلى صيغة قصيرة تصلح لاستشهاد داخل النص.
 * يأخذ الجزء الأول قبل الفواصل الواضحة (شرطة أو قوس)، ثم يقصّ
 * عند حدّ الكلمات إن بقي طويلًا.
 */
export function shortBookTitle(title: string, max = 18): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (!clean) return 'مصدر';

  // الجزء الأول قبل فاصل واضح: «المغني - ابن قدامة» → «المغني»
  const firstPart = clean.split(/\s+[-–—]\s+|\s*\(/)[0]!.trim();
  const base = firstPart.length >= 4 ? firstPart : clean;

  if (base.length <= max) return base;

  const words = base.split(' ');
  const kept: string[] = [];
  let len = 0;
  for (const w of words) {
    if (len === 0 ? w.length > max : len + 1 + w.length > max) break;
    kept.push(w);
    len = kept.join(' ').length;
  }
  if (kept.length === 0) return `${base.slice(0, max).trimEnd()}…`;
  return `${kept.join(' ')}…`;
}

/**
 * نص الاستشهاد المعروض داخل النص، مثل:
 *   «المجموع 3/301» عند توفر الجزء والصفحة
 *   «المجموع جـ3» عند توفر الجزء فقط
 *   «المجموع ص301» عند توفر الصفحة فقط
 *   «المجموع · موضع 280» عند توفر معرّف موضع تراث فقط
 * لا يُخترع أي رقم غير موجود في بيانات المصدر.
 */
export function citationLabel(
  ev: Pick<Evidence, 'bookTitle' | 'volume' | 'page' | 'pageId'>,
): string {
  const short = shortBookTitle(ev.bookTitle);
  const vol = ev.volume?.trim();
  const page = ev.page;
  if (vol && page !== undefined) return `${short} ${vol}/${page}`;
  if (vol) return `${short} جـ${vol}`;
  if (page !== undefined) return `${short} ص${page}`;
  if (ev.pageId !== undefined) return `${short} · موضع ${ev.pageId}`;
  return short;
}

/** يفكّ محتوى قوس مربع إلى معرّفات صالحة فقط. */
function extractIds(inner: string, validIds: Set<string>): string[] {
  return inner
    .split(/[,،؛;\s]+/)
    .map((s) => s.trim())
    .filter((s) => validIds.has(s));
}

/**
 * يقسّم فقرة من نص الإجابة إلى مقاطع نص واستشهادات.
 * كل قوس يحوي معرّفًا واحدًا أو أكثر يتحوّل إلى استشهادات متجاورة
 * مستقلة؛ وما لم يقابل دليلًا حقيقيًا يبقى نصًا عاديًا كما هو.
 */
export function splitAnswerText(paragraph: string, validIds: Set<string>): AnswerSegment[] {
  const parts = paragraph.split(/(\[[^\]\n]{1,80}\])/g);
  const out: AnswerSegment[] = [];

  const pushText = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.type === 'text') last.text += text;
    else out.push({ type: 'text', text });
  };

  for (const part of parts) {
    if (!part) continue;
    const m = /^\[([^\]\n]{1,80})\]$/.exec(part);
    if (!m) {
      pushText(part);
      continue;
    }
    const ids = extractIds(m[1]!, validIds);
    if (ids.length === 0) {
      pushText(part);
      continue;
    }
    for (const id of ids) out.push({ type: 'cite', id });
  }

  return out;
}
