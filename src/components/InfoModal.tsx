'use client';

import { useEffect, useRef } from 'react';
import { IconClose } from './icons';

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * نافذة معلومات عامة (عن حُجَّة / المصادر / تواصل معنا).
 * لوحة منزلقة من الأسفل على الجوال، ومتمركزة على الشاشات الأوسع،
 * ولا تؤثر على حالة المحادثة خلفها عند الإغلاق.
 */
export function InfoModal({ title, open, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 backdrop-blur-[1px]
                 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        dir="rtl"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="modal-rise flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl
                   border border-ink-line bg-ink-panel shadow-xl
                   sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-line px-4 py-3.5">
          <h2 className="text-[15px] font-bold text-ink-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn !rounded-full !border-0 !p-1.5 text-ink-muted hover:text-ink-text"
            aria-label="إغلاق"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="prose-ar overflow-y-auto px-4 py-4 text-[13.5px] leading-7 text-ink-text">
          {children}
        </div>
      </div>
    </div>
  );
}
