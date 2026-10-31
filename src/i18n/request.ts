import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from './config';

type Messages = Record<string, unknown>;
const isObj = (v: unknown): v is Messages => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Missing keys fall back to Spanish (the source language) instead of showing the raw key. */
function withFallback(base: Messages, messages: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [k, v] of Object.entries(messages)) merged[k] = isObj(merged[k]) && isObj(v) ? withFallback(merged[k] as Messages, v) : v;
  return merged;
}

/**
 * The cockpit has no locale in its URLs: the locale comes from a cookie, then the browser.
 * A page can still ask for one explicitly (the guest check-in page, which has ?lang).
 */
export default getRequestConfig(async ({ locale: requested }) => {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const accept = (await headers()).get('accept-language')?.slice(0, 2);
  const locale: Locale = isLocale(requested) ? requested : isLocale(cookie) ? cookie : isLocale(accept) ? accept : defaultLocale;
  const es: Messages = (await import('./messages/es.json')).default;
  if (locale === 'es') return { locale, messages: es };
  const own: Messages = (await import(`./messages/${locale}.json`)).default;
  return { locale, messages: withFallback(es, own) };
});
