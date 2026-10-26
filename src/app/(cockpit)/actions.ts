'use server';

/**
 * Server actions for the cockpit forms. All run with the signed-in host's client (RLS scopes
 * them to their organisation) and revalidate the page they change.
 */
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { runOperations } from '@/lib/agents/operations';
import { addKnowledge } from '@/lib/concierge/host';
import { isLocale, LOCALE_COOKIE } from '@/i18n/config';
import { createServerSupabase, requireSession } from '@/lib/supabase/server';
import type { AgentKey } from '@/lib/types';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (f: FormData, k: string) => (f.get(k) ? Number(f.get(k)) : null);

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function setLocale(form: FormData) {
  const locale = str(form, 'locale');
  if (isLocale(locale)) (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
}

// Properties ----------------------------------------------------------------

export async function createProperty(form: FormData) {
  const { db, profile } = await requireSession();
  const name = str(form, 'name');
  if (!name) return;
  const { data } = await db
    .from('properties')
    .insert({ org_id: profile.org_id, owner_id: null, name, address: str(form, 'address') || null, building_id: num(form, 'building_id') })
    .select('id')
    .single();
  revalidatePath('/alojamientos');
  if (data) redirect(`/alojamientos/${data.id}`);
}

export async function updateProperty(form: FormData) {
  const { db } = await requireSession();
  const id = num(form, 'id');
  if (!id) return;
  const threshold = num(form, 'auto_answer_threshold');
  await db
    .from('properties')
    .update({
      name: str(form, 'name'),
      address: str(form, 'address') || null,
      building_id: num(form, 'building_id'),
      auto_answer: form.get('auto_answer') === 'on',
      auto_answer_threshold: threshold === null ? null : Math.min(Math.max(threshold, 0.05), 0.99),
      check_in_time: str(form, 'check_in_time') || '15:00',
      check_out_time: str(form, 'check_out_time') || '11:00',
      cleaning_minutes: num(form, 'cleaning_minutes') ?? 180,
      default_language: str(form, 'default_language') || 'es',
      whatsapp_phone_number_id: str(form, 'whatsapp_phone_number_id') || null,
    })
    .eq('id', id);
  revalidatePath(`/alojamientos/${id}`);
}

export async function deleteProperty(form: FormData) {
  const { db } = await requireSession();
  const id = num(form, 'id');
  if (id) await db.from('properties').delete().eq('id', id);
  revalidatePath('/alojamientos');
  redirect('/alojamientos');
}

export async function createBuilding(form: FormData) {
  const { db, profile } = await requireSession();
  const name = str(form, 'name');
  if (name) await db.from('buildings').insert({ org_id: profile.org_id, owner_id: null, name });
  revalidatePath('/alojamientos');
}

export async function addKnowledgeItem(form: FormData) {
  const { db } = await requireSession();
  const content = str(form, 'content');
  if (!content) return;
  await addKnowledge(db, { propertyId: num(form, 'property_id'), buildingId: num(form, 'building_id') }, str(form, 'category') || 'general', content, form.get('is_private') === 'on');
  revalidatePath(str(form, 'back') || '/alojamientos');
}

export async function deleteKnowledgeItem(form: FormData) {
  const { db } = await requireSession();
  const id = num(form, 'id');
  if (id) await db.from('knowledge_items').delete().eq('id', id);
  revalidatePath(str(form, 'back') || '/alojamientos');
}

// Reservations ----------------------------------------------------------------

export async function createReservation(form: FormData) {
  const { db } = await requireSession();
  const checkIn = str(form, 'check_in');
  const checkOut = str(form, 'check_out');
  const nightly = num(form, 'nightly_rate');
  const nights = Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000));
  const phone = str(form, 'guest_ref').replace(/[^\d+]/g, '');
  await db.from('reservations').insert({
    property_id: num(form, 'property_id'),
    guest_name: str(form, 'guest_name'),
    guest_ref: phone.replace(/^\+/, '') || `manual:${Date.now()}`,
    check_in: checkIn,
    check_out: checkOut,
    source: str(form, 'source') || 'direct',
    guests: num(form, 'guests'),
    nightly_rate: nightly,
    total_amount: nightly !== null ? nightly * nights : null,
    review_ok: form.get('consent') === 'on',
    marketing_ok: form.get('consent') === 'on',
    status: 'upcoming',
  });
  revalidatePath('/reservas');
}

export async function cancelReservation(form: FormData) {
  const { db } = await requireSession();
  const id = num(form, 'id');
  if (id) await db.from('reservations').update({ status: 'cancelled' }).eq('id', id);
  revalidatePath('/reservas');
}

// Operations ----------------------------------------------------------------

export async function planTurnovers() {
  const { db, profile } = await requireSession();
  await runOperations(db, profile.org_id);
  revalidatePath('/operaciones');
}

export async function setTaskStatus(form: FormData) {
  const { db } = await requireSession();
  await db.from('tasks').update({ status: str(form, 'status') }).eq('id', str(form, 'id'));
  revalidatePath('/operaciones');
}

export async function createTask(form: FormData) {
  const { db, profile } = await requireSession();
  const title = str(form, 'title');
  if (title) await db.from('tasks').insert({ org_id: profile.org_id, title, property_id: num(form, 'property_id'), due_at: str(form, 'due_at') || null, kind: str(form, 'kind') || 'other', source: 'host' });
  revalidatePath('/operaciones');
}

export async function addStaff(form: FormData) {
  const { db, profile } = await requireSession();
  const name = str(form, 'name');
  if (name) await db.from('staff').insert({ org_id: profile.org_id, name, phone: str(form, 'phone') || null, role: str(form, 'role') || 'cleaning' });
  revalidatePath('/operaciones');
}

export async function removeStaff(form: FormData) {
  const { db } = await requireSession();
  await db.from('staff').delete().eq('id', str(form, 'id'));
  revalidatePath('/operaciones');
}

// Agents & settings ------------------------------------------------------------

export async function toggleAgent(form: FormData) {
  const { db, profile } = await requireSession();
  const agent = str(form, 'agent') as AgentKey;
  await db.from('agent_settings').upsert({ org_id: profile.org_id, agent, enabled: form.get('enabled') === 'true', updated_at: new Date().toISOString() });
  revalidatePath('/', 'layout');
}

export async function saveTemplate(form: FormData) {
  const { db } = await requireSession();
  await db.from('message_templates').update({ body: str(form, 'body'), approved: form.get('approved') === 'on' }).eq('id', str(form, 'id'));
  revalidatePath('/ajustes');
}

export async function inviteMember(form: FormData) {
  const { db, profile } = await requireSession();
  const email = str(form, 'email').toLowerCase();
  if (email && profile.role === 'owner') await db.from('invitations').insert({ org_id: profile.org_id, email, role: str(form, 'role') === 'owner' ? 'owner' : 'member' });
  revalidatePath('/ajustes');
}

export async function markNotificationsRead() {
  const { db } = await requireSession();
  await db.from('notifications').update({ read: true }).eq('read', false);
  revalidatePath('/', 'layout');
}
