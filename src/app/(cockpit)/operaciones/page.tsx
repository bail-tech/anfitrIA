import { Brush, CalendarClock, Check, Trash2, UserPlus, Wrench } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Badge, buttonClass, Card, Empty, inputClass, PageHeader } from '@/components/ui';
import { requireSession } from '@/lib/supabase/server';
import type { Staff, Task } from '@/lib/types';
import { addStaff, createTask, planTurnovers, removeStaff, setTaskStatus } from '../actions';

export const metadata = { title: 'Operaciones' };

export default async function OperationsPage() {
  const { db } = await requireSession();
  const t = await getTranslations('operations');
  const [{ data: open }, { data: done }, { data: staffRows }, { data: props }] = await Promise.all([
    db.from('tasks').select('*').eq('status', 'open').order('due_at', { nullsFirst: false }),
    db.from('tasks').select('*').eq('status', 'done').order('due_at', { ascending: false }).limit(10),
    db.from('staff').select('*').order('name'),
    db.from('properties').select('id, name'),
  ]);
  const staff = (staffRows ?? []) as Staff[];
  const sname = new Map(staff.map((s) => [s.id, s.name]));
  const pname = new Map((props ?? []).map((p) => [p.id, p.name]));

  const TaskRow = ({ task }: { task: Task }) => (
    <li className="flex items-start gap-3 py-3 text-sm">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-sand">{task.kind === 'turnover' ? <Brush className="size-4 text-terra" /> : <Wrench className="size-4 text-muted" />}</span>
      <div className="flex-1">
        <div className="font-medium">{task.title}</div>
        <div className="text-xs text-muted">
          {task.property_id ? pname.get(task.property_id) : ''} {task.due_at ? `· ${task.due_at.slice(0, 16).replace('T', ' ')}` : ''}
          {task.window_minutes ? ` · ${t('window')} ${Math.floor(task.window_minutes / 60)}h${String(task.window_minutes % 60).padStart(2, '0')}` : ''}
          {task.staff_id ? ` · ${sname.get(task.staff_id)}` : ''}
        </div>
        {task.notes && <p className="mt-1 text-xs">{task.notes}</p>}
      </div>
      {task.notes?.includes('⚠') && <Badge tone="terra">{t('conflict')}</Badge>}
      {task.status === 'open' && (
        <form action={setTaskStatus}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="status" value="done" />
          <button className={buttonClass('ghost', 'sm')}>
            <Check /> {t('markDone')}
          </button>
        </form>
      )}
    </li>
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <form action={planTurnovers}>
            <button className={buttonClass('gold')}>
              <CalendarClock /> {t('plan')}
            </button>
          </form>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card data-anfi="tasks" className="p-4">
            <h2 className="font-medium">
              {t('open')} ({open?.length ?? 0})
            </h2>
            {open?.length ? <ul className="divide-y divide-line">{(open as Task[]).map((task) => <TaskRow key={task.id} task={task} />)}</ul> : <div className="mt-3"><Empty title={t('empty')} /></div>}
            <form action={createTask} data-anfi-form="task" className="mt-3 grid gap-2 rounded-xl bg-sand/40 p-3 md:grid-cols-[1fr_160px_160px_auto]">
              <input name="title" required placeholder={t('title_field')} className={inputClass} />
              <select name="property_id" className={inputClass}>
                <option value="">—</option>
                {(props ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input name="due_at" type="datetime-local" className={inputClass} aria-label={t('due')} />
              <input type="hidden" name="kind" value="maintenance" />
              <button className={buttonClass('primary')}>{t('add')}</button>
            </form>
          </Card>
          {done?.length ? (
            <Card className="p-4 opacity-80">
              <h2 className="font-medium">{t('done')}</h2>
              <ul className="divide-y divide-line">{(done as Task[]).map((task) => <TaskRow key={task.id} task={task} />)}</ul>
            </Card>
          ) : null}
        </div>
        <Card data-anfi="staff" className="h-fit p-4">
          <h2 className="mb-3 font-medium">{t('staff')}</h2>
          <ul className="mb-3 space-y-2 text-sm">
            {staff.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span>
                  {s.name} <span className="text-xs text-muted">· {t(`role_${s.role}`)}</span>
                </span>
                <form action={removeStaff}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-muted hover:text-terra" aria-label="remove">
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addStaff} data-anfi-form="staff" className="space-y-2">
            <input name="name" required placeholder="Nombre" className={inputClass} />
            <input name="phone" placeholder="+34…" className={inputClass} />
            <select name="role" className={inputClass}>
              {(['cleaning', 'maintenance', 'other'] as const).map((r) => (
                <option key={r} value={r}>
                  {t(`role_${r}`)}
                </option>
              ))}
            </select>
            <button className={buttonClass('ghost') + ' w-full'}>
              <UserPlus /> {t('addStaff')}
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
