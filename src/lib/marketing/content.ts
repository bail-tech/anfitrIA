/**
 * Public site copy (landing and answers), Spanish and English. Only claims about what AnfitrIA
 * actually does today; no prices until they are decided.
 */
export type Lang = 'es' | 'en';

export const LANDING = {
  es: {
    eyebrow: 'Coanfitrión con IA para alquiler vacacional',
    title: 'El coanfitrión al que le hablas.',
    subtitle: 'Anfi responde a tus huéspedes, prepara lo que necesitan y lleva tus números. Tú hablas con él —o le escribes— y decides qué sale.',
    cta: 'Empieza gratis',
    login: 'Entrar',
    voiceTitle: 'Dile qué necesitas, en voz alta',
    voiceBody: '«¿Qué tengo hoy?», «Llévame a la escalada de María», «Prepárale una respuesta». Anfi te contesta, abre la página correcta y te señala dónde mirar. Funciona igual escribiendo.',
    featuresTitle: 'Todo lo de tus huéspedes, en un sitio',
    features: [
      ['Bandeja con IA', 'WhatsApp, Airbnb y Booking.com (vía Smoobu) en una bandeja. La IA responde lo que sabe y te escala lo demás con un borrador listo.'],
      ['Nada sale sin tu permiso', 'Tú eliges el umbral de confianza por alojamiento. Por debajo, la respuesta espera tu visto bueno; lo delicado siempre te llega a ti.'],
      ['Viaje del huésped', 'Mensajes programados desde la reserva hasta la reseña, con condiciones como «solo si la estancia fue bien».'],
      ['Notas de voz', 'Responde a tus huéspedes por WhatsApp con una nota de voz en la voz de Anfi, en su idioma.'],
      ['Aprende de ti', 'Lee cómo has respondido antes y te propone los datos del alojamiento: wifi, llegada, normas, consejos.'],
      ['Extras y reseñas', 'Detecta cuándo un huésped quiere entrada anticipada o parking y te prepara la oferta. Redacta las respuestas a tus reseñas.'],
      ['Informes para propietarios', 'Liquidación mensual por alojamiento: ingresos, comisiones, limpiezas y neto, lista para enviar en PDF.'],
      ['En tu Claude o ChatGPT', 'Conecta AnfitrIA a tu asistente de IA y pregunta por tu día o la disponibilidad desde donde ya trabajas.'],
    ],
    stepsTitle: 'Cómo empiezas',
    steps: [
      ['Conecta', 'Tu WhatsApp Business y, si usas Smoobu, tus alojamientos, reservas y mensajes.'],
      ['Enséñale', 'Anfi aprende de tus respuestas pasadas y de la ficha de cada alojamiento.'],
      ['Supervisa', 'Empieza aprobando cada respuesta; sube el umbral cuando confíes.'],
    ],
    answersTitle: 'Preguntas de anfitriones',
    answersCta: 'Ver todas las respuestas',
    footer: 'AnfitrIA · tu conserje con IA supervisada',
  },
  en: {
    eyebrow: 'AI co-host for holiday rentals',
    title: 'The co-host you talk to.',
    subtitle: 'Anfi answers your guests, prepares what they need and keeps your numbers. You talk to it — or type — and decide what goes out.',
    cta: 'Start free',
    login: 'Log in',
    voiceTitle: 'Say what you need, out loud',
    voiceBody: '“What’s on today?”, “Take me to María’s escalation”, “Draft her a reply”. Anfi answers, opens the right page and points to where to look. It works the same by typing.',
    featuresTitle: 'Everything about your guests, in one place',
    features: [
      ['AI inbox', 'WhatsApp, Airbnb and Booking.com (via Smoobu) in one inbox. The AI answers what it knows and escalates the rest with a draft ready.'],
      ['Nothing goes out without you', 'You set the confidence threshold per property. Below it, the reply waits for your approval; sensitive topics always come to you.'],
      ['Guest journey', 'Scheduled messages from booking to review, with conditions like “only if the stay went well”.'],
      ['Voice notes', 'Reply to guests on WhatsApp with a voice note in Anfi’s voice, in their language.'],
      ['Learns from you', 'Reads how you’ve answered before and suggests each property’s facts: wifi, arrival, rules, tips.'],
      ['Extras and reviews', 'Spots when a guest wants early check-in or parking and prepares the offer. Drafts your review replies.'],
      ['Owner reports', 'A monthly statement per property: revenue, fees, cleanings and net, ready to send as PDF.'],
      ['In your Claude or ChatGPT', 'Connect AnfitrIA to your AI assistant and ask about your day or availability from where you already work.'],
    ],
    stepsTitle: 'How you start',
    steps: [
      ['Connect', 'Your WhatsApp Business and, if you use Smoobu, your properties, bookings and messages.'],
      ['Teach it', 'Anfi learns from your past replies and each property’s facts.'],
      ['Supervise', 'Start by approving every reply; raise the threshold as you trust it.'],
    ],
    answersTitle: 'Host questions',
    answersCta: 'See all answers',
    footer: 'AnfitrIA · your supervised AI concierge',
  },
} as const;

