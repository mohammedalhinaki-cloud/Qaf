import { config } from '@/lib/config';
import type { Evidence, Madhhab, SourceStatus } from '@/lib/types';
import { MADHHAB_LABEL } from '@/lib/types';
import { matchMadhhab } from './madhhab';
import { dedupe, interleaveBySource, scoreEvidence, tokens } from './rank';
import { searchShamela } from './shamela';
import { getTurathAuthorBio, getTurathBookCategory, searchTurath } from './turath';

export interface SearchOutcome {
  evidence: Evidence[];
  statuses: SourceStatus[];
}

function errMessage(source: 'shamela' | 'turath', e: unknown): string {
  const name = source === 'shamela' ? 'المكتبة الشاملة' : 'تراث';
  if (e instanceof Error) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return `انتهت مهلة الاتصال بـ${name}.`;
    return `تعذّر الوصول إلى ${name}: ${e.message}`;
  }
  return `تعذّر الوصول إلى ${name}.`;
}

/** يشغّل بحثًا واحدًا على مصدر مع قياس الزمن وتحويل الأخطاء إلى حالة. */
async function runSource<T>(
  source: 'shamela' | 'turath',
  enabled: boolean,
  fn: (signal: AbortSignal) => Promise<T[]>,
): Promise<{ status: SourceStatus; items: T[] }> {
  const started = Date.now();
  if (!enabled) {
    return {
      status: { source, status: 'disabled', count: 0, tookMs: 0, message: 'هذا المصدر معطّل في الإعدادات.' },
      items: [],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.limits.sourceTimeoutMs);
  try {
    const items = await fn(controller.signal);
    return {
      status: {
        source,
        status: items.length > 0 ? 'ok' : 'empty',
        count: items.length,
        tookMs: Date.now() - started,
      },
      items,
    };
  } catch (e) {
    const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return {
      status: {
        source,
        status: aborted ? 'timeout' : 'error',
        count: 0,
        tookMs: Date.now() - started,
        message: errMessage(source, e),
      },
      items: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ينفّذ البحث في المصدرين معًا على كل الاستعلامات، ثم يوحّد النتائج ويرتّبها.
 * فشل أحد المصدرين لا يوقف الآخر — تُسجَّل حالته وتُعرض للمستخدم.
 */
export async function searchAllSources(
  queries: string[],
  madhhab: Madhhab,
  onStatus?: (s: SourceStatus) => void,
): Promise<SearchOutcome> {
  const limitedQueries = queries.slice(0, config.limits.maxQueries);
  const perQuery = config.limits.maxResultsPerQuery;

  const turathTask = runSource('turath', config.turath.enabled, async (signal) => {
    const all: Awaited<ReturnType<typeof searchTurath>> = [];
    for (const q of limitedQueries) {
      const res = await searchTurath(q, { limit: perQuery, signal });
      all.push(...res);
    }
    return all;
  });

  const shamelaTask = runSource('shamela', config.shamela.enabled, async (signal) => {
    const all: Awaited<ReturnType<typeof searchShamela>> = [];
    let lastError: unknown = null;
    for (const q of limitedQueries) {
      try {
        const res = await searchShamela(q, { limit: perQuery, signal });
        all.push(...res);
      } catch (e) {
        lastError = e;
        break; // عطل في الخدمة: لا جدوى من تكرار بقية الاستعلامات
      }
    }
    if (all.length === 0 && lastError) throw lastError;
    return all;
  });

  const [turathOut, shamelaOut] = await Promise.all([turathTask, shamelaTask]);
  onStatus?.(turathOut.status);
  onStatus?.(shamelaOut.status);

  const qTokens = tokens(limitedQueries.join(' '));
  const collected: Evidence[] = [];

  /* ——— تراث: إثراء بالتصنيف وترجمة المؤلف لتحديد موافقة المذهب ——— */
  const enrichLimit = 14; // نحدّ من الطلبات الإضافية
  let enriched = 0;
  for (const row of turathOut.items) {
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

  /* ——— الشاملة: التصنيف يأتي ضمن نتيجة المصدر إن وُجد ——— */
  for (const row of shamelaOut.items) {
    const base = { ...row.evidence, categoryLabel: row.categoryLabel };
    const madhhabMatch = matchMadhhab(madhhab, row.categoryLabel, undefined);
    const withMatch = { ...base, madhhabMatch, id: '' };
    collected.push({ ...withMatch, score: scoreEvidence(withMatch, qTokens) });
  }

  const ranked = interleaveBySource(dedupe(collected.sort((a, b) => b.score - a.score)), config.limits.maxEvidence);

  // ترقيم الأدلة بعد الترتيب النهائي: ن1، ن2 ...
  const evidence = ranked.map((ev, i) => ({ ...ev, id: `ن${i + 1}` }));

  return { evidence, statuses: [shamelaOut.status, turathOut.status] };
}

/** ملاحظة عربية تصف حالة المصدرين للمستخدم. */
export function buildSourceNotice(statuses: SourceStatus[], madhhab: Madhhab): string | undefined {
  const failed = statuses.filter((s) => s.status === 'error' || s.status === 'timeout');
  const parts: string[] = [];

  if (failed.length === 1) {
    const f = failed[0]!;
    parts.push(
      `${f.source === 'shamela' ? 'المكتبة الشاملة' : 'تراث'} لم تكن متاحة أثناء هذا البحث، والإجابة مبنية على المصدر الآخر فقط.`,
    );
  }
  if (madhhab !== 'all') {
    parts.push(
      `فلتر المذهب (${MADHHAB_LABEL[madhhab]}) يرفع ترتيب المصادر التي صنّفها الموقعان ضمن هذا المذهب، ولا يحذف غيرها.`,
    );
  }
  return parts.length ? parts.join(' ') : undefined;
}
