/**
 * اختبار إعادة المحاولة التلقائية في عميل Groq عند ازدحام مؤقت (503)
 * أو خطأ اتصال عابر، بدون أي اتصال شبكة فعلي (fetch مُموَّه بالكامل).
 * التشغيل: npm test
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GROQ_KEY_NAMES } from '../src/lib/env.ts';
import { GroqError, generateJson } from '../src/lib/ai/groq.ts';

function setKey() {
  for (const n of GROQ_KEY_NAMES) delete process.env[n];
  process.env.GROQ_API_KEY = `gsk_${'x'.repeat(40)}`;
}

function clearKey() {
  for (const n of GROQ_KEY_NAMES) delete process.env[n];
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function overloadedBody() {
  return { error: { message: 'Service Unavailable: the model is overloaded, try again later.', type: 'internal_server_error' } };
}

/** استجابة ناجحة بصيغة Groq (المتوافقة مع OpenAI chat/completions). */
function okBody(payload: unknown) {
  return {
    choices: [{ message: { role: 'assistant', content: JSON.stringify(payload) }, finish_reason: 'stop' }],
  };
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

test('generateJson يرمي GroqError(overloaded) بعد استنفاد كل المحاولات', async () => {
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
        assert.ok(e instanceof GroqError);
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
    return jsonResponse(429, { error: { message: 'Rate limit reached' } });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => generateJson<{ ok: boolean }>({ system: 'sys', user: 'user', maxOutputTokens: 100 }),
      (e: unknown) => {
        assert.ok(e instanceof GroqError);
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
