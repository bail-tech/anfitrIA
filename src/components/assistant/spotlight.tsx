'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AnfiUi } from './use-anfi-ui';

type Rect = { top: number; left: number; width: number; height: number };
/** A step with nothing to point at: the card sits in the middle of a dimmed screen. */
const CENTER = 'center' as const;
const PAD = 8;
const CARD_W = 320;

/** Dims the page around the section Anfi points at, with a note card. Esc or any click closes it. */
export function Spotlight({ ui }: { ui: AnfiUi }) {
  const t = useTranslations('assistant');
  const { spot, exit } = ui;
  const [rect, setRect] = useState<Rect | typeof CENTER | null>(null);

  // Scroll the section into view, then follow it every frame (scroll, resize, layout shifts).
  useEffect(() => {
    if (!spot) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && exit();
    window.addEventListener('keydown', onKey);
    const el = spot.selector ? document.querySelector(spot.selector) : null;
    if (!el) {
      // Nothing to measure: show the centred card straight away (no frame needed).
      let live = true;
      queueMicrotask(() => live && setRect(CENTER));
      return () => {
        live = false;
        window.removeEventListener('keydown', onKey);
        setRect(null);
      };
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    let raf = 0;
    let last = '';
    const track = () => {
      const r = el.getBoundingClientRect();
      const key = `${r.top}|${r.left}|${r.width}|${r.height}`;
      if (key !== last) {
        last = key;
        setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
      }
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      setRect(null);
    };
  }, [spot, exit]);

  if (!spot || !rect) return null;
  const centered = rect === CENTER;
  const below = !centered && rect.top + rect.height + 180 < window.innerHeight;
  const cardTop = centered ? Math.max(12, window.innerHeight / 2 - 110) : below ? rect.top + rect.height + 12 : Math.max(12, rect.top - 12 - 170);
  const cardLeft = centered ? Math.max(12, window.innerWidth / 2 - CARD_W / 2) : Math.min(Math.max(12, rect.left), window.innerWidth - CARD_W - 12);

  return createPortal(
    <div className="fixed inset-0 z-[60]" onClick={ui.exit} role="presentation">
      {centered ? (
        <div className="pointer-events-none fixed inset-0 bg-[rgba(43,38,32,0.45)]" />
      ) : (
        <div
          className="pointer-events-none fixed rounded-2xl ring-2 ring-brand motion-safe:transition-all motion-safe:duration-300"
          style={{ ...rect, boxShadow: '0 0 0 9999px rgba(43,38,32,0.45)' }}
        />
      )}
      <div
        role="dialog"
        aria-live="polite"
        onClick={(e) => e.stopPropagation()}
        className="fixed rounded-2xl border border-line bg-paper p-4 text-sm text-ink shadow-2xl motion-safe:transition-all motion-safe:duration-300"
        style={{ top: cardTop, left: cardLeft, width: `min(${CARD_W}px, calc(100vw - 24px))` }}
      >
        <div className="mb-1 flex items-center gap-2 font-medium">
          <Sparkles className="size-4 text-brand" /> {spot.title}
          {spot.step && <span className="ml-auto font-mono text-xs text-muted">{spot.step.index + 1}/{spot.step.total}</span>}
        </div>
        {spot.note && <p className="text-muted">{spot.note}</p>}
        <div className="mt-3 flex justify-end gap-2 text-xs">
          {spot.step ? (
            <>
              <button onClick={ui.exit} className="rounded-lg px-2.5 py-1.5 hover:bg-sand">{t('tourExit')}</button>
              {spot.step.index > 0 && <button onClick={ui.back} className="rounded-lg border border-line px-2.5 py-1.5 hover:bg-sand">{t('tourBack')}</button>}
              <button onClick={ui.next} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-ink" autoFocus>
                {spot.step.index + 1 < spot.step.total ? t('tourNext') : t('tourDone')}
              </button>
            </>
          ) : (
            <button onClick={ui.exit} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-ink" autoFocus>{t('tourOk')}</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
