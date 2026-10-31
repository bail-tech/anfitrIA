/** GET /api/registrations/:id/xml — the parte de viajeros as filed (for checking or manual upload). */
import { communicationFor, type GuestRegistration, type TravellerRow } from '@/lib/compliance/registrations';
import { partesXml } from '@/lib/compliance/ses';
import { fail, withSession } from '@/lib/http';
import type { Property, Reservation } from '@/lib/types';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  return withSession(async ({ db }) => {
    const { data: reg } = await db.from('guest_registrations').select('*').eq('id', id).maybeSingle<GuestRegistration>();
    if (!reg) return fail(404, 'not found');
    const { data: r } = await db.from('reservations').select('*').eq('id', reg.reservation_id).single<Reservation & { created_at: string }>();
    const { data: p } = await db.from('properties').select('*').eq('id', r!.property_id).single<Property>();
    const { data: travellers } = await db.from('travellers').select('*').eq('registration_id', reg.id).order('position');
    const xml = partesXml(p!.ses_establishment_code ?? '', [communicationFor(reg, r!, p!, (travellers ?? []) as TravellerRow[])]);
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="parte-${(r!.code ?? r!.id).toString().replace(/[^\w-]/g, '')}.xml"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
