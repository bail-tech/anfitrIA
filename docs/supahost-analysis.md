# Supahost.ai — competitor analysis and AnfitrIA plan

*Surveyed 31 Oct 2026 in a real browser: desktop (1500 px) and mobile (375 px). Method: the `competitor-experience-audit` skill (rampstackco/claude-skills), used as a single-competitor deep dive. One site is not a field, so the observations below describe Supahost, not conventions of the whole category.*

## 1. What Supahost is

An "AI co-host" for short-term rentals, run by APMI Inc. The founders are Vera Prohaska and Diego Sanmartin, and the team is EU-oriented, with Spain as a core market. Its promise is **"Run your properties on autopilot"**: AI agents handle guest messaging, cleanings, reviews and devices "across 150+ languages and 60+ tools".

**The product, as shown on the site**

| Area | What it does |
|---|---|
| Smart Inbox | Airbnb, Booking.com, WhatsApp, email and SMS (plus calls) in one stream. Replies go back through the channel the guest used. Smart routing sends invoices by email. |
| Copilot / Autopilot | One AI with three modes: Off, Suggestions (Copilot) and Autopilot. A confidence threshold is set per listing: **above 90% the AI sends, below it you review**. Drafts can be edited by voice ("describe what to edit…"). They claim "80% flip to Autopilot within a week". |
| Safety layer | Every reply is scored before it is sent. Escalations (refunds, complaints), sentiment flags, "AI is missing information" drafts, pause or take over a thread, and an audit trail of edits that teaches it your voice. |
| AI Memory | A knowledge base distilled from listings, house rules, notes **and past conversations**. Every memory shows its source and can be edited. |
| Auto-onboarding | Learns your tone, rules and scheduled messages by reading your past replies. "Live in under 15 minutes." |
| Guest Journey | A per-listing board of scheduled messages, timed relative to booking, check-in or check-out, with conditions such as "if the stay was positive" or "if the stay is longer than 3 days". |
| Agentic actions | Checks the calendar, messages the cleaner, moves the cleaning slot and confirms with the guest on its own. Multimodal: it attaches manuals, maps and lockbox photos. |
| Turnovers | Gap between check-out and the next check-in: red under 2 h, orange 2–4 h, green over 4 h. A cleaner-coordination agent sits on the Pro plan. |
| Smart locks | 500+ models. Codes are created and revoked per booking, it can unlock remotely, and it signals when the guest checks in. One free lock comes with Pro. |
| Compliance (Spain first) | Police registration (SES.Hospedajes, Mossos, Ertzaintza), tourist tax and e-invoicing, filed automatically on confirmation. |
| Upsells | The AI spots a request (early check-in, parking, a cot), prices it from your catalogue, you approve with one tap, and a Stripe pay link goes to your own account. |
| Reviews | Review requests timed by sentiment, AI-drafted responses, theme clustering and comparison with nearby properties (beta). |
| Voice AI agent | A phone line connected to the PMS: 24/7, 30+ languages, rings the host for anything serious. |
| Team | Unlimited seats. Assign conversations, route escalations, set working hours, and add cleaner roles. |
| MCP / API | A personal key turns Supahost into an MCP connector for ChatGPT, Claude or Gemini ("send today's cleaning schedule"). |
| Integrations | 95+: about 40 live PMS (Hostaway, Guesty, Smoobu, Lodgify, Avantio, Hospitable, Mews…), Airbnb live, Booking.com beta, and locks. |

**Pricing (per active property per month, monthly billing)**

| Plan | Price | Includes |
|---|---|---|
| Free | €0 | Up to 10 properties, about 30 Copilot drafts a month, 1 seat |
| Starter | €5.99 | Unlimited Copilot drafts, inbox, channel manager, scheduled messages, 3 seats |
| Pro | €14.99 | Autopilot, cleaner agent, 1 lock or police check-in, unlimited seats |
| Scale | €24.99 | Voice line, booking widget, owner reports, guest app |

