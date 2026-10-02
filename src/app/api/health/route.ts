import { isGeminiConfigured, pingGemini } from '@/lib/ai/gemini';
import { config } from '@/lib/config';
import { geminiKeyDiagnostics } from '@/lib/env';
import { clientKey, rateLimit } from '@/lib/security/ratelimit';
import { searchTurath } from '@/lib/search/turath';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * فحص صحة حقيقي للنظام: حالة مفتاح Gemini وحالة مصدر البحث (تراث).
 *
 * لا يكشف المفتاح إطلاقًا؛ يكشف فقط ما يلزم للتشخيص: هل وُجد، ومن أي متغيّر،
 * ومن أي مصدر (process.env أو سياق Cloudflare)، وطوله، وهل يقبله Google.
 *
 *   GET /api/health            → حالة الإعداد فقط (سريع، بلا شبكة)
 *   GET /api/health?probe=1    → يضيف اتصالًا حقيقيًا بـ Google وتراث
 */
export async function GET(req: Request) {
  const limit = rateLimit(`health:${clientKey(req.headers)}`, 12);
  if (!limit.allowed) {
    return Response.json({ error: 'طلبات كثيرة.' }, { status: 429 });
  }

  const probe = new URL(req.url).searchParams.get('probe') === '1';
  const key = geminiKeyDiagnostics();

  const base = {
    ok: true,
    ai: {
      configured: isGeminiConfigured(),
      model: config.gemini.model,
      key: {
        found: key.configured,
        /** اسم المتغيّر الذي قُرئ منه المفتاح — لا قيمته */
        variable: key.name,
        source: key.source,
        length: key.length,
        looksLikeGoogleKey: key.looksLikeGoogleKey,
        checkedNames: key.checkedNames,
        hint: key.hint,
      },
    },
    runtime: {
      onCloudflare: key.onCloudflare,
      nodeEnv: process.env.NODE_ENV ?? null,
    },
    sources: {
      turath: {
        enabled: config.turath.enabled,
        endpoint: config.turath.apiBase,
        kind: 'public-json-api',
      },
    },
  };

  if (!probe) return Response.json(base, { headers: { 'Cache-Control': 'no-store' } });

  const [gemini, turath] = await Promise.all([
    pingGemini(),
    (async () => {
      if (!config.turath.enabled) return { reachable: false, reason: 'معطّل' };
      const t0 = Date.now();
      try {
        const r = await searchTurath('الصلاة', { limit: 1 });
        return { reachable: true, results: r.length, tookMs: Date.now() - t0 };
      } catch (e) {
        return {
          reachable: false,
          reason: e instanceof Error ? e.message : 'خطأ',
          tookMs: Date.now() - t0,
        };
      }
    })(),
  ]);

  return Response.json(
    { ...base, ok: gemini.ok && turath.reachable === true, probe: { gemini, turath } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
