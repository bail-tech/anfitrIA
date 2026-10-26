/**
 * Key-less embeddings: a hashed bag of words, L2-normalised, 256 dimensions.
 * The same as the Python app's mock embedder, so vectors already stored in
 * `knowledge_items.embedding` stay comparable. Swap for a real provider later
 * (the column dimension changes with it).
 */
import { createHash } from 'node:crypto';

export const EMBEDDING_DIM = 256;

const WORD = /[a-z0-9áéíóúüñ]+/gi;
const STOP = new Set([
  'los', 'las', 'una', 'uno', 'del', 'que', 'por', 'para', 'con', 'sus', 'mis', 'tus', 'está', 'esta', 'este', 'como', 'cerca',
  'the', 'and', 'for', 'with', 'you', 'your',
]);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter((w) => [...w].length > 2 && !STOP.has(w));
}

export function embed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const tok of tokens(text)) {
    const digest = createHash('md5').update(tok, 'utf8').digest();
    v[digest[digest.length - 1] % EMBEDDING_DIM] += 1; // int(md5, 16) % 256 is the last byte
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

/** pgvector text literal. */
export const toVector = (v: number[]) => `[${v.join(',')}]`;

export const isZero = (v: number[]) => v.every((x) => x === 0);
