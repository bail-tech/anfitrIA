---
name: local-guide
description: Turn the host's own recommendations, plus verified web results, into a short local guide (eat, shop, see, transport, pharmacy) for a building or property. Use when the host asks for local recommendations or during onboarding.
---

# Local guide

## Sources, in order
1. The host's own list and notes (always first, in their words).
2. Web search, only to fill a requested category the host left empty.

## Every place needs
- Name, category, one-line note, approximate walking time from the address, and the source (host or URL).
- Verification for web places: it still exists and is open (recent reviews or official page). Drop anything you cannot verify.

## Output
- Grouped by category, 3-6 places each, mixing well-known spots and lesser-known ones.
- Each place as a proposed building knowledge item, for the host to approve.
- Never invent distances: if unknown, write `[CHECK: distance]`.
