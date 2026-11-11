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

const STOP_WORDS: Record<AppLang, readonly string[]> = {
  en: ['the', 'and', 'to', 'of', 'is', 'that', 'you', 'for', 'with', 'this', 'have', 'was'],
  es: ['el', 'la', 'los', 'las', 'que', 'de', 'en', 'un', 'una', 'por', 'con', 'para', 'del', 'hola'],
  fr: ['le', 'la', 'les', 'des', 'une', 'est', 'que', 'pour', 'dans', 'pas', 'avec', 'bonjour'],
  de: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'nicht', 'ich', 'mit', 'den', 'auch'],
  it: ['il', 'lo', 'la', 'che', 'un', 'una', 'per', 'non', 'con', 'del', 'della', 'sono', 'ciao'],
};

/** Whisper's detected language, or the transcription language saved on the note. */
export function languageFromNote(value: string | undefined): AppLang | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (isAppLang(key)) return key;
  return NAMES[key] ?? null;
}

/**
 * Lightweight stop-word detector for en/es/fr/de/it.
 * Returns null when the text is too short or two languages are tied.
 */
export function detectLanguage(text: string): AppLang | null {
  const words = text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\s']/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
  if (words.length < 3) return null;
  const scores = APP_LANGS.map((lang) => {
    const stop = new Set(STOP_WORDS[lang]);
    let score = 0;
    for (const word of words) {
      if (stop.has(word)) score += 1;
    }
    if (lang === 'es' && /[ñ¿¡]/i.test(text)) score += 2;
    if (lang === 'de' && /ß/.test(text)) score += 2;
    if (lang === 'fr' && /[œæ]/i.test(text)) score += 2;
    return { lang, score };
  }).sort((a, b) => b.score - a.score);
  const best = scores[0];
  const second = scores[1];
  if (!best || best.score < 2) return null;
  if (second && best.score - second.score < 1) return null;
  return best.lang;
}
