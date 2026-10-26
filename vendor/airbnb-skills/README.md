# airbnb-skills

**Agent skills for Airbnb stay data.** Three drop-in skills that let any agent look up and search Airbnb listings — photos, reviews, host, pricing, and 12-month availability — over the [Staying API](https://stayingapi.com). One typed `Stay` contract that doesn't break when Airbnb reworks their site, available as REST **and** MCP.

Free to use — [grab a key](https://stayingapi.com/app/keys) (100 credits, no card required) and you're calling Airbnb stay data from Claude, ChatGPT, Cursor, or your own agent loop in under two minutes.

Pure Python standard library. No dependencies. MIT-0 licensed.

## Install

```bash
# OpenClaw (via ClawHub)
npx clawhub@latest install airbnb-full

# Hermes Agent
hermes skills install skills-sh/nikhonit/airbnb-skills/skills/airbnb-full

# Generic agent skills (Claude Code, Cursor, Cline)
npx skills add nikhonit/airbnb-skills
```

## Skills in this repo

| Skill | Purpose | Cost |
|---|---|---|
| [`airbnb-full`](skills/airbnb-full) | Complete toolkit — id/URL/address lookup, sub-resources, search, async batch jobs, webhooks, account/usage | 1 credit per record |
| [`airbnb-stay`](skills/airbnb-stay) | Single-listing lookup plus photos, reviews, host, amenities, availability, pricing, location, rating | 1 credit per call |
| [`airbnb-search`](skills/airbnb-search) | Location / date / price / capacity search with superhost, instant-book, and luxury presets | 1 credit per result |

Install the bundled `airbnb-full` for agents that need broad coverage. Install the focused variants when you want minimum tool surface.

## Authentication

Set the `STAYINGAPI_KEY` environment variable to your Staying API key (format `sk_...`).

```bash
export STAYINGAPI_KEY="sk_..."
```

**[Get a free key in 30 seconds](https://stayingapi.com/app/keys)** — 100 credits, no card required. The same key works for these skills, the [hosted MCP server](https://api.stayingapi.com/mcp), and direct REST calls.

### Use over MCP instead

The Staying API hosts a streamable-HTTP MCP server, so MCP-native agents can skip the scripts entirely. Point your client at `https://api.stayingapi.com/mcp` with an `Authorization: Bearer sk_...` header (or OAuth 2.1 PKCE, scope `mcp:access`) to get five tools: `lookup_stay_by_id`, `lookup_stay_by_url`, `search_stays`, `get_stay_photos`, `get_stay_reviews`. Server card: <https://stayingapi.com/.well-known/mcp/server-card.json>.

## Pricing

| Plan | Price | Credits | Rate limit |
|---|---|---|---|
| Free | $0 | 100 (one-time) | 20/min |
| Monthly | $5/mo | 400/month | 200/min |
| Annual | $54/yr | 5,000/year | 300/min |
| Enterprise | Custom | Custom | 1,500/min |

One credit equals one stay record returned (search bills per result; `by-address` weighs 3). Failed calls do not consume credits. Credits roll forward and don't expire.

## Source

- API reference: <https://stayingapi.com/openapi.json>
- Hosted MCP server: <https://api.stayingapi.com/mcp>
- Quickstart: <https://stayingapi.com/quickstart/>
- For AI agents: <https://stayingapi.com/ai-agents/>

## Issues and contributions

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT No Attribution](LICENSE). Fork, ship, sublicense — no attribution required.

## Trademark

Staying API is an independent service and is not affiliated with, endorsed by, or sponsored by Airbnb, Inc. "Airbnb" is a registered trademark of Airbnb, Inc.
