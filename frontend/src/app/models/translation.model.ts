/** App languages that have UI translations and Bergamot packs via English. */
export type AppLang = 'en' | 'es' | 'fr' | 'de' | 'it';

export const APP_LANGS: readonly AppLang[] = ['en', 'es', 'fr', 'de', 'it'];

export function isAppLang(value: unknown): value is AppLang {
  return (
    value === 'en' ||
    value === 'es' ||
    value === 'fr' ||
    value === 'de' ||
    value === 'it'
  );
}

/**
 * One translation of the original note body.
 * Keyed on the note by `lang` (the target language).
 */
export interface NoteTranslation {
  text: string;
  /**
   * Translation of note.title. Missing on translations saved before titles
   * were translated; those stay valid until the title changes or the user updates.
   */
  title?: string;
  /** Language the original was translated from. Never another translation. */
  sourceLang: AppLang;
  /** Hash of the original title and body when this translation was produced. */
  sourceHash: string;
  createdAt: number;
  /** True when the original title or body no longer matches sourceHash. */
  stale: boolean;
}

export type NoteTranslations = Partial<Record<AppLang, NoteTranslation>>;
