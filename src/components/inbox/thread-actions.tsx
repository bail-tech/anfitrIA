'use client';

import { AudioLines, Hand, Loader2, Mic, Send, Square, Trash2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Badge, buttonClass, Card, inputClass } from '@/components/ui';
import type { EscalationReason } from '@/lib/types';

interface Props {
  conversationId: number;
  handoff: boolean;
  windowOpen: boolean;
  ttsAvailable: boolean;
  draft: { id: number; text: string; confidence: number; reason: EscalationReason | null; question: string } | null;
}

/** WhatsApp shows OGG/Opus as a voice note; MP4/AAC as an audio file; WebM is refused. */
function pickMime(): string {
  for (const m of ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus']) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

export function ThreadActions({ conversationId, handoff, windowOpen, ttsAvailable, draft }: Props) {
  const t = useTranslations('inbox');
  const router = useRouter();
  const [text, setText] = useState(draft?.text ?? '');
  const [learn, setLearn] = useState(false);
  const [category, setCategory] = useState('general');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ blob: Blob; url: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  async function call(name: string, url: string, init: RequestInit) {
    setBusy(name);
    setError(null);
    const res = await fetch(url, init);
    setBusy(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? t('error'));
      return false;
    }
    router.refresh();
    return true;
  }

  const sendText = () =>
    call('text', `/api/conversations/${conversationId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, draft_id: draft?.id, learn_category: learn ? category : undefined }),
    }).then((ok) => ok && setText(''));

  const sendAssistantVoice = () => {
    const form = new FormData();
    form.set('mode', 'assistant_voice');
    form.set('text', text);
    if (draft) form.set('draft_id', String(draft.id));
    return call('tts', `/api/conversations/${conversationId}/audio`, { method: 'POST', body: form }).then((ok) => ok && setText(''));
  };

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
        setRecording({ blob, url: URL.createObjectURL(blob) });
      };
      rec.start();
      recorder.current = rec;
      setBusy('recording');
    } catch {
      setError('mic');
    }
  }

  function stopRecording() {
    recorder.current?.stop();
    recorder.current = null;
    setBusy(null);
  }

  async function sendRecording() {
    if (!recording) return;
    const form = new FormData();
    form.set('mode', 'my_voice');
    const type = recording.blob.type.split(';')[0];
    form.set('file', new File([recording.blob], `note.${type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'}`, { type }));
    if (draft) form.set('draft_id', String(draft.id));
    if (await call('voice', `/api/conversations/${conversationId}/audio`, { method: 'POST', body: form })) setRecording(null);
  }

  return (
    <Card className="mt-4 space-y-3 p-4">
      {draft && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">{t('aiDraft')}</span>
          <Badge tone="gold">
            {t('confidence')} {Math.round(draft.confidence * 100)}%
          </Badge>
          {draft.reason && (
            <Badge tone={draft.reason === 'urgente' ? 'terra' : 'neutral'}>
              {t('why')}: {t(`reason_${draft.reason}` as 'reason_auto')}
            </Badge>
          )}
        </div>
      )}
      {handoff && <p className="rounded-xl bg-violet-soft px-3 py-2 text-sm text-[#5a3fa0]">{t('handoffOn')}</p>}
      {!windowOpen && <p className="rounded-xl bg-terra-soft px-3 py-2 text-sm text-terra-ink">{t('windowClosed')}</p>}
      <textarea name="text" value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={t('placeholder')} className={inputClass} />
      {draft && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
          {t('learn')}
          {learn && <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass + ' w-40'} aria-label={t('learnCategory')} />}
        </label>
      )}
      {recording && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sand/60 p-2">
          <audio controls src={recording.url} className="h-8" />
          <button onClick={sendRecording} disabled={busy !== null} className={buttonClass('primary', 'sm')}>
            {busy === 'voice' ? <Loader2 className="animate-spin" /> : <Send />} {t('sendRecording')}
          </button>
          <button onClick={() => setRecording(null)} className={buttonClass('ghost', 'sm')}>
            <Trash2 /> {t('discard')}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-terra">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={sendText} disabled={!text.trim() || busy !== null || !windowOpen} className={buttonClass('primary')}>
          {busy === 'text' ? <Loader2 className="animate-spin" /> : <Send />} {t('send')}
        </button>
        {ttsAvailable && (
          <button onClick={sendAssistantVoice} disabled={!text.trim() || busy !== null || !windowOpen} className={buttonClass('ghost')}>
            {busy === 'tts' ? <Loader2 className="animate-spin" /> : <AudioLines />} {t('sendVoice')}
          </button>
        )}
        {busy === 'recording' ? (
          <button onClick={stopRecording} className={buttonClass('danger')}>
            <Square /> {t('stop')}
          </button>
        ) : (
          <button onClick={startRecording} disabled={busy !== null || !windowOpen} className={buttonClass('ghost')}>
            <Mic /> {t('record')}
          </button>
        )}
        <button
          onClick={() => call('handoff', `/api/conversations/${conversationId}/handoff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ take_over: !handoff }) })}
          disabled={busy !== null}
          className={buttonClass('ghost') + ' ml-auto'}
        >
          {handoff ? <Undo2 /> : <Hand />} {handoff ? t('release') : t('takeOver')}
        </button>
      </div>
    </Card>
  );
}
