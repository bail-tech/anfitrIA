'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { buttonClass, Field, inputClass } from '@/components/ui';

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
        <div className="flex flex-col items-center justify-between gap-4 border-b border-line bg-cream p-8 text-center md:border-b-0 md:border-r">
          {/* multiply drops the artwork's off-white background onto the panel colour */}
          <Image priority src="/brand/anfitria-logo-360.webp" alt="AnfitrIA" width={360} height={360} className="w-56 mix-blend-multiply md:w-64" />
          <p className="text-sm text-muted">{t('tagline')}</p>
          <p className="text-xs text-muted/70">Huéspedes · Operaciones · Precios · Analítica · Marketing</p>
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
