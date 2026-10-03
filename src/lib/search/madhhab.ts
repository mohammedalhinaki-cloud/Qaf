import type { Evidence, Madhhab } from '@/lib/types';

/**
 * تصنيفات المذاهب الرسمية في تراث.
 *
 * القيم أدناه هي معرّفات أقسام تراث نفسها (`cat_id`) وليست تصنيفًا محليًا:
 *   https://app.turath.io/category/14  الفقه الحنفي
 *   https://app.turath.io/category/15  الفقه المالكي
 *   https://app.turath.io/category/16  الفقه الشافعي
 *   https://app.turath.io/category/17  الفقه الحنبلي
 *
 * لا نفحص اسم الكتاب أو اسم المؤلف أو ترجمته أو نص المقطع. المطابقة لا تحدث
 * إلا إذا أعادت نتيجة البحث من تراث `cat_id` الرسمي المطابق حرفيًا.
 */

type KnownMadhhab = Exclude<Madhhab, 'all'>;

export interface TurathMadhhabCategory {
  id: number;
  label: string;
}

export const TURATH_MADHHAB_CATEGORY: Record<KnownMadhhab, TurathMadhhabCategory> = {
  hanafi: { id: 14, label: 'الفقه الحنفي' },
  maliki: { id: 15, label: 'الفقه المالكي' },
  shafii: { id: 16, label: 'الفقه الشافعي' },
  hanbali: { id: 17, label: 'الفقه الحنبلي' },
};

const CATEGORY_BY_ID = new Map<number, TurathMadhhabCategory>(
  Object.values(TURATH_MADHHAB_CATEGORY).map((category) => [category.id, category]),
);

/** اسم القسم الرسمي إن كان `cat_id` أحد أقسام المذاهب الأربعة. */
export function turathMadhhabCategoryLabel(categoryId: number | undefined): string | undefined {
  if (categoryId === undefined || !Number.isInteger(categoryId)) return undefined;
  return CATEGORY_BY_ID.get(categoryId)?.label;
}

/**
 * يثبت المطابقة من `cat_id` الذي أعادته تراث فقط.
 * غياب المعرّف أو اختلافه يعيد null، حتى لو بدا اسم الكتاب أو المؤلف حنفيًا.
 */
export function matchMadhhab(
  madhhab: Madhhab,
  categoryId: number | undefined,
): Evidence['madhhabMatch'] {
  if (madhhab === 'all') return null;
  const category = TURATH_MADHHAB_CATEGORY[madhhab];
  if (categoryId !== category.id) return null;
  return {
    madhhab,
    basis: 'turath-category',
    categoryId: category.id,
    basisText: category.label,
  };
}

/**
 * الفلتر الإقصائي الحقيقي: عند اختيار مذهب لا يمرّ إلا ما يحمل `cat_id`
 * الرسمي لذلك المذهب. اختيار «الكل» يعيد النتائج كما هي بلا فلتر مذهبي.
 */
export function filterByMadhhab<T extends { catId?: number }>(
  rows: T[],
  madhhab: Madhhab,
): T[] {
  if (madhhab === 'all') return rows;
  const requiredCategoryId = TURATH_MADHHAB_CATEGORY[madhhab].id;
  return rows.filter((row) => row.catId === requiredCategoryId);
}

export const MADHHAB_BASIS_LABEL: Record<'turath-category', string> = {
  'turath-category': 'تصنيف الكتاب في تراث',
};
