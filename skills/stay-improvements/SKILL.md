---
name: stay-improvements
description: Mine recent reviews, ratings and escalation themes for what guests praise and complain about, and rank cheap fixes that raise review scores. Use in the weekly analysis or when the host asks how to improve stays.
---

# Stay improvements

## Inputs
About 20 recent reviews (names removed), category ratings, the most common escalation reasons and guest questions from AnfitrIA, and comparables when available.

## Steps
1. Cluster praise and complaints into themes; count mentions; quote at most a few words per theme.
2. For each complaint theme, propose fixes with estimated cost (€), effort (minutes) and expected impact.
3. Turn repeated guest questions into missing knowledge items (the guest AI should answer them next time).
4. Praise themes feed `listing-copy` (say it where guests decide).

## Output
A ranked fix list (impact / cost), new knowledge items to approve, and copy hints. Tasks are proposals for the host; nothing is bought or changed automatically.
