'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { askStream } from '@/lib/chat/askClient';
import {
  createConversation,
  loadConversations,
  newId,
  saveConversations,
  upsertMessage,
} from '@/lib/chat/storage';
import {
  STAGE_LABEL,
  type AskResult,
  type ChatMessage,
  type Conversation,
  type Madhhab,
  type SourceStatus,
  type StageId,
} from '@/lib/types';
import { AnswerBlock } from './AnswerBlock';
import { Composer } from './Composer';
import { IconAlert, IconBook, IconMenu, IconQuote, IconSearch } from './icons';
import { InfoMenu } from './InfoMenu';
import { Logo, Wordmark } from './Logo';
import { Sidebar } from './Sidebar';
import { SourceStatusBar } from './SourceStatusBar';

const MAX_CHARS = 500;

/** أسئلة افتتاحية تظهر كشرائح أفقية فوق مربع الإدخال مباشرة. */
const EXAMPLES: { q: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { q: 'ما حكم زكاة الذهب؟', Icon: IconBook },
  { q: 'ما الدليل على وجوب صلاة الجماعة؟', Icon: IconSearch },
  { q: 'ما حكم البيع بالتقسيط؟', Icon: IconBook },
  { q: 'ما قاله العلماء في مسألة رفع اليدين في الصلاة؟', Icon: IconQuote },
];

interface Live {
  stage: StageId | null;
  queries: string[];
  statuses: SourceStatus[];
}

const EMPTY_LIVE: Live = { stage: null, queries: [], statuses: [] };

