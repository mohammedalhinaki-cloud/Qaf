'use client';

import { useMemo } from 'react';
import { splitAnswerText } from '@/lib/citations';
import type { AnswerSection, AskResult, Evidence } from '@/lib/types';
import { CitationChip } from './Citation';
import { EvidenceCard } from './EvidenceCard';
import { IconAlert } from './icons';
import { SourceStatusBar } from './SourceStatusBar';

/**
 * يعرض نص الإجابة مع استشهادات داخلية بجانب الجمل التي تسندها.
 * كل استشهاد مرتبط بمعرّف دليل حقيقي من نتائج البحث في تراث،
 * وعند الضغط عليه يفتح رابط الموضع الأصلي الدقيق في تراث مباشرة.
 */
function AnswerText({
  text,
  evidenceById,
}: {
  text: string;
  evidenceById: Map<string, Evidence>;
}) {
  const validIds = useMemo(() => new Set(evidenceById.keys()), [evidenceById]);
  const paragraphs = useMemo(
    () =>
      text
        .split(/\n{1,}/)
        .map((p) => p.trim())
        .filter(Boolean),
    [text],
  );

  return (
    <div className="prose-ar text-[15.5px]">
      {paragraphs.map((para, pi) => {
        const segments = splitAnswerText(para, validIds);
        return (
          <p key={pi}>
            {segments.map((seg, i) =>
              seg.type === 'text' ? (
                <span key={i}>{seg.text}</span>
              ) : (
                <CitationChip key={`${seg.id}-${i}`} ev={evidenceById.get(seg.id)!} />
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

/**
 * العرض الأساسي الجديد: لا نحلّل إحالات كتبها النموذج؛ بل نعرض خريطة
 * الفقرة ← معرّفات الأدلة التي بناها الخادم بعد التحقق من الشواهد الحرفية.
 */
function StructuredAnswer({
  sections,
  evidenceById,
}: {
  sections: AnswerSection[];
  evidenceById: Map<string, Evidence>;
}) {
  return (
    <div className="space-y-5">
      {sections.map((section, sectionIndex) => (
        <section key={sectionIndex} className="space-y-2" aria-label={section.heading || 'فقرة من الإجابة'}>
          {section.heading && (
            <h3 className="text-[16px] font-bold leading-8 text-ink-text">{section.heading}</h3>
          )}
          <div className="prose-ar space-y-2 text-[15.5px]">
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex}>
                <span>{paragraph.text}</span>{' '}
                {paragraph.evidenceIds.map((id) =>
                  evidenceById.has(id) ? (
                    <CitationChip key={id} ev={evidenceById.get(id)!} />
                  ) : null,
                )}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-text">
      <span className="h-3.5 w-0.5 rounded bg-ink-accent" aria-hidden="true" />
      {children}
    </h3>
  );
}

export function AnswerBlock({ result }: { result: AskResult }) {
  const evidenceById = useMemo(
    () => new Map(result.evidence.map((e) => [e.id, e])),
    [result.evidence],
  );

  return (
    <div className="space-y-6">
      <SourceStatusBar statuses={result.sourceStatus} queries={result.queries} />

      {result.notice && (
        <div
          className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3.5
                     text-[13px] leading-6 text-amber-800 dark:text-amber-300"
          role="status"
        >
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{result.notice}</p>
        </div>
      )}

      {result.answer && (
        <section aria-label="الإجابة">
          {Array.isArray(result.answerSections) && result.answerSections.length > 0 ? (
            <StructuredAnswer sections={result.answerSections} evidenceById={evidenceById} />
          ) : (
            // توافق مع المحادثات المحلية المحفوظة قبل إضافة البنية المنظمة.
            <AnswerText text={result.answer} evidenceById={evidenceById} />
          )}
          {result.evidence.length > 0 && (
            <p className="mt-2 text-[10.5px] leading-5 text-ink-muted">
              اضغط على أي استشهاد ملوّن لفتح موضع النص المستشهَد به مباشرة في مكتبة تراث.
            </p>
          )}
        </section>
      )}

      {result.disagreements.length > 0 && (
        <section aria-label="اختلاف المصادر">
          <SectionTitle>اختلاف المصادر</SectionTitle>
          <div className="space-y-3">
            {result.disagreements.map((d, i) => (
              <div key={i} className="card p-4">
                <p className="mb-2.5 text-[13.5px] font-semibold">{d.topic}</p>
                <ul className="space-y-2">
                  {d.positions.map((p, j) => (
                    <li key={j} className="prose-ar text-[14px] leading-8">
                      <span className="text-ink-muted">—</span> {p.position}
                      {p.evidenceIds.map((id) =>
                        evidenceById.has(id) ? (
                          <CitationChip key={id} ev={evidenceById.get(id)!} />
                        ) : null,
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* بطاقات الأدلة الكاملة تُعرض فقط عند غياب إجابة نصية يُعلَّق عليها الاستشهاد */}
      {!result.answer && result.evidence.length > 0 && (
        <section aria-label="المقاطع المسترجعة">
          <SectionTitle>المقاطع المسترجعة من تراث</SectionTitle>
          <div className="space-y-3">
            {result.evidence.map((ev) => (
              <EvidenceCard key={ev.id} ev={ev} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
