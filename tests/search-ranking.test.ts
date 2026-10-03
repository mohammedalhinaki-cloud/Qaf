/** اختبارات تكامل طبقة ترتيب نتائج تراث باستخدام البيانات المحفوظة للتطوير. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { citationLabel } from '../src/lib/citations.ts';
import { searchAllSources } from '../src/lib/search/orchestrator.ts';
import type { Evidence } from '../src/lib/types.ts';

function sourceIdentity(item: Evidence): string {
  return `${item.bookId}|${item.pageId}|${item.url}`;
}

function citationBySource(items: Evidence[]): Map<string, string> {
  return new Map(items.map((item) => [sourceIdentity(item), citationLabel(item)]));
}

test('اختيار الحنفي يعيد الترتيب فقط ويحافظ على غير الحنفي ومعرفات تراث والاستشهادات', async () => {
  const previousFixtures = process.env.HUJJAH_DEV_FIXTURES;
  process.env.HUJJAH_DEV_FIXTURES = 'true';

  try {
    const withoutMadhhab = await searchAllSources(['النية في الوضوء'], 'all');
    const hanafi = await searchAllSources(['النية في الوضوء'], 'hanafi');

    assert.equal(withoutMadhhab.evidence.length, 4);
    assert.ok(withoutMadhhab.evidence.every((item) => item.madhhabMatch == null));

    assert.equal(hanafi.evidence.length, withoutMadhhab.evidence.length);
    assert.ok(hanafi.evidence.some((item) => item.madhhabMatch?.madhhab === 'hanafi'));
    assert.ok(hanafi.evidence.some((item) => item.madhhabMatch == null));

    // اختيار المذهب لا يغيّر مجموعة نتائج تراث ولا معرّفات الكتب/الصفحات/الروابط.
    assert.deepEqual(
      new Set(hanafi.evidence.map(sourceIdentity)),
      new Set(withoutMadhhab.evidence.map(sourceIdentity)),
    );

    // بيانات بناء الاستشهاد لكل مصدر تبقى نفسها؛ الذي يتغير هو ترتيب الأدلة فقط.
    assert.deepEqual(citationBySource(hanafi.evidence), citationBySource(withoutMadhhab.evidence));

    // عقد معرّفات الاستشهاد الداخلي الحالي باقٍ كما هو بعد الترتيب النهائي.
    assert.deepEqual(
      hanafi.evidence.map((item) => item.id),
      hanafi.evidence.map((_, index) => `ن${index + 1}`),
    );
  } finally {
    if (previousFixtures === undefined) delete process.env.HUJJAH_DEV_FIXTURES;
    else process.env.HUJJAH_DEV_FIXTURES = previousFixtures;
  }
});