- **Discounts:** −30% if you have a PMS, −12% for yearly billing.
- **Empty properties** cost €1 a month, so billing follows the season.
- **Add-ons:** locks €5, police check-in €2.50, e-invoices €3.
- **Market variants:** separate price tabs for Hotel and Mid-term rentals.

## 2. How the site works (experience audit, 7 dimensions)

| # | Dimension | What Supahost does |
|---|---|---|
| 1 | Primary-task prominence | One task: start free. The CTA sits in the hero, next to "Watch the 90s demo", over a **live, clickable product mock** (inbox, booking panel, door code, guest journey). On mobile the hero CTA becomes a **Google Play badge**, so there is a native app. A floating "Talk to our AI" voice button appears on every page. |
| 2 | Layout register | SaaS marketing, airy, with one idea per section. Navy and blue on white. Every section is an animated product fragment rather than a stock photo. |
| 3 | Offering surface | A Features mega-menu leading to about 15 feature hubs. Each hub has the same shape: a hero, three to five capability cards, a "Keep exploring" cross-link grid and a demo CTA. |
| 4 | Navigation and paths | Paths by feature, by segment (short-term, hotel, mid-term, long-term pricing tabs), by integration (a page per PMS: "works on top of Hostaway") and by question (an /answers hub). |
| 5 | Brand register | Confident and operational: "autopilot", "superpowers", "agentic". The voice is direct, with concrete numbers (2 seconds, 10 h a week, 15 minutes). |
| 6 | Trust and conversion | Host case studies by city and unit count, "99% 5★ on communication", 250+ reviews, "1M+ messages", "Built by hosts for hosts", plus a "you own your data" belief. Pricing has a property slider, a quote-by-email option and a billing example. |
| 7 | SEO and AEO | Server-rendered pages with hreflang in en, es, de, fr, it. Structured data: Organization, Founders, Product, FAQPage, Breadcrumb and **Speakable**. Answer pages lead with a 40–60-word answer ("best AI for Airbnb messaging", "Hostfully alternative"). Analytics is PostHog EU. |

**Gaps a challenger can exploit**

- **Built for messaging, not for running the business.** There is no unified view of revenue, occupancy or ADR, pricing is absent, and owner reports exist only on Scale.
- **The voice agent is a phone line for guests.** There is no voice assistant for the *host* to drive the app.
- **WhatsApp voice notes:** there is no sign of the AI *sending* voice notes to guests.
- **Booking.com is still beta.**
- **Free plan:** about 30 drafts is a taste, not a workflow.
- **Mobile web:** the hero sends you to the Play Store; there is no web-first mobile experience.

## 3. Where AnfitrIA stands against it

| Area | Supahost | AnfitrIA today | Verdict |
|---|---|---|---|
| Draft → approve → auto-send by confidence | ✔ (90% threshold, per listing) | ✔ (`auto_answer_threshold` per property, escalations, approval cards) | At parity |
| Knowledge base with sources | ✔ learned from past chats | ✔ manual, CSV and PDF import; no learning from history yet | Gap: auto-learn |
| Host voice assistant that drives the app | ✘ | ✔ Anfi (GPT-Live, navigation, tours, prefill) | **Our edge** |
| Voice notes to guests in WhatsApp | ✘ | ✔ TTS in the host's chosen voice | **Our edge** |
| Business metrics and agents (pricing, analytics, marketing) | Partial (reviews beta) | ✔ cockpit KPIs plus Managed Agents | **Our edge** |
| OTA and PMS connections | ~40 PMS, Airbnb, Booking beta | iCal import only, plus WhatsApp | **Biggest gap** |
| Scheduled guest journey | ✔ board, conditions | Partial: templates, daily lifecycle cron | Gap |
| Spanish police registration and tourist tax | ✔ SES.Hospedajes, Mossos, Ertzaintza | ✘ | Gap (critical in Spain) |
| Smart locks | ✔ 500+ models | ✘ | Gap |
| Upsells with Stripe | ✔ | ✘ | Gap |
| Review requests and replies | ✔ | Skill only (`reviews`) | Gap |
| Team assignment and roles | ✔ unlimited seats | Owner/member roles, no assignment | Gap |
| MCP for ChatGPT, Claude or Gemini | ✔ public | `/api/mcp` used internally by our agents | Easy win |
| Marketing site, SEO and answers | ✔ mature | Login page only | Gap |
| Pricing model | Per active property, €1 when empty | None | To decide |

