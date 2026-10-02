import { isGeminiConfigured } from '@/lib/ai/gemini';
import { config } from '@/lib/config';
import { clientKey, rateLimit } from '@/lib/security/ratelimit';
import { searchTurath } from '@/lib/search/turath';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * فحص صحة حقيقي لمصدر البحث (تراث). لا يعرض أي مفتاح، ويكتفي ببيان
 * هل المفتاح مضبوط أم لا. يُستخدم للتشخيص وللافتة الحالة في الواجهة.
 */
export async function GET(req: Request) {
  const limit = rateLimit(`health:${clientKey(req.headers)}`, 12);
  if (!limit.allowed) {
    return Response.json({ error: 'طلبات كثيرة.' }, { status: 429 });
  }

  const probe = new URL(req.url).searchParams.get('probe') === '1';

  const base = {
    ok: true,
    ai: { configured: isGeminiConfigured(), model: config.gemini.model },
    sources: {
      turath: { enabled: config.turath.enabled, endpoint: config.turath.apiBase, kind: 'public-json-api' },
    },
  };

  if (!probe) return Response.json(base, { headers: { 'Cache-Control': 'no-store' } });

  const turath = await (async () => {
    if (!config.turath.enabled) return { reachable: false, reason: 'معطّل' };
    const t0 = Date.now();
    try {
      const r = await searchTurath('الصلاة', { limit: 1 });
      return { reachable: true, results: r.length, tookMs: Date.now() - t0 };
    } catch (e) {
      return { reachable: false, reason: e instanceof Error ? e.message : 'خطأ', tookMs: Date.now() - t0 };
    }
  })();

  return Response.json({ ...base, probe: { turath } }, { headers: { 'Cache-Control': 'no-store' } });
}
