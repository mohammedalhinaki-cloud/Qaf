import type { Evidence, Madhhab } from '@/lib/types';

/**
 * فلتر المذهب.
 *
 * قاعدة صارمة: لا نصنّف أي كتاب أو مؤلف على مذهب من عندنا.
 * المصدر الوحيد للتصنيف هو نص يأتي من المصدر نفسه:
 *   1) تصنيف الكتاب في المصدر (مثل «الفقه الحنبلي» في تصنيفات تراث والشاملة).
 *   2) ترجمة المؤلف المنشورة في المصدر (مثل «فقيه حنفي» في ترجمة تراث).
 * ما عدا ذلك يبقى المذهب غير معروف (null) ولا يُعرض للمستخدم أي ادّعاء.
 *
 * وأثر الفلتر ترجيحي فقط: يرفع ترتيب المطابق ولا يحذف غير المطابق،
 * لأن غياب التصنيف لا يعني مخالفة المذهب.
 */

type Known = Exclude<Madhhab, 'all'>;

/**
 * الألفاظ التي نبحث عنها حرفيًا داخل نصوص المصدر.
 * هذه ليست تصنيفًا للكتب، بل مجرد أنماط مطابقة نصية لأسماء المذاهب
 * كما تكتبها المصادر نفسها.
 */
const TERMS: Record<Known, RegExp> = {
  hanafi: /(الفقه\s+الحنفي|حنفي|الحنفية|الأحناف|أبي\s+حنيفة)/,
  maliki: /(الفقه\s+المالكي|مالكي|المالكية|مذهب\s+مالك)/,
  shafii: /(الفقه\s+الشافعي|شافعي|الشافعية|مذهب\s+الشافعي)/,
  hanbali: /(الفقه\s+الحنبلي|حنبلي|الحنابلة|الحنبلية|مذهب\s+أحمد)/,
};

/** تصنيفات الكتب الرسمية في المصدرين — مطابقة دقيقة وليست استنتاجًا. */
const CATEGORY_EXACT: Record<Known, string[]> = {
  hanafi: ['الفقه الحنفي'],
  maliki: ['الفقه المالكي'],
  shafii: ['الفقه الشافعي'],
  hanbali: ['الفقه الحنبلي'],
};

export const MADHHAB_CATEGORY_NAME: Record<Known, string> = {
  hanafi: 'الفقه الحنفي',
  maliki: 'الفقه المالكي',
  shafii: 'الفقه الشافعي',
  hanbali: 'الفقه الحنبلي',
};

/**
 * يحدّد موافقة المذهب اعتمادًا على بيانات المصدر فقط.
 * @param categoryLabel تصنيف الكتاب كما ورد من المصدر (إن وُجد)
 * @param authorBio ترجمة المؤلف كما وردت من المصدر (إن وُجدت)
 */
export function matchMadhhab(
  madhhab: Madhhab,
  categoryLabel: string | undefined,
  authorBio: string | undefined,
): Evidence['madhhabMatch'] {
  if (madhhab === 'all') return null;

  if (categoryLabel) {
    const exact = CATEGORY_EXACT[madhhab].some((c) => categoryLabel.includes(c));
    if (exact) {
      return {
        madhhab,
        basis: 'source-category',
        basisText: categoryLabel,
      };
    }
  }

  if (authorBio) {
    // نقتصر على أول 400 حرف من الترجمة حيث يُذكر الوصف الفقهي عادةً،
    // ونلتقط الجملة الحاوية للفظ لعرضها كسند للمستخدم.
    const head = authorBio.slice(0, 400);
    const m = TERMS[madhhab].exec(head);
    if (m) {
      const start = Math.max(0, m.index - 60);
      const end = Math.min(head.length, m.index + m[0].length + 60);
      return {
        madhhab,
        basis: 'source-author-bio',
        basisText: head.slice(start, end).trim(),
      };
    }
  }

  return null;
}

export const MADHHAB_BASIS_LABEL: Record<'source-category' | 'source-author-bio', string> = {
  'source-category': 'تصنيف الكتاب في المصدر',
  'source-author-bio': 'ترجمة المؤلف في المصدر',
};
