'use client';

import type { AskResult } from '@/lib/types';
import { EvidenceCard, SourceCard } from './EvidenceCard';
import { IconAlert } from './icons';
import { SourceStatusBar } from './SourceStatusBar';

/**
 * يعرض نص الإجابة كنص عادي فقط (لا HTML)، مع إبراز إشارات الأدلة [نX].
 */
function AnswerText({ text, validIds }: { text: string; validIds: Set<string> }) {
  const paragraphs = text.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="prose-ar text-[15.5px]">
      {paragraphs.map((para, pi) => {
        const parts = para.split(/(\[[^\]\n]{1,80}\])/g);
        return (
          <p key={pi}>
            {parts.map((part, i) => {
              const m = /^\[([^\]\n]{1,80})\]$/.exec(part);
              if (!m) return <span key={i}>{part}</span>;
              const ids = m[1]!
                .split(/[,،؛;\s]+/)
                .map((s) => s.trim())
                .filter((s) => validIds.has(s));
              if (ids.length === 0) return <span key={i}>{part}</span>;
              return (
                <sup key={i} className="mx-0.5 inline-flex gap-1 align-super">
                  {ids.map((id) => (
                    <a
                      key={id}
                      href={`#ev-${id}`}
                      className="rounded bg-ink-accent/12 px-1 py-0.5 text-[10px] font-bold
                                 text-ink-accent no-underline hover:bg-ink-accent/20"
                      title="الانتقال إلى الدليل"
                    >
                      {id}
                    </a>
                  ))}
                </sup>
              );
            })}
          </p>
        );
      })}
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
  const validIds = new Set(result.evidence.map((e) => e.id));

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
          <AnswerText text={result.answer} validIds={validIds} />
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
                      <span className="text-ink-muted">—</span> {p.position}{' '}
                      {p.evidenceIds.map((id) => (
                        <a
                          key={id}
                          href={`#ev-${id}`}
                          className="mr-1 rounded bg-ink-accent/12 px-1 py-0.5 text-[10px] font-bold text-ink-accent"
                        >
                          {id}
                        </a>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {result.evidence.length > 0 && (
        <section aria-label="الدليل">
          <SectionTitle>الدليل</SectionTitle>
          <div className="space-y-3">
            {result.evidence.map((ev) => (
              <div key={ev.id} id={`ev-${ev.id}`} className="scroll-mt-20">
                <EvidenceCard ev={ev} />
              </div>
            ))}
          </div>
        </section>
      )}

      {result.sources.length > 0 && (
        <section aria-label="المصادر">
          <SectionTitle>المصادر</SectionTitle>
          <ul className="space-y-2">
            {result.sources.map((ev) => (
              <SourceCard key={`src-${ev.id}`} ev={ev} />
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-5 text-ink-muted">
            الروابط تفتح الموضع في موقع المصدر الأصلي (المكتبة الشاملة أو تراث)، لا في هذا الموقع. ما لم يُحدَّد
            الجزء أو الصفحة فذلك لعدم توفّرهما في بيانات المصدر.
          </p>
        </section>
      )}
    </div>
  );
}
