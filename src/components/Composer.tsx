'use client';

import { useEffect, useRef } from 'react';
import { MADHHAB_LABEL, type Madhhab } from '@/lib/types';
import { IconSend } from './icons';

interface Props {
  value: string;
  onChange: (v: string) => void;
  madhhab: Madhhab;
  onMadhhabChange: (m: Madhhab) => void;
  onSubmit: () => void;
  busy: boolean;
  maxChars: number;
  compact?: boolean;
}

const MADHHABS: Madhhab[] = ['all', 'hanafi', 'maliki', 'shafii', 'hanbali'];

export function Composer({
  value,
  onChange,
  madhhab,
  onMadhhabChange,
  onSubmit,
  busy,
  maxChars,
  compact = false,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // ارتفاع تلقائي
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, compact ? 180 : 220)}px`;
  }, [value, compact]);

  const tooLong = value.length > maxChars;
  const canSend = value.trim().length >= 3 && !busy && !tooLong;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <div className="card overflow-hidden shadow-sm">
      <label htmlFor="maoun-q" className="sr-only">
        اكتب سؤالك
      </label>
      <textarea
        id="maoun-q"
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="اكتب سؤالك..."
        rows={compact ? 1 : 2}
        dir="rtl"
        disabled={busy}
        aria-describedby="maoun-q-help"
        className="w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-8
                   placeholder:text-ink-muted/70 focus:outline-none disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <label htmlFor="maoun-madhhab" className="text-xs text-ink-muted">
            المذهب:
          </label>
          <select
            id="maoun-madhhab"
            value={madhhab}
            onChange={(e) => onMadhhabChange(e.target.value as Madhhab)}
            disabled={busy}
            className="rounded-lg border border-ink-line bg-ink-panel px-2.5 py-1.5 text-xs
                       text-ink-text focus:outline-none disabled:opacity-60"
          >
            {MADHHABS.map((m) => (
              <option key={m} value={m}>
                {MADHHAB_LABEL[m]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span
            id="maoun-q-help"
            className={`text-[11px] tabular-nums ${tooLong ? 'font-semibold text-red-500' : 'text-ink-muted'}`}
          >
            {value.length} / {maxChars}
          </span>
          <button type="button" onClick={onSubmit} disabled={!canSend} className="btn-primary">
            <IconSend className="h-4 w-4" />
            {busy ? 'جارٍ البحث' : 'بحث'}
          </button>
        </div>
      </div>
    </div>
  );
}
