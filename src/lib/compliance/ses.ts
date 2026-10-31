/**
 * SES.Hospedajes (Ministerio del Interior, Real Decreto 933/2021): the "parte de viajeros" every
 * Spanish holiday rental must file within 24 h of the guests' arrival.
 *
 * Built from "Interfaz servicios externos — Servicio de Comunicación Hospedajes" v3.1.2:
 * a SOAP call to /hospedajes-web/ws/v1/comunicacion with HTTP Basic auth, whose <solicitud> is
 * an XML file, zipped and Base64-encoded. Filing (tipoOperacion A) returns a lote id; querying the
 * lote (C) later returns the communication code or the validation errors.
 */
import { crc32, deflateRawSync } from 'node:zlib';
import { ageOn } from './ses-codes';

export { ageOn, DOCUMENT_TYPES, KINSHIPS, PAYMENT_TYPES, SEXES } from './ses-codes';

export const SES_ENDPOINT = {
  pre: 'https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion',
  prod: 'https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion',
} as const;
export type SesEnv = keyof typeof SES_ENDPOINT;

const NS_SOAP = 'http://www.soap.servicios.hospedajes.mir.es/comunicacion';
const NS_ALTA_PV = 'http://www.neg.hospedajes.mir.es/altaParteHospedaje';
const NS_LOTES = 'http://www.neg.hospedajes.mir.es/consultarComunicacion';
/** The service accepts up to 100 communications per request and 10 lotes per query. */
export const MAX_PER_REQUEST = 100;


export interface SesCredentials {
  env: SesEnv;
  /** codigoArrendador, String(10). */
  arrendador: string;
  usuario: string;
  password: string;
  aplicacion?: string;
}

export interface SesTraveller {
  first_name: string;
  surname1: string;
  surname2?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  document_support?: string | null;
  birth_date: string; // YYYY-MM-DD
  nationality?: string | null; // ISO 3166-1 alpha-3
  sex?: string | null;
  address: string;
  address_extra?: string | null;
  municipality_code?: string | null; // INE, 5 digits, required in Spain
  municipality_name?: string | null; // required outside Spain
  postal_code: string;
  country: string; // ISO 3166-1 alpha-3
  phone?: string | null;
  email?: string | null;
  kinship?: string | null; // required for minors
}

export interface SesContract {
  reference: string;
  contract_date: string; // YYYY-MM-DD
  check_in: string; // YYYY-MM-DDThh:mm:ss
  check_out: string; // YYYY-MM-DDThh:mm:ss
  rooms?: number | null;
  internet?: boolean | null;
  payment_type: string;
  payment_date?: string | null;
}

export interface SesCommunication {
  contract: SesContract;
  travellers: SesTraveller[];
}

// ---------------------------------------------------------------------------
// Validation (the rules the service applies, so errors show before filing)
// ---------------------------------------------------------------------------


const NIF = /^[0-9]{8}[A-Z]$/;
const NIE = /^[XYZ][0-9]{7}[A-Z]$/;
const LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** DNI/NIE control letter. */
export function validSpanishId(type: string, raw: string): boolean {
  const n = raw.toUpperCase().replace(/[\s-]/g, '');
  if (type === 'NIF') return NIF.test(n) && LETTERS[Number(n.slice(0, 8)) % 23] === n[8];
  if (type === 'NIE') {
    if (!NIE.test(n)) return false;
    const digits = String('XYZ'.indexOf(n[0])) + n.slice(1, 8);
    return LETTERS[Number(digits) % 23] === n[8];
  }
  return true;
}

/** Problems with one traveller, as field keys the UI can translate. */
export function travellerErrors(t: SesTraveller, checkIn: string): string[] {
  const errors: string[] = [];
  const adult = ageOn(t.birth_date, checkIn) >= 18;
  if (!t.first_name.trim()) errors.push('first_name');
  if (!t.surname1.trim()) errors.push('surname1');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.birth_date)) errors.push('birth_date');
  if (adult) {
    if (!t.document_type) errors.push('document_type');
    if (!t.document_number?.trim()) errors.push('document_number');
  }
  if (t.document_type === 'NIF' && !t.surname2?.trim()) errors.push('surname2');
  if (t.document_type && t.document_number && !validSpanishId(t.document_type, t.document_number)) errors.push('document_number');
  if ((t.document_type === 'NIF' || t.document_type === 'NIE') && !t.document_support?.trim()) errors.push('document_support');
  if (!adult && !t.kinship) errors.push('kinship');
  if (!t.address.trim()) errors.push('address');
  if (!t.postal_code.trim()) errors.push('postal_code');
  if (!/^[A-Z]{3}$/.test(t.country)) errors.push('country');
  if (t.country === 'ESP' && !/^\d{5}$/.test(t.municipality_code ?? '')) errors.push('municipality_code');
  if (t.country !== 'ESP' && !t.municipality_name?.trim()) errors.push('municipality_name');
  if (!t.phone?.trim() && !t.email?.trim()) errors.push('phone');
  if (t.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email)) errors.push('email');
  return [...new Set(errors)];
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

