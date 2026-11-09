#!/usr/bin/env node
/**
 * فحص مفتاح OpenRouter في ثوانٍ.
 *
 *   npm run check:openrouter
 *       يقرأ المفتاح من البيئة أو من .env / .env.local / .dev.vars
 *       ويختبره مباشرة لدى المزوّد المضبوط (TUA_BASE_URL؛ الافتراضي OpenRouter).
 *       يدعم مفتاح Groq (gsk_…) عند ضبط TUA_BASE_URL=https://api.groq.com/openai/v1
 *       ونفس النموذج openai/gpt-oss-120b.
 *
 *   npm run check:openrouter -- https://hujjah.maaoun.com
 *       يفحص نسخة منشورة عبر /api/health?probe=1 ويشرح النتيجة.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const KEY_NAMES = ['TUA', 'TUA_BUILD'];

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const KEY_SHAPE = /^(sk-or-v1-[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z_-]{20,})$/;

function cleanSecret(value) {
  if (typeof value !== 'string') return '';
  let v = value.trim();
  const pasted = /^[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.+)$/s.exec(v);
  if (pasted) v = pasted[1].trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v.replace(/\s+/gu, '');
}

function parseEnvFile(file) {
  const out = {};
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim().replace(/^export\s+/, '');
    if (k) out[k] = { value: cleanSecret(t.slice(eq + 1)), from: file };
  }
  return out;
}

function resolveValue(name, fallback) {
  const fromEnv = cleanSecret(process.env[name]);
  if (fromEnv) return fromEnv;
  const files = { ...parseEnvFile('.env'), ...parseEnvFile('.env.local'), ...parseEnvFile('.dev.vars') };
  return files[name]?.value ?? fallback;
}

function resolveKey() {
  for (const name of KEY_NAMES) {
    const v = cleanSecret(process.env[name]);
    if (v) return { name, value: v, from: 'process.env' };
  }
  const files = { ...parseEnvFile('.env'), ...parseEnvFile('.env.local'), ...parseEnvFile('.dev.vars') };
  for (const name of KEY_NAMES) {
    if (files[name]?.value) return { name, value: files[name].value, from: files[name].from };
  }
  return null;
}

async function checkRemote(target) {
  const url = new URL('/api/health?probe=1', target).toString();
  console.log(`🌐 فحص النسخة المنشورة: ${url}\n`);

  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    console.error(`❌ تعذّر الوصول إلى الموقع: ${e.message}`);
    process.exit(1);
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    console.error(`❌ استجابة غير متوقّعة (${res.status}).`);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
  console.log('');

  const key = data.ai?.key ?? {};
  if (!key.found) {
    console.error('❌ الخادم لا يرى المفتاح إطلاقًا.');
    console.error('   الحل: Workers → qaf → Settings → Variables and Secrets →');
    console.error('   Add → Type: Secret → Name: TUA → Deploy.');
    console.error('   تذكير: «Build variables» لا تصل إلى وقت التشغيل.');
    process.exit(1);
  }

  console.log(`✅ المفتاح مقروء من ${key.variable} عبر ${key.source} (${key.length} حرفًا).`);

  const ping = data.probe?.openrouter;
  if (ping?.ok) {
    console.log(`✅ المزوّد قبل المفتاح والنموذج ${data.ai?.model} متاح (${ping.tookMs}ms).`);
  } else {
    console.error(`❌ فشل الفحص لدى المزوّد: [${ping?.code}] ${ping?.message}`);
    process.exit(1);
  }

  const turath = data.probe?.turath;
  console.log(
    turath?.reachable
      ? `✅ تراث متاح (${turath.results} نتيجة، ${turath.tookMs}ms).`
      : `⚠ تراث غير متاح: ${turath?.reason ?? 'سبب غير معروف'}`,
  );
}

async function checkLocal() {
  const model = resolveValue('TUA_MODEL', DEFAULT_MODEL);
  const baseUrl = resolveValue('TUA_BASE_URL', DEFAULT_BASE_URL).replace(/\/+$/, '');
  const key = resolveKey();

  if (!key) {
    console.error('❌ لم يُعثر على مفتاح في البيئة ولا في .env / .env.local / .dev.vars');
    console.error(`   الأسماء المقبولة: ${KEY_NAMES.join('، ')}`);
    console.error('   محليًا: ضع TUA=... في .env.local');
    process.exit(1);
  }

  console.log(`🔑 المفتاح: ${key.name} من ${key.from} — ${key.value.length} حرفًا.`);
  if (!KEY_SHAPE.test(key.value)) {
    console.warn('⚠ شكل المفتاح غير معتاد (المتوقّع sk-or-v1-… لـ OpenRouter أو gsk_… لـ Groq). تحقّق من النسخ.');
  }
  console.log(`🎯 المزوّد: ${baseUrl}`);

  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}`, {
    headers: { Authorization: `Bearer ${key.value}` },
    cache: 'no-store',
  }).catch((e) => {
    console.error(`❌ تعذّر الاتصال بـ ${baseUrl}: ${e.message}`);
    process.exit(1);
  });

  const body = await res.json().catch(() => ({}));

  if (res.ok) {
    console.log(`✅ المفتاح صالح والنموذج «${model}» متاح (${Date.now() - t0}ms).`);
    console.log(`   نافذة السياق: ${body.context_window ?? body.context_length ?? '؟'} رمزًا.`);
    return;
  }

  const detail = body?.error?.message ?? '';
  if (res.status === 404) {
    console.error(`❌ النموذج «${model}» غير متاح لهذا المفتاح. جرّب TUA_MODEL=openai/gpt-oss-120b`);
  } else if (res.status === 429) {
    console.error('❌ تجاوز حدّ الاستخدام مؤقتًا؛ أعد المحاولة لاحقًا.');
  } else if (res.status === 401 || res.status === 403 || /api key/i.test(detail)) {
    console.error(`❌ المزوّد رفض المفتاح (${baseUrl}). OpenRouter: https://openrouter.ai/keys — Groq: https://console.groq.com/keys`);
  } else {
    console.error(`❌ خطأ (${res.status}): ${detail.slice(0, 300)}`);
  }
  process.exit(1);
}

const target = process.argv[2];
await (target ? checkRemote(target) : checkLocal());
