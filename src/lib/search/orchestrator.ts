import { config } from '@/lib/config';
import type { Evidence, Madhhab, SourceStatus } from '@/lib/types';
import { MADHHAB_LABEL } from '@/lib/types';
import { filterByMadhhab, matchMadhhab, turathMadhhabCategoryLabel } from './madhhab.ts';
import { dedupe, scoreEvidence, tokens } from './rank.ts';
import { searchTurath } from './turath.ts';

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
 * ينفّذ البحث النصي المعتاد في تراث على كل الاستعلامات ثم يعالج النتائج.
 * فلتر المذهب هنا إقصائي بالكامل، لكنه لا يغيّر بحث تراث ولا بياناته:
 * نفحص فقط `cat_id` الموجود في كل نتيجة ونحذف كل نتيجة لا تطابق القسم
 * الرسمي للمذهب المختار. عند اختيار «الكل» لا يحدث أي فلتر مذهبي.
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
      // الاستعلامات مستقلة؛ تشغيلها معًا يتيح جمع زوايا السؤال المركّب ضمن المهلة.
      const batches = await Promise.all(
        limitedQueries.map((query) => searchTurath(query, { limit: perQuery, signal: controller.signal })),
      );
      items = batches.flat();

      // هذه هي نقطة الفلترة الوحيدة. لا أسماء كتب، ولا أسماء مؤلفين، ولا تراجم.
      items = filterByMadhhab(items, madhhab);

      status = {
        source: 'turath',
        status: items.length > 0 ? 'ok' : 'empty',
        count: items.length,
        tookMs: Date.now() - started,
        message:
          items.length === 0 && madhhab !== 'all'
            ? `لم تُرجع النتائج مصادر تحمل تصنيف تراث الرسمي للمذهب ${MADHHAB_LABEL[madhhab]}.`
            : undefined,
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
      items = [];
    } finally {
      clearTimeout(timer);
    }
  }

  onStatus?.(status);

  const qTokens = tokens(limitedQueries.join(' '));
  const collected: Evidence[] = items.map((row) => {
    const categoryId = row.catId;
    const categoryLabel = turathMadhhabCategoryLabel(categoryId);
    const base = { ...row.evidence, categoryId, categoryLabel };
    const madhhabMatch = matchMadhhab(madhhab, categoryId);
    const withMatch = { ...base, madhhabMatch, id: '' };
    return { ...withMatch, score: scoreEvidence(withMatch, qTokens) };
  });

  const ranked = dedupe(collected.sort((a, b) => b.score - a.score)).slice(
    0,
    config.limits.maxEvidence,
  );

  // ترقيم الأدلة بعد الفلترة والترتيب النهائي: ن1، ن2 ...
  const evidence = ranked.map((ev, i) => ({ ...ev, id: `ن${i + 1}` }));
  return { evidence, statuses: [status] };
}

/** ملاحظة عربية تصف أثر فلتر المذهب الحقيقي للمستخدم. */
export function buildSourceNotice(madhhab: Madhhab): string | undefined {
  if (madhhab === 'all') return undefined;
  return `فلتر المذهب (${MADHHAB_LABEL[madhhab]}) إقصائي: لا تظهر إلا النتائج التي تحمل تصنيف المذهب الرسمي في بيانات تراث.`;
}
