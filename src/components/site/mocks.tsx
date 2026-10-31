/**
 * Small, live-looking pieces of the product for the landing page. Pure markup: items rise in when
 * their section scrolls into view (see RevealOnScroll). Example guests and numbers are clearly
 * illustrative, not customer data.
 */
import { BedDouble, Car, Check, CheckCircle2, FileText, Link2, Lock, Mic, Play, Shield, Sparkles, UserCheck } from 'lucide-react';
import type { Lang } from '@/lib/marketing/content';
import type { MockKind } from '@/lib/marketing/pitch';
import { cn } from '@/lib/utils';

const Item = ({ i, className, children }: { i: number; className?: string; children: React.ReactNode }) => (
  <div className={cn('reveal-item', className)} style={{ animationDelay: `${i * 220}ms` }}>
    {children}
  </div>
);

const Frame = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-line bg-paper p-4 shadow-[0_20px_50px_-24px_rgba(22,48,42,0.35)]">
    {title && <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted"><span className="size-2 rounded-full bg-brand" /> {title}</div>}
    {children}
  </div>
);

const Guest = ({ i, children }: { i: number; children: React.ReactNode }) => (
  <Item i={i} className="mr-10 w-fit rounded-2xl rounded-bl-md border border-line bg-cream px-3 py-2 text-sm">{children}</Item>
);
const Anfi = ({ i, children, tag }: { i: number; children: React.ReactNode; tag?: string }) => (
  <Item i={i} className="ml-10 rounded-2xl rounded-br-md bg-ink px-3 py-2 text-sm text-cream">
    {children}
    {tag && <div className="mt-1 text-[10px] uppercase tracking-wider text-brand">{tag}</div>}
  </Item>
);

const T = {
  es: {
    inbox: ['Bandeja · Born Loft', 'Hola! ¿Cuál es la contraseña del wifi? 🙏', '¡Hola María! La red es BornLoft_5G y la contraseña está en la tarjeta junto al router. ¡Disfrutad!', 'Enviado por Anfi · 4 s', '¿Y hay parking cerca?', 'El más cercano es el Parking Born, a 3 min andando, unos 25 € al día.'],
    approval: ['Necesita tu visto bueno', 'Queja · confianza 38 %', '«Hemos salido y el código de la puerta no funciona»', 'Siento mucho el problema, María. Prueba a marcar el código despacio y terminar con #. Te llamo en 2 minutos.', 'Aprobar y enviar', 'Editar'],
    voice: ['«¿Qué tengo hoy?»', 'Hoy llega Priya a Eixample Suite y se va Sven. Tienes 2 escaladas: la de María es urgente. ¿Te la abro?', '«Sí, ábrela y prepárale respuesta»', 'Abriendo la conversación… borrador listo para que lo revises.'],
    journey: [['Reserva confirmada', 'Al reservar'], ['Instrucciones de llegada', '24 h antes'], ['¿Qué tal la primera noche?', 'Estancias de 3+ noches'], ['Recordatorio de salida', 'La víspera'], ['Petición de reseña', 'Solo si fue bien']],
    voicenote: ['WhatsApp · Tomás', 'Nota de voz de Anfi · 0:18', '«Hola Tomás, para llegar desde el aeropuerto…»'],
    extras: ['Hi! Our flight lands at 9am. Could we check in early?', 'Extra detectado', 'Entrada anticipada · 25 €', 'Aprobar oferta', 'Este mes: 2 extras aceptados · 55 €'],
    learn: ['Aprendido de 9 respuestas tuyas', [['wifi', 'Red BornLoft_5G, contraseña en la tarjeta del router.'], ['parking', 'Parking Born, Carrer del Comerç 9, 3 min a pie.'], ['local', 'Para desayunar, Bar del Pla (2 min).']], 'Añadir a la ficha'],
    report: ['Liquidación · Born Loft · octubre', [['Ingresos brutos', '2.170 €'], ['Comisiones de canal', '−282 €'], ['Comisión de gestión (20 %)', '−378 €'], ['Limpiezas (6)', '−150 €']], 'Neto para el propietario', '1.360 €', 'Descargar PDF'],
    steps: [['Conecta', 'WhatsApp Business y, si usas Smoobu, tus pisos, reservas y mensajes.'], ['Enséñame', 'Aprendo de tus respuestas y de la ficha de cada alojamiento.'], ['Supervisa', 'Empieza aprobando cada mensaje; dame más margen cuando confíes.']],
    trust: [['Solo con tus datos', 'No invento horarios, precios ni normas.'], ['Códigos protegidos', 'El código de la puerta solo durante la estancia.'], ['Lo delicado, a ti', 'Quejas, reembolsos y urgencias te llegan siempre.'], ['Tus datos son tuyos', 'Tus huéspedes y tu historial te pertenecen.']],
  },
  en: {
    inbox: ['Inbox · Born Loft', 'Hi! What’s the wifi password? 🙏', 'Hi María! The network is BornLoft_5G and the password is on the card by the router. Enjoy!', 'Sent by Anfi · 4 s', 'And is there parking nearby?', 'The closest is Parking Born, a 3-minute walk, about €25 a day.'],
    approval: ['Needs your approval', 'Complaint · confidence 38%', '“We went out and the door code doesn’t work”', 'So sorry, María. Try entering the code slowly and finish with #. I’ll call you in 2 minutes.', 'Approve & send', 'Edit'],
    voice: ['“What’s on today?”', 'Priya arrives at Eixample Suite and Sven checks out. You have 2 escalations: María’s is urgent. Shall I open it?', '“Yes, open it and draft a reply”', 'Opening the conversation… draft ready for you to review.'],
    journey: [['Booking confirmed', 'On booking'], ['Arrival instructions', '24 h before'], ['How was the first night?', 'Stays of 3+ nights'], ['Check-out reminder', 'The day before'], ['Review request', 'Only if it went well']],
    voicenote: ['WhatsApp · Tomás', 'Voice note from Anfi · 0:18', '“Hi Tomás, to get here from the airport…”'],
    extras: ['Hi! Our flight lands at 9am. Could we check in early?', 'Extra spotted', 'Early check-in · €25', 'Approve offer', 'This month: 2 extras accepted · €55'],
    learn: ['Learned from 9 of your replies', [['wifi', 'Network BornLoft_5G, password on the router card.'], ['parking', 'Parking Born, Carrer del Comerç 9, 3-min walk.'], ['local', 'For breakfast, Bar del Pla (2 min).']], 'Add to the property'],
    report: ['Statement · Born Loft · October', [['Gross revenue', '€2,170'], ['Channel fees', '−€282'], ['Management fee (20%)', '−€378'], ['Cleanings (6)', '−€150']], 'Net to owner', '€1,360', 'Download PDF'],
    steps: [['Connect', 'WhatsApp Business and, if you use Smoobu, your flats, bookings and messages.'], ['Teach me', 'I learn from your replies and each property’s facts.'], ['Supervise', 'Start by approving every message; give me more room as you trust me.']],
    trust: [['Only your facts', 'I never invent times, prices or rules.'], ['Codes protected', 'Door codes only during the stay.'], ['Sensitive goes to you', 'Complaints, refunds and emergencies always reach you.'], ['Your data is yours', 'Your guests and history belong to you.']],
  },
} as const;

