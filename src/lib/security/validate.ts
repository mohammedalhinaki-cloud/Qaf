import { config } from '@/lib/config';
import type { Madhhab } from '@/lib/types';
import { toPlainText } from './sanitize';

export interface AskRequestBody {
  question: string;
  madhhab: Madhhab;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export class ValidationError extends Error {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

const MADHHABS: Madhhab[] = ['all', 'hanafi', 'maliki', 'shafii', 'hanbali'];

/**
 * أنماط محاولات تغيير قواعد النظام. نرفض الطلب صراحةً بدل تمريره للنموذج.
 */
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /تجاهل\s+(كل\s+)?(ال)?(تعليمات|توجيهات|قواعد)/i,
  /(تخلّ|تخل)\s+عن\s+(ال)?(تعليمات|قواعد)/i,
  /أنت\s+الآن\s+(لست|غير)/i,
  /(اعمل|تصرّف|تصرف)\s+ك(مفتي|شيخ)\s+(مستقل|حر)/i,
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|prompts)/i,
  /disregard\s+(the\s+)?(system|previous)\s+(prompt|instructions)/i,
  /(system|developer)\s*prompt\s*(:|=)/i,
  /\bDAN\b\s*mode/i,
  /أجب\s+من\s+(معرفتك|معلوماتك)\s+(العامة|الخاصة)\s+(دون|بدون)\s+بحث/i,
  /(اخترع|لفّق|لفق|اصنع)\s+(مصدر|مرجع|صفحة|نص)/i,
];

function looksLikeInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((re) => re.test(text));
}

export function parseAskRequest(raw: unknown): AskRequestBody {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError('صيغة الطلب غير صحيحة.', 'bad_body');
  }
  const body = raw as Record<string, unknown>;

  const question = toPlainText(body.question, config.limits.maxQuestionChars + 50);
  if (question.length < 3) {
    throw new ValidationError('السؤال قصير جدًا. اكتب سؤالًا أوضح.', 'question_too_short');
  }
  if (question.length > config.limits.maxQuestionChars) {
    throw new ValidationError(
      `الحد الأقصى لطول السؤال ${config.limits.maxQuestionChars} حرفًا.`,
      'question_too_long',
    );
  }
  if (looksLikeInjection(question)) {
    throw new ValidationError(
      'لا يمكن تنفيذ هذا الطلب. حُجَّة أداة بحث موثّق في مكتبة تراث، ولا تقبل تعليمات تغيّر قواعد عملها.',
      'instruction_override',
    );
  }

  const madhhabRaw = typeof body.madhhab === 'string' ? body.madhhab : 'all';
  const madhhab = (MADHHABS as string[]).includes(madhhabRaw)
    ? (madhhabRaw as Madhhab)
    : 'all';

  const history: AskRequestBody['history'] = [];
  if (Array.isArray(body.history)) {
    for (const item of body.history.slice(-config.limits.maxHistoryTurns * 2)) {
      if (typeof item !== 'object' || item === null) continue;
      const m = item as Record<string, unknown>;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content = toPlainText(m.content, 800);
      if (content) history.push({ role, content });
    }
  }

  return { question, madhhab, history };
}
