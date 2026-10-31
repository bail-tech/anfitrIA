'use client';

import { CheckCircle2, Loader2, Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { inputClass } from '@/components/ui';
import { ageOn, DOCUMENT_TYPES, KINSHIPS, SEXES } from '@/lib/compliance/ses-codes';
import { cn } from '@/lib/utils';

export interface CheckinLabels {
  traveller: string;
  minor: string;
  add: string;
  remove: string;
  first_name: string;
  surname1: string;
  surname2: string;
  birth_date: string;
  nationality: string;
  sex: string;
  document_type: string;
  document_number: string;
  document_support: string;
  supportHint: string;
  country: string;
  address: string;
  address_extra: string;
  postal_code: string;
  municipality_code: string;
  municipalityCodeHint: string;
  municipality_name: string;
  phone: string;
  email: string;
  kinship: string;
  choose: string;
  submit: string;
  sent: string;
  error: string;
  locked: string;
  invalid: string;
  docTypes: Record<string, string>;
  sexes: Record<string, string>;
  kinships: Record<string, string>;
}

type Traveller = Record<string, string>;

const EMPTY: Traveller = { country: 'ESP', nationality: '' };

export function CheckinForm({ token, checkIn, initialCount, countries, labels: L }: { token: string; checkIn: string; initialCount: number; countries: Array<{ code: string; name: string }>; labels: CheckinLabels }) {
  const [travellers, setTravellers] = useState<Traveller[]>(() => Array.from({ length: initialCount }, () => ({ ...EMPTY })));
  const [errors, setErrors] = useState<string[][]>([]);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'locked'>('idle');

  const set = (i: number, key: string, value: string) => setTravellers((list) => list.map((t, j) => (j === i ? { ...t, [key]: value } : t)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    const body = { travellers: travellers.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v === '' ? null : v]).filter(([, v]) => v !== null))) };
    const res = await fetch(`/api/checkin/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      setErrors([]);
      return setState('sent');
    }
    const data = (await res.json().catch(() => ({}))) as { errors?: string[][]; code?: string };
    setErrors(data.errors ?? []);
    setState(res.status === 409 ? 'locked' : 'error');
  }

  if (state === 'sent') {
    return (
      <p className="mt-6 flex items-center gap-2 rounded-2xl bg-sage-soft px-4 py-3 text-sm text-[#0b5e44]">
        <CheckCircle2 className="size-5" /> {L.sent}
      </p>
    );
  }

  const field = (i: number, key: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block space-y-1 text-sm">
      <span className={cn('font-medium', errors[i]?.includes(key) && 'text-terra-ink')}>{label}</span>
      <input value={travellers[i][key] ?? ''} onChange={(e) => set(i, key, e.target.value)} className={cn(inputClass, errors[i]?.includes(key) && 'border-terra')} {...props} />
    </label>
  );

  const select = (i: number, key: string, label: string, options: Array<[string, string]>, required = false) => (
    <label className="block space-y-1 text-sm">
      <span className={cn('font-medium', errors[i]?.includes(key) && 'text-terra-ink')}>{label}</span>
      <select value={travellers[i][key] ?? ''} onChange={(e) => set(i, key, e.target.value)} required={required} className={cn(inputClass, errors[i]?.includes(key) && 'border-terra')}>
        <option value="">{L.choose}</option>
        {options.map(([v, n]) => (
          <option key={v} value={v}>{n}</option>
        ))}
      </select>
    </label>
  );

  const countryList: Array<[string, string]> = countries.map((c) => [c.code, c.name]);

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      {travellers.map((t, i) => {
        const minor = /^\d{4}-\d{2}-\d{2}$/.test(t.birth_date ?? '') && ageOn(t.birth_date, checkIn) < 18;
        const spanishId = t.document_type === 'NIF' || t.document_type === 'NIE';
        return (
          <fieldset key={i} className="space-y-3 rounded-2xl border border-line bg-paper p-4">
            <legend className="px-1 text-sm font-semibold">
              {L.traveller} {i + 1} {minor && <span className="font-normal text-muted">· {L.minor}</span>}
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {field(i, 'first_name', L.first_name, { required: true, autoComplete: 'given-name' })}
              {field(i, 'surname1', L.surname1, { required: true, autoComplete: 'family-name' })}
              {field(i, 'surname2', L.surname2, { required: t.document_type === 'NIF' })}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {field(i, 'birth_date', L.birth_date, { type: 'date', required: true, autoComplete: 'bday' })}
              {select(i, 'nationality', L.nationality, countryList)}
              {select(i, 'sex', L.sex, SEXES.map((s) => [s, L.sexes[s] ?? s]))}
            </div>
            {!minor && (
              <div className="grid gap-3 sm:grid-cols-3">
                {select(i, 'document_type', L.document_type, DOCUMENT_TYPES.map((d) => [d, L.docTypes[d] ?? d]), true)}
                {field(i, 'document_number', L.document_number, { required: true, autoCapitalize: 'characters' })}
                {spanishId && field(i, 'document_support', L.document_support, { required: true, placeholder: L.supportHint, autoCapitalize: 'characters' })}
              </div>
            )}
            {minor && select(i, 'kinship', L.kinship, KINSHIPS.map((k) => [k, L.kinships[k] ?? k]), true)}
            <div className="grid gap-3 sm:grid-cols-2">
              {select(i, 'country', L.country, countryList, true)}
              {field(i, 'postal_code', L.postal_code, { required: true, autoComplete: 'postal-code' })}
            </div>
            {field(i, 'address', L.address, { required: true, autoComplete: 'street-address' })}
            {field(i, 'address_extra', L.address_extra)}
            {t.country === 'ESP' ? (
              <div>
                {field(i, 'municipality_code', L.municipality_code, { required: true, inputMode: 'numeric', pattern: '[0-9]{5}', maxLength: 5 })}
                <p className="mt-1 text-xs text-muted">
                  {L.municipalityCodeHint}{' '}
                  <a href="https://www.ine.es/" className="underline" target="_blank" rel="noreferrer">ine.es</a>
                </p>
              </div>
            ) : (
              field(i, 'municipality_name', L.municipality_name, { required: true, autoComplete: 'address-level2' })
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {field(i, 'phone', L.phone, { type: 'tel', autoComplete: 'tel' })}
              {field(i, 'email', L.email, { type: 'email', autoComplete: 'email' })}
            </div>
            {travellers.length > 1 && (
              <button type="button" onClick={() => setTravellers((list) => list.filter((_, j) => j !== i))} className="flex items-center gap-1 text-xs text-muted hover:text-terra-ink">
                <Minus className="size-3.5" /> {L.remove}
              </button>
            )}
          </fieldset>
        );
      })}

      {travellers.length < 20 && (
        <button type="button" onClick={() => setTravellers((list) => [...list, { ...EMPTY }])} className="flex items-center gap-1.5 text-sm font-medium text-brand-ink">
          <Plus className="size-4" /> {L.add}
        </button>
      )}

      {(state === 'error' || state === 'locked') && (
        <p className="rounded-xl bg-terra-soft px-3 py-2 text-sm text-terra-ink" role="alert">
          {state === 'locked' ? L.locked : errors.some((e) => e.length) ? L.invalid : L.error}
        </p>
      )}

      <button disabled={state === 'sending'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-semibold text-ink disabled:opacity-60">
        {state === 'sending' && <Loader2 className="size-4 animate-spin" />} {L.submit}
      </button>
    </form>
  );
}
