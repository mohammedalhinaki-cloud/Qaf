#!/usr/bin/env node
/**
 * Injects preview vars into wrangler.jsonc's `previews.vars` block at build
 * time, reading values from the environment (process.env, .env, .env.local,
 * .dev.vars). This keeps secrets like GEMINI_API_KEY out of Git while still
 * satisfying `wrangler preview`, which requires them in the `previews` block.
 *
 * Runs as part of `npm run build` (see package.json). The modified
 * wrangler.jsonc only needs to exist in the build/deploy environment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'wrangler.jsonc');

/** Vars the preview deployment needs at runtime. */
const PREVIEW_VAR_NAMES = ['GEMINI_API_KEY'];

function parseEnvFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) vars[key] = value;
  }

  return vars;
}

// Later sources take precedence; process.env wins over files.
const fileVars = {
  ...parseEnvFile(path.join(root, '.env')),
  ...parseEnvFile(path.join(root, '.env.local')),
  ...parseEnvFile(path.join(root, '.dev.vars')),
};

function resolveVar(name) {
  const value = process.env[name] ?? fileVars[name];
  return value !== undefined && value !== '' ? value : undefined;
}

// Strip // and /* */ comments so JSON.parse can handle JSONC (naive but
// sufficient for this config, which does not contain embedded comment tokens).
function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([,{[\s])\/\/.*$/gm, '$1');
}

const raw = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(stripJsonComments(raw));

config.previews ??= {};
config.previews.vars ??= {};

let injected = 0;
for (const name of PREVIEW_VAR_NAMES) {
  const value = resolveVar(name);
  if (value !== undefined) {
    config.previews.vars[name] = value;
    injected += 1;
  } else {
    console.warn(
      `[prepare-preview] WARNING: ${name} not found in the environment; ` +
        'the preview deployment will not have it set.'
    );
  }
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log(
  `[prepare-preview] wrangler.jsonc updated (${injected}/${PREVIEW_VAR_NAMES.length} preview vars injected).`
);
