'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MADHHAB_BASIS_LABEL } from '@/lib/search/madhhab';
import { MADHHAB_LABEL, type Evidence } from '@/lib/types';
import { citationLabel } from '@/lib/citations';
import { IconBook, IconClose, IconExternal, IconQuote } from './icons';

/**
 * الاستشهادات الداخلية داخل نص الإجابة.
 *
 * شريحة صغيرة قابلة للضغط تظهر بجانب الجملة التي تسندها،
 * وعند الضغط تفتح نافذة صغيرة ببيانات المصدر الكاملة من تراث
 * (الكتاب، المؤلف، الجزء، الصفحة، النص المستخرج) وزر فتح
 * الموضع الأصلي في موقع تراث.
 */

export function CitationChip({
  ev,
  onOpen,
}: {
  ev: Evidence;
  onOpen: (ev: Evidence, anchor: DOMRect) => void;
}) {
  const label = citationLabel(ev);
  const hint = [
    ev.bookTitle,
    ev.author,
    ev.volume ? `الجزء ${ev.volume}` : null,
    ev.page !== undefined ? `الصفحة ${ev.page}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={(e) => onOpen(ev, e.currentTarget.getBoundingClientRect())}
      title={hint}
      aria-label={`تفاصيل المصدر: ${hint}`}
      className="mx-0.5 inline-flex h-[1.35rem] max-w-[240px] select-none items-center gap-1
                 rounded-md bg-ink-accent/12 px-1.5 align-middle text-[10.5px] font-semibold
                 leading-none text-ink-accent transition-colors hover:bg-ink-accent/25"
    >
      <IconBook className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

const TEXT_CLAMP = 420;

export function CitationPopover({
  ev,
  anchor,
  onClose,
}: {
  ev: Evidence;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  /* إغلاق بلوحة المفاتيح (Escape) أو عند تمرير الصفحة خلف النافذة */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = (e: Event) => {
      if (cardRef.current && e.target instanceof Node && cardRef.current.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  /* حساب الموضع — يعمل بعد النقر مباشرة، لذا المتصفح متاح دائمًا */
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  const gap = 8;
  const width = Math.min(380, vw - margin * 2);
  const centerX = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(centerX - width / 2, margin), vw - width - margin);

  const spaceBelow = vh - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  const minSpace = 200;
  let top: number;
  let maxHeight: number;
  if (spaceBelow >= minSpace) {
    top = anchor.bottom + gap;
    maxHeight = Math.min(440, spaceBelow);
  } else if (spaceAbove >= minSpace) {
    maxHeight = Math.min(440, spaceAbove);
    top = Math.max(margin, anchor.top - gap - maxHeight);
  } else {
    top = margin;
    maxHeight = vh - margin * 2;
  }

  const locusBits: string[] = [];
  if (ev.volume) locusBits.push(`الجزء: ${ev.volume}`);
  if (ev.page !== undefined) locusBits.push(`الصفحة: ${ev.page}`);
  const hasLocus = locusBits.length > 0;

  const long = ev.text.length > TEXT_CLAMP;
  const body = expanded || !long ? ev.text : `${ev.text.slice(0, TEXT_CLAMP).trimEnd()}…`;

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/10 md:bg-transparent" onClick={onClose} aria-hidden="true" />
      <div
        ref={cardRef}
        role="dialog"
        aria-label={`تفاصيل الاستشهاد: ${ev.bookTitle}`}
        className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-ink-line
                   bg-ink-panel shadow-2xl"
        style={{ top, left, width, maxHeight }}
      >
        <header className="flex items-start justify-between gap-2 border-b border-ink-line px-4 py-3">
          <div className="min-w-0">
            <p className="prose-ar text-[13.5px] font-bold leading-6">{ev.bookTitle}</p>
            <p className="mt-0.5 text-[11.5px] leading-5 text-ink-muted">
              {ev.author ? ev.author : 'المؤلف: غير مذكور في بيانات المصدر'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-ink-line/40 hover:text-ink-text"
            aria-label="إغلاق تفاصيل الاستشهاد"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {ev.madhhabMatch && (
            <p
              className="chip mb-2.5 !border-ink-accent/35 !text-ink-accent"
              title={`${MADHHAB_BASIS_LABEL[ev.madhhabMatch.basis]}: ${ev.madhhabMatch.basisText}`}
            >
              {MADHHAB_LABEL[ev.madhhabMatch.madhhab]} — {MADHHAB_BASIS_LABEL[ev.madhhabMatch.basis]}
            </p>
          )}

          {ev.headings && ev.headings.length > 0 && (
            <p className="mb-2.5 text-[11px] leading-5 text-ink-muted">{ev.headings.join(' ← ')}</p>
          )}

          <p className="mb-2 text-[11.5px] leading-5 text-ink-muted">
            {hasLocus ? locusBits.join(' · ') : 'الموضع غير محدَّد في بيانات المصدر'}
          </p>

          <blockquote className="prose-ar border-r-2 border-ink-accent/40 pr-3 text-[13.5px] text-ink-text">
            <IconQuote className="mb-1 inline-block h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />{' '}
            {body
              .split('\n')
              .filter(Boolean)
              .map((p, i) => (
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
        </div>

        <footer className="border-t border-ink-line px-4 py-3">
          <a
            href={ev.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="btn-primary w-full !text-xs"
          >
            فتح المصدر في تراث
            <IconExternal className="h-3.5 w-3.5" />
          </a>
          <p className="mt-2 text-center text-[10px] leading-5 text-ink-muted">
            يفتح الموضع الأصلي في موقع تراث.
            {!hasLocus && ' ما لم يُحدَّد الجزء أو الصفحة فذلك لعدم توفّرهما في بيانات المصدر.'}
          </p>
        </footer>
      </div>
    </>,
    document.body,
  );
}
