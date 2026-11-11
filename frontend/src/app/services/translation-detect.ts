import { APP_LANGS, AppLang, isAppLang } from '../models/translation.model';

const NAMES: Record<string, AppLang> = {
  en: 'en',
  english: 'en',
  es: 'es',
  spa: 'es',
  spanish: 'es',
  fr: 'fr',
  fra: 'fr',
  french: 'fr',
  de: 'de',
  deu: 'de',
  ger: 'de',
  german: 'de',
  it: 'it',
  ita: 'it',
  italian: 'it',
};

/** Distinctive words only. Shared words such as "de" and "la" are left out so they do not tie. */
const STOP_WORDS: Record<AppLang, readonly string[]> = {
  en: ['the', 'and', 'to', 'of', 'is', 'that', 'you', 'for', 'with', 'this', 'have', 'was', 'are', 'not', 'hello', 'meeting', 'tomorrow', 'please'],
  es: ['los', 'las', 'que', 'una', 'por', 'para', 'del', 'hola', 'gracias', 'mañana', 'está', 'también', 'reunión'],
  fr: ['les', 'des', 'une', 'est', 'pour', 'dans', 'pas', 'avec', 'bonjour', 'nous', 'vous', 'demain', 'réunion', 'merci', 'lundi'],
  de: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'nicht', 'ich', 'auch', 'hallo', 'morgen', 'danke', 'für', 'bitte'],
  it: ['che', 'una', 'per', 'non', 'sono', 'ciao', 'grazie', 'domani', 'riunione', 'della', 'nel', 'questa'],
};

/** Whisper's detected language, or the transcription language saved on the note. */
export function languageFromNote(value: string | undefined): AppLang | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (isAppLang(key)) return key;
  return NAMES[key] ?? null;
}

const MIN_LETTERS = 12;

/**
 * Stop-word and character detector for en/es/fr/de/it.
 * Returns null when the text is too short to trust or two languages are tied.
 */
export function detectLanguage(text: string): AppLang | null {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < MIN_LETTERS) return null;
  const words = text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\s']/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
  const scores = APP_LANGS.map((lang) => {
    const stop = new Set(STOP_WORDS[lang]);
    let score = 0;
    for (const word of words) {
      if (stop.has(word)) score += 2;
    }
    if (lang === 'es' && /[ñ¿¡]/i.test(text)) score += 3;
    if (lang === 'de' && /ß/.test(text)) score += 3;
    if (lang === 'de' && /[äöü]/i.test(text)) score += 1;
    if (lang === 'fr' && /[œæâêîôûù«»]/i.test(text)) score += 2;
    if (lang === 'it' && /[àèìòù]/i.test(text)) score += 1;
    return { lang, score };
  }).sort((a, b) => b.score - a.score);
  const best = scores[0];
  const second = scores[1];
  if (!best || best.score < 2) return null;
  if (second && best.score - second.score < 1) return null;
  return best.lang;
}

/**
 * Transcription language when the saved note still matches, otherwise the
 * detector. A manual correction sticks until the text changes. Text that is
 * too short falls back to the app language.
 */
export function resolveSourceLanguage(input: {
  text: string;
  savedBody?: string;
  noteLanguage?: string;
  uiLanguage?: string;
  override?: AppLang | null;
  overrideHash?: string;
  textHash: string;
}): AppLang {
  if (input.override && input.overrideHash === input.textHash) return input.override;
  const edited = input.savedBody !== undefined && input.text !== input.savedBody;
  if (!edited) {
    const known = languageFromNote(input.noteLanguage);
    if (known) return known;
  }
  return detectLanguage(input.text) ?? languageFromNote(input.uiLanguage) ?? 'en';
}