export const escapeXml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** <tag>value</tag>, skipped when the value is empty (optional fields), cut to the field's length. */
function el(tag: string, value: string | number | boolean | null | undefined, max?: number): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value);
  return `<${tag}>${escapeXml(max ? text.slice(0, max) : text)}</${tag}>`;
}

function personXml(t: SesTraveller): string {
  const doc = t.document_number?.toUpperCase().replace(/[\s-]/g, '');
  return [
    '<persona>',
    el('rol', 'VI'),
    el('nombre', t.first_name.trim(), 50),
    el('apellido1', t.surname1.trim(), 50),
    el('apellido2', t.surname2?.trim(), 50),
    el('tipoDocumento', t.document_type),
    el('numeroDocumento', doc, 15),
    el('soporteDocumento', t.document_support?.toUpperCase().trim(), 9),
    el('fechaNacimiento', t.birth_date),
    el('nacionalidad', t.nationality),
    el('sexo', t.sex),
    '<direccion>',
    el('direccion', t.address.trim(), 100),
    el('direccionComplementaria', t.address_extra?.trim(), 100),
    t.country === 'ESP' ? el('codigoMunicipio', t.municipality_code) : el('nombreMunicipio', t.municipality_name?.trim(), 100),
    el('codigoPostal', t.postal_code.trim(), 20),
    el('pais', t.country),
    '</direccion>',
    el('telefono', t.phone?.trim(), 20),
    el('correo', t.email?.trim(), 250),
    el('parentesco', t.kinship),
    '</persona>',
  ].join('');
}

/** The <solicitud> file for filing guest registrations (tipoOperacion A, tipoComunicacion PV). */
export function partesXml(establishmentCode: string, communications: SesCommunication[]): string {
  const body = communications
    .map(({ contract: c, travellers }) =>
      [
        '<comunicacion><contrato>',
        el('referencia', c.reference, 50),
        el('fechaContrato', c.contract_date),
        el('fechaEntrada', c.check_in),
        el('fechaSalida', c.check_out),
        el('numPersonas', travellers.length),
        el('numHabitaciones', c.rooms),
        el('internet', c.internet),
        '<pago>',
        el('tipoPago', c.payment_type),
        el('fechaPago', c.payment_date),
        '</pago></contrato>',
        ...travellers.map(personXml),
        '</comunicacion>',
      ].join(''),
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><alt:peticion xmlns:alt="${NS_ALTA_PV}"><solicitud>${el('codigoEstablecimiento', establishmentCode, 10)}${body}</solicitud></alt:peticion>`;
}

export function lotesXml(lotes: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><con:lotes xmlns:con="${NS_LOTES}">${lotes.map((l) => `<con:lote>${escapeXml(l)}</con:lote>`).join('')}</con:lotes>`;
}

/** 1980-01-01, the earliest valid DOS date (some unzippers reject 0). */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** A one-file ZIP archive (deflate), as the service expects for <solicitud>. */
export function zipOne(name: string, content: Buffer): Buffer {
  const data = deflateRawSync(content);
  const crc = crc32(content);
  const fileName = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0, 10); // time
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(0, 30); // extra + comment length
  central.writeUInt32LE(0, 34); // disk start + internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(0, 42); // local header offset
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(local.length + fileName.length + data.length, 16);
  return Buffer.concat([local, fileName, data, central, fileName, end]);
}