export interface Answer {
  slug: string;
  question: string;
  /** 40–60 words: the quotable answer. */
  short: string;
  body: string[];
}

export const ANSWERS: Record<Lang, Answer[]> = {
  es: [
    {
      slug: 'automatizar-mensajes-airbnb',
      question: '¿Cómo automatizo los mensajes de Airbnb sin perder el trato personal?',
      short: 'Programa los mensajes fijos (confirmación, llegada, salida, reseña) y deja que una IA supervisada responda las preguntas repetidas desde la información de tu alojamiento. Lo que no sabe o es delicado debe llegarte a ti con un borrador. Así respondes rápido sin que ningún mensaje salga sin control.',
      body: [
        'Separa dos tipos de mensajes. Los fijos dependen del calendario: confirmación de reserva, instrucciones de llegada, recordatorio de salida y petición de reseña. Se programan una vez y salen solos en el momento correcto.',
        'Las preguntas de los huéspedes cambian cada vez, pero se repiten: wifi, aparcamiento, hora de entrada. Una IA puede contestarlas si tiene la ficha del alojamiento; con un umbral de confianza, lo dudoso espera tu aprobación.',
        'El trato personal viene de tu tono: elige tus plantillas y revisa las primeras respuestas hasta que suenen como tú.',
      ],
    },
    {
      slug: 'ia-responde-huespedes-seguro',
      question: '¿Es seguro dejar que una IA responda a mis huéspedes?',
      short: 'Sí, si la IA está supervisada: debe responder solo con la información de tu alojamiento, escalarte lo delicado (quejas, reembolsos, urgencias) y dejar en borrador lo que no tenga claro. Los datos sensibles, como el código de la puerta, solo deberían enviarse durante la estancia del huésped.',
      body: [
        'El riesgo de una IA no supervisada es que invente: horarios, precios o normas que no existen. La solución es limitarla a tus datos y medir su confianza en cada respuesta.',
        'Por debajo del umbral que tú eliges, la respuesta no sale: te llega como borrador. Los temas sensibles se escalan siempre, aunque la IA crea saber la respuesta.',
        'Los códigos de acceso se guardan como privados y la IA solo los comparte dentro de las fechas de la reserva.',
      ],
    },
    {
      slug: 'notas-de-voz-whatsapp-huespedes',
      question: '¿Puedo responder a mis huéspedes con notas de voz de WhatsApp?',
      short: 'Sí. Con WhatsApp Business puedes enviar notas de voz grabadas por ti o generadas en una voz natural a partir del texto que apruebas, en el idioma del huésped. WhatsApp solo permite enviarlas dentro de las 24 horas siguientes al último mensaje del huésped.',
      body: [
        'Una nota de voz se siente cercana y resuelve en segundos lo que por escrito serían varios párrafos, como explicar cómo llegar.',
        'La regla de WhatsApp Business es clara: fuera de la ventana de 24 horas solo se pueden enviar plantillas aprobadas, no audios. Dentro de la ventana, puedes enviarla al momento.',
      ],
    },
    {
      slug: 'informe-mensual-propietario',
      question: '¿Qué debe incluir el informe mensual para el propietario de un piso turístico?',
      short: 'Ingresos brutos del mes, noches ocupadas, ocupación, tarifa media (ADR), comisiones de los canales, tu comisión de gestión, limpiezas y el neto para el propietario, comparado con el mes anterior. Las estancias que cruzan dos meses se reparten por noches para que cada informe cuadre.',
      body: [
        'El propietario quiere tres cosas: cuánto ha ganado, por qué y qué te has quedado tú. Un buen informe lo deja claro en una página.',
        'Reparte cada estancia por noches dentro del mes y prorratea la comisión del canal. Así, la suma de los informes de dos meses coincide con la reserva completa.',
      ],
    },
    {
      slug: 'cuando-pedir-resena',
      question: '¿Cuándo es el mejor momento para pedir una reseña a un huésped?',
      short: 'Unas horas después de la salida, cuando la experiencia está fresca, y solo si la estancia fue bien. Pide la reseña sin ofrecer nada a cambio y sin presionar: las plataformas lo prohíben. Si hubo una incidencia, primero resuélvela y no pidas la reseña automáticamente.',
      body: [
        'Programar la petición unas horas tras la salida funciona mejor que esperar días: el huésped aún está pensando en el viaje.',
        'Filtra las estancias con incidencias. Pedir una reseña a quien tuvo un problema sin resolver suele acabar en una mala nota.',
      ],
    },
  ],
  en: [
    {
      slug: 'automate-airbnb-messages',
      question: 'How do I automate Airbnb messages without losing the personal touch?',
      short: 'Schedule the fixed messages (confirmation, arrival, check-out, review) and let a supervised AI answer repeated questions from your property’s information. Anything it doesn’t know, or anything sensitive, should come to you with a draft. You reply fast and no message goes out unchecked.',
      body: [
        'Split messages in two. Fixed ones depend on the calendar: booking confirmation, arrival instructions, check-out reminder and review request. Set them once and they go out at the right time.',
        'Guest questions change every time but repeat: wifi, parking, check-in time. An AI can answer them from the property’s facts; with a confidence threshold, anything uncertain waits for your approval.',
        'The personal touch comes from your tone: choose your templates and review the first replies until they sound like you.',
      ],
    },
    {
      slug: 'is-ai-guest-messaging-safe',
      question: 'Is it safe to let an AI answer my guests?',
      short: 'Yes, if the AI is supervised: it should answer only from your property’s information, escalate sensitive topics (complaints, refunds, emergencies) and keep uncertain replies as drafts. Sensitive details such as door codes should only be shared during the guest’s stay.',
      body: [
        'The risk of an unsupervised AI is that it invents check-in times, prices or rules that don’t exist. The fix is to limit it to your data and measure its confidence on every reply.',
        'Below the threshold you choose, the reply doesn’t go out: it reaches you as a draft. Sensitive topics are always escalated, even if the AI thinks it knows the answer.',
        'Access codes are stored as private, and the AI only shares them within the booking dates.',
      ],
    },
    {
      slug: 'whatsapp-voice-notes-guests',
      question: 'Can I reply to guests with WhatsApp voice notes?',
      short: 'Yes. With WhatsApp Business you can send voice notes you record or ones generated in a natural voice from the text you approve, in the guest’s language. WhatsApp only allows them within 24 hours of the guest’s last message.',
      body: [
        'A voice note feels personal and explains in seconds what would take paragraphs in writing, such as how to get to the flat.',
        'The WhatsApp Business rule is clear: outside the 24-hour window you can only send approved templates, not audio. Inside the window you can send it right away.',
      ],
    },
    {
      slug: 'monthly-owner-report',
      question: 'What should a monthly owner report for a holiday rental include?',
      short: 'Gross revenue for the month, nights booked, occupancy, average daily rate (ADR), channel fees, your management fee, cleanings and the net to the owner, compared with the previous month. Stays across two months are split by night so every report adds up.',
      body: [
        'Owners want three things: how much they earned, why, and what you kept. A good report makes that clear on one page.',
        'Split each stay by night within the month and prorate the channel fee, so two months’ reports add up to the whole booking.',
      ],
    },
    {
      slug: 'when-to-ask-for-a-review',
      question: 'When is the best time to ask a guest for a review?',
      short: 'A few hours after check-out, while the stay is fresh, and only if it went well. Ask without offering anything in return and without pressure: platforms forbid both. If there was an issue, resolve it first and don’t send the request automatically.',
      body: [
        'Asking a few hours after check-out works better than waiting days: the guest is still thinking about the trip.',
        'Filter out stays with incidents. Asking someone with an unresolved problem for a review usually ends in a low score.',
      ],
    },
  ],
};
