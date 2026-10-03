import { config } from '@/lib/config';
import {
  TURATH_AUTHOR_BIO_FIXTURE,
  TURATH_BOOK_CATEGORY_FIXTURE,
  TURATH_SEARCH_FIXTURE,
  devFixturesEnabled,
} from '@/lib/dev/fixtures';
import { safeSourceUrl, toPlainText, toSnippet } from '@/lib/security/sanitize';
import type { Evidence } from '@/lib/types';

/**
 * محوّل مصدر «تراث» (app.turath.io).
 *
 * طريقة الوصول: واجهة JSON عامة على api.turath.io، لا تحتاج مفتاحًا.
 * تم التحقق من نقاط النهاية التالية عمليًا قبل كتابة هذا الملف:
 *   GET /search?q=&ver=3[&cat_id=&page=]  → { count, data: [{ book_id, cat_id, author_id, meta(JSON string), snip, text }] }
 *   GET /page?book_id=&pg=&ver=3          → { meta(JSON string), text }
 *   GET /book?id=&ver=3                   → { meta: { name, author_id, cat_id, pdf_links?, info } }
 *   GET /author?id=&ver=3                 → { id, name, biography }
 *
 * meta المفكوك يحتوي: { book_name, author_name, vol, page, page_id, headings[] }
 * رابط الموضع الأصلي: https://app.turath.io/book/{book_id}/{page_id}
 */

const ALLOWED_HOSTS = ['turath.io'];

interface RawSearchHit {
  book_id?: number;
  cat_id?: number;
  author_id?: number;
  meta?: string;
  snip?: string;
  text?: string;
}

interface HitMeta {
  book_name?: string;
  author_name?: string;
  vol?: string;
  page?: number;
  page_id?: number;
  headings?: string[];
}

export interface TurathSearchOptions {
  limit: number;
  signal?: AbortSignal;
}

async function getJson<T>(path: string, params: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path.replace(/^\//, ''), `${config.turath.apiBase.replace(/\/$/, '')}/`);
  url.searchParams.set('ver', String(config.turath.apiVersion));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': config.userAgent },
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`turath ${path} رد بالحالة ${res.status}`);
  }
  return (await res.json()) as T;
}

function parseMeta(raw: unknown): HitMeta {
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as HitMeta) : {};
  } catch {
    return {};
  }
}

/* ——— ذاكرة مؤقتة لبيانات الكتب والمؤلفين (لتقليل الطلبات) ——— */

const bookCache = new Map<number, { categoryLabel?: string } | null>();
const authorCache = new Map<number, string | null>();

/**
 * يستخرج تصنيف الكتاب كما تسمّيه تراث نفسها.
 * المسار الموثوق الوحيد المتاح: أول جزء من مسار ملف الـ PDF في بيانات الكتاب
 * (مثل «الفقه الحنبلي/المغني - ابن قدامة ...»)، وهو مجلد التصنيف عند تراث.
 * إذا لم يتوفر، نُعيد undefined ولا نخمّن.
 */
export async function getTurathBookCategory(bookId: number, signal?: AbortSignal): Promise<string | undefined> {
  if (devFixturesEnabled()) return TURATH_BOOK_CATEGORY_FIXTURE[bookId];
  if (bookCache.has(bookId)) return bookCache.get(bookId)?.categoryLabel;
  try {
    const data = await getJson<{ meta?: { pdf_links?: { root?: string } } }>('/book', { id: bookId }, signal);
    const root = data.meta?.pdf_links?.root;
    let categoryLabel: string | undefined;
    if (typeof root === 'string' && root.includes('/')) {
      const first = root.split('/')[0]!.trim();
      if (first && !first.startsWith('waq')) categoryLabel = toPlainText(first, 120);
    }
    bookCache.set(bookId, { categoryLabel });
    return categoryLabel;
  } catch {
    bookCache.set(bookId, null);
    return undefined;
  }
}

