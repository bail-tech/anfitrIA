'use client';

/**
 * GPT-Live voice for Anfi (adapted from Blemia's use-blemi-voice): speech in, the same assistant
 * path as typing, verified results spoken back. The voice layer never acts on its own.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Assistant } from './use-assistant';
import { MAX_APPEND_CHARS, utteranceSince, voiceUpdate } from './voice-bridge';

const MAX_VOICE_SECONDS = 600;
/** Transcript deltas can arrive just after the delegation event. */
const TRANSCRIPT_SETTLE_MS = 700;

type LiveEvent =
  | { type: 'session.started' }
  | { type: 'session.closed' }
  | { type: 'session.input_transcript.delta'; delta: string; start_ms: number }
  | { type: 'session.delegation.created'; offset_ms: number; delegation: { id: string; target: string } }
  | { type: string };

const noSubscribe = () => () => {};
const voiceSupported = () =>
  process.env.NEXT_PUBLIC_VOICE === 'true' && typeof RTCPeerConnection !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

function meter(stream: MediaStream, context: AudioContext) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  return () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  };
}

interface Live {
  peer: RTCPeerConnection;
  events: RTCDataChannel;
  mic: MediaStream;
  audio: HTMLAudioElement;
  context: AudioContext;
  transcript: Array<{ text: string; start: number }>;
  lastOffset: number;
  delegation: string | null;
  reported: Set<string>;
  timers: number[];
  raf: number;
}

export function useVoice({ assistant, locale }: { assistant: Assistant; locale: string }) {
  const [active, setActive] = useState(false);
  // NEXT_PUBLIC_VOICE=true once OPENAI_API_KEY is set on the server; false during SSR.
  const supported = useSyncExternalStore(noSubscribe, voiceSupported, () => false);
  const [error, setError] = useState<string | null>(null);
  /** Loudness 0..1 of the host's mic and of Anfi's voice, updated every animation frame. */
  const levels = useRef({ mic: 0, speaker: 0 });
  const assistantRef = useRef(assistant);
  const live = useRef<Live | null>(null);

  useEffect(() => {
    assistantRef.current = assistant;
  });


  const append = useCallback((kind: 'commentary' | 'thinking', content: string, delegationId: string | null) => {
    const l = live.current;
    if (!l || l.events.readyState !== 'open') return;
    l.events.send(JSON.stringify({ type: `session.${kind}.append`, delegation_id: delegationId, content: content.slice(0, MAX_APPEND_CHARS) }));
  }, []);

  const cleanup = useCallback(() => {
    const l = live.current;
    if (!l) return;
    l.timers.forEach((id) => window.clearTimeout(id));
    cancelAnimationFrame(l.raf);
    l.mic.getTracks().forEach((t) => t.stop());
    l.events.close();
    l.peer.close();
    l.audio.srcObject = null;
    void l.context.close();
    live.current = null;
    levels.current.mic = 0;
    levels.current.speaker = 0;
    setActive(false);
  }, []);

  const onDelegation = useCallback(
    (id: string, offset: number) => {
      const l = live.current;
      if (!l) return;
      l.timers.push(
        window.setTimeout(() => {
          const text = utteranceSince(l.transcript, l.lastOffset);
          l.lastOffset = offset;
          if (!text) {
            append('commentary', "Sorry, I didn't catch that. Ask the host to say it again.", id);
            return;
          }
          l.delegation = id;
          assistantRef.current.items.forEach((item) => l.reported.add(item.id));
          append('thinking', 'Checking that with the backend now.', id);
          void assistantRef.current.send(text);
        }, TRANSCRIPT_SETTLE_MS),
      );
    },
    [append],
  );

  // Speak or note each new verified chat item for the current delegation.
  useEffect(() => {
    const l = live.current;
    if (!l?.delegation) return;
    for (const item of assistant.items) {
      const key = item.kind === 'proposal' ? `${item.id}:${item.proposal.status}` : item.id;
      if (l.reported.has(key)) continue;
      const r = voiceUpdate(item);
      l.reported.add(key);
      if (r) append(r.kind, r.content, l.delegation);
    }
  }, [assistant.items, append]);

  const stopRef = useRef<() => void>(() => {});

  const start = useCallback(async () => {
    if (live.current) return;
    setError(null);
    const peer = new RTCPeerConnection();
    const audio = new Audio();
    audio.autoplay = true;
    const context = new AudioContext();
    let speaker: (() => number) | null = null;
    peer.addEventListener('track', (event) => {
      const stream = new MediaStream([event.track]);
      audio.srcObject = stream;
      void audio.play().catch(() => undefined);
      speaker = meter(stream, context);
    });
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      peer.close();
      void context.close();
      setError('mic');
      return;
    }
    mic.getAudioTracks().forEach((track) => peer.addTrack(track, mic));
    const events = peer.createDataChannel('oai-events');
    const listening = meter(mic, context);
    live.current = { peer, events, mic, audio, context, transcript: [], lastOffset: 0, delegation: null, reported: new Set(), timers: [], raf: 0 };

    const tick = () => {
      if (!live.current) return;
      levels.current.mic = listening();
      levels.current.speaker = speaker?.() ?? 0;
      live.current.raf = requestAnimationFrame(tick);
    };
    tick();

    events.addEventListener('message', ({ data }) => {
      const event = JSON.parse(data) as LiveEvent;
      if (event.type === 'session.started') {
        setActive(true);
        live.current?.timers.push(window.setTimeout(() => stopRef.current(), MAX_VOICE_SECONDS * 1000));
      } else if (event.type === 'session.input_transcript.delta') {
        const e = event as Extract<LiveEvent, { type: 'session.input_transcript.delta' }>;
        live.current?.transcript.push({ text: e.delta, start: e.start_ms });
      } else if (event.type === 'session.delegation.created') {
        const e = event as Extract<LiveEvent, { type: 'session.delegation.created' }>;
        if (e.delegation.target === 'client') onDelegation(e.delegation.id, e.offset_ms);
      } else if (event.type === 'session.closed') {
        cleanup();
      }
    });
    events.addEventListener('close', () => cleanup());

    try {
      await peer.setLocalDescription(await peer.createOffer());
      await new Promise<void>((resolve) => {
        if (peer.iceGatheringState === 'complete') return resolve();
        peer.addEventListener('icegatheringstatechange', () => peer.iceGatheringState === 'complete' && resolve());
        window.setTimeout(resolve, 3000);
      });
      const res = await fetch('/api/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: peer.localDescription?.sdp, locale }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        throw new Error(data.code ?? `voice_${res.status}`);
      }
      const answer = (await res.json()) as { transport: { sdp: string } };
      await peer.setRemoteDescription({ type: 'answer', sdp: answer.transport.sdp });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'voice_failed');
      cleanup();
    }
  }, [cleanup, locale, onDelegation]);

  const stop = useCallback(() => {
    const l = live.current;
    if (!l) return;
    if (l.events.readyState === 'open') {
      l.events.send(JSON.stringify({ type: 'session.close' }));
      l.timers.push(window.setTimeout(cleanup, 3000));
    } else cleanup();
  }, [cleanup]);

  useEffect(() => {
    stopRef.current = stop;
  });

  useEffect(() => () => cleanup(), [cleanup]);

  const toggle = useCallback(() => (live.current ? stop() : void start()), [start, stop]);
  return { active, supported, error, toggle, levels };
}
