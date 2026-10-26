---
name: weekly-market-report
description: Produce the host's weekly performance and market report (revenue, occupancy, ADR, guest score, AI resolution, comparables, next week's outlook) as a spreadsheet and a short summary. Use in the weekly analytics run.
---

# Weekly market report

## Sections
1. **Headline** (3 bullets): what went well, what needs attention, one recommended action.
2. **Performance** last 7 and 30 days vs the previous period: revenue, occupancy, ADR, bookings by channel, cancellations.
3. **Guests**: review score, themes (from `stay-improvements`), escalations by reason, share answered by the AI.
4. **Market**: comparables' price and occupancy signals for the next 30 days.
5. **Next week**: arrivals, departures, turnovers, gaps worth filling.

## Rules
- Every number comes from AnfitrIA tools or the comparables tool; show the period and the source. If a metric is unavailable (e.g. no prices connected), say so instead of estimating.
- Deliver an `.xlsx` with one sheet per section and a one-page summary.
