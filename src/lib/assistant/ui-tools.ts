/**
 * Anfi's UI tools. They only describe what the browser should do (a `ui` event); the dock runs
 * it. Pages and sections come from the registry, never from the model, and nothing here can
 * press a button that acts: prefill fills a form and the host submits it.
 */
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { describe, FORMS, lang, pageByKey, pageForPath, PAGES, routeFor, type FormId, type GuidePage } from './guide';
import type { ToolContext } from './tools';

export interface PageContext {
  path: string;
  /** data-anfi section ids the browser found on screen. */
  sections?: string[];
}

export type TourStep = { section: string; title: string; note: string };

export type UiAction =
  | { kind: 'navigate'; path: string; title: string }
  | { kind: 'highlight'; path: string; section: string; title: string; note: string }
  | { kind: 'tour'; path: string; title: string; steps: TourStep[] }
  | { kind: 'prefill'; path: string; form: FormId; fields: Record<string, string> };

const PAGE_KEYS = PAGES.map((p) => p.key) as [string, ...string[]];
const FORM_IDS = Object.keys(FORMS) as [FormId, ...FormId[]];
const json = (v: unknown) => JSON.stringify(v, null, 1);

let seq = 0;
function emitUi(ctx: ToolContext, name: string, action: UiAction) {
  const id = `u${++seq}`;
  ctx.emit({ type: 'tool', id, name, status: 'running' });
  ctx.emit({ type: 'ui', action });
  ctx.emit({ type: 'tool', id, name, status: 'ok' });
}

export function uiTools(ctx: ToolContext, page: PageContext | undefined, locale: string) {
  const i = lang(locale);
  // Where the host is, updated by navigate within this run so later steps target the new page.
  let current: { path: string; page: GuidePage | null; id?: number } = (() => {
    const path = page?.path ?? '/';
    const found = pageForPath(path);
    return { path, page: found?.page ?? null, id: found?.id };
  })();
  const onScreen = page?.sections;

  const goTo = (key: string, id?: number): string | null => {
    const path = routeFor(key, id);
    if (!path) return null;
    if (path !== current.path) {
      const target = pageByKey(key)!;
      emitUi(ctx, 'navigate', { kind: 'navigate', path, title: target.title[i] });
      current = { path, page: target, id };
    }
    return path;
  };

  return [
    betaZodTool({
      name: 'where_am_i',
      description: 'The cockpit page the host is looking at right now, its sections and what they are for. Use it before answering "what is this?" or "where am I?".',
      inputSchema: z.object({}),
      run: async () => {
        if (!current.page) return json({ path: current.path, known: false });
        return json({ ...describe(current.page, locale), path: current.path, id: current.id, sections_on_screen: onScreen });
      },
    }),
    betaZodTool({
      name: 'explain_page',
      description: 'Purpose, sections and typical tasks of a cockpit page (the current one if no page is given). Explain the app only from this, never from guesses.',
      inputSchema: z.object({ page: z.enum(PAGE_KEYS).optional() }),
      run: async ({ page: key }) => {
        const p = key ? pageByKey(key) : current.page;
        return p ? json(describe(p, locale)) : json({ error: 'Unknown page', pages: PAGE_KEYS });
      },
    }),
    betaZodTool({
      name: 'navigate',
      description:
        'Open a cockpit page for the host. Pages: overview, inbox, conversation (id = conversation id), properties, property (id = property id), reservations, journey (scheduled guest messages), registrations (SES guest registration), operations, simulator, agents, settings, audit. Take ids only from other tool results.',
      inputSchema: z.object({ page: z.enum(PAGE_KEYS), id: z.number().int().positive().optional() }),
      run: async ({ page: key, id }) => {
        const path = goTo(key, id);
        return path ? `Opened ${path}. The host now sees: ${pageByKey(key)!.title[i]}.` : `Error: "${key}" needs a valid id from a tool result.`;
      },
    }),
    betaZodTool({
      name: 'highlight',
      description: 'Scroll to a section of the current page and spotlight it with a short note (one sentence, in the host\'s language). Section ids come from where_am_i or explain_page.',
      inputSchema: z.object({ section: z.string(), note: z.string().max(240) }),
      run: async ({ section, note }) => {
        const s = current.page?.sections.find((x) => x.id === section);
        if (!s || !current.page) return `Error: no section "${section}" on this page. Sections: ${current.page?.sections.map((x) => x.id).join(', ') ?? 'none'}.`;
        emitUi(ctx, 'highlight', { kind: 'highlight', path: current.path, section, title: s.name[i], note });
        return `Highlighted "${s.name[i]}" on screen.`;
      },
    }),
    betaZodTool({
      name: 'start_tour',
      description:
        'A guided tour of a page (the current one if none): the dock spotlights each section in turn and narrates it, with Next and Exit. Opens the page first if needed. After calling it, say one short intro sentence only; the tour narrates itself.',
      inputSchema: z.object({ page: z.enum(PAGE_KEYS).optional(), id: z.number().int().positive().optional() }),
      run: async ({ page: key, id }) => {
        const target = key ? pageByKey(key) : current.page;
        if (!target) return `Error: unknown page. Pages: ${PAGE_KEYS.join(', ')}.`;
        const path = key ? goTo(target.key, id ?? (target.key === current.page?.key ? current.id : undefined)) : current.path;
        if (!path) return `Error: "${target.key}" needs a valid id from a tool result.`;
        const steps = target.sections.map((s) => ({ section: s.id, title: s.name[i], note: s.actions ? `${s.shows[i]} ${s.actions[i]}` : s.shows[i] }));
        emitUi(ctx, 'start_tour', { kind: 'tour', path, title: target.title[i], steps });
        return `Tour of ${target.title[i]} started with ${steps.length} steps: ${steps.map((s) => s.title).join(', ')}.`;
      },
    }),
    betaZodTool({
      name: 'prefill',
      description:
        'Fill a form on screen for the host to review. It never submits: the host presses the button. Forms: reply (fields: text) on a conversation page; reservation (guest_name, guest_ref, check_in, check_out YYYY-MM-DD, guests, nightly_rate, source direct|booking|airbnb|other) on reservations; knowledge (category, content) on a property page. Navigate there first.',
      inputSchema: z.object({ form: z.enum(FORM_IDS), fields: z.record(z.string(), z.union([z.string(), z.number()])) }),
      run: async ({ form, fields }) => {
        const spec = FORMS[form];
        if (current.page?.key !== spec.page) return `Error: the ${form} form is on the "${spec.page}" page. Navigate there first.`;
        const allowed = new Set<string>(spec.fields);
        const clean = Object.fromEntries(
          Object.entries(fields)
            .filter(([k]) => allowed.has(k))
            .map(([k, v]) => [k, String(v).slice(0, 4000)]),
        );
        if (!Object.keys(clean).length) return `Error: no valid fields. Fields: ${spec.fields.join(', ')}.`;
        emitUi(ctx, 'prefill', { kind: 'prefill', path: current.path, form, fields: clean });
        return `Filled ${Object.keys(clean).join(', ')}. Nothing was saved or sent: tell the host to review it and press the button themselves.`;
      },
    }),
  ];
}
