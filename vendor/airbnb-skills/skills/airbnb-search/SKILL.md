---
name: airbnb-search
version: 1.0.1
description: Search Airbnb listings by location, check-in/check-out dates, price, beds, capacity, and host attributes via StayingAPI.com — with superhost, instant-book, and luxury presets.
license: MIT-0
author: Staying API
homepage: https://stayingapi.com
repository: https://github.com/nikhonit/airbnb-skills
tags:
  - airbnb
  - short-term-rental
  - vacation-rental
  - search
  - listings
  - api
  - mcp
metadata:
  openclaw:
    primaryEnv: STAYINGAPI_KEY
    homepage: https://stayingapi.com
    requires:
      env:
        - STAYINGAPI_KEY
---

# airbnb-search

Focused listing-search skill. Use only when the user **explicitly asks** to find Airbnb stays matching a set of criteria — not when a place name merely appears in passing.

## When to use this skill

**DO use when the user asks:**

- "Find 2-bedroom Airbnbs in Austin, TX under $250 a night"
- "Superhost cabins near Asheville for 4 guests"
- "Instant-book lofts in Mexico City, March 10–14"
- "What luxury stays are available in Lisbon?"

**Do NOT use when:**

- A location appears incidentally in context
- The user has a single known listing in mind — use [`airbnb-stay`](https://github.com/nikhonit/airbnb-skills/tree/main/skills/airbnb-stay) instead
- The user has not signaled they want to search for listings

Each result returned consumes one credit. For broad queries, narrow the filters or cap `max_items` before calling.

## Tools

Tools return a Python dict — `{"data": [<stay>, ...], "meta": {...}, "request_id": ...}` on success, or `{"error": ..., "detail": ...}` on failure.

### `search_stays(...)` — 1 credit per result, up to 240

Search listings by location and structured filters.

Parameters:

- `location` — a place string, e.g. `"Austin, TX"`, `"78704"`, `"Lisbon"` (maps to `locationQueries`)
- `search_urls` — list of Airbnb search-results URLs to replay (alternative to `location`)
- `check_in`, `check_out` — `"YYYY-MM-DD"`
- `price_min`, `price_max` — per-night, numeric
- `min_beds`, `min_bedrooms`, `min_bathrooms` — integers
- `adults`, `children`, `infants`, `pets` — guest mix, integers
- `currency`, `locale` — e.g. `"USD"`, `"en"`
- `max_items` — default `50`, **max `240`** (caps credit spend)
- `fields` — comma-separated projection

Pass either `location` or `search_urls` — at least one is required.

### `search_superhost(...)` — 1 credit per result
Superhost-only preset. Same parameters as `search_stays`.

### `search_instant_book(...)` — 1 credit per result
Instant-bookable preset. Same parameters as `search_stays`.

### `search_luxury(...)` — 1 credit per result
Luxury-tier preset. Same parameters as `search_stays`.

### `search_stays_with_details(...)` — async
Search, then fetch the full `Stay` record for every result. Always runs asynchronously: returns a job envelope (`{"job_id": ..., "status": ...}`). Poll it with the [`airbnb-full`](https://github.com/nikhonit/airbnb-skills/tree/main/skills/airbnb-full) skill's `get_job` / `get_job_results`.

## Equivalent MCP tool

On the hosted MCP server (`https://api.stayingapi.com/mcp`): `search_stays`.

## Authentication

Set `STAYINGAPI_KEY` to your Staying API key (format `sk_...`). Free key with 100 credits at <https://stayingapi.com/app/keys> — no card.

## Pricing

| Plan | Price | Credits | Rate limit |
|---|---|---|---|
| Free | $0 | 100 (one-time) | 20/min |
| Monthly | $5/mo | 400/month | 200/min |
| Annual | $54/yr | 5,000/year | 300/min |
| Enterprise | Custom | Custom | 1,500/min |

One credit per listing returned. A search returning 25 results consumes 25 credits. Failed calls (`4xx`/`5xx`) do not consume credits.

## Errors

Functions return a dict. On failure it carries an `error` key: `auth` (missing/invalid key), `HTTP 429` (rate-limited), `HTTP 4xx/5xx`, or `network`.

## API reference

- OpenAPI spec: <https://stayingapi.com/openapi.json>
- Hosted MCP server: <https://api.stayingapi.com/mcp>

## Trademark

Staying API is an independent service and is not affiliated with, endorsed by, or sponsored by Airbnb, Inc. "Airbnb" is a registered trademark of Airbnb, Inc.
