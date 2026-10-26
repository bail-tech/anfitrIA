'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { buttonClass, Field, inputClass } from '@/components/ui';
import { CharacterPoster } from '@/components/character/poster';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.replace('/');
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: String(form.get('name') ?? ''), org_name: String(form.get('org') ?? '') },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) setError(error.message);
      else if (data.session) router.replace('/');
      else setInfo(t('checkEmail'));
    }
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-line bg-paper shadow-xl md:grid-cols-2">
        <div className="flex flex-col justify-between bg-ink p-8 text-cream">
          <div>
            <div className="font-display text-3xl font-semibold">AnfitrIA</div>
            <p className="mt-2 text-sm text-cream/70">{t('tagline')}</p>
          </div>
          <CharacterPoster className="mx-auto my-6 h-56 w-56" />
          <p className="text-xs text-cream/50">Huéspedes · Operaciones · Precios · Analítica · Marketing</p>
        </div>
        <form onSubmit={submit} className="space-y-4 p-8">
          <h1 className="font-display text-2xl font-semibold">{mode === 'login' ? t('login') : t('signup')}</h1>
          {mode === 'signup' && (
            <>
              <Field label={t('name')}>
                <input name="name" required className={inputClass} autoComplete="name" />
              </Field>
              <Field label={t('org')}>
                <input name="org" className={inputClass} autoComplete="organization" />
              </Field>
            </>
          )}
          <Field label={t('email')}>
            <input name="email" type="email" required className={inputClass} autoComplete="email" />
          </Field>
          <Field label={t('password')}>
            <input name="password" type="password" required minLength={8} className={inputClass} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          {error && <p className="rounded-xl bg-terra-soft px-3 py-2 text-sm text-terra">{error}</p>}
          {info && <p className="rounded-xl bg-sage-soft px-3 py-2 text-sm text-[#2f6b4f]">{info}</p>}
          <button disabled={busy} className={buttonClass('primary') + ' w-full'}>
            {mode === 'login' ? t('login') : t('signup')}
          </button>
          <p className="text-center text-sm text-muted">
            {mode === 'login' ? t('noAccount') : t('haveAccount')}{' '}
            <Link className="font-medium text-ink underline" href={mode === 'login' ? '/signup' : '/login'}>
              {mode === 'login' ? t('signup') : t('login')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
