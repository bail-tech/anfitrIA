# AnfitrIA v2: supervised AI concierge cockpit, with a voice

A cockpit for holiday-rental hosts. **Anfi**, a 3D character with a voice, works as your assistant. A team of agents works for you:
- **Huéspedes** answers guests on WhatsApp from each property's knowledge, and escalates what it doesn't know.
- **Operaciones** plans cleanings from the calendar.
- **Precios** and **Analítica** run on Claude Managed Agents.

Nothing reaches a guest, staff or the knowledge without your tap on an approval card.

Built on the Blemia stack: Next.js 16, React 19, Supabase, Tailwind 4, React Three Fiber, GPT-Live voice with client delegation, and Claude.

## What works without any key

| Feature | Without keys | With keys |
|---|---|---|
| Guest replies (simulator) | Rule-based mock over pgvector retrieval, same behaviour as v1 | Claude `claude-opus-5-5`, structured output, refusal fallbacks |
| Anfi assistant | Day summary and pending escalations from your data | Claude Tool Runner with 11 tools and approval cards |
| Voice (talk to Anfi) | Off | `OPENAI_API_KEY` + `NEXT_PUBLIC_VOICE=true` |
| Voice notes to guests | Host recording in the simulator | WhatsApp audio, assistant-voice TTS, transcription of guest notes |
| Operations | Turnovers from the calendar, staff-message cards | WhatsApp sending for approved staff messages |
| Pricing / analytics / marketing | Off | Managed Agents + the AnfitrIA MCP server |
| Lifecycle messages | Cards for the host | Sent within WhatsApp's 24 h window |

## Run locally

```bash
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
npm test                     # vitest: 37 tests
```

On Windows, keep the project at a short path (e.g. `C:\dev\anfitria`). Turbopack fails on very long paths.

## Database

The migrations in `supabase/migrations/` are already applied to the `anfitria` Supabase project. `0001` is the v1 schema; `0002`–`0004` are additive, so the v1 API keeps working. They add:
- `profiles` on Supabase Auth, with sign-up linking: an open invitation, then a v1 account with the same email, then a new organisation.
- Organisation-scoped RLS on every table. The helpers live in a non-exposed `private` schema.
- `match_knowledge` (pgvector, HNSW).
- New tables: agents, proposals, tasks, staff, message templates.
- Reservation amounts and consent, private knowledge, audio messages, and the `voice-notes` storage bucket.

## Secrets (add them yourself, never in chat)

```bash
vercel env add NAME --environment production --sensitive --scope lowpolystudiomagic
```

| Variable | Unlocks |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | WhatsApp webhook, crons, MCP server |
| `ANTHROPIC_API_KEY` | Claude for guests, Anfi and agents |
| `OPENAI_API_KEY` (+ `NEXT_PUBLIC_VOICE=true`) | Voice, transcription, TTS |
| `CRON_SECRET` | Vercel cron auth |
| `MCP_TOKEN_SECRET` | Signs per-run MCP tokens (any random 32+ chars) |
| `WHATSAPP_*` | WhatsApp Cloud API |
| `ANTHROPIC_ENVIRONMENT_ID`, `ANTHROPIC_AGENT_{PRICING,ANALYTICS,MARKETING}_ID` | Scheduled agents (from `ant apply`) |
| `STAYINGAPI_KEY` | Comparables for pricing and analytics |

## Agents (Claude Managed Agents)

The definitions live in `agents/anfitria-*` (`agent.md` and `environment.yaml`).

```bash
npm run skills:sync          # uploads skills/* to the Skills API (writes skills/skill-ids.json)
ant apply agents/anfitria-pricing agents/anfitria-analytics agents/anfitria-marketing
```

Then put the returned IDs in the env vars above.
- **Session per run:** each run is one session started by the app, with a vault holding a 2-hour MCP token for `/api/mcp`.
- **Write access:** agents can only create proposals.
- **Schedule:** pricing runs daily and analytics on Mondays, both from the 07:00 UTC cron.
- **Before applying:** check with `ant apply --dry-run` that relative skill paths (`../../skills/...`) are accepted. If they aren't, reference the IDs from `skills/skill-ids.json`.

## Skills

- `skills/`: 14 hosting skills plus `_shared/RULES.md`. They are bundled into the app (`npm run skills:build`) and uploaded to the Skills API for the agents.
- `.claude/skills/`: development-only skills, reviewed before adding. `airbnb-*` comes from nikhonit/airbnb-skills (pinned in `vendor/`); `airbnb` is browser guidance.
