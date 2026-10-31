/** Personal API keys (`anf_pk_…`) for connecting AnfitrIA to Claude, ChatGPT or any MCP client. */
import { createHash, randomBytes } from 'node:crypto';

export const KEY_PREFIX = 'anf_pk_';

export function generateKey(): { key: string; prefix: string; hash: string } {
  const key = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { key, prefix: key.slice(0, 12), hash: hashKey(key) };
}

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export const looksLikeKey = (token: string) => token.startsWith(KEY_PREFIX) && /^anf_pk_[A-Za-z0-9_-]{32}$/.test(token);
