# Plan: Anfi settings and Anfi-guided navigation

## Context

Voice works end to end: GPT-Live talks, and Claude Haiku is the agent behind it. Hosts want two more things:

1. **Settings pill → modal.** Choose Anfi's language and Anfi's voice.
2. **Anfi drives the app.** Anfi opens pages, points at sections and explains them, so a host can use the whole cockpit just by talking.

Both follow the `building-gpt-agents` skill.
- **Voice layer (GPT-Live):** only talks, and decides when to delegate.
- **Text agent (Claude Tool Runner):** owns every tool, including the new UI tools.
- **Application (the dock in the browser):** executes UI actions and keeps the permission rules.

Spoken and typed requests share one path, so navigation works the same by voice and by text.

## 1. Settings pill and modal

**Where.** A small pill (⚙ "Ajustes") in the dock header, next to "Anfi · Lista". It opens a modal (dialog with focus trap; closes on Esc or by clicking outside).

| Setting | Values | Applies to |
|---|---|---|
| Anfi's language | Automatic (follow the host), Español, English, Français, Deutsch, Italiano | Claude's replies and the voice's opening language |
| Panel language | Español / English | The cockpit UI (the existing `NEXT_PUBLIC_LOCALE` cookie, now also here) |
| Anfi's voice | The 23 GPT-Live built-in voices (`alloy`, `ash`, `ballad`, `beacon`, `bossa`, `cedar`, `cinder`, `coral`, `delta`, `echo`, `gleam`, `marin`, `meridian`, `quartz`, `ripple`, `sage`, `shida`, `shimmer`, `stone`, `tempo`, `verse`, `vesper`, `willow`), plus an optional custom voice ID | GPT-Live sessions |
| Voice for voice notes to guests | The same choice when it's also a TTS voice; otherwise `coral` | `speak()` (TTS) |

**Preview.** A ▶ button plays a 3-second sample through the TTS endpoint, cached per voice. Voices with no TTS equivalent show "preview available in a live session".

**Storage.**
- Migration `0006`: `profiles.assistant_language text`, `profiles.voice text`, `profiles.voice_custom_id text`.
- Extend the column grant: `grant update (name, assistant_language, voice, voice_custom_id) on profiles to authenticated`.
- These are per host, not per organisation: each team member hears their own Anfi.

**Wiring.**
- `/api/live/session` reads the profile's voice and language. A voice is fixed when a session starts, so changing it during a call ends that session and starts a new one. The modal says so.
- `runAssistant` adds the chosen language to the system prompt. "Automatic" keeps today's behaviour: answer in the language the host uses.
- Validation: the voice must be in the built-in list, or a `voice_custom_id` matching `^[A-Za-z0-9_-]{4,64}$`.

## 2. Anfi navigates and explains the app

### How it works

```
Host (voice or text) ─► Claude Tool Runner ─► UI tool ─► SSE event {type:'ui', …} ─► dock executes in the browser
                                                                                   └► voice-bridge says what happened
```

- **Server side:** UI tools only *describe* actions. The server can't change the browser.
- **Browser side:** the dock lives in the cockpit layout, so it survives page changes. It runs `router.push`, scrolls and highlights.
- **Page context:** every message also sends the current page path and the visible section IDs. Anfi then knows where the host is ("¿qué es esto?" means the page on screen).

### Page registry (one source of truth)

`src/lib/assistant/guide.ts`, in Spanish and English, describes every page:
- route, title and purpose;
- sections: `{ id, name, what it shows, what you can do }`, with each `id` matching a `data-anfi="…"` attribute on the page;
- typical tasks, e.g. "responder una escalada": Bandeja → abrir conversación → editar borrador → Enviar.

The registry drives three things: Claude's tool results, the spotlight tooltips, and a test that every registered section exists on its page.

### New tools (Claude, Tool Runner)

| Tool | Does | Limits |
|---|---|---|
| `where_am_i` | Current page, its sections, and what's selected | Read only |
| `explain_page(page?)` | Purpose, sections and typical tasks of a page | From the registry, never invented |
| `navigate(page, params?)` | Opens a cockpit page, e.g. `bandeja/42` or `alojamientos/1` | Registry routes and IDs from tool results only; never external URLs |
| `highlight(section, note)` | Scrolls to a section and spotlights it with a short note | Section must exist on the current page |
| `start_tour(page)` | Guided tour: one section at a time, narrated, with Next / Exit | Each step can be interrupted by voice ("para", "siguiente") |
| `prefill(form, fields)` | Fills a form on screen (a reply, a new reservation, a knowledge item) **without submitting** | The host reviews it and presses the button themselves |

**Permission rule (unchanged):** Anfi never presses buttons that act (Enviar, Aprobar, Borrar, Guardar). Navigation, highlights and prefilling are reversible. Actions with effects stay as approval cards or as the host's own tap.

### Browser side

- `use-assistant` handles `ui` events through `navigate` (`router.push`), `highlight` (scroll plus spotlight overlay), `tour` (step queue) and `prefill` (form refs registered with a `useAnfiForm(id)` hook).
- **Spotlight:** a dimmed backdrop with a cut-out around `[data-anfi=id]`, plus a tooltip (Blemia-style card). It respects reduced motion and closes on Esc or any click.
- **Mobile:** the bottom sheet collapses to a small bar during navigation so the page is visible, then reopens.

### Voice (building-gpt-agents)

- **Delegation:** voice instructions add that navigation, explanations and tours are backend work: "Delegate before describing a page; never guess what is on screen."
- **voice-bridge:** after each `ui` event it appends commentary, e.g. "Ahora estás en la Bandeja; te señalo las pendientes". During tours each step's narration goes out as commentary, and the host can interrupt.
- **Parity check:** "llévame a las reservas de Hab 2" must produce the same `navigate` call whether typed or spoken.

### Cost and model

Haiku 5.5 stays the agent. Tours are mostly registry text, so they're cheap. The tool list grows from 11 to 17; it stays under prompt caching.

## 3. Steps

1. Migration `0006` and profile preferences, plus the settings pill, modal, preview and live-session wiring.
2. `guide.ts` registry and `data-anfi` attributes on every page, with a test that sections exist.
3. UI tools (`where_am_i`, `explain_page`, `navigate`, `highlight`), the SSE `ui` event, and the dock executor with the spotlight.
4. `start_tour` and `prefill`, plus voice-bridge commentary and the voice instruction update.
5. Checks:
   - unit tests for the registry and tool guards (unknown route or section rejected; prefill never submits);
   - typed vs. spoken parity on 5 scripted requests;
   - a manual run: "explícame la app" tour by voice; "abre la escalada de María y prepárale una respuesta".

## Open questions

- Should the host's language and voice also apply to the guest-facing voice notes, or keep a separate "brand voice" per organisation?
- Should a 60-second first-run tour start automatically for new hosts?
- Custom voice ID: do you have one from your voice tech to add as the default?