export function soapRequest(creds: Pick<SesCredentials, 'arrendador' | 'aplicacion'>, op: 'A' | 'C' | 'B', solicitudXml: string): string {
  const solicitud = zipOne('solicitud.xml', Buffer.from(solicitudXml, 'utf8')).toString('base64');
  return [
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="${NS_SOAP}">`,
    '<soapenv:Header/><soapenv:Body><com:comunicacionRequest><peticion><cabecera>',
    el('codigoArrendador', creds.arrendador, 10),
    el('aplicacion', creds.aplicacion ?? 'AnfitrIA', 50),
    el('tipoOperacion', op),
    op === 'A' ? el('tipoComunicacion', 'PV') : '',
    `</cabecera><solicitud>${solicitud}</solicitud></peticion></com:comunicacionRequest></soapenv:Body></soapenv:Envelope>`,
  ].join('');
}

// ---------------------------------------------------------------------------
// Responses (the spec's own examples differ on some tag names, so parse leniently)
// ---------------------------------------------------------------------------

const tag = (xml: string, name: string) => new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml)?.[1]?.trim() ?? null;
const tags = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'g'))].map((m) => m[1].trim());
const unescape = (v: string) => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export interface SesReply {
  code: number;
  description: string;
  lote: string | null;
}

export function parseReply(xml: string): SesReply {
  const respuesta = tag(xml, 'respuesta') ?? xml;
  const code = Number(tag(respuesta, 'codigo') ?? tag(respuesta, 'codigoRetorno') ?? NaN);
  return { code: Number.isFinite(code) ? code : -1, description: unescape(tag(respuesta, 'descripcion') ?? tag(xml, 'faultstring') ?? 'Respuesta no reconocida'), lote: tag(respuesta, 'lote') };
}

export interface SesLoteResult {
  lote: string;
  /** 1 ok · 2 header/format errors · 3 unexpected · 4 processing · 5 pending · 6 some communications failed */
  state: number;
  stateText: string;
  communications: Array<{ order: number; code: string | null; error: string | null }>;
}

export function parseLotes(xml: string): SesLoteResult[] {
  return tags(xml, 'resultado').map((r) => ({
    lote: tag(r, 'lote') ?? '',
    state: Number(tag(r, 'codigoEstado') ?? 0),
    stateText: unescape(tag(r, 'descEstado') ?? ''),
    // The spec spells the item both resultadoComunicacion and resutadoComunicacion.
    communications: [...tags(r, 'resultadoComunicacion'), ...tags(r, 'resutadoComunicacion')].map((c) => ({
      order: Number(tag(c, 'orden') ?? 0),
      code: tag(c, 'codigoComunicacion'),
      error: tag(c, 'error') ? unescape(tag(c, 'error')!) : null,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SesError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
  }
}

async function call(creds: SesCredentials, body: string): Promise<string> {
  const res = await fetch(SES_ENDPOINT[creds.env], {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '',
      Authorization: `Basic ${Buffer.from(`${creds.usuario}:${creds.password}`).toString('base64')}`,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new SesError('Usuario o contraseña de SES.Hospedajes incorrectos', res.status);
  if (!res.ok && !text.includes('respuesta')) throw new SesError(`SES.Hospedajes respondió ${res.status}`, res.status);
  return text;
}

/** Files guest registrations; returns the lote to query later. */
export async function fileRegistrations(creds: SesCredentials, establishmentCode: string, comms: SesCommunication[]): Promise<string> {
  if (!comms.length || comms.length > MAX_PER_REQUEST) throw new SesError(`Between 1 and ${MAX_PER_REQUEST} registrations per request`, 0);
  const reply = parseReply(await call(creds, soapRequest(creds, 'A', partesXml(establishmentCode, comms))));
  if (reply.code !== 0 || !reply.lote) throw new SesError(reply.description, reply.code);
  return reply.lote;
}

export async function queryLotes(creds: SesCredentials, lotes: string[]): Promise<SesLoteResult[]> {
  const xml = await call(creds, soapRequest(creds, 'C', lotesXml(lotes.slice(0, 10))));
  const reply = parseReply(xml);
  if (reply.code !== 0) throw new SesError(reply.description, reply.code);
  return parseLotes(xml);
}

/** A code list (TIPO_DOCUMENTO, SEXO, TIPO_PAGO, TIPO_PARENTESCO…), also a cheap credentials check. */
export async function fetchCatalog(creds: SesCredentials, catalogo: string): Promise<Array<{ code: string; description: string }>> {
  const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="${NS_SOAP}"><soapenv:Header/><soapenv:Body><com:catalogoRequest><peticion>${el('catalogo', catalogo)}</peticion></com:catalogoRequest></soapenv:Body></soapenv:Envelope>`;
  const xml = await call(creds, body);
  const result = tag(xml, 'resultado');
  const code = Number(result ? tag(result, 'codigo') : NaN);
  if (code && code !== 0) throw new SesError(unescape(tag(result ?? '', 'descripcion') ?? 'Error'), code);
  return tags(xml, 'tupla').map((t) => ({ code: tag(t, 'codigo') ?? '', description: unescape(tag(t, 'descripcion') ?? '') }));
}
