import { config } from '@/lib/config';
import { neutralizeInstructions, toPlainText } from '@/lib/security/sanitize';
import { SOURCE_LABEL, type AnswerClaim, type Disagreement, type Evidence, type Madhhab } from '@/lib/types';
import { generateJson } from './openrouter.ts';
import {
  ANSWER_SCHEMA,
  ANSWER_SYSTEM,
  PLANNER_SCHEMA,
  PLANNER_SYSTEM,
  answerUser,
  plannerUser,
  type EvidenceForPrompt,
} from './prompts.ts';

/* ———————————— المرحلة الأولى: تحليل السؤال ———————————— */

export interface Plan {
  intent: string;
  queries: string[];
  outOfScope: boolean;
}

/** يستخرج استعلامات احتياطية من السؤال نفسه إن فشل النموذج. */
function fallbackQueries(question: string): string[] {
  const DROP = new Set(['ما', 'ماذا', 'هل', 'كيف', 'لماذا', 'متى', 'أين', 'هو', 'هي', 'عن', 'من', 'في', 'على']);
  const words = question
    .replace(/[؟?!.،,:;«»"'()[\]]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !DROP.has(w));
  return words.length > 0 ? [words.slice(0, 6).join(' ')] : [];
}

export async function planSearch(
  question: string,
  history: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<Plan> {
  try {
    const plan = await generateJson<Plan>({
      system: PLANNER_SYSTEM,
      user: plannerUser(question, history),
      schema: PLANNER_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.3,
      maxOutputTokens: 1024,
      signal,
    });

    const queries = Array.isArray(plan.queries)
      ? plan.queries
          .map((q) => toPlainText(q, 120))
          .filter((q) => q.length >= 2)
          .slice(0, config.limits.maxQueries)
      : [];

    if (plan.outOfScope === true && queries.length === 0) {
      return { intent: toPlainText(plan.intent, 200), queries: [], outOfScope: true };
    }

    return {
      intent: toPlainText(plan.intent, 200),
      queries: queries.length > 0 ? queries : fallbackQueries(question),
      outOfScope: false,
    };
  } catch (e) {
    // فشل المخطِّط لا يعني فشل البحث: نبحث بالسؤال نفسه.
    const fb = fallbackQueries(question);
    if (fb.length === 0) throw e;
    return { intent: '', queries: fb, outOfScope: false };
  }
}

/* ———————————— المرحلة الثانية: الصياغة المستندة ———————————— */

export type EvidenceCoverage = 'complete' | 'partial' | 'none';

export interface RawSynthesisResult {
  coverage: EvidenceCoverage;
  answer: string;
  claims: AnswerClaim[];
  disagreements: Disagreement[];
  limitations: string[];
}

export interface SynthesisResult {
  insufficient: boolean;
  coverage: EvidenceCoverage;
  answer: string | null;
  claims: AnswerClaim[];
  disagreements: Disagreement[];
  /** حدود ما لم تستطع الأدلة إثباته في الإجابة الجزئية. */
  limitations: string[];
  /** معرّفات الأدلة التي تظهر في استشهاد قابل للنقر بعد التحقق. */
  usedIds: string[];
}

function toPromptEvidence(evidence: Evidence[]): EvidenceForPrompt[] {
  return evidence.map((e) => ({
    id: e.id,
    sourceLabel: SOURCE_LABEL[e.source],
    bookTitle: e.bookTitle,
    author: e.author,
    volume: e.volume,
    page: e.page,
    headings: e.headings,
    text: neutralizeInstructions(
      e.text.length > config.limits.maxSnippetChars
        ? `${e.text.slice(0, config.limits.maxSnippetChars)}…`
        : e.text,
    ),
  }));
}

/**
 * يحذف أي استشهاد بمعرّف غير موجود ضمن الأدلة المسلَّمة للنموذج.
 * هذه هي الحماية الأخيرة ضد نسبة كلام إلى مصدر لم يُعطَ للنموذج.
 */
function sanitizeCitations(
  raw: RawSynthesisResult,
  validIds: Set<string>,
): { claims: AnswerClaim[]; disagreements: Disagreement[] } {
  const claims: AnswerClaim[] = (raw.claims ?? [])
    .map((c) => ({
      text: toPlainText(c.text, 1200),
      evidenceIds: (c.evidenceIds ?? []).filter((id) => validIds.has(id)),
    }))
    .filter((c) => c.text.length > 0 && c.evidenceIds.length > 0);

  const disagreements: Disagreement[] = (raw.disagreements ?? [])
    .map((d) => {
      const positions = (d.positions ?? [])
        .map((p) => ({
          position: toPlainText(p.position, 800),
          evidenceIds: (p.evidenceIds ?? []).filter((id) => validIds.has(id)),
        }))
        .filter((p) => p.position.length > 0 && p.evidenceIds.length > 0);
      return { topic: toPlainText(d.topic, 300), positions };
    })
    .filter((d) => d.topic.length > 0 && d.positions.length >= 2);

  return { claims, disagreements };
}

/** يزيل من نص الإجابة أي إشارة [نX] لا تقابل دليلًا حقيقيًا. */
function stripInvalidRefs(answer: string, validIds: Set<string>): string {
  return answer
    .replace(/\[([^\]\n]{1,80})\]/g, (match, inner: string) => {
      const ids = inner
        .split(/[,،؛;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const kept = ids.filter((id) => validIds.has(id));
      if (kept.length === 0) return ids.every((id) => /^ن\d+$/.test(id)) ? '' : match;
      return `[${kept.join('، ')}]`;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.،؛:])/g, '$1')
    .trim();
}

/** يستخرج المعرّفات الحقيقية الظاهرة فعلًا داخل نص الإجابة. */
function inlineEvidenceIds(answer: string, validIds: Set<string>): string[] {
  const used = new Set<string>();
  for (const match of answer.matchAll(/\[([^\]\n]{1,80})\]/g)) {
    for (const id of match[1]!.split(/[,،؛;\s]+/).map((s) => s.trim())) {
      if (validIds.has(id)) used.add(id);
    }
  }
  return [...used];
}

/**
 * الحاجز البرمجي بعد النموذج: لا يسمح بإجابة بلا استشهاد ظاهر حقيقي،
 * ويحافظ على الإجابة الجزئية بدل إسقاطها ما دامت مبنية على دليل.
 */
export function finalizeSynthesis(
  raw: RawSynthesisResult,
  evidence: Pick<Evidence, 'id'>[],
): SynthesisResult {
  const validIds = new Set(evidence.map((e) => e.id));
  const { claims, disagreements } = sanitizeCitations(raw, validIds);
  const answer = stripInvalidRefs(toPlainText(raw.answer, 8000), validIds);
  const inlineIds = inlineEvidenceIds(answer, validIds);
  const paragraphs = answer.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const everyParagraphCited = paragraphs.length > 0
    && paragraphs.every((p) => inlineEvidenceIds(p, validIds).length > 0);
  const coverage: EvidenceCoverage =
    raw.coverage === 'complete' || raw.coverage === 'partial' ? raw.coverage : 'none';

  // claims حقل تدقيق، لكنه لا يعوّض الإحالة المرئية القابلة للنقر داخل الجواب.
  // كذلك نرفض فقرة موضوعية كاملة تركها النموذج بلا أي إحالة.
  const insufficient = coverage === 'none'
    || answer.length < 20
    || inlineIds.length === 0
    || claims.length === 0
    || !everyParagraphCited;
  if (insufficient) {
    return {
      insufficient: true,
      coverage: 'none',
      answer: null,
      claims: [],
      disagreements: [],
      limitations: [],
      usedIds: [],
    };
  }

  const limitations = coverage === 'partial'
    ? (raw.limitations ?? []).map((v) => toPlainText(v, 600)).filter(Boolean).slice(0, 4)
    : [];
  // استشهادات قسم الخلاف ظاهرة وقابلة للنقر أيضًا، فنحتفظ بأدلتها للواجهة.
  const displayedIds = new Set(inlineIds);
  disagreements.forEach((d) => d.positions.forEach((p) => p.evidenceIds.forEach((id) => displayedIds.add(id))));

  return {
    insufficient: false,
    coverage,
    answer,
    claims,
    disagreements,
    limitations,
    usedIds: [...displayedIds],
  };
}

export async function synthesizeAnswer(
  question: string,
  madhhab: Madhhab,
  evidence: Evidence[],
  signal?: AbortSignal,
): Promise<SynthesisResult> {
  if (evidence.length === 0) {
    return {
      insufficient: true,
      coverage: 'none',
      answer: null,
      claims: [],
      disagreements: [],
      limitations: [],
      usedIds: [],
    };
  }

  const raw = await generateJson<RawSynthesisResult>({
    system: ANSWER_SYSTEM,
    user: answerUser(question, madhhab, toPromptEvidence(evidence)),
    schema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.1,
    maxOutputTokens: 3000,
    signal,
  });

  return finalizeSynthesis(raw, evidence);
}
