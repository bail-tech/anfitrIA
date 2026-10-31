import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { communicationFor, readiness } from '@/lib/compliance/registrations';
import { parseLotes, parseReply, partesXml, soapRequest, travellerErrors, validSpanishId, zipOne, type SesTraveller } from '@/lib/compliance/ses';

const adult: SesTraveller = {
  first_name: 'Juan',
  surname1: 'García',
  surname2: 'García',
  document_type: 'NIF',
  document_number: '12345678Z',
  document_support: 'CAA000000',
  birth_date: '1999-01-01',
  nationality: 'ESP',
  sex: 'H',
  address: 'C/Serrano 127',
  address_extra: 'Portal A. 2ºB',
  municipality_code: '28079',
  postal_code: '28001',
  country: 'ESP',
  phone: '666666666',
  email: 'juangarcia@correo.es',
};
const child: SesTraveller = { ...adult, first_name: 'Pedro', document_type: null, document_number: null, document_support: null, birth_date: '2018-01-01', kinship: 'HJ' };

describe('SES validation', () => {
  it('checks DNI and NIE control letters', () => {
    expect(validSpanishId('NIF', '12345678Z')).toBe(true);
    expect(validSpanishId('NIF', '12345678A')).toBe(false);
    expect(validSpanishId('NIE', 'X1234567L')).toBe(true);
    expect(validSpanishId('NIE', 'X1234567A')).toBe(false);
    expect(validSpanishId('PAS', 'AB123')).toBe(true);
  });

  it('applies the service rules for adults, minors and addresses', () => {
    expect(travellerErrors(adult, '2026-11-01')).toEqual([]);
    expect(travellerErrors(child, '2026-11-01')).toEqual([]);
    expect(travellerErrors({ ...child, kinship: null }, '2026-11-01')).toContain('kinship');
    expect(travellerErrors({ ...adult, document_number: null }, '2026-11-01')).toContain('document_number');
    expect(travellerErrors({ ...adult, surname2: null }, '2026-11-01')).toContain('surname2');
    expect(travellerErrors({ ...adult, document_support: null }, '2026-11-01')).toContain('document_support');
    expect(travellerErrors({ ...adult, municipality_code: null }, '2026-11-01')).toContain('municipality_code');
    expect(travellerErrors({ ...adult, country: 'FRA', municipality_code: null, municipality_name: null }, '2026-11-01')).toContain('municipality_name');
    expect(travellerErrors({ ...adult, phone: null, email: null }, '2026-11-01')).toContain('phone');
  });

  it('lists what is missing before filing', () => {
    expect(readiness([adult], '2026-11-01', null)).toEqual(['establishment_code']);
    expect(readiness([], '2026-11-01', '1234567890')).toEqual(['travellers']);
    expect(readiness([{ ...adult, postal_code: '' }], '2026-11-01', '1234567890')).toEqual(['1:postal_code']);
  });
});

