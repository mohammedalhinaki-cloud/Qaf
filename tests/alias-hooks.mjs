import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = new URL('../src/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const target = new URL(`${rel}.ts`, srcRoot);
    return nextResolve(pathToFileURL(fileURLToPath(target)).href, context);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // يكتب كود التطبيق الواردات النسبية بلا امتداد؛ أضف .ts عند تشغيله مباشرة في Node.
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
      return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
    }
    throw error;
  }
}
