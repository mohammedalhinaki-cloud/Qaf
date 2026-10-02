'use client';

import type { AskEvent, Madhhab } from '@/lib/types';

/**
 * يستدعي /api/ask ويقرأ أحداث NDJSON سطرًا سطرًا.
 * لا يحتوي هذا الملف على أي مفتاح — كل الاتصال بالنموذج يتم على الخادم.
 */
export async function askStream(
  input: {
    question: string;
    madhhab: Madhhab;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
  onEvent: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    let message = 'تعذّر تنفيذ الطلب.';
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* نُبقي الرسالة الافتراضية */
    }
    onEvent({ type: 'error', message });
    return;
  }

  if (!res.body) {
    onEvent({ type: 'error', message: 'لم يصل أي رد من الخادم.' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const raw = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!raw) continue;
      try {
        onEvent(JSON.parse(raw) as AskEvent);
      } catch {
        /* سطر غير مكتمل أو تالف — نتجاهله */
      }
    }
  }

  const rest = buffer.trim();
  if (rest) {
    try {
      onEvent(JSON.parse(rest) as AskEvent);
    } catch {
      /* تجاهل */
    }
  }
}
