'use client';

import type { Conversation } from '@/lib/types';
import { IconClose, IconPlus, IconTrash } from './icons';
import { Logo } from './Logo';
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

export function Sidebar({ conversations, activeId, open, onClose, onNew, onSelect, onDelete }: Props) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[82%] max-w-[300px] flex-col border-l
                    border-ink-line bg-ink-panel transition-transform duration-200
                    md:static md:w-[272px] md:translate-x-0
                    ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-label="المحادثات"
      >
        <div className="flex items-center justify-between gap-2 border-b border-ink-line px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <div className="leading-tight">
              <div className="text-base font-bold">ماعون</div>
              <div className="text-[11px] text-ink-muted">بحث موثّق في المصادر</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn !px-2 !py-1.5 md:hidden" aria-label="إغلاق القائمة">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          <button type="button" onClick={onNew} className="btn w-full">
            <IconPlus className="h-4 w-4" />
            محادثة جديدة
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2">
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

        <div className="flex items-center justify-between gap-2 border-t border-ink-line px-3 py-3">
          <p className="text-[11px] leading-5 text-ink-muted">
            المصادر: المكتبة الشاملة · تراث
          </p>
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}
