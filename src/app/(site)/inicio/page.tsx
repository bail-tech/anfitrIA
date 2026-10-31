import { ArrowRight, Mic } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { ANSWERS, LANDING } from '@/lib/marketing/content';

export async function generateMetadata() {
  const c = LANDING[(await getLocale()) === 'en' ? 'en' : 'es'];
  return { title: { absolute: `AnfitrIA · ${c.title.replace(/\.$/, '')}` }, description: c.subtitle };
}

/** The public landing. Visitors without a session see it at "/" (the proxy rewrites to here). */
export default async function LandingPage() {
  const lang = (await getLocale()) === 'en' ? 'en' : 'es';
  const c = LANDING[lang];
  const answers = ANSWERS[lang].slice(0, 3);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AnfitrIA',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: c.subtitle,
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-12 pt-8 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-ink">{c.eyebrow}</p>
          <h1 className="font-display text-4xl font-semibold leading-tight md:text-6xl">{c.title}</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">{c.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signup" className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-ink">
              {c.cta} <ArrowRight className="size-4" />
            </Link>
            <Link href="/login" className="rounded-xl border border-line bg-paper px-5 py-3 font-medium">{c.login}</Link>
          </div>
        </div>
        <Image src="/brand/anfitria-mark.webp" alt="" width={1254} height={1254} priority className="mx-auto w-full max-w-md mix-blend-multiply" />
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col gap-4 rounded-3xl bg-ink p-8 text-cream md:flex-row md:items-center">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand text-ink">
            <Mic className="size-7" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-semibold">{c.voiceTitle}</h2>
            <p className="mt-1 text-cream/80">{c.voiceBody}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <h2 className="mb-6 font-display text-3xl font-semibold">{c.featuresTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.features.map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-line bg-paper p-5">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <h2 className="mb-6 font-display text-3xl font-semibold">{c.stepsTitle}</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {c.steps.map(([title, body], i) => (
            <li key={title} className="rounded-2xl bg-brand-soft/60 p-5">
              <span className="font-mono text-sm text-brand-ink">0{i + 1}</span>
              <h3 className="mt-1 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-ink/75">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <h2 className="mb-6 font-display text-3xl font-semibold">{c.answersTitle}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {answers.map((a) => (
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
  );
}
