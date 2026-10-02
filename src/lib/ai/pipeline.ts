import { config } from '@/lib/config';
import { neutralizeInstructions, toPlainText } from '@/lib/security/sanitize';
import { SOURCE_LABEL, type AnswerClaim, type Disagreement, type Evidence, type Madhhab } from '@/lib/types';
import { generateJson } from './gemini';
import {
  ANSWER_SCHEMA,
  ANSWER_SYSTEM,
  PLANNER_SCHEMA,
  PLANNER_SYSTEM,
  answerUser,
  plannerUser,
  type EvidenceForPrompt,
} from './prompts';

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
      maxOutputTokens: 512,
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

export interface SynthesisResult {
  insufficient: boolean;
  answer: string | null;
  claims: AnswerClaim[];
  disagreements: Disagreement[];
  /** معرّفات الأدلة التي استُشهد بها فعليًا بعد التحقق */
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
  raw: SynthesisResult,
  validIds: Set<string>,
): { claims: AnswerClaim[]; disagreements: Disagreement[]; usedIds: string[] } {
  const used = new Set<string>();

  const claims: AnswerClaim[] = (raw.claims ?? [])
    .map((c) => {
      const ids = (c.evidenceIds ?? []).filter((id) => validIds.has(id));
      ids.forEach((id) => used.add(id));
      return { text: toPlainText(c.text, 1200), evidenceIds: ids };
    })
    .filter((c) => c.text.length > 0 && c.evidenceIds.length > 0);

  const disagreements: Disagreement[] = (raw.disagreements ?? [])
    .map((d) => {
      const positions = (d.positions ?? [])
        .map((p) => {
          const ids = (p.evidenceIds ?? []).filter((id) => validIds.has(id));
          ids.forEach((id) => used.add(id));
          return { position: toPlainText(p.position, 800), evidenceIds: ids };
        })
        .filter((p) => p.position.length > 0 && p.evidenceIds.length > 0);
      return { topic: toPlainText(d.topic, 300), positions };
    })
    .filter((d) => d.topic.length > 0 && d.positions.length >= 2);

  return { claims, disagreements, usedIds: [...used] };
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

export async function synthesizeAnswer(
  question: string,
  madhhab: Madhhab,
  evidence: Evidence[],
  signal?: AbortSignal,
): Promise<SynthesisResult> {
  if (evidence.length === 0) {
    return { insufficient: true, answer: null, claims: [], disagreements: [], usedIds: [] };
  }

  const raw = await generateJson<SynthesisResult>({
    system: ANSWER_SYSTEM,
    user: answerUser(question, madhhab, toPromptEvidence(evidence)),
    schema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.15,
    maxOutputTokens: 2600,
    signal,
  });

  const validIds = new Set(evidence.map((e) => e.id));
  const { claims, disagreements, usedIds } = sanitizeCitations(raw, validIds);

  const answerText = toPlainText(raw.answer, 8000);

  // اعتبار الإجابة غير كافية إن صرّح النموذج بذلك، أو لم يبقَ أي استشهاد صالح.
  const insufficient = raw.insufficient === true || answerText.length < 20 || usedIds.length === 0;

  if (insufficient) {
    return { insufficient: true, answer: null, claims: [], disagreements: [], usedIds: [] };
  }

  return {
    insufficient: false,
    answer: stripInvalidRefs(answerText, validIds),
    claims,
    disagreements,
    usedIds,
  };
}
