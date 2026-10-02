/**
 * شعار حُجَّة: مرجع مفتوح مع علامة تحقّق — إشارة إلى «الحُجَّة»:
 * النص الأصلي مع إثبات صحّته بالرجوع إلى مصدره.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="شعار حُجَّة"
      className="text-ink-accent"
    >
      <circle cx="16" cy="16" r="15" className="fill-current opacity-[0.10]" />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M16 12.4c-2.3-1.6-5-2-7.9-1.4v11.6c2.9-.6 5.6-.2 7.9 1.4" />
        <path d="M16 12.4c2.3-1.6 5-2 7.9-1.4v11.6c-2.9-.6-5.6-.2-7.9 1.4" />
      </g>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55">
        <path d="M10.4 14.9h3.5" />
        <path d="M10.4 17.7h3.5" />
        <path d="M10.4 20.5h2.3" />
      </g>
      <path
        d="M17.7 17l1.7 1.8 3.5-3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** الشعار النصي الرسمي — يُكتب دائمًا بهذا الضبط: حُجَّة */
export const BRAND_NAME = 'حُجَّة';
export const BRAND_NAME_EN = 'Hujjah';
export const BRAND_TAGLINE =
  'حُجَّة — الذكاء الاصطناعي للتحقق العلمي والبحث في المراجع الإسلامية الصحيحة';
export const BRAND_DESCRIPTION =
  'باحث ذكي يبحث في المراجع الإسلامية، ويعرض الإجابة مع مصادرها الأصلية للتحقق منها.';

/** شعار نصي: الاسم مضبوطًا بالشكل مع تباعد حروف خفيف لإبراز التشكيل. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span lang="ar" dir="rtl" className={`brand-wordmark ${className}`}>
      {BRAND_NAME}
    </span>
  );
}
