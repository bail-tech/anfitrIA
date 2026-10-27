/**
 * The cockpit's page registry: what each page and section is for. One source of truth for
 * Anfi's UI tools, the spotlight tooltips and the test that every section exists on its page
 * (each section id matches a data-anfi="…" attribute). Text is [Spanish, English].
 */

type Text = readonly [es: string, en: string];

export interface GuideSection {
  id: string;
  name: Text;
  shows: Text;
  actions?: Text;
}

export interface GuidePage {
  key: string;
  /** Route; ":id" is a numeric id taken from a tool result. */
  route: string;
  /** Source file, relative to src/app/(cockpit), for the registry test. */
  file: string;
  title: Text;
  purpose: Text;
  sections: GuideSection[];
  tasks?: Text[];
}

export const PAGES: GuidePage[] = [
  {
    key: 'overview',
    route: '/',
    file: 'page.tsx',
    title: ['Resumen', 'Overview'],
    purpose: ['El estado de tu negocio de un vistazo: ingresos, ocupación, lo de hoy y lo que espera tu visto bueno.', 'Your business at a glance: revenue, occupancy, today and what is waiting for you.'],
    sections: [
      { id: 'kpis', name: ['Indicadores', 'Key figures'], shows: ['Ingresos del mes, reservas activas, ocupación, ADR, % resuelto por la IA y pendientes.', 'Month revenue, active bookings, occupancy, ADR, share resolved by AI and pending items.'] },
      { id: 'trends', name: ['Tendencias', 'Trends'], shows: ['Ingresos, ocupación y ADR de los últimos 7 días.', 'Revenue, occupancy and ADR over the last 7 days.'] },
      { id: 'today', name: ['Hoy', 'Today'], shows: ['Llegadas, salidas y llegadas de mañana.', "Arrivals, departures and tomorrow's arrivals."] },
      { id: 'agents', name: ['Agentes y actividad', 'Agents and activity'], shows: ['El estado de cada agente y lo último que hicieron.', 'Each agent\'s status and what they did last.'], actions: ['Abre un agente para ver sus ejecuciones.', 'Open an agent to see its runs.'] },
      { id: 'health', name: ['Salud', 'Health'], shows: ['Avisos: escaladas sin responder, conflictos y configuración pendiente.', 'Alerts: unanswered escalations, conflicts and missing setup.'], actions: ['Abre la bandeja desde aquí.', 'Open the inbox from here.'] },
    ],
  },
  {
    key: 'inbox',
    route: '/bandeja',
    file: 'bandeja/page.tsx',
    title: ['Bandeja', 'Inbox'],
    purpose: ['Las conversaciones con huéspedes. Las escaladas son mensajes que la IA no quiso contestar sola.', 'Guest conversations. Escalations are messages the AI chose not to answer alone.'],
    sections: [
      { id: 'filters', name: ['Filtros', 'Filters'], shows: ['Pendientes, todas o en directo (tú al mando).', 'Pending, all, or live (you in control).'] },
      { id: 'list', name: ['Conversaciones', 'Conversations'], shows: ['Cada huésped con su último mensaje y su estado.', 'Each guest with their last message and status.'], actions: ['Abre una para leerla y responder.', 'Open one to read and reply.'] },
    ],
    tasks: [['Responder una escalada: Bandeja → abrir la conversación → revisar el borrador → Enviar.', 'Answer an escalation: Inbox → open the conversation → review the draft → Send.']],
  },
  {
    key: 'conversation',
    route: '/bandeja/:id',
    file: 'bandeja/[id]/page.tsx',
    title: ['Conversación', 'Conversation'],
    purpose: ['Un hilo con un huésped, el borrador de la IA y los datos de su reserva.', "A thread with one guest, the AI's draft and their booking."],
    sections: [
      { id: 'thread', name: ['Mensajes', 'Messages'], shows: ['El hilo completo, notas de voz incluidas, con el motivo de cada escalada.', 'The full thread, voice notes included, with why each message escalated.'] },
      { id: 'reply', name: ['Respuesta', 'Reply'], shows: ['El borrador de la IA, editable.', "The AI's draft, editable."], actions: ['Edítalo y pulsa Enviar, o envíalo como nota de voz. También puedes tomar el control (modo en directo).', 'Edit it and press Send, or send it as a voice note. You can also take over (live mode).'] },
      { id: 'reservation', name: ['Reserva', 'Booking'], shows: ['Fechas, huéspedes y alojamiento de esta reserva.', 'Dates, guests and property for this booking.'] },
    ],
  },
  {
    key: 'properties',
    route: '/alojamientos',
    file: 'alojamientos/page.tsx',
    title: ['Alojamientos', 'Properties'],
    purpose: ['Tus alojamientos y edificios, y lo que la IA sabe de cada uno.', 'Your properties and buildings, and what the AI knows about each.'],
    sections: [
      { id: 'list', name: ['Alojamientos', 'Properties'], shows: ['Cada alojamiento con su configuración básica.', 'Each property with its basic settings.'], actions: ['Abre uno para editar su información.', 'Open one to edit its information.'] },
      { id: 'new', name: ['Nuevo alojamiento', 'New property'], shows: ['Formulario para añadir un alojamiento.', 'Form to add a property.'] },
      { id: 'buildings', name: ['Edificios', 'Buildings'], shows: ['Información compartida por varios alojamientos (wifi, portal, normas).', 'Information shared by several properties (wifi, entrance, rules).'] },
    ],
  },
  {
    key: 'property',
    route: '/alojamientos/:id',
    file: 'alojamientos/[id]/page.tsx',
    title: ['Alojamiento', 'Property'],
    purpose: ['La ficha de un alojamiento: su conocimiento y cómo responde la IA.', "One property's page: its knowledge and how the AI answers."],
    sections: [
      { id: 'knowledge', name: ['Conocimiento', 'Knowledge'], shows: ['Lo que la IA usa para responder: wifi, llegada, normas…', 'What the AI answers from: wifi, arrival, rules…'], actions: ['Añade un dato o importa un CSV/PDF.', 'Add an item or import a CSV/PDF.'] },
      { id: 'settings', name: ['Ajustes del alojamiento', 'Property settings'], shows: ['Respuesta automática, umbral de confianza, horarios, idioma y número de WhatsApp.', 'Auto-answer, confidence threshold, times, language and WhatsApp number.'] },
    ],
    tasks: [['Añadir información: Alojamientos → abrir el alojamiento → Conocimiento → Añadir.', 'Add information: Properties → open the property → Knowledge → Add.']],
  },
  {
    key: 'reservations',
    route: '/reservas',
    file: 'reservas/page.tsx',
    title: ['Reservas', 'Reservations'],
    purpose: ['Todas las reservas, nuevas a mano o importadas por iCal.', 'All bookings, added by hand or imported by iCal.'],
    sections: [
      { id: 'list', name: ['Reservas', 'Bookings'], shows: ['Huésped, alojamiento, fechas y origen.', 'Guest, property, dates and source.'] },
      { id: 'new', name: ['Nueva reserva', 'New booking'], shows: ['Formulario para crear una reserva.', 'Form to create a booking.'] },
      { id: 'ical', name: ['Importar iCal', 'iCal import'], shows: ['Trae reservas desde el calendario de Airbnb o Booking.', 'Pull bookings from an Airbnb or Booking calendar.'] },
    ],
  },
  {
    key: 'operations',
    route: '/operaciones',
    file: 'operaciones/page.tsx',
    title: ['Operaciones', 'Operations'],
    purpose: ['Limpiezas y tareas del equipo, planificadas por el agente de operaciones.', 'Cleanings and team tasks, planned by the operations agent.'],
    sections: [
      { id: 'tasks', name: ['Tareas', 'Tasks'], shows: ['Tareas abiertas y hechas, con ventana de tiempo y avisos de conflicto.', 'Open and done tasks, with time windows and conflict warnings.'], actions: ['Márcalas como hechas.', 'Mark them done.'] },
      { id: 'staff', name: ['Equipo', 'Staff'], shows: ['Las personas a las que se asignan tareas.', 'The people tasks are assigned to.'] },
    ],
  },
  {
    key: 'simulator',
    route: '/simulador',
    file: 'simulador/page.tsx',
    title: ['Simulador', 'Simulator'],
    purpose: ['Escribe como si fueras un huésped para probar cómo responde la IA, sin WhatsApp.', 'Write as a guest to test how the AI answers, without WhatsApp.'],
    sections: [{ id: 'chat', name: ['Chat de prueba', 'Test chat'], shows: ['Elige alojamiento y huésped y escribe un mensaje.', 'Pick a property and guest and send a message.'] }],
  },
  {
    key: 'agents',
    route: '/agentes',
    file: 'agentes/page.tsx',
    title: ['Agentes', 'Agents'],
    purpose: ['Los agentes que trabajan para ti y las propuestas que esperan tu aprobación.', 'The agents working for you and the proposals waiting for approval.'],
    sections: [
      { id: 'approvals', name: ['Aprobaciones', 'Approvals'], shows: ['Propuestas de los agentes: precios, respuestas, conocimiento.', 'Agent proposals: prices, replies, knowledge.'], actions: ['Apruébalas o recházalas tú.', 'Approve or reject them yourself.'] },
      { id: 'agents', name: ['Agentes', 'Agents'], shows: ['Cada agente, si está activo y su última ejecución.', 'Each agent, whether it is on and its last run.'], actions: ['Actívalos o desactívalos.', 'Turn them on or off.'] },
    ],
  },
  {
    key: 'settings',
    route: '/ajustes',
    file: 'ajustes/page.tsx',
    title: ['Ajustes', 'Settings'],
    purpose: ['Equipo, integraciones y plantillas de mensajes.', 'Team, integrations and message templates.'],
    sections: [
      { id: 'team', name: ['Equipo', 'Team'], shows: ['Miembros y sus roles; invitaciones.', 'Members and their roles; invitations.'] },
      { id: 'integrations', name: ['Integraciones', 'Integrations'], shows: ['Qué está conectado: Claude, voz, WhatsApp, agentes.', 'What is connected: Claude, voice, WhatsApp, agents.'] },
      { id: 'templates', name: ['Plantillas', 'Templates'], shows: ['Mensajes automáticos de antes, durante y después de la estancia.', 'Automatic messages before, during and after the stay.'] },
    ],
  },
  {
    key: 'audit',
    route: '/auditoria',
    file: 'auditoria/page.tsx',
    title: ['Auditoría', 'Audit log'],
    purpose: ['Todo lo que pasó: quién respondió, qué se aprobó y cuándo.', 'Everything that happened: who answered, what was approved and when.'],
    sections: [{ id: 'log', name: ['Registro', 'Log'], shows: ['Cada acción con su autor y hora.', 'Each action with its author and time.'] }],
  },
];

