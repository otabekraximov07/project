import { useEffect, useRef } from 'react';

/** channel '*' means "something may have changed, refresh" (sent after reconnecting). */
export interface ChatEvent { channel: string; kind: 'new' | 'edit' | 'delete' | 'read'; id: number }

type Kind = 'change' | 'chat';
const subs: Record<Kind, Set<(e?: ChatEvent) => void>> = { change: new Set(), chat: new Set() };
let es: EventSource | null = null;
let retry = 0;
let enabled = false; // only while signed in; the stream needs a session

// One stream per tab, shared by every component that listens.
function ensure() {
  if (es || !enabled || !(subs.change.size + subs.chat.size)) return;
  es = new EventSource('/api/events');
  // The browser gives up for good on an HTTP error (e.g. before login); try again ourselves.
  es.onerror = () => {
    if (es?.readyState !== EventSource.CLOSED) return;
    es = null;
    clearTimeout(retry);
    retry = window.setTimeout(ensure, 3000);
  };
  // After a (re)connect, let listeners catch up on what they may have missed while offline.
  es.onopen = () => subs.chat.forEach((cb) => cb({ channel: '*', kind: 'new', id: 0 }));
  es.onmessage = () => subs.change.forEach((cb) => cb());
  es.addEventListener('chat', (e) => {
    const data = JSON.parse((e as MessageEvent).data) as ChatEvent;
    subs.chat.forEach((cb) => cb(data));
  });
}
function release() {
  if (subs.change.size + subs.chat.size) return;
  clearTimeout(retry);
  es?.close();
  es = null;
}

function useSubscription(kind: Kind, cb: (e?: ChatEvent) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const fn = (e?: ChatEvent) => ref.current(e);
    subs[kind].add(fn);
    ensure();
    return () => { subs[kind].delete(fn); release(); };
  }, [kind]);
}

/** Calls `onChange` whenever the server reports a data change (upload, edit, status, note…). */
export function useLiveUpdates(onChange: () => void) {
  const timer = useRef(0);
  const cb = useRef(onChange);
  cb.current = onChange;
  const fire = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => cb.current(), 250); };
  useSubscription('change', fire);
  useEffect(() => {
    // Safety net in case the stream drops (sleeping laptop, proxy timeouts).
    const poll = window.setInterval(fire, 60_000);
    const onFocus = () => document.visibilityState === 'visible' && fire();
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(poll); clearTimeout(timer.current); document.removeEventListener('visibilitychange', onFocus); };
  }, []);
}

/** Calls `onEvent` for chat messages the server sends to this user. */
export function useChatEvents(onEvent: (e: ChatEvent) => void) {
  useSubscription('chat', (e) => e && onEvent(e));
}

/** Turn live updates on after login and off after logout. */
export function setLiveEnabled(on: boolean) {
  enabled = on;
  clearTimeout(retry);
  if (on) ensure();
  else { es?.close(); es = null; }
}
