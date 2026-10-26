/**
 * Uploads skills/* to the Claude Skills API so the Managed Agents (pricing, analytics,
 * marketing) can reference them by skill_id. Creates a skill the first time, then a new
 * version on every later run. IDs are kept in skills/skill-ids.json (commit it).
 *
 *   ANTHROPIC_API_KEY=... npm run skills:sync
 */
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', 'skills');
const idsFile = path.join(root, 'skill-ids.json');
const ids: Record<string, string> = existsSync(idsFile) ? JSON.parse(readFileSync(idsFile, 'utf8')) : {};
const rules = readFileSync(path.join(root, '_shared', 'RULES.md'), 'utf8');

async function main() {
  const client = new Anthropic();
  for (const name of readdirSync(root).sort()) {
    const file = path.join(root, name, 'SKILL.md');
    if (name.startsWith('_') || !existsSync(file)) continue;
    // The shared rules travel inside every skill so each one is self-contained.
    const body = `${readFileSync(file, 'utf8').trimEnd()}\n\n${rules}`;
    const files = [await toFile(Buffer.from(body, 'utf8'), `${name}/SKILL.md`, { type: 'text/markdown' })];
    try {
      if (ids[name]) {
        const version = await client.skills.versions.create(ids[name], { files });
        console.log(`${name}: new version ${version.version}`);
      } else {
        const skill = await client.skills.create({ files });
        ids[name] = skill.id;
        console.log(`${name}: created ${skill.id}`);
      }
    } catch (e) {
      if (e instanceof Anthropic.APIError) console.error(`${name}: ${e.status} ${e.message}`);
      else throw e;
    }
  }
  writeFileSync(idsFile, `${JSON.stringify(ids, null, 2)}\n`);
}

void main();
