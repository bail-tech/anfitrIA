import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { ANSWERS, LANDING, type Answer } from '@/lib/marketing/content';

/** An answer in either language, so links keep working whichever language the visitor uses. */
const find = (slug: string): Answer | undefined => ANSWERS.es.find((a) => a.slug === slug) ?? ANSWERS.en.find((a) => a.slug === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = find((await params).slug);
  return a ? { title: a.question, description: a.short } : {};
}

export default async function AnswerPage({ params }: { params: Promise<{ slug: string }> }) {
  const a = find((await params).slug);
  if (!a) notFound();
  const lang = (await getLocale()) === 'en' ? 'en' : 'es';
  const c = LANDING[lang];
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [{ '@type': 'Question', name: a.question, acceptedAnswer: { '@type': 'Answer', text: a.short } }],
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '[data-answer-short]'] },
  };
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Link href="/respuestas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {c.answersTitle}
      </Link>
      <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">{a.question}</h1>
      <p data-answer-short className="mt-5 rounded-2xl bg-brand-soft/60 p-5 text-lg text-ink">{a.short}</p>
      <div className="mt-6 space-y-4 text-ink/85">
        {a.body.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </div>
      <div className="mt-10 flex flex-col items-start gap-3 rounded-2xl border border-line bg-paper p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">{c.title}</p>
        <Link href="/signup" className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 font-semibold text-ink">
          {c.cta} <ArrowRight className="size-4" />
        </Link>
      </div>
    </main>
  );
}
