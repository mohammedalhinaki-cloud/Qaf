import { config } from '@/lib/config';
import { TURATH_SEARCH_FIXTURE, devFixturesEnabled } from '@/lib/dev/fixtures';
import { safeSourceUrl, toPlainText, toSnippet } from '@/lib/security/sanitize';
import type { Evidence } from '@/lib/types';

/**
 * محوّل مصدر «تراث» (app.turath.io).
 *
 * طريقة الوصول: واجهة JSON عامة على api.turath.io، لا تحتاج مفتاحًا.
 * نقطة النهاية المستخدمة:
 *   GET /search?q=&ver=3  → { count, data: [{ book_id, cat_id, author_id, meta(JSON string), snip, text }] }
 *
 * meta المفكوك يحتوي: { book_name, author_name, vol, page, page_id, headings[] }.
 * نحتفظ بـ `cat_id` كما أعادته تراث ليكون وحده أساس فلتر المذهب.
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

/**
 * يبني رابط الموضع من `book_id` و`page_id` اللذين أعادتهما نتيجة تراث فقط.
 * لا نُنشئ رابط بداية الكتاب مطلقًا؛ غياب أي معرّف يعني غياب رابط موثوق،
 * فتُستبعد النتيجة بدل تخمين الصفحة أو إيهام المستخدم بأن الرابط دقيق.
 */
export function buildTurathUrl(
  bookId: number | undefined,
  pageId: number | undefined,
): string | null {
  if (bookId === undefined || !Number.isInteger(bookId) || bookId <= 0) return null;
  if (pageId === undefined || !Number.isInteger(pageId) || pageId <= 0) return null;
  const path = `/book/${bookId}/${pageId}`;
  return safeSourceUrl(`${config.turath.appBase.replace(/\/$/, '')}${path}`, ALLOWED_HOSTS);
}

export interface TurathRawResult {
  bookId?: number;
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
    const url = buildTurathUrl(hit.book_id, meta.page_id);
    const text = toPlainText(hit.text, 6000);
    const bookTitle = toPlainText(meta.book_name, 200);

    // لا نعرض نتيجة بلا نص أو بلا رابط أصلي أو بلا اسم كتاب.
    if (!url || !text || !bookTitle) continue;

    out.push({
      bookId: hit.book_id,
      catId: hit.cat_id,
      evidence: {
        source: 'turath',
        bookTitle,
        author: toPlainText(meta.author_name, 200) || undefined,
        volume: typeof meta.vol === 'string' && meta.vol.trim() ? toPlainText(meta.vol, 20) : undefined,
        page: typeof meta.page === 'number' && meta.page > 0 ? meta.page : undefined,
        pageId: typeof meta.page_id === 'number' ? meta.page_id : undefined,
        bookId: hit.book_id ? String(hit.book_id) : undefined,
        categoryId: typeof hit.cat_id === 'number' && Number.isInteger(hit.cat_id) ? hit.cat_id : undefined,
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