/** يجلب ترجمة المؤلف كما نشرتها تراث (تُستخدم كسند معلن لموافقة المذهب). */
export async function getTurathAuthorBio(authorId: number, signal?: AbortSignal): Promise<string | undefined> {
  if (devFixturesEnabled()) return TURATH_AUTHOR_BIO_FIXTURE[authorId];
  if (authorCache.has(authorId)) return authorCache.get(authorId) ?? undefined;
  try {
    const data = await getJson<{ biography?: string }>('/author', { id: authorId }, signal);
    const bio = toPlainText(data.biography, 2000);
    authorCache.set(authorId, bio || null);
    return bio || undefined;
  } catch {
    authorCache.set(authorId, null);
    return undefined;
  }
}

/**
 * يبني رابط تراث من المعرّفات التي أعادها المصدر فقط.
 * إذا أخبرتنا النتيجة أن لها صفحة مطبوعة ولم تعطِ page_id، نرفض رابط بداية
 * الكتاب بدل إيهام المستخدم بأنه رابط الموضع. لا نحاول تحويل رقم الصفحة
 * المطبوعة إلى معرّف داخلي بالتخمين.
 */
export function buildTurathUrl(
  bookId: number | undefined,
  pageId: number | undefined,
  hasSpecificPage = false,
): string | null {
  if (bookId === undefined || !Number.isInteger(bookId) || bookId <= 0) return null;
  const precise = pageId !== undefined && Number.isInteger(pageId) && pageId > 0;
  if (hasSpecificPage && !precise) return null;
  const path = precise ? `/book/${bookId}/${pageId}` : `/book/${bookId}`;
  return safeSourceUrl(`${config.turath.appBase.replace(/\/$/, '')}${path}`, ALLOWED_HOSTS);
}

export interface TurathRawResult {
  bookId?: number;
  authorId?: number;
  catId?: number;
  evidence: Omit<Evidence, 'id' | 'score' | 'madhhabMatch'>;
}

/** بحث نصي في تراث. يُعيد نتائج خامًا قبل الترتيب ودمج بيانات المذهب. */
export async function searchTurath(
  query: string,
  opts: TurathSearchOptions,
): Promise<TurathRawResult[]> {
  // وضع التطوير فقط: نستخدم استجابة محفوظة بدل الشبكة. مستحيل في الإنتاج.
  const data = devFixturesEnabled()
    ? (TURATH_SEARCH_FIXTURE as { count?: number; data?: RawSearchHit[] })
    : await getJson<{ count?: number; data?: RawSearchHit[] }>('/search', { q: query }, opts.signal);

  const hits = Array.isArray(data.data) ? data.data.slice(0, opts.limit) : [];
  const out: TurathRawResult[] = [];

  for (const hit of hits) {
    const meta = parseMeta(hit.meta);
    const hasSpecificPage = typeof meta.page === 'number' && meta.page > 0;
    const url = buildTurathUrl(hit.book_id, meta.page_id, hasSpecificPage);
    const text = toPlainText(hit.text, 6000);
    const bookTitle = toPlainText(meta.book_name, 200);

    // لا نعرض نتيجة بلا نص أو بلا رابط أصلي أو بلا اسم كتاب.
    if (!url || !text || !bookTitle) continue;

    out.push({
      bookId: hit.book_id,
      authorId: hit.author_id,
      catId: hit.cat_id,
      evidence: {
        source: 'turath',
        bookTitle,
        author: toPlainText(meta.author_name, 200) || undefined,
        volume: typeof meta.vol === 'string' && meta.vol.trim() ? toPlainText(meta.vol, 20) : undefined,
        page: typeof meta.page === 'number' && meta.page > 0 ? meta.page : undefined,
        pageId: typeof meta.page_id === 'number' ? meta.page_id : undefined,
        bookId: hit.book_id ? String(hit.book_id) : undefined,
        headings: Array.isArray(meta.headings)
          ? meta.headings.map((h) => toPlainText(h, 160)).filter(Boolean).slice(0, 4)
          : undefined,
        text,
        snippet: toSnippet(hit.snip) || undefined,
        url,
      },
    });
  }

  return out;
}
