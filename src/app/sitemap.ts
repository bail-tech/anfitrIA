import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';
import { ANSWERS } from '@/lib/marketing/content';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/respuestas`, changeFrequency: 'weekly', priority: 0.8 },
    ...[...ANSWERS.es, ...ANSWERS.en].map((a) => ({ url: `${base}/respuestas/${a.slug}`, changeFrequency: 'monthly' as const, priority: 0.6 })),
  ];
}
