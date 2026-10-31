/**
 * The welcome tour: the whole app in about two minutes, right after sign-up. Each stop is a page
 * and a section; stops without a section show a centred card. Warm, short, and pointed at what
 * the host should set up first. `{name}` is the host's first name.
 */
import type { TourStep } from './ui-tools';

type Stop = { path: string; section: string | null; title: [string, string]; note: [string, string] };

const STOPS: Stop[] = [
  {
    path: '/',
    section: null,
    title: ['¡Hola, {name}! Soy Anfi 👋', 'Hi {name}! I’m Anfi 👋'],
    note: [
      'Voy a ser tu coanfitrión. En dos minutos te enseño todo lo que hacemos juntos y dónde dejarlo listo. Puedes pararme cuando quieras.',
      'I’ll be your co-host. In two minutes I’ll show you everything we do together and where to set it up. You can stop me any time.',
    ],
  },
  {
    path: '/',
    section: 'kpis',
    title: ['Tu negocio, de un vistazo', 'Your business at a glance'],
    note: [
      'Ingresos, ocupación y lo que espera tu visto bueno. Se llena solo en cuanto tengas reservas.',
      'Revenue, occupancy and what’s waiting for you. It fills itself in as soon as you have bookings.',
    ],
  },
  {
    path: '/',
    section: 'today',
    title: ['Lo de hoy', 'Today'],
    note: ['Quién llega, quién se va y quién está en casa. Pregúntame «¿qué tengo hoy?» y te lo cuento.', 'Who’s arriving, leaving and staying. Ask me “what’s on today?” and I’ll tell you.'],
  },
  {
    path: '/bandeja',
    section: 'list',
    title: ['Tus huéspedes, en una bandeja', 'Your guests, in one inbox'],
    note: [
      'Yo contesto lo que sé con los datos de tu alojamiento. Lo que no sé, o es delicado, te lo dejo aquí con un borrador listo para que lo apruebes.',
      'I answer what I know from your property’s facts. Anything I’m unsure about, or that’s sensitive, waits here with a draft ready for you to approve.',
    ],
  },
  {
    path: '/alojamientos',
    section: 'new',
    title: ['Primer paso: tu alojamiento', 'Step one: your property'],
    note: [
      'Empieza por aquí: añade tu piso con su nombre y dirección. Después, en su ficha, cuéntame el wifi, cómo se entra y las normas. Cuanto más sé, más respondo por ti.',
      'Start here: add your flat with its name and address. Then, on its page, tell me the wifi, how to get in and the rules. The more I know, the more I answer for you.',
    ],
  },
  {
    path: '/reservas',
    section: 'ical',
    title: ['Trae tus reservas', 'Bring in your bookings'],
    note: [
      'Pega el enlace iCal de Airbnb o Booking y las importo. Si usas Smoobu, lo conectamos en Ajustes y me traigo también los mensajes.',
      'Paste your Airbnb or Booking iCal link and I’ll import them. If you use Smoobu, we connect it in Settings and I’ll bring the messages too.',
    ],
  },
  {
    path: '/viaje',
    section: 'board',
    title: ['Mensajes que salen solos', 'Messages that send themselves'],
    note: [
      'Confirmación, instrucciones de llegada, «¿todo bien?» y la petición de reseña. Pulsa «Crear el viaje sugerido», revísalos y activa los que te gusten.',
      'Confirmation, arrival instructions, “all good?” and the review request. Tap “Create the suggested journey”, review them and switch on the ones you like.',
    ],
  },
  {
    path: '/extras',
    section: 'catalog',
    title: ['Un extra más por estancia', 'One more extra per stay'],
    note: [
      'Entrada anticipada, parking, cuna… Si un huésped lo pide, te preparo la oferta con su precio y tú solo la apruebas.',
      'Early check-in, parking, a cot… When a guest asks, I prepare the offer with its price and you just approve it.',
    ],
  },
  {
    path: '/informes',
    section: 'statement',
    title: ['Informes para tus propietarios', 'Reports for your owners'],
    note: ['Cada mes, la liquidación de cada piso lista para enviar en PDF. Sin hojas de cálculo.', 'Every month, each flat’s statement ready to send as PDF. No spreadsheets.'],
  },
  {
    path: '/ajustes',
    section: 'connections',
    title: ['Conecta tus canales', 'Connect your channels'],
    note: [
      'Aquí enlazas Smoobu y, si alquilas en España, el registro de viajeros. Para WhatsApp, escríbenos y lo dejamos listo contigo.',
      'This is where you link Smoobu and, if you rent in Spain, guest registration. For WhatsApp, message us and we’ll set it up with you.',
    ],
  },
  {
    path: '/ajustes',
    section: 'ask-anfi',
    title: ['Y lo mejor: háblame', 'And the best part: talk to me'],
    note: [
      'Este botón está en cada página. Púlsalo y dime lo que necesitas —«añade un extra de parking a 12 €»— y te lo relleno para que solo revises y guardes.',
      'This button is on every page. Tap it and tell me what you need — “add a parking extra for €12” — and I’ll fill it in so you just review and save.',
    ],
  },
  {
    path: '/alojamientos',
    section: null,
    title: ['¡Todo listo para empezar! 🎉', 'All set to start! 🎉'],
    note: [
      'Te he dejado en Alojamientos: añade tu primer piso y vamos. Si quieres repetir este recorrido, pídeme «hazme el tour». Estoy aquí al lado.',
      'I’ve left you on Properties: add your first flat and off we go. To see this tour again, ask me “give me the tour”. I’m right here.',
    ],
  },
];

/** The welcome tour in the host's language, as tour steps the dock can run. */
export function appTour(locale: string, name: string): { title: string; steps: TourStep[] } {
  const i = locale === 'en' ? 1 : 0;
  const first = name.trim().split(/\s+/)[0] || (i ? 'there' : 'anfitrión');
  return {
    title: i ? 'Welcome tour' : 'Tour de bienvenida',
    steps: STOPS.map((s) => ({ path: s.path, section: s.section ?? '', title: s.title[i].replace('{name}', first), note: s.note[i].replace('{name}', first) })),
  };
}

export const APP_TOUR_PATHS = [...new Set(STOPS.map((s) => s.path))];
export const APP_TOUR_SECTIONS = STOPS.filter((s) => s.section && s.section !== 'ask-anfi').map((s) => ({ path: s.path, section: s.section! }));