export function ChatShell({ devFixtures = false }: { devFixtures?: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [madhhab, setMadhhab] = useState<Madhhab>('all');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Live>(EMPTY_LIVE);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* ——— تحميل المحادثات ——— */
  useEffect(() => {
    const list = loadConversations();
    setConversations(list);
    setActiveId(list[0]?.id ?? null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveConversations(conversations);
  }, [conversations, hydrated]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const messages = active?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, live.stage]);

  /* ——— إدارة المحادثات ——— */
  const handleNew = useCallback(() => {
    abortRef.current?.abort();
    setBusy(false);
    setLive(EMPTY_LIVE);
    setActiveId(null);
    setInput('');
    setSidebarOpen(false);
  }, []);

  const handleSelect = useCallback((id: string) => {
    abortRef.current?.abort();
    setBusy(false);
    setLive(EMPTY_LIVE);
    setActiveId(id);
    setSidebarOpen(false);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (id === activeId) {
          abortRef.current?.abort();
          setBusy(false);
          setLive(EMPTY_LIVE);
          setActiveId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [activeId],
  );

  /* ——— إرسال السؤال ——— */
  const send = useCallback(
    async (questionRaw: string) => {
      const question = questionRaw.trim();
      if (question.length < 3 || busy) return;

      let conv = active;
      if (!conv) {
        conv = createConversation();
        setConversations((prev) => [conv!, ...prev]);
        setActiveId(conv.id);
      }
      const convId = conv.id;

      const userMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        content: question,
        madhhab,
        createdAt: Date.now(),
      };

      const history = conv.messages
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: m.role === 'user' ? (m.content ?? '') : (m.result?.answer ?? ''),
        }))
        .filter((m) => m.content.length > 0);

      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? upsertMessage(c, userMsg) : c)),
      );
      setInput('');
      setBusy(true);
      setLive({ stage: 'analyzing', queries: [], statuses: [] });

      const controller = new AbortController();
      abortRef.current = controller;

      let finalResult: AskResult | null = null;
      let errorMsg: string | null = null;

      try {
        await askStream({ question, madhhab, history }, (ev) => {
          if (ev.type === 'stage') setLive((l) => ({ ...l, stage: ev.stage }));
          else if (ev.type === 'queries') setLive((l) => ({ ...l, queries: ev.queries }));
          else if (ev.type === 'source')
            setLive((l) => ({
              ...l,
              statuses: [ev.status],
            }));
          else if (ev.type === 'result') finalResult = ev.result;
          else if (ev.type === 'error') errorMsg = ev.message;
        }, controller.signal);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          errorMsg = 'انقطع الاتصال بالخادم أثناء البحث.';
        }
      }

      if (controller.signal.aborted) {
        setBusy(false);
        setLive(EMPTY_LIVE);
        return;
      }

      const assistantMsg: ChatMessage = {
        id: newId(),
        role: 'assistant',
        result: finalResult ?? undefined,
        error: finalResult ? undefined : (errorMsg ?? 'تعذّر إكمال البحث.'),
        createdAt: Date.now(),
      };

      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? upsertMessage(c, assistantMsg) : c)),
      );
      setBusy(false);
      setLive(EMPTY_LIVE);
      abortRef.current = null;
    },
    [active, busy, madhhab],
  );

  const isEmpty = messages.length === 0 && !busy;

  return (
    <div className="flex h-dvh overflow-hidden bg-ink-bg">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={handleNew}
        onSelect={handleSelect}
        onDelete={handleDelete}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {devFixtures && (
          <div
            className="border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-center text-[11.5px]
                       font-semibold leading-5 text-amber-900 dark:text-amber-200"
            role="status"
          >
            ⚠️ وضع التطوير: نتائج «تراث» مقروءة من ملف محفوظ لا من الشبكة. هذا الوضع معطّل في الإنتاج.
          </div>
        )}
        {/* شريط علوي للجوال */}
        <header className="grid grid-cols-3 items-center gap-2 border-b border-ink-line px-3 py-2.5 md:hidden">
          <div className="flex items-center justify-self-start gap-1.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="btn !px-2.5 !py-2"
              aria-label="فتح قائمة المحادثات"
            >
              <IconMenu className="h-4 w-4" />
            </button>
            <InfoMenu />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Logo size={22} />
            <Wordmark className="text-sm" />
          </div>
          <div aria-hidden="true" />
        </header>

        {/* شريط علوي للشاشات الأوسع: قائمة «المزيد» فقط */}
        <div className="hidden items-center justify-start border-b border-ink-line px-4 py-2 md:flex">
          <InfoMenu />
        </div>

        {isEmpty ? (
          /* ——— الشاشة الأولى ——— */
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
            <div className="w-full max-w-2xl">
              <div className="mb-8 text-center">
                <div className="mb-4 flex justify-center">
                  <Logo size={56} />
                </div>
                <h1 className="text-3xl">
                  <Wordmark />
                </h1>
                <p className="mx-auto mt-2 max-w-lg text-[12.5px] leading-6 text-ink-muted">
                  الذكاء الاصطناعي للتحقق العلمي والبحث في المراجع الإسلامية
                </p>
              </div>

              {/* أسئلة افتتاحية: شريط شرائح أفقي فوق مربع الإدخال مباشرة */}
              <div
                className="suggest-row mb-2.5 flex items-center gap-2 pb-1"
                role="group"
                aria-label="أسئلة مقترحة"
              >
                {EXAMPLES.map(({ q, Icon }) => (
                  <button key={q} type="button" onClick={() => setInput(q)} className="suggest-chip">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-ink-accent/75" aria-hidden="true" />
                    <span>{q}</span>
                  </button>
                ))}
              </div>

              <Composer
                value={input}
                onChange={setInput}
                madhhab={madhhab}
                onMadhhabChange={setMadhhab}
                onSubmit={() => void send(input)}
                busy={busy}
                maxChars={MAX_CHARS}
              />

              <p className="mt-8 text-center text-[11px] leading-6 text-ink-muted">
                حُجَّة أداة بحث وتوثيق، لا يُصدر فتوى ولا يرجّح بين الأقوال. راجع المصدر الأصلي في سياقه قبل
                الاعتماد عليه.
              </p>
            </div>
          </div>
        ) : (
          /* ——— المحادثة ——— */
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="flex justify-start">
                      <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-ink-accent/10 px-4 py-3">
                        <p className="prose-ar text-[15px] font-medium">{m.content}</p>
                        {m.madhhab && m.madhhab !== 'all' && (
                          <p className="mt-1.5 text-[11px] text-ink-muted">
                            فلتر المذهب مُفعّل في هذا السؤال
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id}>
                      {m.result ? (
                        <AnswerBlock result={m.result} />
                      ) : (
                        <div
                          className="flex gap-2.5 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3.5
                                     text-[13px] leading-6 text-red-700 dark:text-red-300"
                          role="alert"
                        >
                          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          <p>{m.error}</p>
                        </div>
                      )}
                    </div>
                  ),
                )}

                {busy && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[13px] text-ink-muted">
                      <span className="flex gap-1" aria-hidden="true">
                        <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-ink-accent" />
                        <span
                          className="dot-pulse h-1.5 w-1.5 rounded-full bg-ink-accent"
                          style={{ animationDelay: '0.2s' }}
                        />
                        <span
                          className="dot-pulse h-1.5 w-1.5 rounded-full bg-ink-accent"
                          style={{ animationDelay: '0.4s' }}
                        />
                      </span>
                      <span>{live.stage ? STAGE_LABEL[live.stage] : 'جارٍ العمل…'}</span>
                    </div>
                    <SourceStatusBar
                      statuses={live.statuses}
                      stage={live.stage ?? undefined}
                      queries={live.queries}
                    />
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </div>

            <div className="border-t border-ink-line bg-ink-bg/90 px-4 py-3 backdrop-blur">
              <div className="mx-auto w-full max-w-3xl">
                <Composer
                  value={input}
                  onChange={setInput}
                  madhhab={madhhab}
                  onMadhhabChange={setMadhhab}
                  onSubmit={() => void send(input)}
                  busy={busy}
                  maxChars={MAX_CHARS}
                  compact
                />
                <p className="mt-2 text-center text-[10.5px] text-ink-muted">
                  الإجابات مبنية على مقاطع مسترجَعة من مكتبة تراث. راجع المصدر الأصلي قبل الاعتماد.
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
