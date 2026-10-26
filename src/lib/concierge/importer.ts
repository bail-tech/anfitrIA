/** Knowledge import from files: a CSV (category, content) or the flat's PDF manual. */

export const MAX_ITEMS = 200;
export const MAX_CONTENT = 4000;
const MIN_CHUNK = 25;
const MAX_CHUNK = 700;

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, commas and newlines inside quotes). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(text: string): Array<[string, string]> {
  const items: Array<[string, string]> = [];
  parseCsvRows(text.replace(/^﻿/, '')).forEach((raw, i) => {
    const cells = raw.map((c) => c.trim()).filter(Boolean);
    if (!cells.length || items.length >= MAX_ITEMS) return;
    const [category, content] = cells.length >= 2 ? [cells[0], cells[1]] : ['general', cells[0]];
    if (i === 0 && ['category', 'categoría', 'categoria'].includes(category.toLowerCase())) return;
    const body = content.slice(0, MAX_CONTENT).trim();
    if (body) items.push([category.slice(0, 64) || 'general', body]);
  });
  return items;
}

/** Split plain text (e.g. from a PDF) into knowledge chunks. */
export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n\n')) {
    let block = raw.split(/\s+/).join(' ').trim();
    if (block.length < MIN_CHUNK) continue;
    while (block.length > MAX_CHUNK) {
      let cut = block.lastIndexOf(' ', MAX_CHUNK);
      cut = cut > MIN_CHUNK ? cut : MAX_CHUNK;
      chunks.push(block.slice(0, cut).trim());
      block = block.slice(cut).trim();
      if (chunks.length >= MAX_ITEMS) return chunks.slice(0, MAX_ITEMS);
    }
    if (block.length >= MIN_CHUNK) chunks.push(block.slice(0, MAX_CONTENT));
    if (chunks.length >= MAX_ITEMS) break;
  }
  return chunks.slice(0, MAX_ITEMS);
}

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join('\n\n');
}

export async function parseUpload(filename: string, contentType: string, data: Uint8Array): Promise<Array<[string, string]>> {
  const name = filename.toLowerCase();
  const type = contentType.toLowerCase();
  if (name.endsWith('.csv') || type.includes('csv')) return parseCsv(new TextDecoder().decode(data));
  if (name.endsWith('.pdf') || type.includes('pdf')) return chunkText(await extractPdfText(data)).map((c) => ['general', c] as [string, string]);
  throw new Error('Formato no soportado: usa CSV o PDF');
}
