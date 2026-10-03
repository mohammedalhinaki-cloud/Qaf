import { NextRequest } from 'next/server';
import { planSearch, synthesizeAnswer } from '@/lib/ai/pipeline';
import { GroqError, isGroqConfigured } from '@/lib/ai/groq';
import { config } from '@/lib/config';
import { clientKey, rateLimit } from '@/lib/security/ratelimit';
import { ValidationError, parseAskRequest } from '@/lib/security/validate';
import { buildSourceNotice, searchAllSources } from '@/lib/search/orchestrator';
import { STAGE_LABEL, type AskEvent, type AskResult } from '@/lib/types';

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

  if (!isGroqConfigured()) {
    return jsonError(
      'النظام غير مهيّأ: مفتاح Groq غير مضبوط على الخادم. أضف GROQ_API_KEY كـ Secret في ' +
        'متغيّرات البيئة ثم أعد النشر. لمعرفة التفاصيل افتح المسار /api/health?probe=1',
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
            answer: null,
            claims: [],
            disagreements: [],
            insufficient: true,
            notice:
              'هذا السؤال خارج نطاق ما يمكن البحث عنه في تراث. حُجَّة يبحث في كتب التراث الإسلامي المتوفرة في مكتبة تراث فقط.',
            createdAt: Date.now(),
          };
          send({ type: 'result', result });
          send({ type: 'stage', stage: 'done', label: STAGE_LABEL.done });
          controller.close();
          return;
        }

        send({ type: 'queries', queries: plan.queries });
        send({ type: 'stage', stage: 'searching', label: STAGE_LABEL.searching });

        const statuses: AskResult['sourceStatus'] = [];
        const { evidence } = await searchAllSources(plan.queries, madhhab, (s) => {
          statuses.push(s);
          send({ type: 'source', status: s });
        });

        send({ type: 'stage', stage: 'collecting', label: STAGE_LABEL.collecting });

        const sourceStatus = statuses[0];
        const sourceFailed =
          sourceStatus !== undefined &&
          (sourceStatus.status === 'error' || sourceStatus.status === 'timeout');

        /* ——— فشل مصدر البحث: لا إجابة تخمينية ——— */
        if (sourceFailed) {
          const result: AskResult = {
            questionId: crypto.randomUUID(),
            question,
            madhhab,
            queries: plan.queries,
            sourceStatus: statuses,
            evidence: [],
            answer: null,
            claims: [],
            disagreements: [],
            insufficient: true,
            notice: 'تعذّر الوصول إلى مكتبة تراث حاليًا، لذلك لم أتمكن من التحقق من الإجابة.',
            createdAt: Date.now(),
          };
          send({ type: 'result', result });
          send({ type: 'stage', stage: 'done', label: STAGE_LABEL.done });
          controller.close();
          return;
        }

        /* ——— لا أدلة: نُصرّح بذلك ——— */
        if (evidence.length === 0) {
          const disabled = sourceStatus?.status === 'disabled';
          const result: AskResult = {
            questionId: crypto.randomUUID(),
            question,
            madhhab,
            queries: plan.queries,
            sourceStatus: statuses,
            evidence: [],
            answer: null,
            claims: [],
            disagreements: [],
            insufficient: true,
            notice: disabled
              ? 'مصدر البحث (تراث) معطّل في إعدادات الخادم، لذلك لم يتم تنفيذ أي بحث.'
              : 'لم أجد مادة كافية في مكتبة تراث عن هذا السؤال بهذه الصياغة. جرّب صياغة أدق أو مصطلحًا فقهيًا أقرب.',
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
          synthesis = await synthesizeAnswer(question, madhhab, evidence, req.signal);
        } catch (e) {
          // فشل النموذج بعد نجاح البحث: لا نُضيّع مادة حقيقية استُرجعت فعلًا.
          // نعرض المقاطع كما هي ونوضّح أن الصياغة لم تتم. ولا نعرض أي إجابة.
          const reason = e instanceof GroqError ? e.message : 'تعذّرت صياغة الإجابة.';
          const result: AskResult = {
            questionId: crypto.randomUUID(),
            question,
            madhhab,
            queries: plan.queries,
            sourceStatus: statuses,
            evidence: evidence.slice(0, 5),
            answer: null,
            claims: [],
            disagreements: [],
            insufficient: true,
            notice: `${reason} عُثر على المقاطع التالية في تراث، وهي معروضة كما وردت دون صياغة.`,
            createdAt: Date.now(),
          };
          send({ type: 'result', result });
          send({ type: 'stage', stage: 'done', label: STAGE_LABEL.done });
          controller.close();
          return;
        }

        // الأدلة المعروضة: المستشهَد بها فعليًا داخل نص الإجابة عند توفرها
        const usedSet = new Set(synthesis.usedIds);
        const cited = evidence.filter((e) => usedSet.has(e.id));
        const shownEvidence = synthesis.insufficient
          ? evidence.slice(0, 5)
          : cited.length > 0
            ? cited
            : evidence.slice(0, 5);

        const notice = synthesis.insufficient
          ? 'لم أجد في المقاطع المسترجَعة من تراث ما يكفي للإجابة عن هذا السؤال بدقة. المقاطع الأقرب معروضة أدناه للاطلاع.'
          : buildSourceNotice(madhhab);

        const result: AskResult = {
          questionId: crypto.randomUUID(),
          question,
          madhhab,
          queries: plan.queries,
          sourceStatus: statuses,
          evidence: shownEvidence,
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
          e instanceof GroqError
            ? e.message
            : e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')
              ? 'انتهت مهلة المعالجة. حاول مرة أخرى.'
              : 'حدث خطأ غير متوقّع أثناء المعالجة.';
        const code = e instanceof GroqError ? e.code : 'internal';
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