## 4. Plan

**Positioning.** Supahost sells *"autopilot for messages"*. AnfitrIA should sell **"the co-host you talk to"**: one assistant, by voice or chat, that runs messages *and* the business (numbers, pricing, cleanings), Spanish-first and supervised. That is the gap above that Supahost doesn't cover.

### Phase 0 — Close the dealbreakers (4–6 weeks)
1. **Connect real channels.** Start with one PMS that has a public API: Hostaway or Smoobu (strong in Spain). Use the Airbnb and Booking messaging they sync. Keep iCal as the fallback.
2. **Spanish compliance.** Send guest registration to SES.Hospedajes, plus the regional variants for Mossos and Ertzaintza, and calculate tourist tax. Even the Spain-only version is a sales hook.
3. **Learn from history.** On import, distil past conversations into knowledge items with sources. We already store embeddings; this adds an extraction step with `propose_knowledge`, which keeps the host's approval.
4. **Guest Journey board.** Our `message_templates` move onto a per-property board with times relative to booking or check-in, and conditions (positive sentiment, length of stay).

### Phase 1 — Win on what they lack (4 weeks)
5. **Anfi as the headline.** Demo videos of driving the cockpit by voice: "¿Qué tengo hoy?", "llévame a la escalada de María". Supahost's voice is only for guests.
6. **Voice notes to guests.** Market it. It already works; it needs a toggle per message type.
7. **Business cockpit.** Revenue, occupancy, ADR and pricing proposals as a standing weekly report from our Managed Agents, plus owner reports. Supahost only has those on Scale.
8. **Public MCP.** Personal keys so hosts can use AnfitrIA from Claude or ChatGPT. The server already exists.

### Phase 2 — Parity features (6–8 weeks)
9. **Upsells.** A catalogue, AI detection, an approval card and a Stripe Connect pay link. It fits our approval-card pattern exactly.
10. **Smart locks.** Codes per booking and a check-in signal, through one aggregator API. Start with Nuki, which is common in Spain.
11. **Reviews.** Timed requests that check sentiment, plus drafted replies (the skill exists).
12. **Team.** Assign conversations and escalations, set working hours, and add a cleaner role.

### Phase 3 — Go to market (in parallel)
13. **Marketing site** on the same Next.js app. Hero with a live cockpit mock and Anfi talking, a feature hub per capability, a page per PMS integration, and an **/answers** hub with FAQPage and Speakable schema, in ES and EN first.
14. **Pricing.** Copy the *active property* model (€1 when empty is fair and seasonal). Keep a generous free plan, about 3 properties with unlimited Copilot, to undercut their 30 drafts.
15. **Proof.** Pilot with 5–10 Spanish hosts, then city-based case studies and a 5★ communication stat.

**Skills to run per phase** (now installed in `.claude/skills`): `jtbd-framing` and `pm-spec-writing` (Phase 0 specs), `integration-orchestrator` (PMS connections), `information-architecture`, `landing-page-copy` and `seo-aeo-geo` (site), `upgrade-flow-design` (pricing), `interactive-product-tour` (onboarding), `launch-runbook`.

## 5. Not assessable
- **The product behind the login.** I didn't create an account, so everything above comes from the public pages and their demos.
- **"Talk to our AI".** I didn't start the voice widget (it needs the microphone).
- **Prices beyond 1 property.** I only checked the per-property price at 1 property; there may be volume tiers.
- **Claims.** Statistics such as 80% switching to Autopilot, 1M+ messages and 99% 5★ are Supahost's own and unverified.
