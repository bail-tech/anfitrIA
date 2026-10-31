import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { AnfiGuideProvider, AnfiHero, RevealOnScroll } from '@/components/site/anfi-guide';
import { Mock } from '@/components/site/mocks';
import { features } from '@/lib/env';
import { ANSWERS, LANDING } from '@/lib/marketing/content';
import { PITCH } from '@/lib/marketing/pitch';
import { cn } from '@/lib/utils';

export async function generateMetadata() {
  const p = PITCH[(await getLocale()) === 'en' ? 'en' : 'es'];
  return { title: { absolute: `AnfitrIA · ${p.hero.title}` }, description: p.hero.subtitle };
}

/**
 * The public landing, told by Anfi: he greets the visitor, can walk them through every section
 * aloud, and answers their questions. Visitors without a session see it at "/" (proxy rewrite).
 */
export default async function LandingPage() {
  const lang = (await getLocale()) === 'en' ? 'en' : 'es';
  const p = PITCH[lang];
  const c = LANDING[lang];
  const ld = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'AnfitrIA', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description: p.hero.subtitle };
  const sections = p.sections.filter((s) => s.mock !== 'pilot');
  const pilot = p.sections.find((s) => s.mock === 'pilot')!;

  return (
    <AnfiGuideProvider lang={lang} voice={features.openai()}>
      <main>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
        <RevealOnScroll />
        <AnfiHero />

        {sections.map((s, i) => (
          <section key={s.id} className={cn('py-14 md:py-20', i % 2 === 1 && 'bg-sand/40')}>
            <div data-pitch={s.id} data-reveal className={cn('mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2', s.mock === 'trust' || s.mock === 'steps' ? 'md:grid-cols-[0.8fr_1.2fr]' : '')}>
              <div className={cn(i % 2 === 1 && s.mock !== 'trust' && s.mock !== 'steps' && 'md:order-2')}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-ink">{s.eyebrow}</p>
                <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">{s.title}</h2>
                <p className="mt-4 text-lg text-muted">{s.body}</p>
              </div>
              <div className={cn('mx-auto w-full max-w-lg', i % 2 === 1 && s.mock !== 'trust' && s.mock !== 'steps' && 'md:order-1')}>
                <Mock kind={s.mock} lang={lang} />
              </div>
            </div>
          </section>
        ))}

        <section className="px-4 py-16">
          <div data-pitch={pilot.id} className="mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-[2rem] bg-ink px-6 py-12 text-center text-cream md:flex-row md:text-left">
            <Image src="/brand/anfitria-mark.webp" alt="" width={1254} height={1254} className="w-40 shrink-0 animate-bob rounded-3xl bg-cream/95 p-2" />
            <div className="flex-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">{pilot.eyebrow}</p>
              <h2 className="font-display text-3xl font-semibold md:text-4xl">{pilot.title}</h2>
              <p className="mt-3 text-cream/80">{pilot.body}</p>
            </div>
            <Link href="/signup" className="flex shrink-0 items-center gap-2 rounded-xl bg-brand px-6 py-3.5 font-semibold text-ink">
              {p.hero.cta} <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-8">
          <h2 className="mb-6 font-display text-3xl font-semibold">{c.answersTitle}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {ANSWERS[lang].slice(0, 3).map((a) => (
              <Link key={a.slug} href={`/respuestas/${a.slug}`} className="rounded-2xl border border-line bg-paper p-5 hover:border-brand">
                <h3 className="font-semibold">{a.question}</h3>
                <p className="mt-2 line-clamp-4 text-sm text-muted">{a.short}</p>
              </Link>
            ))}
          </div>
          <Link href="/respuestas" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-ink">
            {c.answersCta} <ArrowRight className="size-4" />
          </Link>
        </section>
      </main>
    </AnfiGuideProvider>
  );
}
