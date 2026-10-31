import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';

/** Only the public site is indexable; the cockpit, guest links and APIs are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: ['/', '/inicio', '/respuestas', '/anfi'], disallow: ['/api/', '/checkin/', '/bandeja', '/ajustes', '/registros'] },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
