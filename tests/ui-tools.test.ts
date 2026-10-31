import { describe, expect, it } from 'vitest';
import type { AssistantEvent, ToolContext } from '@/lib/assistant/tools';
import { uiTools, type PageContext } from '@/lib/assistant/ui-tools';

function setup(path = '/', locale = 'es') {
  const events: AssistantEvent[] = [];
  const ctx = { emit: (e: AssistantEvent) => events.push(e) } as unknown as ToolContext;
  const tools = Object.fromEntries(uiTools(ctx, { path } satisfies PageContext, locale).map((t) => [t.name, t]));
  const call = (name: string, input: unknown) => tools[name].run(input as never) as Promise<string>;
  const ui = () => events.flatMap((e) => (e.type === 'ui' ? [e.action] : []));
  return { call, ui };
}

describe('Anfi UI tools', () => {
  it('knows the current page from the path', async () => {
    const { call } = setup('/bandeja/7');
    const here = JSON.parse(await call('where_am_i', {}));
    expect(here).toMatchObject({ page: 'conversation', id: 7, title: 'Conversación' });
  });

  it('navigates only to registry routes, with ids when needed', async () => {
    const { call, ui } = setup('/');
    expect(await call('navigate', { page: 'conversation' })).toMatch(/^Error/);
    await call('navigate', { page: 'inbox' });
    await call('navigate', { page: 'conversation', id: 42 });
    expect(ui()).toEqual([
      { kind: 'navigate', path: '/bandeja', title: 'Bandeja' },
      { kind: 'navigate', path: '/bandeja/42', title: 'Conversación' },
    ]);
  });

  it('highlights only sections of the page the host is on (after navigating)', async () => {
    const { call, ui } = setup('/', 'en');
    expect(await call('highlight', { section: 'list', note: 'x' })).toMatch(/^Error/);
    await call('navigate', { page: 'reservations' });
    await call('highlight', { section: 'list', note: 'Your bookings' });
    expect(ui().at(-1)).toEqual({ kind: 'highlight', path: '/reservas', section: 'list', title: 'Bookings', note: 'Your bookings' });
  });

  it('tours a page section by section', async () => {
    const { call, ui } = setup('/');
    await call('start_tour', { page: 'agents' });
    const tour = ui().at(-1);
    expect(tour).toMatchObject({ kind: 'tour', path: '/agentes' });
    expect(tour?.kind === 'tour' && tour.steps.map((s) => s.section)).toEqual(['approvals', 'agents']);
  });

  it('prefills only allowed fields, only on the right page, and never submits', async () => {
    const { call, ui } = setup('/');
    expect(await call('prefill', { form: 'reservation', fields: { guest_name: 'Ana' } })).toMatch(/Navigate there first/);
    await call('navigate', { page: 'reservations' });
    const result = await call('prefill', { form: 'reservation', fields: { guest_name: 'Ana', guests: 2, consent: 'on', property_id: '9' } });
    expect(result).toMatch(/Nothing was saved or sent/);
    expect(ui().at(-1)).toEqual({ kind: 'prefill', path: '/reservas', form: 'reservation', fields: { guest_name: 'Ana', guests: '2', property_id: '9' } });
  });
});
