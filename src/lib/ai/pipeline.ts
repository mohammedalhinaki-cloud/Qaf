import { config } from '@/lib/config';
import { neutralizeInstructions, toPlainText } from '@/lib/security/sanitize';
import { normalizeArabic } from '@/lib/search/rank';
import {
  SOURCE_LABEL,
  type AnswerClaim,
  type AnswerSection,
  type Disagreement,
  type Evidence,
  type Madhhab,
} from '@/lib/types';
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

/** شاهد يطلب من النموذج نسخه حرفيًا، ثم يتحقق منه الخادم. */
export interface RawCitationAnchor {
  evidenceId: string;
  quote: string;
}

export interface RawAnswerParagraph {
  text: string;
  citations: RawCitationAnchor[];
}

export interface RawAnswerSection {
  heading: string;
  paragraphs: RawAnswerParagraph[];
}

export interface RawSynthesisResult {
  coverage: EvidenceCoverage;
  sections: RawAnswerSection[];
  disagreements: Array<{
    topic: string;
    positions: Array<{ position: string; citations: RawCitationAnchor[] }>;
  }>;
  limitations: string[];
}

export interface SynthesisResult {
  insufficient: boolean;
  coverage: EvidenceCoverage;
  /** نص مشتق من البنية الموثقة، لا نص حر مستقل من النموذج. */
  answer: string | null;
  answerSections: AnswerSection[];
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

/** يمنع النموذج من تمرير إحالات نصية تتجاوز خريطة الخادم. */
function cleanGeneratedText(value: unknown, maxChars: number): string {
  return toPlainText(value, maxChars)
    .replace(/\[\s*ن\d+(?:\s*[,،؛;]\s*ن\d+)*\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * تحقق حتمي من الشاهد: لا يُقبل المعرّف وحده. يجب أن ينسخ النموذج عبارة
 * موجودة فعلًا داخل نص ذلك المقطع. نطبّع التشكيل والمسافات للمقارنة فقط.
 */
function verifiedEvidenceIds(
  anchors: RawCitationAnchor[] | undefined,
  evidenceById: Map<string, Pick<Evidence, 'id' | 'text'>>,
): string[] {
  if (!Array.isArray(anchors)) return [];
  const ids = new Set<string>();

  for (const anchor of anchors) {
    if (!anchor || typeof anchor.evidenceId !== 'string' || typeof anchor.quote !== 'string') continue;
    const evidence = evidenceById.get(anchor.evidenceId);
    if (!evidence) continue;

    const quote = normalizeArabic(toPlainText(anchor.quote, 600));
    // شاهد قصير جدًا لا يكفي لإثبات ارتباط فعلي، ولو صادف وجود كلمة عامة.
    if (quote.length < 12 || quote.split(' ').filter(Boolean).length < 2) continue;
    const sourceText = normalizeArabic(evidence.text);
    if (!sourceText.includes(quote)) continue;
    ids.add(anchor.evidenceId);
  }

  return [...ids];
}

function sanitizeSections(
  rawSections: RawAnswerSection[] | undefined,
  evidenceById: Map<string, Pick<Evidence, 'id' | 'text'>>,
): { sections: AnswerSection[]; rawParagraphCount: number } {
  if (!Array.isArray(rawSections)) return { sections: [], rawParagraphCount: 0 };
  let rawParagraphCount = 0;
  const sections: AnswerSection[] = [];

  for (const rawSection of rawSections.slice(0, 10)) {
    if (!rawSection || !Array.isArray(rawSection.paragraphs)) continue;
    const paragraphs: AnswerClaim[] = [];

    for (const rawParagraph of rawSection.paragraphs.slice(0, 8)) {
      rawParagraphCount += 1;
      const text = cleanGeneratedText(rawParagraph?.text, 1600);
      const evidenceIds = verifiedEvidenceIds(rawParagraph?.citations, evidenceById);
      if (!text || evidenceIds.length === 0) continue;
      paragraphs.push({ text, evidenceIds });
    }

    if (paragraphs.length === 0) continue;
    const heading = cleanGeneratedText(rawSection.heading, 180);
    sections.push({ heading: heading || undefined, paragraphs });
  }

  return { sections, rawParagraphCount };
}

function sanitizeDisagreements(
  raw: RawSynthesisResult['disagreements'] | undefined,
  evidenceById: Map<string, Pick<Evidence, 'id' | 'text'>>,
): Disagreement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 6)
    .map((disagreement) => {
      const positions = Array.isArray(disagreement?.positions)
        ? disagreement.positions
            .slice(0, 8)
            .map((position) => ({
              position: cleanGeneratedText(position?.position, 900),
              evidenceIds: verifiedEvidenceIds(position?.citations, evidenceById),
            }))
            .filter((position) => position.position.length > 0 && position.evidenceIds.length > 0)
        : [];
      return { topic: cleanGeneratedText(disagreement?.topic, 300), positions };
    })
    .filter((disagreement) => disagreement.topic.length > 0 && disagreement.positions.length >= 2);
}

/** يبني النص القديم/سياق المحادثة من الخريطة الموثقة؛ النموذج لا يتحكم بالإحالات الظاهرة. */
function sectionsToAnswer(sections: AnswerSection[]): string {
  return sections
    .map((section) => {
      const heading = section.heading ? `${section.heading}\n` : '';
      const paragraphs = section.paragraphs
        .map((paragraph) => `${paragraph.text} [${paragraph.evidenceIds.join('، ')}]`)
        .join('\n');
      return `${heading}${paragraphs}`;
    })
    .join('\n\n')
    .trim();
}

/**
 * الحاجز البرمجي بعد النموذج:
 * - لا فقرة بلا معرّف موجود وشاهد حرفي موجود داخل نص تراث.
 * - لا إحالة نصية حرّة من النموذج؛ النص النهائي يُبنى هنا من الخريطة.
 * - إسقاط أي فقرة فاشلة يخفض التغطية إلى «جزئية» بدل إخفاء النقص.
 */
export function finalizeSynthesis(
  raw: RawSynthesisResult,
  evidence: Pick<Evidence, 'id' | 'text'>[],
): SynthesisResult {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const { sections, rawParagraphCount } = sanitizeSections(raw.sections, evidenceById);
  const claims = sections.flatMap((section) => section.paragraphs);
  const disagreements = sanitizeDisagreements(raw.disagreements, evidenceById);

  const declaredCoverage: EvidenceCoverage =
    raw.coverage === 'complete' || raw.coverage === 'partial' ? raw.coverage : 'none';

  if (declaredCoverage === 'none' || claims.length === 0) {
    return {
      insufficient: true,
      coverage: 'none',
      answer: null,
      answerSections: [],
      claims: [],
      disagreements: [],
      limitations: [],
      usedIds: [],
    };
  }

  const droppedUnsupportedParagraph = rawParagraphCount > claims.length;
  const coverage: EvidenceCoverage =
    declaredCoverage === 'complete' && droppedUnsupportedParagraph ? 'partial' : declaredCoverage;
  const limitations = coverage === 'partial'
    ? (Array.isArray(raw.limitations) ? raw.limitations : [])
        .map((value) => cleanGeneratedText(value, 700))
        .filter(Boolean)
        .slice(0, 5)
    : [];

  if (droppedUnsupportedParagraph) {
    limitations.push('استُبعدت فقرة أو أكثر لأن شاهدها لم يطابق نص المقطع المسترجع من تراث.');
  }

  const used = new Set<string>();
  claims.forEach((claim) => claim.evidenceIds.forEach((id) => used.add(id)));
  disagreements.forEach((item) =>
    item.positions.forEach((position) => position.evidenceIds.forEach((id) => used.add(id))),
  );

  return {
    insufficient: false,
    coverage,
    answer: sectionsToAnswer(sections),
    answerSections: sections,
    claims,
    disagreements,
    limitations: [...new Set(limitations)],
    usedIds: [...used],
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
      answerSections: [],
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
    maxOutputTokens: 5000,
    signal,
  });

  return finalizeSynthesis(raw, evidence);
}
