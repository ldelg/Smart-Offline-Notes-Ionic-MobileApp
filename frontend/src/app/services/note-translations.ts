import { Note } from '../models/note.model';
import {
  APP_LANGS,
  AppLang,
  NoteTranslation,
  NoteTranslations,
  isAppLang,
} from '../models/translation.model';
import { languageFromNote } from './translation-detect';

/** Stable hash of the original body. Used only to notice edits. */
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
): NoteTranslations | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const current = hashText(body);
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
    out[lang] = {
      text: record['text'],
      sourceLang,
      sourceHash,
      createdAt,
      stale: sourceHash !== current,
    };
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

/** Keeps every translation and marks it stale when the original body changed. */
export function translationsAfterBodyEdit(
  translations: NoteTranslations | undefined,
  body: string,
): NoteTranslations | undefined {
  if (!translations) return translations;
  const current = hashText(body);
  let changed = false;
  const next: NoteTranslations = {};
  for (const lang of APP_LANGS) {
    const item = translations[lang];
    if (!item) continue;
    const stale = item.sourceHash !== current;
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
): NoteTranslation {
  return {
    text,
    sourceLang,
    sourceHash: hashText(body),
    createdAt,
    stale: false,
  };
}
