'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSpeechInput } from '@/lib/speech/useSpeechInput';
import { MADHHAB_LABEL, SOURCE_LABEL, type Madhhab } from '@/lib/types';
import {
  IconArrowUp,
  IconChevronDown,
  IconFilter,
  IconMic,
  IconStop,
} from './icons';

interface Props {
  value: string;
  onChange: (v: string) => void;
  madhhab: Madhhab;
  onMadhhabChange: (m: Madhhab) => void;
  onSubmit: () => void;
  busy: boolean;
  maxChars: number;
  compact?: boolean;
  /** تسمية توضيحية صغيرة تُعرض تحت البطاقة مباشرة */
  caption?: string;
}

const MADHHABS: Madhhab[] = ['all', 'hanafi', 'maliki', 'shafii', 'hanbali'];

/** نص شريحة المذهب: «المذهب» ما دام الفلتر غير مفعّل، واسم المذهب عند تفعيله. */
const MADHHAB_PILL_LABEL: Record<Madhhab, string> = {
  all: 'المذهب',
  hanafi: 'حنفي',
  maliki: 'مالكي',
  shafii: 'شافعي',
  hanbali: 'حنبلي',
};

/** أعمدة الموجة الصوتية: تأخير ومدة مختلفان لكل عمود ليبدو الإيقاع طبيعيًا. */
const WAVE_BARS = [
  { delay: '0s', duration: '1.05s' },
  { delay: '0.16s', duration: '0.88s' },
  { delay: '0.32s', duration: '1.18s' },
  { delay: '0.08s', duration: '0.96s' },
  { delay: '0.24s', duration: '1.1s' },
];

/* ——— أصناف مشتركة: شكل Gemini/ChatGPT بالضبط في الوضع الداكن، وما يقابله في الفاتح ——— */

const PILL =
  'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ' +
  'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200 ' +
  'dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-700/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const PILL_ACTIVE =
  'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ' +
  'bg-teal-600/10 text-teal-700 border-teal-600/30 hover:bg-teal-600/15 ' +
  'dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/30 dark:hover:bg-teal-500/20';

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
  caption,
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
    <div className="w-full">
      <div className="relative mx-auto w-full max-w-2xl">
        {/* ——— البطاقة: عمودان — نص في الأعلى، شريط أدوات أفقي في الأسفل ——— */}
        <div
          className="flex w-full flex-col overflow-hidden rounded-3xl border
                   border-gray-200 bg-white shadow-lg transition-shadow
                   focus-within:border-gray-300 dark:border-gray-700/60 dark:bg-[#1e232a]
                   dark:focus-within:border-gray-600"
        >
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
            className="min-h-[50px] w-full resize-none border-none bg-transparent p-3 text-sm leading-7
                     text-gray-900 placeholder-gray-500 outline-none focus:outline-none focus:ring-0
                     disabled:opacity-60 dark:text-white dark:placeholder-gray-400"
          />

          {/* ——— حالة التسجيل الصوتي (تظهر فقط أثناء الإملاء) ——— */}
          {speech.recording && (
            <div
              className="rec-row flex items-center gap-2.5 px-3 pb-1"
              role="status"
              aria-live="polite"
            >
              <span ref={speech.waveRef} className="wave" aria-hidden="true">
                {WAVE_BARS.map((b) => (
                  <span
                    key={b.delay}
                    className="wave-bar"
                    style={{ animationDelay: b.delay, animationDuration: b.duration }}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                {speech.interim || 'جارٍ التسجيل… اضغط ■ للإنهاء'}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-gray-400">
                {clock(speech.seconds)}
              </span>
            </div>
          )}

          {speech.error && !speech.recording && (
            <p
              className="px-3 pb-1 text-[11px] leading-5 text-amber-600 dark:text-amber-400"
              role="alert"
            >
              {speech.error}
            </p>
          )}

          {/* ——— شريط الأدوات: صف أفقي واحد ——— */}
          <div
            className="flex items-center justify-between border-t border-gray-200 px-3 pb-3 pt-1
                     dark:border-gray-700/30"
          >
            {/* يسار (في RTL: بداية السطر) — مرشّحات صغيرة */}
            <div className="flex items-center gap-1.5">
              {/* شريحة المذهب: نص ظاهر + قائمة أصلية شفافة فوقه */}
              <div className="relative rounded-full focus-within:ring-2 focus-within:ring-teal-500/40">
                <span className={madhhab === 'all' ? PILL : PILL_ACTIVE} aria-hidden="true">
                  <IconFilter className="h-3 w-3 shrink-0" />
                  {MADHHAB_PILL_LABEL[madhhab]}
                  <IconChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                </span>
                <select
                  id="hujjah-madhhab"
                  value={madhhab}
                  onChange={(e) => onMadhhabChange(e.target.value as Madhhab)}
                  disabled={busy}
                  aria-label="فلتر المذهب"
                  title="فلتر المذهب"
                  className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full
                           opacity-0 disabled:cursor-not-allowed"
                >
                  {MADHHABS.map((m) => (
                    <option key={m} value={m}>
                      {MADHHAB_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* يمين (في RTL: نهاية السطر) — العدّاد والميكروفون وزر الإرسال */}
            <div className="flex items-center gap-2">
              <span
                id="hujjah-q-help"
                className={`font-mono text-[10px] tabular-nums ${
                  tooLong ? 'font-semibold text-red-500' : 'text-gray-400'
                }`}
              >
                {value.length}/{maxChars}
              </span>

              {speech.supported && (
                <button
                  type="button"
                  onClick={speech.toggle}
                  disabled={busy}
                  aria-pressed={speech.recording}
                  aria-label={speech.recording ? 'إيقاف التسجيل' : 'إملاء صوتي'}
                  title={speech.recording ? 'إيقاف التسجيل' : 'إملاء صوتي'}
                  className={
                    speech.recording
                      ? 'flex items-center justify-center rounded-full bg-teal-600 p-1.5 text-white transition hover:bg-teal-500'
                      : 'rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-white'
                  }
                >
                  {speech.recording ? (
                    <IconStop className="h-4 w-4" />
                  ) : (
                    <IconMic className="h-4 w-4" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend}
                aria-label={busy ? 'جارٍ البحث' : 'بحث'}
                title={busy ? 'جارٍ البحث' : 'بحث'}
                className="flex items-center justify-center rounded-full bg-teal-600 p-2 text-white
                         transition-all hover:bg-teal-500 disabled:opacity-40"
              >
                {busy ? (
                  <span
                    className="block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden="true"
                  />
                ) : (
                  <IconArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

      </div>

      {caption && (
        <p className="mt-2 text-center text-[11px] text-gray-500 opacity-75 dark:text-gray-400">
          {caption}
        </p>
      )}
    </div>
  );
}
