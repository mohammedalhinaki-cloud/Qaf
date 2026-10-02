/**
 * عميل MCP مُصغّر فوق Streamable HTTP (JSON-RPC 2.0).
 *
 * يُستخدم للاتصال بخدمة الشاملة الرسمية للقراءة فقط:
 *   https://shamela.ws/mcp   (موثّقة في https://shamela.ws/page/support — بلا حساب)
 *
 * العميل لا يفترض أسماء أدوات مسبقًا: ينفّذ initialize ثم tools/list
 * ويترك اختيار الأداة للمستدعي بناءً على ما أعلنه الخادم فعلًا.
 */

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>;
    required?: string[];
  };
}

export interface McpContentBlock {
  type: string;
  text?: string;
  [k: string]: unknown;
}

export interface McpToolResult {
  content?: McpContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
}

export class McpError extends Error {
  constructor(
    message: string,
    public readonly kind: 'transport' | 'protocol' | 'tool',
  ) {
    super(message);
    this.name = 'McpError';
  }
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PROTOCOL_VERSION = '2025-06-18';

/**
 * يستخرج أول رسالة JSON-RPC من استجابة قد تكون JSON عاديًا أو تدفق SSE.
 */
function extractRpc(contentType: string, body: string): JsonRpcResponse {
  const trimmed = body.trim();
  if (!trimmed) throw new McpError('استجابة فارغة من الخادم.', 'protocol');

  if (contentType.includes('text/event-stream') || trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
    const payloads: string[] = [];
    for (const line of trimmed.split(/\r?\n/)) {
      if (line.startsWith('data:')) payloads.push(line.slice(5).trim());
    }
    for (const p of payloads.reverse()) {
      if (!p || p === '[DONE]') continue;
      try {
        const parsed = JSON.parse(p) as JsonRpcResponse;
        if (parsed.result !== undefined || parsed.error !== undefined) return parsed;
      } catch {
        /* تجاهل الأسطر غير الصالحة */
      }
    }
    throw new McpError('لم تحتوِ استجابة SSE على رسالة JSON-RPC صالحة.', 'protocol');
  }

  try {
    return JSON.parse(trimmed) as JsonRpcResponse;
  } catch {
    throw new McpError('استجابة الخادم ليست JSON صالحًا.', 'protocol');
  }
}

export class McpHttpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  private initialized = false;
  private toolsCache: McpToolDef[] | null = null;

  constructor(
    private readonly url: string,
    private readonly userAgent: string,
    private readonly timeoutMs: number,
  ) {}

  private async send(
    method: string,
    params: unknown,
    isNotification = false,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const payload: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (params !== undefined) payload.params = params;
    if (!isNotification) payload.id = this.nextId++;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent': this.userAgent,
      'MCP-Protocol-Version': PROTOCOL_VERSION,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: combined,
        cache: 'no-store',
      });
    } catch (e) {
      throw new McpError(
        `تعذّر الاتصال بخدمة الشاملة: ${e instanceof Error ? e.message : 'خطأ شبكة'}`,
        'transport',
      );
    }

    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    if (isNotification) {
      // 202 Accepted المتوقّعة للإشعارات.
      if (!res.ok && res.status !== 202) {
        throw new McpError(`رفض الخادم الإشعار ${method} (${res.status}).`, 'transport');
      }
      return undefined;
    }

    if (!res.ok) {
      throw new McpError(`خدمة الشاملة ردّت بالحالة ${res.status} على ${method}.`, 'transport');
    }

    const rpc = extractRpc(res.headers.get('content-type') ?? '', await res.text());
    if (rpc.error) {
      throw new McpError(`خطأ من خدمة الشاملة (${rpc.error.code}): ${rpc.error.message}`, 'protocol');
    }
    return rpc.result;
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    if (this.initialized) return;
    await this.send(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'hujjah', version: '0.1.0' },
      },
      false,
      signal,
    );
    try {
      await this.send('notifications/initialized', {}, true, signal);
    } catch {
      // بعض الخوادم لا تتطلب الإشعار؛ لا نُفشل الجلسة بسببه.
    }
    this.initialized = true;
  }

  async listTools(signal?: AbortSignal): Promise<McpToolDef[]> {
    if (this.toolsCache) return this.toolsCache;
    await this.initialize(signal);
    const result = (await this.send('tools/list', {}, false, signal)) as { tools?: McpToolDef[] } | undefined;
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    if (tools.length === 0) {
      throw new McpError('لم تُعلن خدمة الشاملة عن أي أدوات.', 'protocol');
    }
    this.toolsCache = tools;
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpToolResult> {
    await this.initialize(signal);
    const result = (await this.send('tools/call', { name, arguments: args }, false, signal)) as McpToolResult;
    if (result?.isError) {
      const text = (result.content ?? []).map((c) => c.text ?? '').join(' ').slice(0, 300);
      throw new McpError(`أعادت أداة «${name}» خطأً: ${text || 'بدون تفاصيل'}`, 'tool');
    }
    return result ?? {};
  }

  /** يعيد الحالة إلى الصفر (تُستدعى عند انتهاء الجلسة من طرف الخادم). */
  reset(): void {
    this.sessionId = null;
    this.initialized = false;
    this.toolsCache = null;
  }
}

/**
 * يحوّل نتيجة أداة MCP إلى كائن JSON إن أمكن.
 * ترتيب المحاولات: structuredContent، ثم كتل النص المحتوية على JSON.
 */
export function parseToolPayload(result: McpToolResult): unknown {
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return result.structuredContent;
  }
  for (const block of result.content ?? []) {
    if (typeof block.text !== 'string') continue;
    const t = block.text.trim();
    if (!t.startsWith('{') && !t.startsWith('[')) continue;
    try {
      return JSON.parse(t);
    } catch {
      /* المتابعة إلى الكتلة التالية */
    }
  }
  return null;
}

/** يجمع النص الخام من كتل النتيجة (للحالات التي لا تُعيد JSON). */
export function collectToolText(result: McpToolResult): string {
  return (result.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n')
    .trim();
}
