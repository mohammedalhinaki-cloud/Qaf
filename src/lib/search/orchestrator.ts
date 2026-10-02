import { config } from '@/lib/config';
import type { Evidence, Madhhab, SourceStatus } from '@/lib/types';
import { MADHHAB_LABEL } from '@/lib/types';
import { matchMadhhab } from './madhhab';
import { dedupe, scoreEvidence, tokens } from './rank';
import { getTurathAuthorBio, getTurathBookCategory, searchTurath } from './turath';

export interface SearchOutcome {
  evidence: Evidence[];
  statuses: SourceStatus[];
}

function errMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'انتهت مهلة الاتصال بتراث.';
    return `تعذّر الوصول إلى تراث: ${e.message}`;
  }
  return 'تعذّر الوصول إلى تراث.';
}

/**
 * ينفّذ البحث في تراث (المصدر الوحيد) على كل الاستعلامات،
 * ثم يوحّد النتائج ويرتّبها. عند تعذّر الوصول تُسجَّل الحالة
 * وتُعرض للمستخدم — ولا تُلفَّق أي نتيجة.
 */
export async function searchAllSources(
  queries: string[],
  madhhab: Madhhab,
  onStatus?: (s: SourceStatus) => void,
): Promise<SearchOutcome> {
  const limitedQueries = queries.slice(0, config.limits.maxQueries);
  const perQuery = config.limits.maxResultsPerQuery;

  const started = Date.now();
  let status: SourceStatus;
  let items: Awaited<ReturnType<typeof searchTurath>> = [];

  if (!config.turath.enabled) {
    status = {
      source: 'turath',
      status: 'disabled',
      count: 0,
      tookMs: 0,
      message: 'مصدر البحث معطّل في الإعدادات.',
    };
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.limits.sourceTimeoutMs);
    try {
      for (const q of limitedQueries) {
        const res = await searchTurath(q, { limit: perQuery, signal: controller.signal });
        items.push(...res);
      }
      status = {
        source: 'turath',
        status: items.length > 0 ? 'ok' : 'empty',
        count: items.length,
        tookMs: Date.now() - started,
      };
    } catch (e) {
      const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
      status = {
        source: 'turath',
        status: aborted ? 'timeout' : 'error',
        count: 0,
        tookMs: Date.now() - started,
        message: errMessage(e),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  onStatus?.(status);

  const qTokens = tokens(limitedQueries.join(' '));
  const collected: Evidence[] = [];

  /* ——— إثراء بالتصنيف وترجمة المؤلف لتحديد موافقة المذهب ——— */
  const enrichLimit = 14; // نحدّ من الطلبات الإضافية
  let enriched = 0;
  for (const row of items) {
    let categoryLabel: string | undefined;
    let authorBio: string | undefined;

    if (madhhab !== 'all' && enriched < enrichLimit) {
      enriched += 1;
      if (row.bookId !== undefined) {
        categoryLabel = await getTurathBookCategory(row.bookId).catch(() => undefined);
      }
      const alreadyMatched =
        categoryLabel !== undefined && matchMadhhab(madhhab, categoryLabel, undefined) !== null;
      if (!alreadyMatched && row.authorId !== undefined) {
        authorBio = await getTurathAuthorBio(row.authorId).catch(() => undefined);
      }
    }

    const base = { ...row.evidence, categoryLabel };
    const madhhabMatch = matchMadhhab(madhhab, categoryLabel, authorBio);
    const withMatch = { ...base, madhhabMatch, id: '' };
    collected.push({ ...withMatch, score: scoreEvidence(withMatch, qTokens) });
  }

  const ranked = dedupe(collected.sort((a, b) => b.score - a.score)).slice(
    0,
    config.limits.maxEvidence,
  );

  // ترقيم الأدلة بعد الترتيب النهائي: ن1، ن2 ...
  const evidence = ranked.map((ev, i) => ({ ...ev, id: `ن${i + 1}` }));

  return { evidence, statuses: [status] };
}

/** ملاحظة عربية تصف حالة البحث للمستخدم. */
export function buildSourceNotice(madhhab: Madhhab): string | undefined {
  if (madhhab !== 'all') {
    return `فلتر المذهب (${MADHHAB_LABEL[madhhab]}) يرفع ترتيب المصادر التي صنّفتها تراث ضمن هذا المذهب، ولا يحذف غيرها.`;
  }
  return undefined;
}
