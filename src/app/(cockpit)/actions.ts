'use server';

/**
 * Server actions for the cockpit forms. All run with the signed-in host's client (RLS scopes
 * them to their organisation) and revalidate the page they change.
 */
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { runOperations } from '@/lib/agents/operations';
import { JOURNEY_DEFAULTS } from '@/lib/agents/journey-defaults';
import { learnFromHistory } from '@/lib/agents/learn';
import { draftReviewReply } from '@/lib/agents/review-reply';
import { DEFAULT_UPSELLS } from '@/lib/upsells';
import { addKnowledge } from '@/lib/concierge/host';
import { isLocale, LOCALE_COOKIE } from '@/i18n/config';
import { ensureRegistration, refreshLotes, sesCredentials, submitRegistration } from '@/lib/compliance/registrations';
import { fetchCatalog, SesError } from '@/lib/compliance/ses';
import { listApartments, registerWebhook } from '@/lib/channels/smoobu';
import { appUrl } from '@/lib/env';
import { smoobuCredentials, syncSmoobu, type SmoobuIntegration } from '@/lib/integrations/smoobu-sync';
import { createAdminSupabase, createServerSupabase, requireSession } from '@/lib/supabase/server';
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
      ses_establishment_code: str(form, 'ses_establishment_code').replace(/\s/g, '') || null,
    })
    .eq('id', id);
  revalidatePath(`/alojamientos/${id}`);
}

