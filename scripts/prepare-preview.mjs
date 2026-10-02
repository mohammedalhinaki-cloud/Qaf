#!/usr/bin/env node
/**
 * تشخيص (وعند اللزوم تهيئة) مفتاح Gemini قبل النشر على Cloudflare.
 *
 * يعمل ضمن `npm run build` ويقوم بأمرين:
 *
 * 1) تقرير واضح في سجل البناء: هل المفتاح متاح؟ ومن أين؟ وهل سيصل إلى وقت
 *    التشغيل أم لا؟ (أكثر سبب لعطل «المفتاح غير مضبوط» هو ضبطه كمتغيّر Build
 *    فقط، وهو لا يصل إلى الـ Worker أثناء التشغيل.)
 *
 * 2) شبكة أمان داخل CI فقط: إن وُجد المفتاح في بيئة البناء ولم يكن هناك سرّ
 *    وقت تشغيل، يُحقن في wrangler.jsonc باسم احتياطي `GEMINI_API_KEY_BUILD`
 *    (يقرأه التطبيق كآخر خيار). يُحقن باسم مختلف عمدًا حتى لا يصطدم بسرّ
 *    `GEMINI_API_KEY` في اللوحة ولا يحوّله إلى نص ظاهر.
 *
 * محليًا (خارج CI) لا يُعدَّل wrangler.jsonc إطلاقًا، حتى لا ينتهي سرّ في Git.
 * للإجبار: CF_INLINE_RUNTIME_VARS=1 — وللتعطيل: CF_INLINE_RUNTIME_VARS=0
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'wrangler.jsonc');

/** الأسماء المقبولة للمفتاح، بالترتيب نفسه المستعمل في src/lib/env.ts. */
const KEY_NAMES = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_AI_API_KEY',
];

/** الاسم الاحتياطي الذي يُحقن في إعدادات الـ Worker عند الحاجة. */
const FALLBACK_VAR = 'GEMINI_API_KEY_BUILD';

const log = (msg) => console.log(`[gemini-key] ${msg}`);
const warn = (msg) => console.warn(`[gemini-key] ⚠ ${msg}`);

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

function parseEnvFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (key) vars[key] = cleanSecret(line.slice(eq + 1));
  }

  return vars;
}

// الأسبقية: بيئة العملية ثم ملفات التطوير المحلية.
const fileVars = {
  ...parseEnvFile(path.join(root, '.env')),
  ...parseEnvFile(path.join(root, '.env.local')),
  ...parseEnvFile(path.join(root, '.dev.vars')),
};

function resolveKey() {
  for (const name of KEY_NAMES) {
    const fromProcess = cleanSecret(process.env[name]);
    if (fromProcess) return { name, value: fromProcess, from: 'بيئة البناء' };
  }
  for (const name of KEY_NAMES) {
    const fromFile = fileVars[name];
    if (fromFile) return { name, value: fromFile, from: 'ملف محلي (.env/.dev.vars)' };
  }
  return null;
}

// يزيل تعليقات JSONC لتحليلها (كافٍ لهذا الملف).
function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([,{[\s])\/\/.*$/gm, '$1');
}

const inCI = /^(1|true)$/i.test(process.env.CI ?? '') || /^(1|true)$/i.test(process.env.WORKERS_CI ?? '');
const inlineFlag = process.env.CF_INLINE_RUNTIME_VARS;
const inlineAllowed = inlineFlag === undefined ? inCI : /^(1|true|yes|on)$/i.test(inlineFlag);

const key = resolveKey();

if (!key) {
  warn('لم يُعثر على مفتاح Gemini أثناء البناء.');
  warn(
    'للإنتاج: Cloudflare Dashboard → Workers → qaf → Settings → Variables and Secrets → ' +
      'Add → Type: Secret → Name: GEMINI_API_KEY → Deploy.',
  );
  warn('ملاحظة: متغيّرات «Build variables and secrets» لا تصل إلى وقت تشغيل الـ Worker.');
  process.exit(0);
}

const masked = `${key.value.length} حرفًا${key.value.startsWith('AIza') ? '، يبدأ بـ AIza' : ''}`;
log(`وُجد المفتاح في ${key.name} (${key.from}) — ${masked}.`);

if (!inlineAllowed) {
  log('لن يُعدَّل wrangler.jsonc (خارج CI). استعمل سرّ وقت التشغيل في لوحة Cloudflare.');
  log('للإجبار على الحقن: CF_INLINE_RUNTIME_VARS=1 npm run build');
  process.exit(0);
}

const raw = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(stripJsonComments(raw));

config.vars ??= {};
config.previews ??= {};
config.previews.vars ??= {};

// لا نكتب فوق GEMINI_API_KEY نفسه: السرّ في اللوحة هو المرجع الأعلى دائمًا.
config.vars[FALLBACK_VAR] = key.value;
config.previews.vars[FALLBACK_VAR] = key.value;

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

log(`حُقن ${FALLBACK_VAR} في wrangler.jsonc لهذا النشر (احتياطي فقط).`);
warn(`لا تُضف wrangler.jsonc المعدّل إلى Git: ${FALLBACK_VAR} يحوي قيمة سرّية.`);
