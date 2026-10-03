'use client';

import { useEffect } from 'react';
import type { Conversation } from '@/lib/types';
import Link from 'next/link';
import { IconClose, IconPlus, IconTrash } from './icons';
import { InfoItems } from './InfoItems';
import { Logo, Wordmark } from './Logo';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  const d = Math.floor(h / 24);
  if (d < 30) return `قبل ${d} ي`;
  return new Date(ts).toLocaleDateString('ar', { day: 'numeric', month: 'short' });
}

/**
 * القائمة الجانبية: درج عائم يغطي المحتوى بالكامل على كل المقاسات (نمط ChatGPT/Gemini)،
 * يُفتح من زر (≡) في الشريط العلوي ويُغلق بالنقر خارجَه أو بزر الإغلاق أو بمفتاح الهروب.
 */
export function Sidebar({ conversations, activeId, open, onClose, onNew, onSelect, onDelete }: Props) {
  /* إغلاق الدرج بمفتاح الهروب */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* حاجب خلفي يغطي الصفحة كاملة ويمنع ظهور المحتوى خلف الدرج */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex h-full min-h-screen w-[86%] max-w-[320px]
                    flex-col border-l border-ink-line bg-ink-panel shadow-2xl
                    transition-[transform,visibility] duration-200
                    ${open ? 'visible translate-x-0' : 'invisible translate-x-full'}`}
        aria-label="قائمة حُجَّة"
      >
        {/* رأس الدرج: الشعار + زر الإغلاق */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ink-line px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <div className="leading-tight">
              <Wordmark className="block text-base" />
              <div className="text-[11px] text-ink-muted">تحقّق علمي من المراجع</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn !px-2 !py-1.5" aria-label="إغلاق القائمة">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 p-3">
          <button type="button" onClick={onNew} className="btn w-full">
            <IconPlus className="h-4 w-4" />
            محادثة جديدة
          </button>
        </div>

        {/* سجل المحادثات */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="سجل المحادثات">
          {conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs leading-6 text-ink-muted">
              لا توجد محادثات بعد.
              <br />
              تُحفظ محادثاتك في هذا المتصفح فقط.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id}>
                    <div
                      className={`group flex items-center gap-1 rounded-xl px-2 transition-colors
                                  ${active ? 'bg-ink-accent/10' : 'hover:bg-ink-line/40'}`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="flex-1 overflow-hidden py-2.5 text-right"
                        aria-current={active ? 'page' : undefined}
                      >
                        <span
                          className={`block truncate text-[13px] ${active ? 'font-semibold text-ink-accent' : ''}`}
                          title={c.title}
                        >
                          {c.title}
                        </span>
                        <span className="block text-[11px] text-ink-muted">{relativeTime(c.updatedAt)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        className="rounded-lg p-1.5 text-ink-muted opacity-0 transition hover:text-red-500
                                   focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={`حذف المحادثة: ${c.title}`}
                        title="حذف المحادثة"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* أسفل الدرج: عناصر المعلومات فوق زر تبديل السمة مباشرة */}
        <div className="shrink-0 border-t border-ink-line p-3">
          <InfoItems />

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-ink-line pt-2.5">
            <p className="text-[11px] leading-5 text-ink-muted">المصدر: مكتبة تراث</p>
            <ThemeToggle />
          </div>
        </div>
        <nav aria-label="معلومات حُجَّة" className="flex flex-wrap gap-x-3 gap-y-1 border-t border-ink-line px-3 py-2 text-[11px] text-ink-muted">
          <Link href="/about" className="hover:text-ink-accent hover:underline">عن حُجَّة</Link>
          <Link href="/sources" className="hover:text-ink-accent hover:underline">المصادر</Link>
          <Link href="/compare/qaf" className="hover:text-ink-accent hover:underline">حُجَّة وقاف</Link>
        </nav>
      </aside>
    </>
  );
}
