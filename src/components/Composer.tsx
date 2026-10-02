'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSpeechInput } from '@/lib/speech/useSpeechInput';
import { MADHHAB_LABEL, type Madhhab } from '@/lib/types';
import { IconMic, IconSend, IconStop } from './icons';

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

/** أعمدة الموجة الصوتية: تأخير ومدة مختلفان لكل عمود ليبدو الإيقاع طبيعيًا. */
const WAVE_BARS = [
  { delay: '0s', duration: '1.05s' },
  { delay: '0.16s', duration: '0.88s' },
  { delay: '0.32s', duration: '1.18s' },
  { delay: '0.08s', duration: '0.96s' },
  { delay: '0.24s', duration: '1.1s' },
];

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

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
  const valueRef = useRef(value);
  valueRef.current = value;

  // ارتفاع تلقائي
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, compact ? 180 : 220)}px`;
  }, [value, compact]);

  /* ——— الإملاء الصوتي: يضع النص في مربع الإدخال عند إيقاف التسجيل ——— */
  const handleTranscript = useCallback(
    (text: string) => {
      const current = valueRef.current;
      const next = current.trim().length > 0 ? `${current.trimEnd()} ${text}` : text;
      onChange(next);
      requestAnimationFrame(() => ref.current?.focus());
    },
    [onChange],
  );

  const speech = useSpeechInput({ onTranscript: handleTranscript });
  const { recording, stop: stopSpeech } = speech;

  // لا يستمر التسجيل أثناء البحث (ولا يُسقط نصًا في مربع إدخال أُفرغ للتو).
  useEffect(() => {
    if (busy && recording) stopSpeech(true);
  }, [busy, recording, stopSpeech]);

  const tooLong = value.length > maxChars;
  const canSend = value.trim().length >= 3 && !busy && !tooLong;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <div className="card overflow-hidden rounded-[28px] shadow-sm transition-shadow focus-within:border-ink-accent/40 focus-within:shadow-md">
      <label htmlFor="hujjah-q" className="sr-only">
        اكتب سؤالك
      </label>
      <textarea
        id="hujjah-q"
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={speech.recording ? 'أستمع إليك…' : 'اكتب سؤالك...'}
        rows={compact ? 1 : 2}
        dir="rtl"
        disabled={busy}
        aria-describedby="hujjah-q-help"
        className="w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-8
                   placeholder:text-ink-muted/70 focus:outline-none disabled:opacity-60"
      />

      {speech.recording && (
        <div className="rec-row flex items-center gap-2.5 px-4 pb-0.5 pt-1" role="status" aria-live="polite">
          <span ref={speech.waveRef} className="wave" aria-hidden="true">
            {WAVE_BARS.map((b) => (
              <span
                key={b.delay}
                className="wave-bar"
                style={{ animationDelay: b.delay, animationDuration: b.duration }}
              />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] leading-5 text-ink-muted">
            {speech.interim || 'جارٍ التسجيل… اضغط ■ للإنهاء'}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">
            {clock(speech.seconds)}
          </span>
        </div>
      )}

      {speech.error && !speech.recording && (
        <p className="px-4 pt-1 text-[11.5px] leading-5 text-amber-600 dark:text-amber-400" role="alert">
          {speech.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <label htmlFor="hujjah-madhhab" className="text-xs text-ink-muted">
            المذهب:
          </label>
          <select
            id="hujjah-madhhab"
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

        <div className="flex items-center gap-2.5">
          <span
            id="hujjah-q-help"
            className={`text-[11px] tabular-nums ${tooLong ? 'font-semibold text-red-500' : 'text-ink-muted'}`}
          >
            {value.length} / {maxChars}
          </span>

          {speech.supported && (
            <button
              type="button"
              onClick={speech.toggle}
              disabled={busy}
              aria-pressed={speech.recording}
              aria-label={speech.recording ? 'إيقاف التسجيل' : 'إملاء صوتي'}
              title={speech.recording ? 'إيقاف التسجيل' : 'إملاء صوتي'}
              className={`mic-btn${speech.recording ? ' mic-btn-rec' : ''}`}
            >
              {speech.recording ? (
                <IconStop className="h-3.5 w-3.5" />
              ) : (
                <IconMic className="h-[18px] w-[18px]" />
              )}
            </button>
          )}

          <button type="button" onClick={onSubmit} disabled={!canSend} className="btn-primary">
            <IconSend className="h-4 w-4" />
            {busy ? 'جارٍ البحث' : 'بحث'}
          </button>
        </div>
      </div>
    </div>
  );
}
