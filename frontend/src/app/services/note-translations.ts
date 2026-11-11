import { Note } from '../models/note.model';
import {
  APP_LANGS,
  AppLang,
  NoteTranslation,
  NoteTranslations,
  isAppLang,
} from '../models/translation.model';
import { languageFromNote } from './translation-detect';

/** Stable hash of the original title and body. Used only to notice edits. */
export function sourceFingerprint(title: string, body: string): string {
  return hashText(`${title}\n${body}`);
}

/** Stable hash. Used only to notice edits. */
export function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    hash |= 0;
  }
  return `${(hash >>> 0).toString(16)}:${text.length}`;
}

export function normalizeTranslations(
  value: unknown,
  body: string,
  title = '',
): NoteTranslations | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const out: NoteTranslations = {};
  for (const lang of APP_LANGS) {
    const item = raw[lang];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record['text'] !== 'string') continue;
    const sourceLang = isAppLang(record['sourceLang']) ? record['sourceLang'] : lang;
    const sourceHash =
      typeof record['sourceHash'] === 'string' ? record['sourceHash'] : '';
    const createdAt =
      typeof record['createdAt'] === 'number' && Number.isFinite(record['createdAt'])
        ? record['createdAt']
        : 0;
    const stored: NoteTranslation = {
      text: record['text'],
      sourceLang,
      sourceHash,
      createdAt,
      stale: false,
    };
    if (typeof record['title'] === 'string') stored.title = record['title'];
    stored.stale = translationIsStale(stored, title, body);
    out[lang] = stored;
  }
  return Object.keys(out).length ? out : undefined;
}

export function noteWithTranslation(
  note: Note,
  lang: AppLang,
  translation: NoteTranslation,
): Note {
  return {
    ...note,
    translations: { ...note.translations, [lang]: translation },
  };
}

export function noteWithoutTranslation(note: Note, lang: AppLang): Note {
  if (!note.translations?.[lang]) return note;
  const translations: NoteTranslations = { ...note.translations };
  delete translations[lang];
  return {
    ...note,
    translations: Object.keys(translations).length ? translations : undefined,
  };
}

/**
 * A translation saved before titles were included stays current while the
 * body is unchanged. A later title edit, or any edit once the title is stored,
 * marks it stale. The translated text is kept.
 */
export function translationIsStale(
  item: NoteTranslation,
  title: string,
  body: string,
): boolean {
  if (item.sourceHash === sourceFingerprint(title, body)) return false;
  if (item.title === undefined && item.sourceHash === hashText(body)) return false;
  return true;
}

/** Keeps every translation and marks it stale when the original title or body changed. */
export function translationsAfterEdit(
  translations: NoteTranslations | undefined,
  title: string,
  body: string,
  previous?: { title: string; body: string },
): NoteTranslations | undefined {
  if (!translations) return translations;
  const titleChanged = !!previous && previous.title !== title;
  let changed = false;
  const next: NoteTranslations = {};
  for (const lang of APP_LANGS) {
    const item = translations[lang];
    if (!item) continue;
    const stale =
      translationIsStale(item, title, body) || (titleChanged && item.title === undefined);
    if (stale !== item.stale) changed = true;
    next[lang] = stale === item.stale ? item : { ...item, stale };
  }
  return changed ? next : translations;
}

/** Transcription language, or the source already used for another translation of this note. */
export function storedSourceLanguage(note: Note): AppLang | null {
  for (const lang of APP_LANGS) {
    const source = note.translations?.[lang]?.sourceLang;
    if (source) return source;
  }
  return languageFromNote(note.language);
}

export function makeTranslation(
  text: string,
  sourceLang: AppLang,
  body: string,
  createdAt: number,
  title?: { original: string; translated: string },
): NoteTranslation {
  const translation: NoteTranslation = {
    text,
    sourceLang,
    sourceHash: title ? sourceFingerprint(title.original, body) : hashText(body),
    createdAt,
    stale: false,
  };
  if (title) translation.title = title.translated;
  return translation;
}
