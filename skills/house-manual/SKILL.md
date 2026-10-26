---
name: house-manual
description: Build or extend a property's house manual (welcome book) from its knowledge, device notes and the host's answers, marking every missing fact. Use when onboarding a property or when the host asks for a guide, device instructions or arrival directions.
---

# House manual

## Sections
1. Welcome and contacts (host, emergencies: 112 in Spain/EU)
2. Arrival: directions from the main transport hub using landmarks, parking, building access, check-in method
3. Wi-Fi and devices: one short step list per device (TV, A/C, heating, washing machine, coffee machine, hob)
4. House rules (as stated by the host; do not invent new ones)
5. Rubbish and recycling
6. Check-out
7. Local favourites (from `local-guide`)

## Output
- For each section: the text, then a list of `[CHECK: ...]` markers for facts you lacked.
- Also return the new knowledge items you would create (category + content), one fact per item, so the guest AI can answer from them.
- Device steps only from the host's notes or the model number's official manual the host provided; never guess button names.
- Private details stay as placeholders.
