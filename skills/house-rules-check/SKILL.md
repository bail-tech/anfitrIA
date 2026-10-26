---
name: house-rules-check
description: Rewrite a property's house rules clearly and flag rules that may conflict with a booking platform's policy. Use when the host edits house rules or asks whether their rules are allowed.
---

# House rules check

## Steps
1. Rewrite each rule in plain, friendly, specific language (what, when, why if useful). Keep the host's meaning.
2. Flag rules that are vague, unenforceable, contradictory, or that charge fees not disclosed at booking.
3. Platform policy: compare against the platform's **official** policy text provided in the inputs. If no official text is provided, write `[CHECK: verify against the platform's current house-rules policy]` instead of stating what the policy says.

## Output
- `rules`: the rewritten list.
- `flags`: for each flagged rule, the reason and a suggested fix.
- Never add new rules the host did not ask for.
