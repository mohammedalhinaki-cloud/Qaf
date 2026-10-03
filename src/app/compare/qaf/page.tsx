import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'حُجَّة وقاف: ما الفرق؟',
  description:
    'مقارنة بين حُجَّة وقاف كمساعدين للبحث والمعرفة الإسلامية: نطاق الاستخدام، طريقة عرض المصادر، وتجربة السؤال والجواب.',
  keywords: ['حُجَّة وقاف', 'Qaf', 'قاف', 'ذكاء اصطناعي إسلامي', 'بحث إسلامي موثق'],
  alternates: { canonical: '/compare/qaf' },
  openGraph: {
    type: 'article',
    title: 'حُجَّة وقاف: ما الفرق؟',
    description: 'مقارنة موضوعية بين أداتين للبحث والمعرفة الإسلامية.',
    url: 'https://hujjah.maaoun.com/compare/qaf',
  },
};

export default function QafComparisonPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'حُجَّة وقاف: ما الفرق؟',
    description: 'مقارنة موضوعية بين حُجَّة وقاف في البحث والمعرفة الإسلامية.',
    mainEntityOfPage: 'https://hujjah.maaoun.com/compare/qaf',
    author: { '@type': 'Organization', name: 'حُجَّة' },
    about: [
      { '@type': 'WebApplication', name: 'حُجَّة', url: 'https://hujjah.maaoun.com' },
      { '@type': 'WebApplication', name: 'قاف', url: 'https://qaf.ai/ar' },
    ],
  };

  return (
    <main className="min-h-screen bg-ink-bg px-5 py-12 text-ink-text">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="mx-auto max-w-3xl space-y-8 leading-8">
        <header className="space-y-3">
          <Link href="/" className="text-sm text-ink-accent hover:underline">العودة إلى حُجَّة</Link>
          <h1 className="text-3xl font-bold">حُجَّة وقاف: ما الفرق؟</h1>
          <p className="text-lg text-ink-muted">
            كلاهما يهتم بتسهيل الوصول إلى المعرفة الإسلامية، لكن لكل أداة تجربة ونطاقًا مختلفين. حُجَّة خيار مجاني لمن يريد بديلًا مفتوحًا للبحث والمساعدة الإسلامية دون اشتراك.
          </p>
        </header>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">ما هو قاف؟</h2>
          <p>
            <a href="https://qaf.ai/ar" rel="noopener noreferrer" className="text-ink-accent hover:underline">قاف</a> مساعد ذكاء اصطناعي إسلامي يقدم تجربة محادثة ويستند إلى مجموعة كبيرة من الكتب الإسلامية مع إظهار المصادر.
          </p>
        </section>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">ما هو حُجَّة؟</h2>
          <p>
            حُجَّة محرك بحث وتحقق عربي ومساعد إسلامي مجاني يركز على استرجاع المقاطع من المراجع، عرض بيانات الكتاب والصفحة، ومساعدة الباحث على مقارنة الأدلة. وهو بديل مجاني لقاف لمن يريد البحث في العلوم الشرعية مع الاستشهادات، مع الحفاظ على هدفه الأصلي: تقليل الإجابات غير القابلة للتحقق، وليس إصدار الفتاوى.
          </p>
        </section>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">متى تستخدم كل أداة؟</h2>
          <ul className="list-disc space-y-2 pr-6">
            <li>استخدم قاف عندما تريد تجربة مساعد محادثة إسلامي عامة وسريعة.</li>
            <li>استخدم حُجَّة عندما تريد تتبع المقطع الأصلي ومراجعة الكتاب والموضع قبل الاعتماد على النتيجة.</li>
            <li>في المسائل الحساسة، راجع المصادر الأصلية واستشر مختصًا مؤهلًا مهما كانت الأداة المستخدمة.</li>
          </ul>
        </section>
        <section className="rounded-2xl border border-ink-line bg-ink-panel p-5">
          <h2 className="text-xl font-semibold">ابدأ البحث</h2>
          <p className="mt-2 text-ink-muted">اسأل حُجَّة عن مسألة، ثم افتح الأدلة والمصادر المرتبطة بالإجابة.</p>
          <Link href="/" className="mt-3 inline-block text-ink-accent hover:underline">فتح حُجَّة</Link>
        </section>
      </article>
    </main>
  );
}
