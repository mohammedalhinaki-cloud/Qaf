/**
 * تنظيف كل النصوص القادمة من المصادر الخارجية أو من المستخدم.
 * القاعدة: لا نعرض ولا نُمرّر إلى النموذج أي HTML أو سكربت قادم من المصادر.
 */

const TAG_RE = /<[^>]*>/g;
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** محارف اتجاهية غير مرئية تُستخدم أحيانًا في هجمات الحقن البصري */
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d{1,6});/g, (_m, d: string) => {
      const code = Number.parseInt(d, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

/**
 * يحوّل نصًا خارجيًا إلى نص عادي آمن.
 * تُزال الوسوم أولًا ثم تُفكّ الكيانات، ثم تُزال الوسوم مرة أخرى
 * حتى لا ينتج وسم جديد بعد فكّ الترميز.
 */
export function toPlainText(input: unknown, maxChars = 20000): string {
  if (typeof input !== 'string') return '';
  let out = input.replace(TAG_RE, ' ');
  out = decodeEntities(out);
  out = out.replace(TAG_RE, ' ');
  out = out.replace(CTRL_RE, '').replace(BIDI_RE, '');
  out = out.replace(/[ \t\u00A0]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return out.length > maxChars ? `${out.slice(0, maxChars).trimEnd()}…` : out;
}

/** تنظيف مقتطف قصير: سطر واحد. */
export function toSnippet(input: unknown, maxChars = 320): string {
  const plain = toPlainText(input, maxChars * 2).replace(/\s*\n\s*/g, ' ');
  return plain.length > maxChars ? `${plain.slice(0, maxChars).trimEnd()}…` : plain;
}

/**
 * يسمح فقط بروابط http/https إلى نطاقات المصدرين المعتمدين.
 * أي رابط آخر يُرفض ويُعاد null — لا نعرض روابط خارج المصدرين.
 */
export function safeSourceUrl(raw: unknown, allowedHosts: string[]): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const ok = allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
  return ok ? url.toString() : null;
}

/**
 * تحييد محاولات حقن التعليمات داخل النصوص المسترجَعة قبل تمريرها للنموذج.
 * لا نحذف المحتوى العلمي، بل نكسر أنماط الأوامر الموجّهة للنموذج.
 */
export function neutralizeInstructions(text: string): string {
  return text
    .replace(/```/g, "'''")
    .replace(/^\s*(system|assistant|user)\s*:/gim, '—$1—:')
    .replace(/<\/?\s*(system|instructions?|prompt)\s*>/gi, '');
}
