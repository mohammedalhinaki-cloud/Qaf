'use client';

import { citationLabel } from '@/lib/citations';
import type { Evidence } from '@/lib/types';
import { IconBook } from './icons';

/**
 * استشهاد داخلي قابل للنقر. الرابط لا يُنشأ في الواجهة؛ بل يأتي من دليل
 * تراث المتحقق منه، ويتضمن book_id/page_id عندما أعادهما المصدر.
 * النقر يفتح الموضع نفسه مباشرة، لا نافذة وسيطة ولا أول الكتاب.
 */
export function CitationChip({ ev }: { ev: Evidence }) {
  const label = citationLabel(ev);
  const hint = [
    ev.bookTitle,
    ev.author,
    ev.volume ? `الجزء ${ev.volume}` : null,
    ev.page !== undefined
      ? `الصفحة ${ev.page}`
      : ev.pageId !== undefined
        ? `موضع تراث ${ev.pageId}`
        : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <a
      href={ev.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={`${hint} — فتح الموضع المستشهَد به في تراث`}
      aria-label={`فتح المصدر في موضع الاستشهاد: ${hint}`}
      className="mx-0.5 inline-flex h-[1.35rem] max-w-[240px] select-none items-center gap-1
                 rounded-md bg-ink-accent/12 px-1.5 align-middle text-[10.5px] font-semibold
                 leading-none text-ink-accent transition-colors hover:bg-ink-accent/25"
    >
      <IconBook className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
      <span className="truncate">{label}</span>
      <span className="sr-only"> (يفتح الموضع في تراث)</span>
    </a>
  );
}
