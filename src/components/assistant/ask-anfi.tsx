'use client';

import { Mic, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The event the dock listens for: start talking to Anfi about the page on screen. */
export const ASK_EVENT = 'anfi:ask';

/**
 * "Ask Anfi" in every page header: starts a voice call with Anfi (or focuses the chat when voice
 * isn't available). Anfi knows which page is open, so "añade un extra de parking a 15 €" fills
 * the form here for the host to review.
 */
export function AskAnfi() {
  const t = useTranslations('assistant');
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(ASK_EVENT))}
      title={t('askAnfiHint')}
      className="flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-ink shadow-sm hover:bg-brand/90 print:hidden"
    >
      <Sparkles className="size-4" />
      {t('askAnfi')}
      <Mic className="size-3.5 opacity-70" />
    </button>
  );
}
