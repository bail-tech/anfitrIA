import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { ANSWERS, LANDING } from '@/lib/marketing/content';

export async function generateMetadata() {
  return { title: LANDING[(await getLocale()) === 'en' ? 'en' : 'es'].answersTitle };
}

export default async function AnswersPage() {
  const lang = (await getLocale()) === 'en' ? 'en' : 'es';
  const answers = ANSWERS[lang];
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: answers.map((a) => ({ '@type': 'Question', name: a.question, acceptedAnswer: { '@type': 'Answer', text: a.short } })),
  };
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <h1 className="font-display text-4xl font-semibold">{LANDING[lang].answersTitle}</h1>
      <ul className="mt-8 space-y-4">
        {answers.map((a) => (
          <li key={a.slug}>
            <Link href={`/respuestas/${a.slug}`} className="block rounded-2xl border border-line bg-paper p-5 hover:border-brand">
              <h2 className="font-semibold">{a.question}</h2>
              <p className="mt-2 text-sm text-muted">{a.short}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