/** Forms Anfi may fill (never submit), with the fields it may set. */
export const FORMS = {
  reply: { page: 'conversation', fields: ['text'] },
  reservation: { page: 'reservations', fields: ['guest_name', 'guest_ref', 'check_in', 'check_out', 'guests', 'nightly_rate', 'source'] },
  knowledge: { page: 'property', fields: ['category', 'content'] },
} as const satisfies Record<string, { page: string; fields: readonly string[] }>;
export type FormId = keyof typeof FORMS;

export const lang = (locale: string) => (locale === 'en' ? 1 : 0);

export function pageByKey(key: string): GuidePage | undefined {
  return PAGES.find((p) => p.key === key);
}

/** Which registered page a browser path is, with its :id. */
export function pageForPath(pathname: string): { page: GuidePage; id?: number } | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const page of PAGES) {
    const re = new RegExp(`^${page.route.replace(':id', '(\\d+)')}$`);
    const m = re.exec(path);
    if (m) return { page, id: m[1] ? Number(m[1]) : undefined };
  }
  return null;
}

/** The path for a page key, or null for an unknown page or a missing/invalid id. Never an external URL. */
export function routeFor(key: string, id?: number): string | null {
  const page = pageByKey(key);
  if (!page) return null;
  if (!page.route.includes(':id')) return page.route;
  return Number.isInteger(id) && (id as number) > 0 ? page.route.replace(':id', String(id)) : null;
}

/** A page described in the host's language, for tool results. */
export function describe(page: GuidePage, locale: string) {
  const i = lang(locale);
  return {
    page: page.key,
    route: page.route,
    title: page.title[i],
    purpose: page.purpose[i],
    sections: page.sections.map((s) => ({ id: s.id, name: s.name[i], shows: s.shows[i], ...(s.actions ? { you_can: s.actions[i] } : {}) })),
    ...(page.tasks ? { typical_tasks: page.tasks.map((t) => t[i]) } : {}),
  };
}
