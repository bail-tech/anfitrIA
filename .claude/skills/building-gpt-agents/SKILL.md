---
name: building-gpt-agents
description: Voice layer design for custom GPT agents — pick GPT-Live, Realtime, or a chained STT→agent→TTS path, then wire delegation to an existing text agent. Use when building custom GPT agents, GPT-Live, Realtime, speech-to-speech, client delegation, voice agents, live transcription, or adding voice to a Salesforce, Agentforce, or other text agent.
---

# Building GPT Agents

A custom GPT agent with voice is two systems. The **voice layer** listens and speaks. The **text agent** reasons, uses tools, checks permissions, and writes records. **Delegation** is the handoff between them.

This skill is the OpenAI API stack, not a ChatGPT Custom GPT. Vapi assistants stay on the `create-assistant` skill. Sharing a transport does not make GPT-Live and Realtime handshakes, credentials, or events interchangeable.

Confirm model names, events, and endpoints against the live docs (append `.md` to the page URL) before writing code. Start at [Audio and voice](https://developers.openai.com/api/docs/guides/audio).

## 1. Name the job

Done when one row below is the job, written in the reply.

For a new conversational voice app, start with **GPT-Live**. It is **full duplex**: it listens while speaking and keeps talking while the text agent works.

Use another row only when that is the product:

| Build | Start here | What you control |
| --- | --- | --- |
| A speech-to-speech agent using the Realtime session and tool model | [Realtime API](https://developers.openai.com/api/docs/guides/realtime) | Audio turns, session state, tools, and interruptions. |
| A voice interface for an existing text agent | [Voice agents](https://developers.openai.com/api/docs/guides/voice-agents#build-a-chained-voice-workflow) | Speech-to-text, the text-agent workflow, then text-to-speech. |
| A transcript of an audio file | [File transcription](https://developers.openai.com/api/docs/guides/speech-to-text) | File uploads, bounded requests, and supported transcript formats. |
| Live captions without assistant speech | [Live transcription](https://developers.openai.com/api/docs/guides/realtime-transcription) | Streaming audio and incremental transcript events. |
| Continuous speech translation | [Live translation](https://developers.openai.com/api/docs/guides/realtime-translation) | A dedicated translation session, not a voice-agent turn loop. |
| Narration or generated speech | [Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech) | Text, voice, and output format. |
| Audio input or output in an existing chat app | [Audio in Chat Completions](https://developers.openai.com/api/docs/guides/audio-chat-completions) | Bounded multimodal chat requests. |

**Build with voice.** An existing text agent still starts on GPT-Live plus **client delegation**, not the chained row, unless each stage must be inspected or swapped. The chained row is STT → text agent → TTS. GPT-Live is the voice layer over that same agent.

Conversational architectures, when the job is a spoken agent:

| Architecture | Best for |
| --- | --- |
| GPT-Live | Full-duplex talk with a separate backend |
| Realtime API | Speech, reasoning, and tools in one session |
| Chained pipeline | Inspect or replace STT, the agent, and TTS independently |

Non-conversational rows: read [workflows.md](workflows.md) and stop after that branch.

In this repo, portal voice is GPT-Live + client delegation + Agentforce. Read [monita.md](monita.md) before changing `MonitaLiveSessionController` or `liveShell.js`.

## 2. Split the voice layer from the text agent

Done when the reply names (a) the voice layer, (b) the text agent, (c) the delegation mode, and (d) where permissions run.

| Piece | Owns | Lives in |
| --- | --- | --- |
| Voice layer | Manner, pace, interruptions, when to delegate | `session.instructions` on GPT-Live / Realtime |
| Text agent | Tools, business rules, facts, disclosures, writes | Existing agent prompt and tool loop |
| Application | Auth, confirmations, records, whether work finishes after an interrupt | Your server |

Delegation mode, chosen at session create (a new session to change it):

- **Client delegation** — the app runs the existing text agent and returns results. Default when a Salesforce, Agentforce, Agents SDK, eve, or other harness already owns tools.
- **Responses delegation** — OpenAI runs a Responses model; the app still executes custom functions. Default only when there is no existing agent.

Realtime keeps speech and tools in one session. Use it when that session-and-tool model is the product. Otherwise keep tools on the text agent.

## 3. Choose the connection

Done when transport and the server that holds the project key are named.

| Surface | Transport |
| --- | --- |
| Browser or mobile mic | [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc) |
| Server audio pipeline | [WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets) |
| Phone | [Telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip) |
| Observe or steer a live call from the server | [Sideband](https://developers.openai.com/api/docs/guides/voice-server-controls) |

The project key stays on a trusted server. The browser sends an SDP offer and receives an SDP answer. GPT-Live has no ephemeral-key path like older Realtime minting.

Read [connections.md](connections.md) before writing the handshake.

## 4. Wire the session

Done when every item in the branch checklist is either built or listed as a gap.

**GPT-Live + existing text agent** (this repo's default):

1. Server creates `POST /v1/live/sessions` with `model`, short voice instructions, `delegation: { type: "client" }`, and the WebRTC SDP.
2. Browser waits for `session.started` on the `oai-events` data channel.
3. On `session.delegation.created` with `target: "client"`, build the request from transcripts and app state — the event has no utterance.
4. Hold invention with `session.thinking.append`. Speak the text agent's result with `session.commentary.append`. Redirect the voice layer with `session.instructions.append`.
5. The text agent is the same turn path as typed chat when one exists.

Read [live-delegation.md](live-delegation.md) for the prompt template, events, and text-agent contract.

**Realtime speech-to-speech:** session tools and turn events stay on the Realtime session. See [workflows.md](workflows.md).

**Chained:** STT, then the text agent, then TTS. Use when a human or policy check must see the text before speech.

## 5. Verify conversation and task

Done when a spoken request that needs the text agent produces the same record as the typed path, and a spoken request that does not need it never hits the text agent.

Check both:

- **Task** — tool args, permissions, final record, spoken confirmation matches the write.
- **Conversation** — interruption yield, silence while the backend runs, no invented facts or completed actions.

Crawl / Walk / Run: synthetic single turns, then replayed human audio, then a multi-turn simulated caller. Cookbook: [voice agent evaluation](https://developers.openai.com/cookbook/examples/audio/voice_agent_evaluation).
