/**
 * اختبار إعادة المحاولة التلقائية في عميل Gemini عند ازدحام مؤقت (503)
 * أو خطأ اتصال عابر، بدون أي اتصال شبكة فعلي (fetch مُموَّه بالكامل).
 * التشغيل: npm test
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GEMINI_KEY_NAMES } from '../src/lib/env.ts';
import { GeminiError, generateJson } from '../src/lib/ai/gemini.ts';

function setKey() {
  for (const n of GEMINI_KEY_NAMES) delete process.env[n];
  process.env.GEMINI_API_KEY = `AIza${'x'.repeat(35)}`;
}

function clearKey() {
  for (const n of GEMINI_KEY_NAMES) delete process.env[n];
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function overloadedBody() {
  return { error: { message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } };
}

function okBody(payload: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }] };
}

test('generateJson يعيد المحاولة بعد 503 وينجح دون أن يصل الخطأ للمستخدم', async () => {
  setKey();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) return jsonResponse(503, overloadedBody());
    return jsonResponse(200, okBody({ ok: true }));
  }) as typeof fetch;

  try {
    const result = await generateJson<{ ok: boolean }>({
      system: 'sys',
      user: 'user',
      maxOutputTokens: 100,
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 2, 'يجب أن يستدعي fetch مرتين: محاولة فاشلة ثم ناجحة');
  } finally {
    globalThis.fetch = originalFetch;
    clearKey();
  }
});

test('generateJson يعيد المحاولة بعد خطأ اتصال عابر (شبكة) وينجح', async () => {
  setKey();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('network reset');
    return jsonResponse(200, okBody({ ok: true }));
  }) as typeof fetch;

  try {
    const result = await generateJson<{ ok: boolean }>({
      system: 'sys',
      user: 'user',
      maxOutputTokens: 100,
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearKey();
  }
});

test('generateJson يرمي GeminiError(overloaded) بعد استنفاد كل المحاولات', async () => {
  setKey();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(503, overloadedBody());
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => generateJson<{ ok: boolean }>({ system: 'sys', user: 'user', maxOutputTokens: 100 }),
      (e: unknown) => {
        assert.ok(e instanceof GeminiError);
        assert.equal(e.code, 'overloaded');
        return true;
      },
    );
    assert.ok(calls >= 3, `يجب إجراء عدّة محاولات (كانت ${calls})`);
  } finally {
    globalThis.fetch = originalFetch;
    clearKey();
  }
});

test('generateJson لا يعيد المحاولة عند 429 (تجاوز الحصّة) ويفشل فورًا', async () => {
  setKey();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(429, { error: { message: 'Quota exceeded' } });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => generateJson<{ ok: boolean }>({ system: 'sys', user: 'user', maxOutputTokens: 100 }),
      (e: unknown) => {
        assert.ok(e instanceof GeminiError);
        assert.equal(e.code, 'rate_limit');
        return true;
      },
    );
    assert.equal(calls, 1, 'لا يجوز إعادة المحاولة على 429');
  } finally {
    globalThis.fetch = originalFetch;
    clearKey();
  }
});
