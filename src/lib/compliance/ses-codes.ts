/** SES.Hospedajes code lists and helpers safe to use in the browser (no Node APIs). */

/*
 * Code lists. The authoritative values come from the service's `catalogo` operation
 * (TIPO_DOCUMENTO, SEXO, TIPO_PAGO, TIPO_PARENTESCO); `fetchCatalog` reads them live so a host
 * can check them from Settings. These are the published values at the time of writing.
 */
export const DOCUMENT_TYPES = ['NIF', 'NIE', 'PAS', 'OTRO'] as const;
export const SEXES = ['H', 'M', 'O'] as const;
export const PAYMENT_TYPES = ['EFECT', 'TARJT', 'PLATF', 'TRANS', 'MOVIL', 'TREG', 'DESTI', 'OTRO'] as const;
export const KINSHIPS = ['AB', 'BA', 'BN', 'CD', 'CY', 'HJ', 'HR', 'NI', 'PM', 'SB', 'SG', 'TI', 'YN', 'TU', 'OT'] as const;

export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m, d] = on.slice(0, 10).split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
