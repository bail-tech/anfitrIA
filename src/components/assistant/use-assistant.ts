'use client';

import { useCallback, useRef, useState } from 'react';
import { nowMs } from '@/components/blemi/clock';
import type { AssistantEvent } from '@/lib/assistant/tools';
import type { Proposal } from '@/lib/types';

/** What the dock shows and what Anfi's face mirrors. Driven only by server events. */
export type AssistantState = 'idle' | 'thinking' | 'working' | 'approval' | 'done' | 'error';

export type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'tool'; toolId: string; name: string; status: 'running' | 'ok' | 'error'; detail?: string }
  | { id: string; kind: 'proposal'; proposal: Proposal }
  | { id: string; kind: 'notice'; text: string; tone: 'info' | 'error' };

let seq = 0;
const nextId = () => `c${++seq}`;

export function useAssistant(welcome: string, locale: string) {
  const [items, setItems] = useState<ChatItem[]>([{ id: nextId(), kind: 'assistant', text: welcome }]);
  const [state, setState] = useState<AssistantState>('idle');
  const [busy, setBusy] = useState(false);
  /** For Blemi's screens: the tool running right now, and until when a reply is being "spoken". */
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [talkingUntil, setTalkingUntil] = useState(0);
  const history = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  /** Proposal cards still waiting for the host's tap. */
  const pending = useRef(new Set<string>());

  const onEvent = useCallback((e: AssistantEvent, collect: string[]) => {
    switch (e.type) {
      case 'text':
        collect.push(e.text);
        setTalkingUntil(nowMs() + Math.min(6000, 60 * e.text.length));
        setItems((list) => [...list, { id: nextId(), kind: 'assistant', text: e.text }]);
        break;
      case 'tool':
        setState(e.status === 'running' ? 'working' : 'thinking');
        setActiveTool(e.status === 'running' ? e.name : null);
        setItems((list) => {
          const existing = list.find((i) => i.kind === 'tool' && i.toolId === e.id);
          if (existing) return list.map((i) => (i === existing ? { ...i, status: e.status, detail: e.detail } : i));
          return [...list, { id: nextId(), kind: 'tool', toolId: e.id, name: e.name, status: e.status, detail: e.detail }];
        });
        break;
      case 'proposal':
        pending.current.add(e.proposal.id);
        setItems((list) => [...list, { id: nextId(), kind: 'proposal', proposal: e.proposal }]);
        break;
      case 'notice':
        setItems((list) => [...list, { id: nextId(), kind: 'notice', text: e.text, tone: e.key === 'no_claude' ? 'info' : 'error' }]);
        if (e.key !== 'no_claude') setState('error');
        break;
      case 'done':
        break;
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      setBusy(true);
      setState('thinking');
      setItems((list) => [...list, { id: nextId(), kind: 'user', text: content }]);
      history.current.push({ role: 'user', content });
      const collected: string[] = [];
      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.current.slice(-20), locale }),
        });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6)) as AssistantEvent, collected);
          }
        }
        if (collected.length) history.current.push({ role: 'assistant', content: collected.join('\n') });
        setState((s) => (s === 'error' ? s : pending.current.size ? 'approval' : 'done'));
      } catch {
        setItems((list) => [...list, { id: nextId(), kind: 'notice', text: 'No pude conectar con el asistente.', tone: 'error' }]);
        setState('error');
      } finally {
        setBusy(false);
        setActiveTool(null);
      }
    },
    [busy, locale, onEvent],
  );

  const decide = useCallback(async (proposalId: string, decision: 'approve' | 'reject', text?: string) => {
    const res = await fetch(`/api/proposals/${proposalId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, text }) });
    const data = (await res.json().catch(() => ({}))) as { proposal?: Proposal; error?: string };
    pending.current.delete(proposalId);
    setItems((list) => {
      const next: ChatItem[] = list.map((i) =>
        i.kind === 'proposal' && i.proposal.id === proposalId
          ? { ...i, proposal: data.proposal ?? { ...i.proposal, status: res.ok ? (decision === 'approve' ? 'applied' : 'rejected') : 'failed' } }
          : i,
      );
      return res.ok ? next : [...next, { id: nextId(), kind: 'notice', text: data.error ?? 'Error', tone: 'error' }];
    });
    setState(pending.current.size ? 'approval' : res.ok ? 'done' : 'error');
    const note = `[El anfitrión ${decision === 'approve' ? 'aprobó' : 'rechazó'} la propuesta ${proposalId}${res.ok ? '' : ' pero falló: ' + (data.error ?? '')}]`;
    history.current.push({ role: 'user', content: note }, { role: 'assistant', content: 'Entendido.' });
  }, []);

  return { items, state, busy, send, decide, activeTool, talkingUntil };
}

export type Assistant = ReturnType<typeof useAssistant>;
