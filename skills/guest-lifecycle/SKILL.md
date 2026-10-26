---
name: guest-lifecycle
description: Draft the scheduled guest messages of a stay (pre-arrival, check-out, saved replies) as reusable templates with placeholders. Use when a host sets up or edits automatic messages.
---

# Guest lifecycle messages

Produce templates the host approves once; the system fills the placeholders and sends them at the right time.

## Templates
- `pre_arrival` (sent ~24 h before check-in): welcome, check-in time and method, how to get there, parking, Wi-Fi network, who to contact.
- `checkout` (sent the morning of check-out): check-out time, keys, 2-3 light requests at most (no chores beyond normal tidying), thanks.
- `saved_reply`: answers to the property's most common questions.

## Placeholders you may use
`{guest_name}`, `{check_in}`, `{check_out}`, `{check_in_time}`, `{check_out_time}`, `{property_name}`, `{wifi_network}`, and private placeholders `{{private:<id>}}` taken from the knowledge.

## Rules
- Facts only from the knowledge; use `[CHECK: ...]` for anything missing (for example the check-in method).
- One language per template; offer the host's default language first.
- Keep each under ~600 characters: guests read these on a phone.
- WhatsApp outside the 24-hour window needs a pre-approved template; keep wording template-friendly (no links that change, no promotions).
