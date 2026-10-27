'use client';

/**
 * Runs Anfi's UI actions in the browser: open a page, spotlight a section, step through a tour,
 * fill a form. Actions run one at a time, each after the page it targets has loaded. Nothing
 * here submits a form or presses a button.
 */
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { TourStep, UiAction } from '@/lib/assistant/ui-tools';

export interface Spot {
  selector: string;
  title: string;
  note: string;
  step?: { index: number; total: number };
}

const TIMEOUT_MS = 6000;

function waitFor<T>(check: () => T | null | undefined | false): Promise<T | null> {
  const until = Date.now() + TIMEOUT_MS;
  return new Promise((resolve) => {
    const poll = () => {
      const v = check();
      if (v) return resolve(v);
      if (Date.now() > until) return resolve(null);
      window.setTimeout(poll, 100);
    };
    poll();
  });
}

const section = (id: string) => `[data-anfi="${CSS.escape(id)}"]`;

/** Sets a field the way typing would, so React-controlled inputs see the change too. */
function setField(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const NEXT = /^(siguiente|sigue|continúa|continua|adelante|next|continue|go on)$/;
const BACK = /^(atrás|atras|anterior|vuelve|back|previous)$/;
const STOP = /^(para|parar|stop|salir|sal|termina|basta|fin|exit|enough)$/;

export function useAnfiUi({ onNarrate, onMinimize, prefilledLabel }: { onNarrate: (text: string) => void; onMinimize?: () => void; prefilledLabel: string }) {
  const router = useRouter();
  const [spot, setSpot] = useState<Spot | null>(null);
  const tour = useRef<{ steps: TourStep[]; index: number } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const showStep = useCallback(
    (index: number) => {
      const t = tour.current;
      const s = t?.steps[index];
      if (!t || !s) return;
      t.index = index;
      setSpot({ selector: section(s.section), title: s.title, note: s.note, step: { index, total: t.steps.length } });
      onNarrate(`${s.title}. ${s.note}`);
    },
    [onNarrate],
  );

  const exit = useCallback(() => {
    tour.current = null;
    setSpot(null);
  }, []);

  const next = useCallback(() => {
    const t = tour.current;
    if (!t) return;
    if (t.index + 1 < t.steps.length) showStep(t.index + 1);
    else exit();
  }, [exit, showStep]);

  const back = useCallback(() => {
    const t = tour.current;
    if (t && t.index > 0) showStep(t.index - 1);
  }, [showStep]);

  /** "siguiente" / "para" during a tour, typed or spoken, without a round trip to Claude. */
  const command = useCallback(
    (text: string) => {
      if (!tour.current) return false;
      const said = text.toLowerCase().replace(/[¡!¿?.,]/g, '').trim();
      if (NEXT.test(said)) next();
      else if (BACK.test(said)) back();
      else if (STOP.test(said)) exit();
      else return false;
      return true;
    },
    [back, exit, next],
  );

  const run = useCallback(
    (action: UiAction) => {
      queue.current = queue.current
        .then(async () => {
          onMinimize?.();
          if (window.location.pathname !== action.path) {
            setSpot(null);
            router.push(action.path);
            await waitFor(() => window.location.pathname === action.path);
          }
          switch (action.kind) {
            case 'navigate':
              tour.current = null;
              setSpot(null);
              break;
            case 'highlight':
              tour.current = null;
              if (await waitFor(() => document.querySelector(section(action.section)))) setSpot({ selector: section(action.section), title: action.title, note: action.note });
              break;
            case 'tour':
              tour.current = { steps: action.steps, index: 0 };
              if (await waitFor(() => document.querySelector(section(action.steps[0]?.section ?? '')))) showStep(0);
              break;
            case 'prefill': {
              const selector = `[data-anfi-form="${CSS.escape(action.form)}"]`;
              const form = await waitFor(() => document.querySelector<HTMLElement>(selector));
              if (!form) break;
              for (const [name, value] of Object.entries(action.fields)) {
                const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${CSS.escape(name)}"]`);
                if (el && el.type !== 'hidden' && el.type !== 'checkbox') setField(el, value);
              }
              tour.current = null;
              setSpot({ selector, title: prefilledLabel, note: '' });
              break;
            }
          }
        })
        .catch(() => undefined);
    },
    [onMinimize, prefilledLabel, router, showStep],
  );

  return { spot, run, next, back, exit, command };
}

export type AnfiUi = ReturnType<typeof useAnfiUi>;
