import { config } from '@/lib/config';
import { safeSourceUrl, toPlainText, toSnippet } from '@/lib/security/sanitize';
import type { Evidence } from '@/lib/types';
import { McpError, McpHttpClient, collectToolText, parseToolPayload } from './mcpClient';

/**
 * محوّل مصدر «المكتبة الشاملة».
 *
 * ما تم التحقق منه:
 *   • لا توجد واجهة REST عامة موثّقة للبحث في shamela.ws.
 *   • الطلب GET https://shamela.ws/search?q=... يُعيد نموذج البحث فقط بلا نتائج.
 *   • الشاملة تنشر خدمة رسمية عامة للقراءة فقط عبر MCP على
 *     https://shamela.ws/mcp  (موثّقة في https://shamela.ws/page/support،
 *     «لا تحتاج الخدمة إلى حساب، ولا تعدل محتوى المكتبة»).
 *
 * لذلك هذا المحوّل يتعامل مع الخدمة الرسمية حصرًا، ولا يقوم بأي
 * كشط للموقع ولا بتجاوز أي حماية.
 *
 * ملاحظة مهمة: أسماء أدوات الخدمة وبنية مخرجاتها غير موثّقة علنًا،
 * لذا لا نُثبّتها في الكود. ننفّذ tools/list عند أول نداء ونختار الأداة
 * المناسبة من الأدوات المُعلنة فعلًا، ونستخرج الحقول بمرونة.
 * إن تعذّر ذلك نُرجع خطأً صريحًا يظهر للمستخدم، ولا نُلفّق أي نتيجة.
 */

const ALLOWED_HOSTS = ['shamela.ws'];

let client: McpHttpClient | null = null;

function getClient(): McpHttpClient {
  if (!client) {
    client = new McpHttpClient(config.shamela.mcpUrl, config.userAgent, config.limits.sourceTimeoutMs);
  }
  return client;
}

/* ——— اختيار الأداة من القائمة المُعلنة ——— */

/** كلمات دالّة على أداة بحث في محتوى الكتب (لا في العناوين). */
const CONTENT_SEARCH_HINTS = [
  'search_library',
  'search_content',
  'search_books_by_content',
  'full_text_search',
  'fulltext',
  'search_text',
  'search_pages',
  'search',
];

const TITLE_ONLY_HINTS = ['by_name', 'book_name', 'author', 'title', 'categor', 'narrator', 'recent'];

function pickSearchTool(tools: { name: string; description?: string }[]): string | null {
  const names = tools.map((t) => t.name);

  for (const hint of CONTENT_SEARCH_HINTS) {
    const exact = names.find((n) => n.toLowerCase() === hint);
    if (exact) return exact;
  }
  for (const hint of CONTENT_SEARCH_HINTS) {
    const partial = names.find(
      (n) => n.toLowerCase().includes(hint) && !TITLE_ONLY_HINTS.some((b) => n.toLowerCase().includes(b)),
    );
    if (partial) return partial;
  }
  // أي أداة فيها كلمة search ولا تخصّ العناوين فقط
  const loose = names.find(
    (n) => n.toLowerCase().includes('search') && !TITLE_ONLY_HINTS.some((b) => n.toLowerCase().includes(b)),
  );
  return loose ?? null;
}

/** يحدّد اسم معامل الاستعلام من مخطط الأداة. */
function pickQueryParam(schema: { properties?: Record<string, unknown>; required?: string[] } | undefined): string {
  const props = Object.keys(schema?.properties ?? {});
  const preferred = ['query', 'q', 'text', 'term', 'keyword', 'search', 'phrase'];
  for (const p of preferred) if (props.includes(p)) return p;
  const req = schema?.required?.[0];
  return req ?? props[0] ?? 'query';
}

function pickLimitParam(schema: { properties?: Record<string, unknown> } | undefined): string | null {
  const props = Object.keys(schema?.properties ?? {});
  for (const p of ['limit', 'size', 'per_page', 'count', 'max_results']) if (props.includes(p)) return p;
  return null;
}

