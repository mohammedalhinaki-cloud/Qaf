'use client';

import { useEffect, useState } from 'react';
import { IconAlert, IconClose } from './icons';

interface HealthResponse {
  ai?: {
    configured?: boolean;
    model?: string;
    key?: { hint?: string | null; variable?: string | null; source?: string | null };
  };
}

/**
 * شريط تنبيه يظهر فقط حين لا يرى الخادم مفتاح Groq.
 * يجعل العطل مرئيًا فورًا بدل انتظار فشل أول سؤال، ويشرح الإصلاح بدقّة.
 * لا يعرض المفتاح ولا أي جزء منه.
 */
export function ConfigBanner() {
  const [state, setState] = useState<{ missing: boolean; hint: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as HealthResponse;
        if (data.ai?.configured === false) {
          setState({
            missing: true,
            hint: data.ai.key?.hint ?? 'أضف GROQ_API_KEY كـ Secret في متغيّرات بيئة الخادم.',
          });
        }
      } catch {
        /* الشبكة أو الإلغاء: لا تنبيه */
      }
    })();

    return () => controller.abort();
  }, []);

  if (!state?.missing || dismissed) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5
                 text-[11.5px] leading-5 text-amber-900 dark:text-amber-200"
    >
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">مفتاح Groq غير مضبوط على الخادم، لذلك لن تعمل الإجابات.</p>
        <p className="mt-0.5 opacity-90">{state.hint}</p>
        <p className="mt-0.5 opacity-75">
          للتشخيص التفصيلي افتح{' '}
          <a
            className="underline underline-offset-2"
            href="/api/health?probe=1"
            target="_blank"
            rel="noreferrer"
          >
            /api/health?probe=1
          </a>
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="إخفاء التنبيه"
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-amber-500/20"
      >
        <IconClose className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
