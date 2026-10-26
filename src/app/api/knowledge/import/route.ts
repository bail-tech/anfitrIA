/** POST /api/knowledge/import (multipart: file, property_id | building_id) — CSV or PDF manual into knowledge. */
import { NextResponse } from 'next/server';
import { addKnowledge } from '@/lib/concierge/host';
import { parseUpload } from '@/lib/concierge/importer';
import { fail, sameOrigin, withSession } from '@/lib/http';

export const maxDuration = 60;
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail(400, 'file required');
  if (file.size > MAX_BYTES) return fail(413, 'file too large (5 MB max)');
  const propertyId = form?.get('property_id') ? Number(form.get('property_id')) : null;
  const buildingId = form?.get('building_id') ? Number(form.get('building_id')) : null;
  if (!propertyId && !buildingId) return fail(400, 'property_id or building_id required');

  return withSession(async ({ db }) => {
    let items: Array<[string, string]>;
    try {
      items = await parseUpload(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      return fail(415, e instanceof Error ? e.message : 'unsupported file');
    }
    let created = 0;
    for (const [category, content] of items) {
      const { error } = await addKnowledge(db, { propertyId, buildingId }, category, content);
      if (!error) created++;
    }
    return NextResponse.json({ created, total: items.length });
  });
}