/** Distils the host's past answers into a knowledge card to approve; the result shows as a banner. */
export async function learnForProperty(form: FormData) {
  const { db, profile } = await requireSession();
  const id = num(form, 'id');
  if (!id) return;
  let outcome: string;
  try {
    const r = await learnFromHistory(db, profile.org_id, id);
    outcome = r.proposal ? 'ok' : (r.reason ?? 'nothing_new');
  } catch (e) {
    console.error('learn failed', e);
    outcome = 'error';
  }
  revalidatePath('/agentes');
  redirect(`/alojamientos/${id}?learn=${outcome}`);
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

const ANCHORS = ['booking', 'check_in', 'check_out'] as const;
const JOURNEY_KINDS = ['booking_confirmed', 'pre_arrival', 'check_in', 'during_stay', 'checkout', 'post_stay'] as const;

/** A journey message's fields from the board form; offsets are capped at a month either way. */
function templateFields(form: FormData) {
  const anchor = ANCHORS.find((a) => a === str(form, 'anchor')) ?? 'check_in';
  const offset = Math.max(-720, Math.min(720, Math.round(Number(str(form, 'offset')) || 0)));
  const minNights = num(form, 'min_nights');
  return {
    title: str(form, 'title').slice(0, 80),
    body: str(form, 'body').slice(0, 2000),
    anchor,
    kind: JOURNEY_KINDS.find((k) => k === str(form, 'kind')) ?? (anchor === 'booking' ? 'booking_confirmed' : anchor === 'check_in' ? (offset < 0 ? 'pre_arrival' : 'during_stay') : offset <= 0 ? 'checkout' : 'post_stay'),
    send_offset_hours: offset,
    min_nights: minNights && minNights > 0 ? Math.round(minNights) : null,
    positive_only: form.get('positive_only') === 'on',
    as_voice: form.get('as_voice') === 'on',
    property_id: num(form, 'property_id'),
    approved: form.get('approved') === 'on',
  };
}

export async function saveTemplate(form: FormData) {
  const { db } = await requireSession();
  const id = str(form, 'id');
  const fields = templateFields(form);
  if (!fields.body) return;
  if (id) await db.from('message_templates').update(fields).eq('id', id);
  else await db.from('message_templates').insert(fields);
  revalidatePath('/viaje');
}

export async function deleteTemplate(form: FormData) {
  const { db } = await requireSession();
  await db.from('message_templates').delete().eq('id', str(form, 'id'));
  revalidatePath('/viaje');
}

/** Adds the suggested journey (unapproved) in the panel language. */
export async function seedJourney() {
  const { db } = await requireSession();
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'es';
  await db.from('message_templates').insert(JOURNEY_DEFAULTS[locale].map((d) => ({ ...d, language: locale, approved: false })));
  revalidatePath('/viaje');
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

// Guest registration (SES.Hospedajes) -------------------------------------------

/** Creates the guest's registration link for a reservation. */
export async function createRegistration(form: FormData) {
  const { db, profile } = await requireSession();
  const id = num(form, 'reservation_id');
  if (id) await ensureRegistration(db, { id }, profile.org_id);
  revalidatePath('/registros');
}

/** Files a registration with SES.Hospedajes; errors are stored on the registration. */
export async function submitRegistrationAction(form: FormData) {
  const { db, profile } = await requireSession();
  try {
    await submitRegistration(db, createAdminSupabase(), profile.org_id, str(form, 'id'));
  } catch (e) {
    // A 400/412 (missing data, not configured) is shown from the registration's error field.
    if (e instanceof SesError && (e.code === 400 || e.code === 412)) await db.from('guest_registrations').update({ error: e.message }).eq('id', str(form, 'id'));
    else console.error('SES filing failed', e);
  }
  revalidatePath('/registros');
}

export async function refreshRegistrations() {
  const { db, profile } = await requireSession();
  try {
    await refreshLotes(db, createAdminSupabase(), profile.org_id);
  } catch (e) {
    console.error('SES lote check failed', e);
  }
  revalidatePath('/registros');
}

/** Owner only: SES.Hospedajes web-service credentials (the password goes to Vault). */
export async function saveSesSettings(form: FormData) {
  const { profile } = await requireSession();
  if (profile.role !== 'owner') return;
  const admin = createAdminSupabase();
  const config = { env: str(form, 'env') === 'prod' ? 'prod' : 'pre', arrendador: str(form, 'arrendador').slice(0, 10), usuario: str(form, 'usuario').slice(0, 50) };
  const { data: row, error } = await admin
    .from('integrations')
    .upsert({ org_id: profile.org_id, provider: 'ses', status: 'configured', account: config.arrendador, config }, { onConflict: 'org_id,provider' })
    .select('id')
    .single();
  if (error || !row) throw new Error(error?.message ?? 'could not save');
  const password = String(form.get('password') ?? '');
  if (password) await admin.rpc('integration_set_secret', { p_integration: row.id, p_secret: password });
  // A cheap call that proves the credentials work.
  let status = 'connected';
  let lastError: string | null = null;
  try {
    const creds = await sesCredentials(admin, profile.org_id);
    if (!creds) throw new Error('Falta la contraseña');
    await fetchCatalog(creds, 'TIPO_DOCUMENTO');
  } catch (e) {
    status = 'error';
    lastError = e instanceof Error ? e.message : String(e);
  }
  await admin.from('integrations').update({ status, last_error: lastError, last_sync_at: new Date().toISOString() }).eq('id', row.id);
  revalidatePath('/ajustes');
}

// PMS: Smoobu ------------------------------------------------------------------

/** Owner only: connects Smoobu (key + secret in Vault), then imports and subscribes in the background. */
export async function saveSmoobuSettings(form: FormData) {
  const { profile } = await requireSession();
  if (profile.role !== 'owner') return;
  const admin = createAdminSupabase();
  const apiKey = str(form, 'api_key');
  const secret = String(form.get('api_secret') ?? '').trim();
  const { data: current } = await admin.from('integrations').select('id, config, webhook_token').eq('org_id', profile.org_id).eq('provider', 'smoobu').maybeSingle();
  const { data: row, error } = await admin
    .from('integrations')
    .upsert(
      { org_id: profile.org_id, provider: 'smoobu', status: 'configured', account: null, config: { apiKey: apiKey || current?.config?.apiKey }, webhook_token: current?.webhook_token ?? randomBytes(20).toString('hex') },
      { onConflict: 'org_id,provider' },
    )
    .select('id, org_id, config, webhook_token, last_sync_at')
    .single<SmoobuIntegration>();
  if (error || !row) throw new Error(error?.message ?? 'could not save');
  if (secret) await admin.rpc('integration_set_secret', { p_integration: row.id, p_secret: secret });

  const creds = await smoobuCredentials(admin, row);
  try {
    if (!creds) throw new Error('Falta la clave o el secreto de la API');
    await listApartments(creds);
  } catch (e) {
    await admin.from('integrations').update({ status: 'error', last_error: e instanceof Error ? e.message : String(e) }).eq('id', row.id);
    revalidatePath('/ajustes');
    return;
  }
  await admin.from('integrations').update({ status: 'syncing', last_error: null }).eq('id', row.id);
  after(async () => {
    try {
      await syncSmoobu(admin, row, creds!);
      const base = appUrl();
      if (base.startsWith('https://')) await registerWebhook(creds!, `${base}/api/channels/smoobu/${row.webhook_token}`);
    } catch (e) {
      await admin.from('integrations').update({ status: 'error', last_error: e instanceof Error ? e.message.slice(0, 300) : 'sync failed' }).eq('id', row.id);
    }
  });
  revalidatePath('/ajustes');
}

// Personal MCP keys -----------------------------------------------------------

export async function revokeApiKey(form: FormData) {
  const { db } = await requireSession();
  // RLS: a host can only revoke their own keys.
  await db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', str(form, 'id'));
  revalidatePath('/ajustes');
}

// Team -----------------------------------------------------------------------------

/** Assigns a conversation to a team member (empty = unassigned). RLS keeps it inside the organisation. */
export async function assignConversation(form: FormData) {
  const { db, profile } = await requireSession();
  const id = num(form, 'id');
  const to = str(form, 'profile_id') || null;
  if (!id) return;
  if (to) {
    const { data: member } = await db.from('profiles').select('id').eq('id', to).maybeSingle();
    if (!member) return;
  }
  await db.from('conversations').update({ assigned_profile: to }).eq('id', id);
  await db.from('audit_logs').insert({ org_id: profile.org_id, actor: 'host', actor_profile: profile.id, action: 'conversation_assigned', conversation_id: id, detail: to ?? 'unassigned' });
  revalidatePath(`/bandeja/${id}`);
  revalidatePath('/bandeja');
}

/** Owner only: who receives escalated conversations that nobody owns yet. */
export async function setEscalationRouting(form: FormData) {
  const { db, profile } = await requireSession();
  if (profile.role !== 'owner') return;
  await db.from('organizations').update({ escalation_profile: str(form, 'profile_id') || null }).eq('id', profile.org_id);
  revalidatePath('/ajustes');
}

// Upsells ---------------------------------------------------------------------------

export async function saveUpsellItem(form: FormData) {
  const { db } = await requireSession();
  const id = str(form, 'id');
  const price = Number(str(form, 'price').replace(',', '.'));
  const fields = {
    name: str(form, 'name').slice(0, 80),
    price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : 0,
    keywords: str(form, 'keywords').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 20),
    property_id: num(form, 'property_id'),
    active: form.get('active') === 'on',
  };
  if (!fields.name) return;
  if (id) await db.from('upsell_items').update(fields).eq('id', id);
  else await db.from('upsell_items').insert(fields);
  revalidatePath('/extras');
}

export async function deleteUpsellItem(form: FormData) {
  const { db } = await requireSession();
  await db.from('upsell_items').delete().eq('id', str(form, 'id'));
  revalidatePath('/extras');
}

/** The suggested catalogue, in the panel language. */
export async function seedUpsells() {
  const { db } = await requireSession();
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'es';
  await db.from('upsell_items').insert(DEFAULT_UPSELLS[locale].map((u) => ({ ...u, active: true })));
  revalidatePath('/extras');
}

export async function setOfferStatus(form: FormData) {
  const { db } = await requireSession();
  const status = str(form, 'status');
  if (status !== 'accepted' && status !== 'declined' && status !== 'offered') return;
  await db.from('upsell_offers').update({ status, decided_at: status === 'offered' ? null : new Date().toISOString() }).eq('id', str(form, 'id'));
  revalidatePath('/extras');
}

// Reviews ---------------------------------------------------------------------------

const PLATFORMS = ['airbnb', 'booking', 'vrbo', 'google', 'other'] as const;

/** Stores a pasted review and drafts the public reply. */
export async function addReview(form: FormData) {
  const { db } = await requireSession();
  const propertyId = num(form, 'property_id');
  const text = str(form, 'text').slice(0, 5000);
  if (!propertyId || !text) return;
  const rating = num(form, 'rating');
  const review = { property_id: propertyId, rating: rating && rating >= 1 && rating <= 5 ? rating : null, guest_name: str(form, 'guest_name') || null, text };
  const reply = await draftReviewReply(db, review);
  await db.from('reviews').insert({ ...review, platform: PLATFORMS.find((p) => p === str(form, 'platform')) ?? 'airbnb', reply });
  revalidatePath('/resenas');
}

export async function saveReviewReply(form: FormData) {
  const { db } = await requireSession();
  const replied = form.get('replied') === 'on';
  await db.from('reviews').update({ reply: str(form, 'reply').slice(0, 5000), status: replied ? 'replied' : 'draft', replied_at: replied ? new Date().toISOString() : null }).eq('id', str(form, 'id'));
  revalidatePath('/resenas');
}

export async function redraftReview(form: FormData) {
  const { db } = await requireSession();
  const { data: r } = await db.from('reviews').select('property_id, rating, guest_name, text').eq('id', str(form, 'id')).single();
  if (r) await db.from('reviews').update({ reply: await draftReviewReply(db, r) }).eq('id', str(form, 'id'));
  revalidatePath('/resenas');
}

export async function deleteReview(form: FormData) {
  const { db } = await requireSession();
  await db.from('reviews').delete().eq('id', str(form, 'id'));
  revalidatePath('/resenas');
}
