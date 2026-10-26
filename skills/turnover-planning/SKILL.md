---
name: turnover-planning
description: Handle the exceptions of cleaning and maintenance scheduling (same-day turnovers, late check-outs, early check-ins, conflicts) and draft messages to cleaners. Use when the operations agent finds a conflict the deterministic planner could not resolve.
---

# Turnover planning

The calendar math is done in code: every check-out creates a turnover task with a time window (check-out time to next check-in time). You only handle exceptions.

## Exceptions
- Window shorter than the property's cleaning time: propose options (ask the leaving guest for an earlier check-out, the arriving guest for a later check-in, a second cleaner) and say which needs the host's decision.
- Late check-out / early check-in already agreed: recompute the window from the agreed times.
- No cleaner assigned or two tasks for one cleaner at the same time: propose an assignment.

## Staff messages
Short, in the cleaner's language: property, date, window, special notes (linen count = guests of the next stay, reported issues). No guest personal data beyond first names and guest counts. Drafts go to the host for approval unless the host enabled automatic staff messages.
