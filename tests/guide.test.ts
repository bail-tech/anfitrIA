import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMS, PAGES, pageForPath, routeFor } from '@/lib/assistant/guide';

const SRC = path.resolve(import.meta.dirname, '../src');
const COCKPIT = path.join(SRC, 'app/(cockpit)');

function allSources(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((e) => (e.isDirectory() ? allSources(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? readFileSync(path.join(dir, e.name), 'utf8') : ''))
    .join('\n');
}

describe('page registry', () => {
  it('every registered section exists on its page', () => {
    for (const page of PAGES) {
      const source = readFileSync(path.join(COCKPIT, page.file), 'utf8');
      for (const section of page.sections) expect(source, `${page.key}#${section.id}`).toContain(`data-anfi="${section.id}"`);
    }
  });

  it('every prefillable form is marked in the code', () => {
    const sources = allSources(SRC);
    for (const id of Object.keys(FORMS)) expect(sources).toContain(`data-anfi-form="${id}"`);
  });

  it('keys and section ids are unique', () => {
    expect(new Set(PAGES.map((p) => p.key)).size).toBe(PAGES.length);
    for (const p of PAGES) expect(new Set(p.sections.map((s) => s.id)).size).toBe(p.sections.length);
  });

  it('maps paths to pages', () => {
    expect(pageForPath('/')?.page.key).toBe('overview');
    expect(pageForPath('/bandeja/42')).toMatchObject({ page: { key: 'conversation' }, id: 42 });
    expect(pageForPath('/reservas/')?.page.key).toBe('reservations');
    expect(pageForPath('/nope')).toBeNull();
  });

  it('only builds cockpit routes', () => {
    expect(routeFor('inbox')).toBe('/bandeja');
    expect(routeFor('property', 3)).toBe('/alojamientos/3');
    expect(routeFor('property')).toBeNull();
    expect(routeFor('property', -1)).toBeNull();
    expect(routeFor('https://evil.example')).toBeNull();
  });
});
