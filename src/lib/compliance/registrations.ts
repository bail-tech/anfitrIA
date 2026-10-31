/**
 * Guest registrations for SES.Hospedajes: one per reservation. The guest fills in the travellers
 * through a link (no account), the host files it, and the lote is checked until the Ministry
 * returns a communication code or errors. Credentials live in Supabase Vault.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Property, Reservation } from '@/lib/types';
import { fileRegistrations, queryLotes, SesError, travellerErrors, type SesCommunication, type SesCredentials, type SesEnv, type SesTraveller } from './ses';

export type RegistrationStatus = 'pending' | 'ready' | 'sent' | 'accepted' | 'error' | 'cancelled';

export interface GuestRegistration {
  id: string;
  org_id: number;
  reservation_id: number;
  token: string;
  status: RegistrationStatus;
  contract_date: string | null;
  payment_type: string;
  payment_date: string | null;
  rooms: number | null;
  internet: boolean | null;
  lote: string | null;
  communication_code: string | null;
  error: string | null;
  submitted_at: string | null;
  created_at: string;
}

export type TravellerRow = SesTraveller & { id: string; registration_id: string; position: number };

export interface SesConfig {
  env: SesEnv;
  arrendador: string;
  usuario: string;
}

/** The org's SES settings and password (service role only). */
export async function sesCredentials(admin: SupabaseClient, orgId: number): Promise<SesCredentials | null> {
  const { data: row } = await admin.from('integrations').select('id, config, status').eq('org_id', orgId).eq('provider', 'ses').maybeSingle<{ id: number; config: SesConfig; status: string }>();
  if (!row?.config?.arrendador || !row.config.usuario) return null;
  const { data: password } = await admin.rpc('integration_get_secret', { p_integration: row.id });
  if (!password) return null;
  return { env: row.config.env === 'prod' ? 'prod' : 'pre', arrendador: row.config.arrendador, usuario: row.config.usuario, password: password as string, aplicacion: 'AnfitrIA' };
}

/** The registration for a reservation, created on first use. */
export async function ensureRegistration(db: SupabaseClient, reservation: Pick<Reservation, 'id'>, orgId: number): Promise<GuestRegistration> {
  const { data: existing } = await db.from('guest_registrations').select('*').eq('reservation_id', reservation.id).maybeSingle<GuestRegistration>();
  if (existing) return existing;
  const { data, error } = await db.from('guest_registrations').insert({ reservation_id: reservation.id, org_id: orgId }).select('*').single<GuestRegistration>();
  if (error || !data) throw new Error(`registration: ${error?.message}`);
  return data;
}

/** Arrival and departure as local date-time, from the reservation and the property's times. */
export function communicationFor(
  reg: Pick<GuestRegistration, 'contract_date' | 'payment_type' | 'payment_date' | 'rooms' | 'internet' | 'created_at'>,
  r: Pick<Reservation, 'id' | 'code' | 'check_in' | 'check_out'> & { created_at?: string },
  p: Pick<Property, 'check_in_time' | 'check_out_time'>,
  travellers: SesTraveller[],
): SesCommunication {
  return {
    contract: {
      reference: (r.code ?? `R${r.id}`).replace(/^smoobu:/, ''),
      contract_date: reg.contract_date ?? (r.created_at ?? reg.created_at).slice(0, 10),
      check_in: `${r.check_in}T${p.check_in_time.slice(0, 5)}:00`,
      check_out: `${r.check_out}T${p.check_out_time.slice(0, 5)}:00`,
      rooms: reg.rooms,
      internet: reg.internet,
      payment_type: reg.payment_type,
      payment_date: reg.payment_date,
    },
    travellers,
  };
}

/** Everything still missing before this registration can be filed. */
export function readiness(travellers: SesTraveller[], checkIn: string, establishmentCode: string | null): string[] {
  const problems: string[] = [];
  if (!establishmentCode) problems.push('establishment_code');
  if (!travellers.length) problems.push('travellers');
  travellers.forEach((t, i) => travellerErrors(t, checkIn).forEach((e) => problems.push(`${i + 1}:${e}`)));
  return problems;
}

/** Files one registration. `db` is the host's client (RLS); `admin` only reads the credentials. */
export async function submitRegistration(db: SupabaseClient, admin: SupabaseClient, orgId: number, registrationId: string): Promise<GuestRegistration> {
  const { data: reg } = await db.from('guest_registrations').select('*').eq('id', registrationId).single<GuestRegistration>();
  if (!reg) throw new SesError('Registro no encontrado', 404);
  if (reg.status === 'sent' || reg.status === 'accepted') throw new SesError('Este registro ya se envió', 409);
  const { data: r } = await db.from('reservations').select('*').eq('id', reg.reservation_id).single<Reservation & { created_at: string }>();
  const { data: p } = await db.from('properties').select('*').eq('id', r!.property_id).single<Property>();
  const { data: travellers } = await db.from('travellers').select('*').eq('registration_id', reg.id).order('position');
  const list = (travellers ?? []) as TravellerRow[];
  const problems = readiness(list, r!.check_in, p!.ses_establishment_code);
  if (problems.length) throw new SesError(`Faltan datos: ${problems.join(', ')}`, 400);
  const creds = await sesCredentials(admin, orgId);
  if (!creds) throw new SesError('Configura SES.Hospedajes en Ajustes (código de arrendador, usuario y contraseña)', 412);
  try {
    const lote = await fileRegistrations(creds, p!.ses_establishment_code!, [communicationFor(reg, r!, p!, list)]);
    const { data } = await db.from('guest_registrations').update({ status: 'sent', lote, error: null, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reg.id).select('*').single<GuestRegistration>();
    await db.from('audit_logs').insert({ org_id: orgId, actor: 'host', action: 'ses_filed', detail: `lote ${lote} · reserva ${r!.id}` });
    return data!;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from('guest_registrations').update({ status: 'error', error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', reg.id);
    throw e;
  }
}

/** Checks filed lotes; accepted ones get their communication code, rejected ones the reason. */
export async function refreshLotes(db: SupabaseClient, admin: SupabaseClient, orgId: number): Promise<{ checked: number; accepted: number; failed: number }> {
  const { data: sent } = await db.from('guest_registrations').select('id, lote').eq('org_id', orgId).eq('status', 'sent').not('lote', 'is', null).limit(10);
  if (!sent?.length) return { checked: 0, accepted: 0, failed: 0 };
  const creds = await sesCredentials(admin, orgId);
  if (!creds) return { checked: 0, accepted: 0, failed: 0 };
  const results = await queryLotes(creds, sent.map((s) => s.lote as string));
  let accepted = 0;
  let failed = 0;
  for (const result of results) {
    const reg = sent.find((s) => s.lote === result.lote);
    if (!reg || result.state === 4 || result.state === 5) continue; // still processing
    const comm = result.communications[0];
    const ok = (result.state === 1 || result.state === 6) && comm?.code;
    await db
      .from('guest_registrations')
      .update(ok ? { status: 'accepted', communication_code: comm.code, error: null, updated_at: new Date().toISOString() } : { status: 'error', error: (comm?.error ?? result.stateText).slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', reg.id);
    if (ok) accepted++;
    else failed++;
  }
  return { checked: results.length, accepted, failed };
}