/* ——— استخراج النتائج بمرونة ——— */

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** يبحث عن أول مصفوفة من الكائنات داخل الحمولة مهما كان اسم الغلاف. */
function findRows(payload: unknown, depth = 0): Rec[] {
  if (depth > 4) return [];
  if (Array.isArray(payload)) return payload.filter(isRec);
  if (!isRec(payload)) return [];

  for (const key of ['results', 'items', 'data', 'hits', 'matches', 'rows', 'pages', 'content']) {
    const v = payload[key];
    if (Array.isArray(v) && v.some(isRec)) return v.filter(isRec);
  }
  for (const v of Object.values(payload)) {
    const found = findRows(v, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function pickString(row: Rec, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (isRec(v) && typeof v.name === 'string' && v.name.trim()) return v.name;
    if (isRec(v) && typeof v.title === 'string' && v.title.trim()) return v.title;
  }
  return undefined;
}

function pickNumber(row: Rec, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number.parseInt(v.replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

function pickStringArray(row: Rec, keys: string[]): string[] | undefined {
  for (const k of keys) {
    const v = row[k];
    if (Array.isArray(v)) {
      const arr = v.map((x) => (typeof x === 'string' ? x : isRec(x) && typeof x.title === 'string' ? x.title : ''))
        .map((s) => toPlainText(s, 160))
        .filter(Boolean);
      if (arr.length) return arr.slice(0, 4);
    }
    if (typeof v === 'string' && v.includes('>')) {
      const arr = v.split('>').map((s) => toPlainText(s, 160)).filter(Boolean);
      if (arr.length) return arr.slice(0, 4);
    }
  }
  return undefined;
}

/** يبني رابط الشاملة الأصلي من المعرّفات التي أعادها المصدر فقط. */
function buildUrl(row: Rec): string | null {
  const direct = pickString(row, ['url', 'link', 'href', 'page_url', 'source_url']);
  if (direct) {
    const abs = direct.startsWith('http')
      ? direct
      : `${config.shamela.webBase.replace(/\/$/, '')}/${direct.replace(/^\//, '')}`;
    const safe = safeSourceUrl(abs, ALLOWED_HOSTS);
    if (safe) return safe;
  }

  const bookId = pickNumber(row, ['book_id', 'bookId', 'id_book']);
  const pageId = pickNumber(row, ['page_id', 'pageId', 'shamela_page', 'internal_page', 'page_number', 'page']);
  if (!bookId) return null;
  const path = pageId ? `/book/${bookId}/${pageId}` : `/book/${bookId}`;
  return safeSourceUrl(`${config.shamela.webBase.replace(/\/$/, '')}${path}`, ALLOWED_HOSTS);
}

export interface ShamelaRawResult {
  evidence: Omit<Evidence, 'id' | 'score' | 'madhhabMatch'>;
  /** تصنيف الكتاب كما أعاده المصدر، إن وُجد */
  categoryLabel?: string;
}

export interface ShamelaSearchOptions {
  limit: number;
  signal?: AbortSignal;
}

/**
 * بحث في محتوى المكتبة الشاملة عبر خدمتها الرسمية.
 * يرمي McpError عند تعذّر الوصول — ولا يُعيد نتائج ملفّقة أبدًا.
 */
export async function searchShamela(
  query: string,
  opts: ShamelaSearchOptions,
): Promise<ShamelaRawResult[]> {
  const c = getClient();
  const tools = await c.listTools(opts.signal);
  const toolName = pickSearchTool(tools);
  if (!toolName) {
    throw new McpError(
      `لم تُعلن خدمة الشاملة عن أداة بحث في المحتوى (الأدوات المتاحة: ${tools.map((t) => t.name).join('، ')}).`,
      'protocol',
    );
  }

  const tool = tools.find((t) => t.name === toolName);
  const queryParam = pickQueryParam(tool?.inputSchema);
  const limitParam = pickLimitParam(tool?.inputSchema);

  const args: Record<string, unknown> = { [queryParam]: query };
  if (limitParam) args[limitParam] = opts.limit;

  const result = await c.callTool(toolName, args, opts.signal);
  const payload = parseToolPayload(result);

  const rows = findRows(payload);
  if (rows.length === 0) {
    // لا نتائج قابلة للتحليل: إن كان هناك نص فقط، نعتبر البحث بلا نتائج
    // بدل اختلاق بنية. هذا يظهر للمستخدم كـ«لا نتائج» لا كنجاح.
    const text = collectToolText(result);
    if (text && /لا توجد|no results|not found|0 results/i.test(text)) return [];
    if (!payload) return [];
    return [];
  }

  const out: ShamelaRawResult[] = [];
  for (const row of rows.slice(0, opts.limit)) {
    const url = buildUrl(row);
    const bookTitle = toPlainText(
      pickString(row, ['book_title', 'bookTitle', 'book', 'book_name', 'title', 'kitab']),
      200,
    );
    const text = toPlainText(
      pickString(row, ['text', 'content', 'body', 'page_text', 'matn', 'excerpt', 'snippet']),
      6000,
    );

    // شرط العرض: اسم كتاب + نص + رابط أصلي. ما نقص شيء منه يُستبعد.
    if (!url || !bookTitle || !text) continue;

    out.push({
      evidence: {
        source: 'shamela',
        bookTitle,
        author: toPlainText(pickString(row, ['author', 'author_name', 'authorName', 'muallif']), 200) || undefined,
        volume: (() => {
          const v = pickString(row, ['volume', 'vol', 'juz', 'printed_volume']);
          const n = pickNumber(row, ['volume', 'vol', 'juz', 'printed_volume']);
          const s = v ? toPlainText(v, 20) : n !== undefined ? String(n) : '';
          return s || undefined;
        })(),
        page: pickNumber(row, ['printed_page', 'page_number', 'page', 'pg']),
        pageId: pickNumber(row, ['page_id', 'pageId', 'internal_page']),
        bookId: (() => {
          const id = pickNumber(row, ['book_id', 'bookId']);
          return id !== undefined ? String(id) : undefined;
        })(),
        headings: pickStringArray(row, ['chapter_path', 'headings', 'chapters', 'breadcrumb', 'toc_path', 'chapter']),
        text,
        snippet: toSnippet(pickString(row, ['snippet', 'snip', 'highlight', 'excerpt'])) || undefined,
        url,
      },
      categoryLabel: toPlainText(pickString(row, ['category', 'cat', 'category_name', 'section']), 120) || undefined,
    });
  }

  return out;
}

/** لأغراض التشخيص: يعيد أسماء الأدوات التي تعلنها الخدمة فعلًا. */
export async function probeShamela(signal?: AbortSignal): Promise<{ tools: string[]; chosen: string | null }> {
  const c = getClient();
  const tools = await c.listTools(signal);
  return { tools: tools.map((t) => t.name), chosen: pickSearchTool(tools) };
}
