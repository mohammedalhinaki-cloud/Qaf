import { NextRequest } from 'next/server';
import { planSearch, synthesizeAnswer } from '@/lib/ai/pipeline';
import { GeminiError, isGeminiConfigured } from '@/lib/ai/gemini';
import { config } from '@/lib/config';
import { clientKey, rateLimit } from '@/lib/security/ratelimit';
import { ValidationError, parseAskRequest } from '@/lib/security/validate';
import { buildSourceNotice, searchAllSources } from '@/lib/search/orchestrator';
import {
  SOURCE_LABEL,
  STAGE_LABEL,
  type AskEvent,
  type AskResult,
  type Evidence,
  type SourceStatus,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function line(event: AskEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function jsonError(message: string, status: number, code?: string, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: message, code, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  /* ——— 1) حماية نقطة النهاية ——— */
  if (req.headers.get('content-type')?.includes('application/json') !== true) {
    return jsonError('نوع المحتوى يجب أن يكون application/json.', 415, 'bad_content_type');
  }

  const limit = rateLimit(clientKey(req.headers), config.limits.ratePerMinute);
  if (!limit.allowed) {
    return jsonError(
      `عدد الطلبات كبير. أعد المحاولة بعد ${limit.retryAfterSeconds} ثانية.`,
      429,
      'rate_limited',
      { retryAfter: limit.retryAfterSeconds },
    );
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 20_000) return jsonError('حجم الطلب كبير جدًا.', 413, 'payload_too_large');
    body = JSON.parse(raw);
  } catch {
    return jsonError('تعذّر قراءة محتوى الطلب.', 400, 'bad_json');
  }

  let parsed;
  try {
    parsed = parseAskRequest(body);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.message, 400, e.code);
    return jsonError('طلب غير صالح.', 400, 'bad_request');
  }

  if (!isGeminiConfigured()) {
    return jsonError(
      'النظام غير مهيّأ: مفتاح Gemini غير مضبوط على الخادم. أضف GEMINI_API_KEY في متغيرات البيئة.',
      503,
      'missing_key',
    );
  }

  const { question, madhhab, history } = parsed;
  const encoder = new TextEncoder();

  /* ——— 2) البث المرحلي ——— */
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => {
        try {
          controller.enqueue(encoder.encode(line(event)));
        } catch {
          /* أُغلق التدفّق من طرف العميل */
        }
      };

      try {
        send({ type: 'stage', stage: 'analyzing', label: STAGE_LABEL.analyzing });
        const plan = await planSearch(question, history, req.signal);

        if (plan.outOfScope || plan.queries.length === 0) {
          const result: AskResult = {
            questionId: crypto.randomUUID(),
            question,
            madhhab,
            queries: [],
            sourceStatus: [],
            evidence: [],
            sources: [],
            answer: null,
            claims: [],
            disagreements: [],
            insufficient: true,
            notice:
              'هذا السؤال خارج نطاق ما يمكن البحث عنه في المكتبة الشاملة وتراث. حُجَّة يبحث في كتب التراث الإسلامي فقط.',
            createdAt: Date.now(),
          };
          send({ type: 'result', result });
          send({ type: 'stage', stage: 'done', label: STAGE_LABEL.done });
          controller.close();
          return;
        }

        send({ type: 'queries', queries: plan.queries });
        send({ type: 'stage', stage: 'searching', label: STAGE_LABEL.searching });

        const statuses: SourceStatus[] = [];
        const { evidence } = await searchAllSources(plan.queries, madhhab, (s) => {
          statuses.push(s);
          send({ type: 'source', status: s });
        });

        send({ type: 'stage', stage: 'collecting', label: STAGE_LABEL.collecting });

        const ordered = statuses.sort((a, b) => (a.source === 'shamela' ? -1 : 1));
        const bothFailed = ordered.every((s) => s.status === 'error' || s.status === 'timeout');

        /* ——— فشل المصدرين معًا: لا إجابة تخمينية ——— */
        if (bothFailed) {
          const result: AskResult = {
            questionId: crypto.randomUUID(),
            question,
            madhhab,
            queries: plan.queries,
            sourceStatus: ordered,
            evidence: [],
            sources: [],
            answer: null,
            claims: [],
            disagreements: [],
            insufficient: true,
            notice: 'تعذّر الوصول إلى المصادر حاليًا، لذلك لم أتمكن من التحقق من الإجابة.',
            createdAt: Date.now(),
          };
          send({ type: 'result', result });
          send({ type: 'stage', stage: 'done', label: STAGE_LABEL.done });
          controller.close();
          return;
        }

        const missingSources = ordered
          .filter((s) => s.status === 'error' || s.status === 'timeout')
          .map((s) => SOURCE_LABEL[s.source]);

        /* ——— لا أدلة: نُصرّح بذلك ——— */
        if (evidence.length === 0) {
          const result: AskResult = {
            questionId: crypto.randomUUID(),
            question,
            madhhab,
            queries: plan.queries,
            sourceStatus: ordered,
            evidence: [],
            sources: [],
            answer: null,
            claims: [],
            disagreements: [],
            insufficient: true,
            notice:
              missingSources.length > 0
                ? `لم أجد مادة كافية في المصادر التي تم البحث فيها، مع العلم أن ${missingSources.join('، ')} لم تكن متاحة.`
                : 'لم أجد مادة كافية في المكتبة الشاملة وتراث عن هذا السؤال بهذه الصياغة. جرّب صياغة أدق أو مصطلحًا فقهيًا أقرب.',
            createdAt: Date.now(),
          };
          send({ type: 'result', result });
          send({ type: 'stage', stage: 'done', label: STAGE_LABEL.done });
          controller.close();
          return;
        }

        send({ type: 'stage', stage: 'reasoning', label: STAGE_LABEL.reasoning });

        let synthesis;
        try {
          synthesis = await synthesizeAnswer(question, madhhab, evidence, missingSources, req.signal);
        } catch (e) {
          // فشل النموذج بعد نجاح البحث: لا نُضيّع مادة حقيقية استُرجعت فعلًا.
          // نعرض المقاطع كما هي ونوضّح أن الصياغة لم تتم. ولا نعرض أي إجابة.
          const reason = e instanceof GeminiError ? e.message : 'تعذّرت صياغة الإجابة.';
          const result: AskResult = {
            questionId: crypto.randomUUID(),
            question,
            madhhab,
            queries: plan.queries,
            sourceStatus: ordered,
            evidence: evidence.slice(0, 5),
            sources: evidence.slice(0, 5),
            answer: null,
            claims: [],
            disagreements: [],
            insufficient: true,
            notice: `${reason} عُثر على المقاطع التالية في المصادر، وهي معروضة كما وردت دون صياغة.`,
            createdAt: Date.now(),
          };
          send({ type: 'result', result });
          send({ type: 'stage', stage: 'done', label: STAGE_LABEL.done });
          controller.close();
          return;
        }

        // المصادر المعروضة: المستشهَد بها أولًا (3–5 عند توفرها)
        const usedSet = new Set(synthesis.usedIds);
        const cited: Evidence[] = evidence.filter((e) => usedSet.has(e.id));
        const sources = (cited.length > 0 ? cited : evidence).slice(0, 5);
        const shownEvidence = cited.length > 0 ? cited : evidence.slice(0, 5);

        const notice = synthesis.insufficient
          ? missingSources.length > 0
            ? `لم أجد في المقاطع المسترجَعة ما يكفي للإجابة بدقة، مع العلم أن ${missingSources.join('، ')} لم تكن متاحة. المقاطع التي عُثر عليها معروضة أدناه للاطلاع.`
            : 'لم أجد في المصادر التي تم البحث فيها مادة كافية للإجابة عن هذا السؤال بدقة. المقاطع الأقرب معروضة أدناه للاطلاع.'
          : buildSourceNotice(ordered, madhhab);

        const result: AskResult = {
          questionId: crypto.randomUUID(),
          question,
          madhhab,
          queries: plan.queries,
          sourceStatus: ordered,
          evidence: shownEvidence,
          sources,
          answer: synthesis.answer,
          claims: synthesis.claims,
          disagreements: synthesis.disagreements,
          insufficient: synthesis.insufficient,
          notice,
          createdAt: Date.now(),
        };

        send({ type: 'result', result });
        send({ type: 'stage', stage: 'done', label: STAGE_LABEL.done });
        controller.close();
      } catch (e) {
        const message =
          e instanceof GeminiError
            ? e.message
            : e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')
              ? 'انتهت مهلة المعالجة. حاول مرة أخرى.'
              : 'حدث خطأ غير متوقّع أثناء المعالجة.';
        const code = e instanceof GeminiError ? e.code : 'internal';
        send({ type: 'error', message, code });
        send({ type: 'stage', stage: 'failed', label: STAGE_LABEL.failed });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET() {
  return jsonError('استخدم POST.', 405, 'method_not_allowed');
}
