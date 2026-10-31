import Image from 'next/image';
import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { LANDING } from '@/lib/marketing/content';
import { setLocale } from '../(cockpit)/actions';

/** Public pages (landing, answers): no session needed. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const lang = (await getLocale()) === 'en' ? 'en' : 'es';
  const c = LANDING[lang];
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" aria-label="AnfitrIA">
          <Image src="/brand/anfitria-wordmark-480.webp" alt="AnfitrIA" width={480} height={178} priority className="h-auto w-36 mix-blend-multiply" />
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/respuestas" className="hidden px-2 py-1.5 text-muted hover:text-ink sm:block">{c.answersTitle}</Link>
          <form action={setLocale}>
            <input type="hidden" name="locale" value={lang === 'es' ? 'en' : 'es'} />
            <button className="rounded-xl border border-line bg-paper px-2 py-1.5 text-xs font-medium uppercase">{lang === 'es' ? 'EN' : 'ES'}</button>
          </form>
          <Link href="/login" className="px-2 py-1.5 font-medium">{c.login}</Link>
          <Link href="/signup" className="rounded-xl bg-brand px-3 py-1.5 font-semibold text-ink">{c.cta}</Link>
        </nav>
      </header>
      {children}
      <footer className="mt-20 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted">
          <span>{c.footer}</span>
          <span className="flex gap-4">
            <Link href="/respuestas" className="hover:text-ink">{c.answersTitle}</Link>
            <Link href="/anfi" className="hover:text-ink">Anfi</Link>
            <Link href="/login" className="hover:text-ink">{c.login}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
