# Development skills (Claude Code)

Not used by the product agents (those live in `skills/`). Reviewed before adding.

- `airbnb-full`, `airbnb-stay`, `airbnb-search` — from nikhonit/airbnb-skills (pinned copy in `vendor/airbnb-skills`, commit d17e2ed, MIT-0).
  Airbnb listing data over the Staying API: needs `STAYINGAPI_KEY`, costs credits (1 per record). Third-party Airbnb data: check
  Airbnb's terms before commercial use. In production the pricing/analytics agents use the hosted MCP (https://api.stayingapi.com/mcp) instead.
- `airbnb` — browser-automation guidance for airbnb.com (traveler side: search, wishlists, booking flows). Needs the
  `agent-web-interface-guide` skill (not included) and a browser MCP. Dev/QA only: product agents must not sign in, book or pay on Airbnb.