export function Mock({ kind, lang }: { kind: MockKind; lang: Lang }) {
  const t = T[lang];
  switch (kind) {
    case 'inbox': {
      const [title, q1, a1, tag, q2, a2] = t.inbox;
      return (
        <Frame title={title}>
          <div className="space-y-2">
            <Guest i={0}>{q1}</Guest>
            <Anfi i={1} tag={tag}>{a1}</Anfi>
            <Guest i={2}>{q2}</Guest>
            <Anfi i={3}>{a2}</Anfi>
          </div>
        </Frame>
      );
    }
    case 'approval': {
      const [head, why, guest, draft, approve, edit] = t.approval;
      return (
        <Frame>
          <Item i={0} className="mb-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-terra-ink">● {head}</span>
            <span className="rounded-full bg-terra-soft px-2 py-0.5 text-terra-ink">{why}</span>
          </Item>
          <Item i={1} className="mb-2 text-sm text-muted">{guest}</Item>
          <Item i={2} className="rounded-2xl border border-brand/40 bg-brand-soft/50 p-3 text-sm">{draft}</Item>
          <Item i={3} className="mt-3 flex gap-2">
            <span className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-ink"><Check className="size-3.5" /> {approve}</span>
            <span className="rounded-xl border border-line px-3 py-2 text-xs">{edit}</span>
          </Item>
        </Frame>
      );
    }
    case 'voice': {
      const [q1, a1, q2, a2] = t.voice;
      return (
        <Frame>
          <Item i={0} className="mb-3 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-brand text-ink"><Mic className="size-5" /></span>
            <span className="flex h-8 items-center gap-1">
              {[0.2, 0.5, 0.35, 0.8, 0.45, 0.9, 0.3, 0.6, 0.4, 0.75, 0.25].map((d, k) => (
                <span key={k} className="animate-wave block h-full w-1 rounded-full bg-brand" style={{ animationDelay: `${d}s` }} />
              ))}
            </span>
          </Item>
          <div className="space-y-2">
            <Guest i={1}>{q1}</Guest>
            <Anfi i={2}>{a1}</Anfi>
            <Guest i={3}>{q2}</Guest>
            <Anfi i={4}>
              <Sparkles className="mr-1 inline size-3.5 text-brand" /> {a2}
            </Anfi>
          </div>
        </Frame>
      );
    }
    case 'journey':
      return (
        <Frame>
          <ol className="relative space-y-3 border-l-2 border-brand/30 pl-5">
            {t.journey.map(([title, when], i) => (
              <Item key={title} i={i}>
                <li className="relative">
                  <span className="absolute -left-[27px] top-1 grid size-4 place-items-center rounded-full bg-brand text-ink"><Check className="size-2.5" /></span>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="text-xs text-muted">{when}</div>
                </li>
              </Item>
            ))}
          </ol>
        </Frame>
      );
    case 'voicenote': {
      const [title, note, transcript] = t.voicenote;
      return (
        <Frame title={title}>
          <Item i={0} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#d9fdd3] p-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-brand-ink text-white"><Play className="size-4" /></span>
              <span className="flex h-6 items-center gap-0.5">
                {Array.from({ length: 22 }, (_, k) => (
                  <span key={k} className="block w-0.5 rounded-full bg-brand-ink/70" style={{ height: `${30 + ((k * 37) % 70)}%` }} />
                ))}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-ink/60">{note}</div>
          </Item>
          <Item i={1} className="mt-2 text-right text-xs italic text-muted">{transcript}</Item>
        </Frame>
      );
    }
    case 'extras': {
      const [guest, spotted, offer, approve, month] = t.extras;
      return (
        <Frame>
          <Guest i={0}>{guest}</Guest>
          <Item i={1} className="mt-3 rounded-2xl border border-brand/40 bg-brand-soft/50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-ink">{spotted}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold"><BedDouble className="size-4" /> {offer}</span>
              <span className="rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-ink">{approve}</span>
            </div>
          </Item>
          <Item i={2} className="mt-3 flex items-center gap-2 text-xs text-muted"><Car className="size-3.5" /> {month}</Item>
        </Frame>
      );
    }
    case 'learn': {
      const [head, items, add] = t.learn;
      return (
        <Frame title={head}>
          <div className="space-y-2">
            {items.map(([cat, text], i) => (
              <Item key={cat} i={i} className="rounded-xl bg-sand/70 px-3 py-2 text-sm">
                <span className="mr-2 rounded-md bg-paper px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted">{cat}</span>
                {text}
              </Item>
            ))}
            <Item i={3} className="w-fit rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-ink">{add}</Item>
          </div>
        </Frame>
      );
    }
    case 'report': {
      const [head, rows, netLabel, net, pdf] = t.report;
      return (
        <Frame title={head}>
          <dl className="space-y-1.5 text-sm">
            {rows.map(([k, v], i) => (
              <Item key={k} i={i} className="flex justify-between">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </Item>
            ))}
            <Item i={4} className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <dt>{netLabel}</dt>
              <dd className="text-brand-ink">{net}</dd>
            </Item>
          </dl>
          <Item i={5} className="mt-3 flex w-fit items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs"><FileText className="size-3.5" /> {pdf}</Item>
        </Frame>
      );
    }
    case 'steps':
      return (
        <ol className="grid gap-3">
          {t.steps.map(([title, body], i) => (
            <Item key={title} i={i} className="flex gap-4 rounded-2xl border border-line bg-paper p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">{[<Link2 key="a" className="size-5" />, <Sparkles key="b" className="size-5" />, <UserCheck key="c" className="size-5" />][i]}</span>
              <div>
                <div className="font-mono text-xs text-brand-ink">0{i + 1}</div>
                <div className="font-semibold">{title}</div>
                <div className="text-sm text-muted">{body}</div>
              </div>
            </Item>
          ))}
        </ol>
      );
    case 'trust':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {t.trust.map(([title, body], i) => (
            <Item key={title} i={i} className="rounded-2xl border border-line bg-paper p-4">
              <span className="mb-2 grid size-9 place-items-center rounded-xl bg-brand-soft text-brand-ink">{[<Shield key="a" className="size-4" />, <Lock key="b" className="size-4" />, <CheckCircle2 key="c" className="size-4" />, <UserCheck key="d" className="size-4" />][i]}</span>
              <div className="font-semibold">{title}</div>
              <div className="text-sm text-muted">{body}</div>
            </Item>
          ))}
        </div>
      );
    case 'pilot':
      return null;
  }
}