describe('SES XML', () => {
  const comm = communicationFor(
    { contract_date: '2022-09-29', payment_type: 'EFECT', payment_date: '2022-09-29', rooms: 1, internet: false, created_at: '2022-09-29T10:00:00Z' },
    { id: 7, code: 'smoobu:4417', check_in: '2022-09-19', check_out: '2022-09-21' },
    { check_in_time: '15:00:00', check_out_time: '11:00:00' },
    [adult, child],
  );

  it('matches the structure of the Ministry example (Anexo I)', () => {
    const xml = partesXml('1234567890', [comm]);
    expect(xml).toContain('<alt:peticion xmlns:alt="http://www.neg.hospedajes.mir.es/altaParteHospedaje"><solicitud><codigoEstablecimiento>1234567890</codigoEstablecimiento>');
    expect(xml).toContain('<contrato><referencia>4417</referencia><fechaContrato>2022-09-29</fechaContrato><fechaEntrada>2022-09-19T15:00:00</fechaEntrada><fechaSalida>2022-09-21T11:00:00</fechaSalida><numPersonas>2</numPersonas><numHabitaciones>1</numHabitaciones><internet>false</internet><pago><tipoPago>EFECT</tipoPago><fechaPago>2022-09-29</fechaPago></pago></contrato>');
    expect(xml).toContain('<persona><rol>VI</rol><nombre>Juan</nombre><apellido1>García</apellido1><apellido2>García</apellido2><tipoDocumento>NIF</tipoDocumento><numeroDocumento>12345678Z</numeroDocumento><soporteDocumento>CAA000000</soporteDocumento><fechaNacimiento>1999-01-01</fechaNacimiento><nacionalidad>ESP</nacionalidad><sexo>H</sexo>');
    expect(xml).toContain('<direccion><direccion>C/Serrano 127</direccion><direccionComplementaria>Portal A. 2ºB</direccionComplementaria><codigoMunicipio>28079</codigoMunicipio><codigoPostal>28001</codigoPostal><pais>ESP</pais></direccion><telefono>666666666</telefono><correo>juangarcia@correo.es</correo></persona>');
    // The minor carries the relationship and no document.
    expect(xml).toContain('<nombre>Pedro</nombre><apellido1>García</apellido1><apellido2>García</apellido2><fechaNacimiento>2018-01-01</fechaNacimiento>');
    expect(xml).toContain('<parentesco>HJ</parentesco></persona></comunicacion></solicitud></alt:peticion>');
  });

  it('escapes XML and uses the city name outside Spain', () => {
    const xml = partesXml('1', [{ ...comm, travellers: [{ ...adult, address: 'Rue <A> & B', country: 'FRA', municipality_code: null, municipality_name: 'Paris' }] }]);
    expect(xml).toContain('<direccion>Rue &lt;A&gt; &amp; B</direccion>');
    expect(xml).toContain('<nombreMunicipio>Paris</nombreMunicipio>');
    expect(xml).not.toContain('codigoMunicipio');
  });

  it('zips the solicitud into a valid one-file archive inside the SOAP envelope', () => {
    const content = Buffer.from(partesXml('1234567890', [comm]), 'utf8');
    const zip = zipOne('solicitud.xml', content);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const nameLength = zip.readUInt16LE(26);
    const compressed = zip.readUInt32LE(18);
    expect(zip.subarray(30, 30 + nameLength).toString()).toBe('solicitud.xml');
    expect(inflateRawSync(zip.subarray(30 + nameLength, 30 + nameLength + compressed)).equals(content)).toBe(true);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);

    const soap = soapRequest({ arrendador: '0000000001' }, 'A', content.toString());
    expect(soap).toContain('<cabecera><codigoArrendador>0000000001</codigoArrendador><aplicacion>AnfitrIA</aplicacion><tipoOperacion>A</tipoOperacion><tipoComunicacion>PV</tipoComunicacion></cabecera>');
    expect(soapRequest({ arrendador: '1' }, 'C', '<x/>')).not.toContain('tipoComunicacion');
  });
});

describe('SES responses', () => {
  it('reads both spellings of the reply code from the spec examples', () => {
    expect(parseReply('<ns3:comunicacionResponse><respuesta><codigoRetorno>0</codigoRetorno><descripcion>Ok</descripcion><lote>abc-1</lote></respuesta></ns3:comunicacionResponse>')).toEqual({ code: 0, description: 'Ok', lote: 'abc-1' });
    expect(parseReply('<respuesta><codigo>10121</codigo><descripcion>Error de validación</descripcion></respuesta>')).toEqual({ code: 10121, description: 'Error de validación', lote: null });
  });

  it('reads lote results, including the misspelled item tag', () => {
    const xml = `<respuesta><codigo>0</codigo><descripcion>Ok</descripcion></respuesta>
      <resultado><lote>L1</lote><codigoEstado>6</codigoEstado><descEstado>Con errores</descEstado>
      <resultadoComunicaciones><resutadoComunicacion><orden>1</orden><tipoError>Error validación de datos</tipoError><error>No existe un establecimiento</error></resutadoComunicacion></resultadoComunicaciones></resultado>
      <resultado><lote>L2</lote><codigoEstado>1</codigoEstado><descEstado>Ok</descEstado>
      <resultadoComunicaciones><resultadoComunicacion><orden>1</orden><codigoComunicacion>C-99</codigoComunicacion></resultadoComunicacion></resultadoComunicaciones></resultado>`;
    expect(parseLotes(xml)).toEqual([
      { lote: 'L1', state: 6, stateText: 'Con errores', communications: [{ order: 1, code: null, error: 'No existe un establecimiento' }] },
      { lote: 'L2', state: 1, stateText: 'Ok', communications: [{ order: 1, code: 'C-99', error: null }] },
    ]);
  });
});
