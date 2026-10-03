import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'عن حُجَّة',
  description:
    'حُجَّة محرك بحث إسلامي عربي يستخدم الذكاء الاصطناعي للبحث في المراجع الإسلامية وعرض الأدلة والصفحات الأصلية.',
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'article',
    title: 'عن حُجَّة — البحث الإسلامي الموثّق',
    description: 'تعرف على طريقة عمل حُجَّة ومصادره وحدوده.',
    url: 'https://hujjah.maaoun.com/about',
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-ink-bg px-5 py-12 text-ink-text">
      <article className="mx-auto max-w-3xl space-y-8 leading-8">
        <header className="space-y-3">
          <Link href="/" className="text-sm text-ink-accent hover:underline">العودة إلى حُجَّة</Link>
          <h1 className="text-3xl font-bold">حُجَّة — البحث الإسلامي الموثّق</h1>
          <p className="text-lg text-ink-muted">
            أداة عربية للبحث والتحقق من المراجع الإسلامية، تساعدك على الوصول إلى النصوص الأصلية قبل الاعتماد على أي إجابة.
          </p>
        </header>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">كيف يعمل حُجَّة؟</h2>
          <p>
            يحلل حُجَّة السؤال، يبحث في مصادر تراثية متاحة، ثم يعرض المقاطع والبيانات الببليوغرافية التي بُنيت عليها الصياغة. لا يعتمد على إجابة نموذج لغوي بلا دليل، ولا يقدم نفسه مفتيًا أو بديلًا عن المتخصص.
          </p>
        </section>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">المصادر والشفافية</h2>
          <p>
            يمكن فتح المصدر الأصلي من بطاقة الدليل ومراجعة الكتاب والموضع والسياق. عند عدم توفر أدلة كافية يصرّح حُجَّة بذلك بدل اختلاق إجابة.
          </p>
          <Link href="/sources" className="text-ink-accent hover:underline">تعرف على المصادر المستخدمة</Link>
        </section>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">حُجَّة وقاف</h2>
          <p>
            حُجَّة مشروع مستقل يركز على البحث القابل للتحقق وعرض مواضع الأدلة. وللتعرف على الفرق في التجربة والهدف، اقرأ صفحة المقارنة بين حُجَّة وقاف.
          </p>
          <p>
            لمن يبحث عن بديل مجاني لقاف أو مساعد إسلامي مجاني للمعرفة الشرعية، يقدم حُجَّة تجربة بحث مفتوحة مع عرض الأدلة والمراجع، مع بقاء الوصف الأصلي للمشروع: الباحث الإسلامي الذكي بالأدلة والمصادر.
          </p>
          <Link href="/compare/qaf" className="text-ink-accent hover:underline">مقارنة حُجَّة وقاف</Link>
        </section>
      </article>
    </main>
  );
}
