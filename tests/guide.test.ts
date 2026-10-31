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
    // Plain attribute, or an expression that marks only the 'new' instance of a shared form.
    for (const id of Object.keys(FORMS)) expect(sources, id).toMatch(new RegExp(`data-anfi-form=("${id}"|\{[^}]*'${id}'\})`));
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

describe('welcome tour', () => {
  it('only visits registered pages and sections that exist', async () => {
    const { APP_TOUR_PATHS, APP_TOUR_SECTIONS, appTour } = await import('@/lib/assistant/app-tour');
    for (const path of APP_TOUR_PATHS) expect(pageForPath(path), path).not.toBeNull();
    for (const { path, section } of APP_TOUR_SECTIONS) {
      const page = pageForPath(path)!.page;
      expect(page.sections.map((s) => s.id), `${path}#${section}`).toContain(section);
    }
    expect(readFileSync(path.join(SRC, 'components/assistant/ask-anfi.tsx'), 'utf8')).toContain('data-anfi="ask-anfi"');
    const es = appTour('es', 'Lucía Ortega');
    expect(es.steps[0].title).toBe('¡Hola, Lucía! Soy Anfi 👋');
    expect(appTour('en', '').steps[0].title).toBe('Hi there! I’m Anfi 👋');
    expect(es.steps.every((s) => s.path && s.note.length > 20)).toBe(true);
  });
});
