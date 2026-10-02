'use client';

import { useEffect, useRef, useState } from 'react';
import { IconDots, IconInfo, IconLibrary, IconMail } from './icons';
import { InfoModal } from './InfoModal';

type PanelId = 'about' | 'sources' | 'contact';

const MENU_ITEMS: { id: PanelId; label: string; Icon: typeof IconInfo }[] = [
  { id: 'about', label: 'عن حُجَّة', Icon: IconInfo },
  { id: 'sources', label: 'المصادر', Icon: IconLibrary },
  { id: 'contact', label: 'تواصل معنا', Icon: IconMail },
];

/**
 * زر القائمة الإضافية (⋯) ولوحته المنسدلة، إلى جانب نوافذ المحتوى الثلاث.
 * لا يمس أي حالة من حالات المحادثة أو البحث — مستقل تمامًا عن ChatShell.
 */
export function InfoMenu() {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn !px-2.5 !py-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="قائمة المزيد"
        title="المزيد"
      >
        <IconDots className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          dir="rtl"
          aria-label="قائمة المزيد"
          className="menu-rise absolute right-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden
                     rounded-2xl border border-ink-line bg-ink-panel py-1.5 shadow-lg"
        >
          {MENU_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setPanel(id);
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-right text-[13.5px]
                         text-ink-text transition-colors hover:bg-ink-line/40"
            >
              <Icon className="h-4 w-4 shrink-0 text-ink-accent/80" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      <InfoModal title="عن حُجَّة" open={panel === 'about'} onClose={() => setPanel(null)}>
        <AboutContent />
      </InfoModal>

      <InfoModal title="المصادر" open={panel === 'sources'} onClose={() => setPanel(null)}>
        <SourcesContent />
      </InfoModal>

      <InfoModal title="تواصل معنا" open={panel === 'contact'} onClose={() => setPanel(null)}>
        <ContactContent />
      </InfoModal>
    </div>
  );
}

function AboutContent() {
  return (
    <div className="space-y-3.5">
      <p>
        <strong className="font-semibold text-ink-text">حُجَّة</strong> أداة بحث تساعدك على الوصول
        إلى المراجع الإسلامية والبحث فيها، والاستفادة من المصادر الأصلية، ثم عرض الأدلة والمراجع
        المرتبطة بالإجابة.
      </p>

      <ul className="list-disc space-y-2 pr-5">
        <li>مشروع مستقل يهدف إلى تسهيل البحث والوصول إلى المصادر.</li>
        <li>لا يُغني عن الرجوع إلى أهل العلم في المسائل التي تحتاج إلى فتوى أو حكم شرعي.</li>
        <li>
          <strong className="font-semibold text-ink-text">مجاني بالكامل</strong> ولا توجد رسوم على
          استخدامه.
        </li>
        <li>نعمل على تطويره وتحسينه وإضافة المزيد من المحتوى مع الوقت بإذن الله.</li>
      </ul>

      <p className="font-semibold text-ink-text">
        نسأل الله أن ينفع به، ولا تنسونا من دعواتكم.
      </p>
    </div>
  );
}

function SourcesContent() {
  const stats: [string, string][] = [
    ['8,593', 'كتاب'],
    ['3,188', 'مؤلف'],
    ['7.6 مليون', 'صفحة'],
  ];

  return (
    <div className="space-y-4">
      <p>
        إجابات حُجَّة مبنية على محتوى{' '}
        <strong className="font-semibold text-ink-text">المكتبة الشاملة</strong>، وهي أكبر مكتبة
        موثوقة للكتب الإسلامية. وتمتد المكتبة لتشمل:
      </p>

      <div className="grid grid-cols-3 gap-2">
        {stats.map(([num, label]) => (
          <div
            key={label}
            className="card flex flex-col items-center gap-0.5 px-2 py-3 text-center"
          >
            <span className="text-[15px] font-bold text-ink-accent">{num}</span>
            <span className="text-[11px] text-ink-muted">{label}</span>
          </div>
        ))}
      </div>

      <p>
        على الرغم من شعبيتها، نقدّر أن الشاملة لا تمثل سوى{' '}
        <strong className="font-semibold text-ink-text">٥٪</strong> من الكتب الإسلامية المتاحة،
        ونود إضافة المزيد من المحتوى مع مرور الوقت إن شاء الله.
      </p>

      <p>
        تُقدَّم المصادر من مطوري{' '}
        <a
          href="https://turath.io"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-ink-accent underline underline-offset-2"
        >
          Turath.io
        </a>
        .
      </p>
    </div>
  );
}

function ContactContent() {
  const email = 'mohammedalhinaki@gmail.com';
  return (
    <div className="space-y-3.5">
      <p>
        يسعدنا تلقي ملاحظاتكم واقتراحاتكم، سواء لاحظتم خطأ في المحتوى أو كانت لديكم فكرة تساعدنا
        على تطوير حُجَّة وتحسين تجربة البحث.
      </p>
      <p>
        إذا واجهتكم مشكلة أو لديكم اقتراح لإضافة مصدر أو تحسين إحدى الخصائص، يمكنكم التواصل معنا
        عبر البريد الإلكتروني:
      </p>

      <a
        href={`mailto:${email}`}
        dir="ltr"
        className="flex items-center justify-center gap-2 rounded-xl border border-ink-accent/30
                   bg-ink-accent/[0.06] px-4 py-3 text-center text-[13.5px] font-semibold
                   text-ink-accent transition-colors hover:bg-ink-accent/10"
      >
        <IconMail className="h-4 w-4 shrink-0" aria-hidden="true" />
        {email}
      </a>

      <p className="font-semibold text-ink-text">
        ملاحظاتكم تساعدنا على تطوير حُجَّة وجعله أكثر نفعًا للباحثين.
      </p>
    </div>
  );
}
