'use client';

import { useState } from 'react';
import { MADHHAB_BASIS_LABEL } from '@/lib/search/madhhab';
import { MADHHAB_LABEL, SOURCE_LABEL, type Evidence } from '@/lib/types';
import { IconBook, IconExternal, IconQuote } from './icons';

/** بيانات الموضع — تُعرض فقط عند توفّرها من المصدر. */
function Locus({ ev }: { ev: Evidence }) {
  const bits: string[] = [];
  if (ev.volume) bits.push(`الجزء: ${ev.volume}`);
  if (ev.page !== undefined) bits.push(`الصفحة: ${ev.page}`);
  if (bits.length === 0) return <span className="text-ink-muted">الموضع غير محدَّد في بيانات المصدر</span>;
  return <span>{bits.join(' · ')}</span>;
}

function SourceBadge({ ev }: { ev: Evidence }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
        ev.source === 'shamela'
          ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
          : 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
      }`}
    >
      {SOURCE_LABEL[ev.source]}
    </span>
  );
}

const CLAMP = 460;

/** بطاقة دليل: النص المستند إليه + بيانات التوثيق + رابط المصدر الأصلي. */
export function EvidenceCard({ ev }: { ev: Evidence }) {
  const [expanded, setExpanded] = useState(false);
  const long = ev.text.length > CLAMP;
  const body = expanded || !long ? ev.text : `${ev.text.slice(0, CLAMP).trimEnd()}…`;

  return (
    <article className="card p-4">
      <header className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-ink-accent/12 px-1.5 py-0.5 text-[10px] font-bold text-ink-accent">
          {ev.id}
        </span>
        <SourceBadge ev={ev} />
        {ev.madhhabMatch && (
          <span
            className="chip !border-ink-accent/35 !text-ink-accent"
            title={`${MADHHAB_BASIS_LABEL[ev.madhhabMatch.basis]}: ${ev.madhhabMatch.basisText}`}
          >
            {MADHHAB_LABEL[ev.madhhabMatch.madhhab]} — {MADHHAB_BASIS_LABEL[ev.madhhabMatch.basis]}
          </span>
        )}
      </header>

      {ev.headings && ev.headings.length > 0 && (
        <p className="mb-2 text-[11px] leading-5 text-ink-muted">{ev.headings.join(' ← ')}</p>
      )}

      <blockquote className="prose-ar border-r-2 border-ink-accent/40 pr-3 text-[14.5px] text-ink-text">
        <IconQuote className="mb-1 inline-block h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />{' '}
        {body.split('\n').filter(Boolean).map((p, i) => (
          <p key={i} className="mb-2 last:mb-0">
            {p}
          </p>
        ))}
      </blockquote>

      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-ink-accent hover:underline"
        >
          {expanded ? 'عرض أقل' : 'عرض النص كاملًا'}
        </button>
      )}

      <footer className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-ink-line pt-3">
        <div className="min-w-0 text-[13px] leading-6">
          <div className="flex items-center gap-1.5 font-semibold">
            <IconBook className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="truncate" title={ev.bookTitle}>
              {ev.bookTitle}
            </span>
          </div>
          <div className="text-[12px] text-ink-muted">
            {ev.author ? `المؤلف: ${ev.author}` : 'المؤلف: غير مذكور في بيانات المصدر'}
          </div>
          <div className="text-[12px] text-ink-muted">
            <Locus ev={ev} />
          </div>
        </div>

        <a
          href={ev.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="btn shrink-0 !py-1.5 !text-xs"
        >
          فتح المصدر
          <IconExternal className="h-3.5 w-3.5" />
        </a>
      </footer>
    </article>
  );
}

/** بطاقة مصدر مختصرة لقسم «المصادر». */
export function SourceCard({ ev }: { ev: Evidence }) {
  return (
    <li className="card flex items-center justify-between gap-3 p-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold">📖 {ev.bookTitle}</span>
          <SourceBadge ev={ev} />
        </div>
        <div className="mt-0.5 text-[12px] leading-6 text-ink-muted">
          {ev.author ? `المؤلف: ${ev.author}` : 'المؤلف: غير مذكور في بيانات المصدر'}
          {ev.volume ? ` · الجزء: ${ev.volume}` : ''}
          {ev.page !== undefined ? ` · الصفحة: ${ev.page}` : ''}
        </div>
      </div>
      <a
        href={ev.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="btn shrink-0 !py-1.5 !text-xs"
        aria-label={`فتح المصدر الأصلي: ${ev.bookTitle}`}
      >
        فتح المصدر
        <IconExternal className="h-3.5 w-3.5" />
      </a>
    </li>
  );
}
