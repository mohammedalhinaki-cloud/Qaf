import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = new URL('../src/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const target = new URL(`${rel}.ts`, srcRoot);
    return nextResolve(pathToFileURL(fileURLToPath(target)).href, context);
  }
  return nextResolve(specifier, context);
}
