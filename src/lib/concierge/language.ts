/** Light language detection for guest messages (Claude detects properly; this is the fallback). */

export const LANGUAGES = ['es', 'en', 'fr', 'de', 'it'] as const;
export type Lang = (typeof LANGUAGES)[number];

const MARKERS: Record<Lang, Set<string>> = {
  en: new Set(['the', 'what', 'when', 'where', 'how', 'please', 'hi', 'hello', 'time', 'check', 'checkin', 'wifi', 'password', 'arrive', 'address', 'can', 'is', 'your']),
  es: new Set(['hola', 'que', 'qué', 'como', 'cómo', 'donde', 'dónde', 'gracias', 'hora', 'cuando', 'cuándo', 'wifi', 'puedo', 'cual', 'cuál']),
  fr: new Set(['bonjour', 'merci', 'quelle', 'quel', 'heure', 'où', 'comment', 'arrivée', 'clé', 'je', 'est', 'puis', "s'il", 'vous', 'plaît']),
  de: new Set(['hallo', 'danke', 'wann', 'wie', 'wo', 'uhr', 'schlüssel', 'ankunft', 'ich', 'ist', 'kann', 'bitte', 'wlan', 'passwort']),
  it: new Set(['ciao', 'grazie', 'quando', 'come', 'dove', 'ora', 'chiave', 'arrivo', 'posso', 'è', 'per', 'favore', 'qual']),
};
const ES_CHARS = /[¿¡ñ]/i;
const WORD = /[a-zàáâäçéèêëíìîïñóòôöúùûü']+/gi;

export function detectLanguage(text: string, fallback = 'es'): string {
  const lower = text.toLowerCase();
  if (ES_CHARS.test(lower)) return 'es';
  const words = new Set(lower.match(WORD) ?? []);
  let best: Lang | null = null;
  let bestScore = 0;
  for (const lang of LANGUAGES) {
    let score = 0;
    for (const w of words) if (MARKERS[lang].has(w)) score++;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return best ?? fallback;
}

/** What the guest gets at once when a message is escalated to the host. */
export const HOLDING: Record<string, string> = {
  es: '¡Hola! Lo confirmo con el anfitrión y te respondo enseguida. 🙌',
  en: 'Hi! Let me check this with the host and get right back to you. 🙌',
  fr: "Bonjour ! Je vérifie avec l'hôte et je vous réponds tout de suite. 🙌",
  de: 'Hallo! Ich kläre das mit dem Gastgeber und melde mich gleich. 🙌',
  it: "Ciao! Lo verifico con l'host e ti rispondo subito. 🙌",
};

export const holdingMessage = (lang: string) => HOLDING[lang] ?? HOLDING.es;

/** Reply when a guest sends something the channel can't read yet (image, sticker...). */
export const NON_TEXT_REPLY: Record<string, string> = {
  es: '¡Gracias por escribir! De momento solo puedo leer texto y notas de voz. ¿Puedes contarme tu duda?',
  en: 'Thanks for reaching out! For now I can only read text and voice notes. Could you tell me your question?',
  fr: 'Merci de votre message ! Pour le moment je ne lis que le texte et les notes vocales. Quelle est votre question ?',
  de: 'Danke für deine Nachricht! Momentan kann ich nur Text und Sprachnachrichten lesen. Was möchtest du wissen?',
  it: 'Grazie per il messaggio! Per ora leggo solo testo e note vocali. Puoi scrivermi la tua domanda?',
};

/** Reply on the shared WhatsApp number when the guest can't be matched to any booking yet. */
export const ASK_BOOKING: Record<string, string> = {
  es: '¡Hola! Soy Anfi 👋 Para ayudarte necesito encontrar tu reserva. ¿Me envías tu código de reserva (o el teléfono con el que reservaste)?',
  en: 'Hi! I’m Anfi 👋 To help you I need to find your booking. Could you send me your booking code (or the phone number you booked with)?',
  fr: 'Bonjour ! Je suis Anfi 👋 Pour vous aider, je dois retrouver votre réservation. Pouvez-vous m’envoyer votre code de réservation (ou le téléphone utilisé pour réserver) ?',
  de: 'Hallo! Ich bin Anfi 👋 Um dir zu helfen, muss ich deine Buchung finden. Schickst du mir deinen Buchungscode (oder die Telefonnummer, mit der du gebucht hast)?',
  it: 'Ciao! Sono Anfi 👋 Per aiutarti devo trovare la tua prenotazione. Mi mandi il codice di prenotazione (o il telefono con cui hai prenotato)?',
};
