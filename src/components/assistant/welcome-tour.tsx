'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { markOnboarded } from '@/app/(cockpit)/actions';

/** The event the dock listens for: run the welcome tour across the app. */
export const APP_TOUR_EVENT = 'anfi:app-tour';

export const startAppTour = () => window.dispatchEvent(new CustomEvent(APP_TOUR_EVENT));

/** Shown once, right after sign-up: Anfi says hello and offers the two-minute tour. */
export function WelcomeTour({ name }: { name: string }) {
  const t = useTranslations('welcome');
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  if (!open) return null;

  const close = (tour: boolean) => {
    setOpen(false);
    start(() => markOnboarded());
    if (tour) startAppTour();
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-paper shadow-2xl">
        <div className="bg-gradient-to-b from-brand-soft to-paper px-6 pt-6">
          <Image src="/brand/anfitria-mark.webp" alt="" width={1254} height={1254} priority className="mx-auto w-40 mix-blend-multiply" />
        </div>
        <div className="space-y-3 px-6 pb-6 text-center">
          <h2 id="welcome-title" className="font-display text-2xl font-semibold">{t('title', { name: name.trim().split(/\s+/)[0] || '' })}</h2>
          <p className="text-muted">{t('body')}</p>
          <ul className="mx-auto max-w-xs space-y-1 text-left text-sm">
            {(['one', 'two', 'three'] as const).map((k) => (
              <li key={k} className="flex gap-2">
                <span className="text-brand-ink">✓</span> {t(`point_${k}`)}
              </li>
            ))}
          </ul>
          <button onClick={() => close(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-semibold text-ink" autoFocus>
            {t('start')} <ArrowRight className="size-4" />
          </button>
          <button onClick={() => close(false)} className="w-full text-sm text-muted hover:text-ink">{t('later')}</button>
        </div>
      </div>
    </div>
  );
}
