/** الأنواع المشتركة بين الخادم والواجهة. */

/** مصدر البحث الوحيد: تراث. */
export type SourceId = 'turath';

export const SOURCE_LABEL: Record<SourceId, string> = {
  turath: 'تراث',
};

export type Madhhab = 'all' | 'hanafi' | 'maliki' | 'shafii' | 'hanbali';

export const MADHHAB_LABEL: Record<Madhhab, string> = {
  all: 'جميع المذاهب',
  hanafi: 'حنفي',
  maliki: 'مالكي',
  shafii: 'شافعي',
  hanbali: 'حنبلي',
};

/**
 * مقطع نصي مسترجَع من تراث.
 * كل حقل هنا يأتي حرفيًا من المصدر — الحقول غير المتوفرة تبقى undefined
 * ولا تُملأ بالتخمين.
 */
export interface Evidence {
  /** معرّف داخلي قصير يُستخدم في الاستشهاد (ن1، ن2 ...) */
  id: string;
  source: SourceId;
  bookTitle: string;
  author?: string;
  /** رقم الجزء كما ورد في المصدر */
  volume?: string;
  /** رقم الصفحة المطبوعة كما ورد في المصدر */
  page?: number;
  /** معرّف الصفحة داخل المصدر (يُستخدم لبناء الرابط الدقيق) */
  pageId?: number;
  bookId?: string;
  /** العناوين الهرمية للموضع داخل الكتاب */
  headings?: string[];
  /** النص المسترجَع بعد التنظيف */
  text: string;
  /** مقتطف قصير حول موضع المطابقة */
  snippet?: string;
  /** رابط المصدر الأصلي خارج موقعنا */
  url: string;
  /** تصنيف المصدر كما ورد من المصدر نفسه (لا نصنّف نحن) */
  categoryLabel?: string;
  /** موافقة المذهب المطلوب، وسندها. null = غير معروف */
  madhhabMatch?: {
    madhhab: Exclude<Madhhab, 'all'>;
    /** من أين عرفنا ذلك: تصنيف الكتاب في المصدر، أو ترجمة المؤلف في المصدر */
    basis: 'source-category' | 'source-author-bio';
    basisText: string;
  } | null;
  /** درجة ترتيب داخلية */
  score: number;
}

export type SourceStatusCode = 'ok' | 'empty' | 'error' | 'disabled' | 'timeout';

export interface SourceStatus {
  source: SourceId;
  status: SourceStatusCode;
  /** عدد النتائج المسترجعة */
  count: number;
  /** رسالة عربية مفهومة للمستخدم عند الفشل */
  message?: string;
  /** زمن الاستجابة بالمللي ثانية */
  tookMs: number;
}

export interface AnswerClaim {
  /** جملة أو فقرة من الإجابة */
  text: string;
  /** معرّفات الأدلة التي تسند هذه الجملة */
  evidenceIds: string[];
}

export interface Disagreement {
  topic: string;
  positions: Array<{ position: string; evidenceIds: string[] }>;
}

export interface AskResult {
  questionId: string;
  question: string;
  madhhab: Madhhab;
  /** الاستعلامات التي أُرسلت فعليًا إلى تراث */
  queries: string[];
  sourceStatus: SourceStatus[];
  /** الأدلة المستخدمة في الاستشهادات داخل النص (مرتبة) */
  evidence: Evidence[];
  /** نص الإجابة، أو null عند انعدام أساس حقيقي في الأدلة */
  answer: string | null;
  claims: AnswerClaim[];
  disagreements: Disagreement[];
  /** مدى ما تثبته الأدلة: كامل، جزئي، أو معدوم. */
  coverage?: 'complete' | 'partial' | 'none';
  /** ما لم يمكن إثباته من المقاطع في الإجابة الجزئية. */
  limitations?: string[];
  /** صحيح فقط عندما لم يوجد أساس موثّق يصلح لإجابة. */
  insufficient: boolean;
  /** ملاحظة عربية تُعرض للمستخدم عند وجود قصور */
  notice?: string;
  createdAt: number;
}

/** أحداث البث المرحلي إلى الواجهة. */
export type AskEvent =
  | { type: 'stage'; stage: StageId; label: string }
  | { type: 'queries'; queries: string[] }
  | { type: 'source'; status: SourceStatus }
  | { type: 'result'; result: AskResult }
  | { type: 'error'; message: string; code?: string };

export type StageId =
  | 'analyzing'
  | 'searching'
  | 'collecting'
  | 'reasoning'
  | 'done'
  | 'failed';

export const STAGE_LABEL: Record<StageId, string> = {
  analyzing: 'تحليل السؤال وصياغة استعلامات البحث',
  searching: 'البحث في تراث',
  collecting: 'جمع المقاطع وترتيبها',
  reasoning: 'تحليل الأدلة وصياغة الإجابة',
  done: 'اكتمل',
  failed: 'تعذّر الإكمال',
};

/* ——— نماذج المحادثة (تُخزَّن محليًا في المتصفح) ——— */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** نص سؤال المستخدم */
  content?: string;
  madhhab?: Madhhab;
  /** نتيجة البحث الكاملة لرسائل المساعد */
  result?: AskResult;
  /** رسالة خطأ لرسائل المساعد الفاشلة */
  error?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
