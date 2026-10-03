import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'مصادر حُجَّة',
  description: 'المصادر الإسلامية التي يبحث فيها حُجَّة وكيفية التحقق من النصوص والمواضع الأصلية.',
  alternates: { canonical: '/sources' },
};

export default function SourcesPage() {
  return (
    <main className="min-h-screen bg-ink-bg px-5 py-12 text-ink-text">
      <article className="mx-auto max-w-3xl space-y-8 leading-8">
        <Link href="/" className="text-sm text-ink-accent hover:underline">العودة إلى حُجَّة</Link>
        <h1 className="text-3xl font-bold">مصادر حُجَّة الإسلامية</h1>
        <p className="text-lg text-ink-muted">يبحث حُجَّة في مصادر تراثية، ثم يعرض المقاطع المسترجعة وروابط مواضعها الأصلية كلما توفرت.</p>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">تراث</h2>
          <p>يستفيد حُجَّة من واجهة البحث العامة في تراث للوصول إلى بيانات الكتب والمؤلفين والنصوص والمواضع الأصلية.</p>
          <a href="https://app.turath.io" rel="noopener noreferrer" className="text-ink-accent hover:underline">زيارة تراث</a>
        </section>
        <p className="border-t border-ink-line pt-5 text-sm text-ink-muted">حُجَّة أداة بحث وتوثيق، وليس مفتيًا. تحقق من المصدر في سياقه واستشر أهل الاختصاص.</p>
      </article>
    </main>
  );
}
