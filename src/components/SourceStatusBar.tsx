'use client';

import { SOURCE_LABEL, type SourceStatus, type StageId } from '@/lib/types';
import { IconAlert, IconCheck, IconSearch } from './icons';

const STATUS_TEXT: Record<SourceStatus['status'], string> = {
  ok: 'نتائج متاحة',
  empty: 'لا نتائج',
  error: 'غير متاح',
  timeout: 'انتهت المهلة',
  disabled: 'معطّل',
};

function tone(s: SourceStatus['status']): string {
  if (s === 'ok') return 'text-emerald-600 dark:text-emerald-400 border-emerald-600/30';
  if (s === 'empty') return 'text-ink-muted border-ink-line';
  return 'text-amber-600 dark:text-amber-400 border-amber-600/35';
}

export function SourceStatusBar({
  statuses,
  stage,
  queries,
}: {
  statuses: SourceStatus[];
  stage?: StageId;
  queries?: string[];
}) {
  const pending = stage === 'searching' && statuses.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {pending && (
          <span className="chip">
            <IconSearch className="h-3.5 w-3.5 dot-pulse" />
            جارٍ البحث في المصدرين…
          </span>
        )}

        {statuses.map((s) => (
          <span key={s.source} className={`chip ${tone(s.status)}`} title={s.message ?? undefined}>
            {s.status === 'ok' ? (
              <IconCheck className="h-3.5 w-3.5" />
            ) : s.status === 'empty' ? (
              <IconSearch className="h-3.5 w-3.5" />
            ) : (
              <IconAlert className="h-3.5 w-3.5" />
            )}
            <span className="font-medium text-ink-text">{SOURCE_LABEL[s.source]}</span>
            <span>·</span>
            <span>
              {STATUS_TEXT[s.status]}
              {s.status === 'ok' ? ` (${s.count})` : ''}
            </span>
          </span>
        ))}
      </div>

      {queries && queries.length > 0 && (
        <p className="text-[11px] leading-6 text-ink-muted">
          <span className="font-medium">استعلامات البحث:</span>{' '}
          {queries.map((q, i) => (
            <span key={`${q}-${i}`}>
              {i > 0 && ' · '}
              <code className="rounded bg-ink-line/40 px-1.5 py-0.5 font-sans">{q}</code>
            </span>
          ))}
        </p>
      )}

      {statuses
        .filter((s) => s.message && (s.status === 'error' || s.status === 'timeout'))
        .map((s) => (
          <p key={`msg-${s.source}`} className="text-[11px] leading-5 text-amber-700 dark:text-amber-400">
            {s.message}
          </p>
        ))}
    </div>
  );
}
