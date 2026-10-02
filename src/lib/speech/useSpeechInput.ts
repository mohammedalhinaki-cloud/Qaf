'use client';

/**
 * إملاء صوتي داخل المتصفح (Web Speech API) لزر الميكروفون في مربع الإدخال.
 *
 * - لا يتصل بأي خادم ولا يمسّ مسار البحث (تراث) ولا نموذج الصياغة (Gemini).
 * - التعرّف يتم في المتصفح نفسه؛ والنص النهائي يُسلَّم عبر `onTranscript` عند الإيقاف.
 * - مقياس مستوى الصوت اختياري: إن تعذّر، تبقى الموجات متحركة بالـ CSS وحدها.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/* ——— تعريفات مصغّرة لواجهة التعرّف على الكلام (غير موجودة في أنواع TS القياسية) ——— */

interface RecognitionAlternative {
  readonly transcript: string;
}

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}

interface RecognitionResultList {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
}

interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
}

interface RecognitionErrorEvent {
  readonly error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'لم يُسمح باستخدام الميكروفون. فعّل الإذن من إعدادات المتصفح.',
  'service-not-allowed': 'خدمة التعرّف على الكلام غير متاحة في هذا المتصفح.',
  'audio-capture': 'تعذّر الوصول إلى الميكروفون. تأكد من توصيله.',
  network: 'تعذّر الاتصال بخدمة التعرّف على الكلام.',
};

/** حدّ لإعادة التشغيل التلقائي حين يتوقف المحرّك من تلقائه بعد صمت. */
const MAX_RESTARTS = 12;

const IDLE_LEVEL = '0.14';

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechInput {
  /** هل يدعم المتصفح الإملاء الصوتي؟ (يُحسب بعد التركيب تفاديًا لاختلاف الترطيب) */
  supported: boolean;
  recording: boolean;
  /** النص المؤقت أثناء الكلام (عرض فقط). */
  interim: string;
  /** عدّاد ثواني التسجيل. */
  seconds: number;
  error: string | null;
  /** يُربط بحاوية الموجات؛ يُحدَّث عليه المتغيّر `--wave-level` بلا إعادة رسم. */
  waveRef: React.RefObject<HTMLSpanElement | null>;
  start: () => void;
  /** `discard` يُنهي التسجيل دون وضع النص في مربع الإدخال. */
  stop: (discard?: boolean) => void;
  toggle: () => void;
}

export function useSpeechInput({
  lang = 'ar-SA',
  onTranscript,
}: {
  lang?: string;
  onTranscript: (text: string) => void;
}): SpeechInput {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const waveRef = useRef<HTMLSpanElement | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const restartsRef = useRef(0);
  const discardRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cbRef = useRef(onTranscript);

  useEffect(() => {
    cbRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  /* ——— مقياس مستوى الصوت (اختياري) ——— */

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    void ctx?.close().catch(() => undefined);
    waveRef.current?.style.setProperty('--wave-level', IDLE_LEVEL);
  }, []);

  const startMeter = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!wantRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      const ctx = new Ctor();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      ctx.createMediaStreamSource(stream).connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      let smooth = 0.14;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const target = Math.min(1, Math.max(0.14, rms * 4.5));
        smooth += (target - smooth) * 0.28;
        waveRef.current?.style.setProperty('--wave-level', smooth.toFixed(3));
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* المقياس تحسين اختياري: الموجات تبقى متحركة بالـ CSS */
    }
  }, []);

  /* ——— تسليم النص وإنهاء الجلسة ——— */

  const commit = useCallback(() => {
    const text = `${finalRef.current} ${interimRef.current}`.replace(/\s+/g, ' ').trim();
    finalRef.current = '';
    interimRef.current = '';
    setInterim('');
    if (text) cbRef.current(text);
  }, []);

  const finish = useCallback(() => {
    wantRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopMeter();
    setRecording(false);
    setSeconds(0);

    const discard = discardRef.current;
    discardRef.current = false;
    if (discard) {
      finalRef.current = '';
      interimRef.current = '';
      setInterim('');
      return;
    }
    commit();
  }, [commit, stopMeter]);

  /* ——— بدء/إيقاف التسجيل ——— */

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || wantRef.current) return;

    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      setError('تعذّر تشغيل الإملاء الصوتي في هذا المتصفح.');
      return;
    }

    setError(null);
    finalRef.current = '';
    interimRef.current = '';
    setInterim('');
    restartsRef.current = 0;

    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        const text = res?.[0]?.transcript ?? '';
        if (!text) continue;
        if (res.isFinal) finalRef.current = `${finalRef.current} ${text}`.trim();
        else live += text;
      }
      interimRef.current = live;
      setInterim(live);
    };

    rec.onerror = (e) => {
      // «لا كلام» و«أُلغي» حالتان طبيعيتان؛ onend يتكفّل بهما.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wantRef.current = false;
      setError(ERROR_TEXT[e.error] ?? 'تعذّر التعرّف على الكلام.');
    };

    rec.onend = () => {
      // المحرّك يتوقف من تلقائه بعد صمت؛ نواصل ما دام المستخدم لم يضغط ■.
      if (wantRef.current && restartsRef.current < MAX_RESTARTS) {
        restartsRef.current += 1;
        try {
          rec.start();
          return;
        } catch {
          /* تابع الإنهاء */
        }
      }
      recRef.current = null;
      finish();
    };

    recRef.current = rec;
    wantRef.current = true;
    setRecording(true);
    setSeconds(0);

    try {
      rec.start();
    } catch {
      recRef.current = null;
      wantRef.current = false;
      setRecording(false);
      setError('تعذّر بدء التسجيل.');
      return;
    }

    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    void startMeter();
  }, [finish, lang, startMeter]);

  const stop = useCallback((discard = false) => {
    wantRef.current = false;
    discardRef.current = discard;
    const rec = recRef.current;
    if (!rec) {
      finish();
      return;
    }
    try {
      rec.stop();
    } catch {
      /* تُعالَج بالمهلة أدناه */
    }
    // شبكة أمان لو لم يُطلق المتصفح حدث onend.
    window.setTimeout(() => {
      if (recRef.current === rec) {
        recRef.current = null;
        finish();
      }
    }, 1500);
  }, [finish]);

  const toggle = useCallback(() => {
    if (wantRef.current) stop();
    else start();
  }, [start, stop]);

  /* ——— تنظيف عند الإزالة ——— */
  useEffect(
    () => () => {
      wantRef.current = false;
      const rec = recRef.current;
      recRef.current = null;
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.abort();
        } catch {
          /* تجاهل */
        }
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close().catch(() => undefined);
    },
    [],
  );

  return { supported, recording, interim, seconds, error, waveRef, start, stop, toggle };
}
