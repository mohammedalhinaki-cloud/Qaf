'use client';

import type { ChatMessage, Conversation } from '@/lib/types';

/**
 * تخزين المحادثات محليًا في المتصفح (localStorage).
 * لا حسابات ولا خادم ولا إرسال لأي بيانات شخصية.
 */

const KEY = 'hujjah.conversations.v1';
/** مفتاح الاسم السابق — يُقرأ مرة واحدة فقط لترحيل محادثات المستخدمين القدامى. */
const LEGACY_KEY = 'maoun.conversations.v1';
const MAX_CONVERSATIONS = 60;

function canUse(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * ترحيل النتائج المخزَّنة من نسخ قديمة: يُبقي أدلة وحالات مصدر «تراث» فقط
 * (كانت نسخ سابقة تعرض نتائج من مصادر أُزيلت لاحقًا)، ويحذف الحقول
 * التي لم تعد مستخدمة. يعمل على البيانات المحلية كما هي دون فقدان المحادثات.
 */
function migrateResult(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const r = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(r.sourceStatus)) {
    r.sourceStatus = r.sourceStatus.filter(
      (s) => typeof s === 'object' && s !== null && (s as { source?: unknown }).source === 'turath',
    );
  }
  if (Array.isArray(r.evidence)) {
    r.evidence = r.evidence.filter(
      (e) => typeof e === 'object' && e !== null && (e as { source?: unknown }).source === 'turath',
    );
  }
  delete r.sources; // قسم «المصادر» المنفصل أُستبدل بالاستشهادات داخل النص
  return r;
}

function migrateConversation(c: Conversation): Conversation {
  if (!Array.isArray(c.messages)) return c;
  return {
    ...c,
    messages: c.messages.map((m) =>
      m && m.role === 'assistant' && m.result
        ? { ...m, result: migrateResult(m.result) as typeof m.result }
        : m,
    ),
  };
}

export function loadConversations(): Conversation[] {
  if (!canUse()) return [];
  try {
    let raw = window.localStorage.getItem(KEY);
    if (!raw) {
      // ترحيل من المفتاح السابق (قبل تغيير الاسم) دون فقدان محادثات المستخدم.
      const legacy = window.localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        window.localStorage.setItem(KEY, legacy);
        window.localStorage.removeItem(LEGACY_KEY);
        raw = legacy;
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Conversation[])
      .filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages))
      .map(migrateConversation)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]): void {
  if (!canUse()) return;
  try {
    const trimmed = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* قد تمتلئ المساحة — نتجاهل بصمت ولا نكسر الواجهة */
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** عنوان تلقائي من السؤال الأول. */
export function titleFromQuestion(q: string): string {
  const clean = q.replace(/\s+/g, ' ').trim();
  if (clean.length <= 42) return clean || 'محادثة جديدة';
  return `${clean.slice(0, 42).trimEnd()}…`;
}

export function createConversation(): Conversation {
  const now = Date.now();
  return { id: newId(), title: 'محادثة جديدة', messages: [], createdAt: now, updatedAt: now };
}

export function upsertMessage(conv: Conversation, message: ChatMessage): Conversation {
  const idx = conv.messages.findIndex((m) => m.id === message.id);
  const messages =
    idx >= 0
      ? conv.messages.map((m) => (m.id === message.id ? message : m))
      : [...conv.messages, message];

  const firstUser = messages.find((m) => m.role === 'user');
  const title =
    conv.title === 'محادثة جديدة' && firstUser?.content
      ? titleFromQuestion(firstUser.content)
      : conv.title;

  return { ...conv, messages, title, updatedAt: Date.now() };
}
