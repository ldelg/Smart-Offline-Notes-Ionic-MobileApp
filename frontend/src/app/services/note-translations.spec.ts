import { Note } from '../models/note.model';
import {
  hashText,
  makeTranslation,
  normalizeTranslations,
  noteWithTranslation,
  noteWithoutTranslation,
  sourceFingerprint,
  storedSourceLanguage,
  translationsAfterEdit,
} from './note-translations';

const note = {
  id: '1',
  title: 'Ciao',
  body: 'Il totale è 1.500.',
  createdAt: 1,
  source: 'Typed' as const,
  language: 'italian',
};

describe('translation storage', () => {
  it('stores several languages on one note and deletes one of them', () => {
    const english = makeTranslation('The total is 1.500.', 'it', note.body, 10);
    const german = makeTranslation('Die Summe ist 1.500.', 'it', note.body, 11);
    let next: Note = noteWithTranslation(note, 'en', english);
    next = noteWithTranslation(next, 'de', german);
    expect(next.translations?.en?.text).toContain('total');
    expect(next.translations?.de?.sourceLang).toBe('it');
    expect(next.body).toBe(note.body);
    next = noteWithoutTranslation(next, 'en');
    expect(next.translations?.en).toBeUndefined();
    expect(next.translations?.de?.text).toContain('Summe');
    expect(noteWithoutTranslation(next, 'de').translations).toBeUndefined();
  });

  it('marks every translation stale when the original changes and keeps the text', () => {
    const english = makeTranslation('Hello', 'it', note.body, 10);
    const stale = translationsAfterEdit({ en: english }, note.title, 'Testo nuovo', {
      title: note.title,
      body: note.body,
    });
    expect(stale?.en?.stale).toBeTrue();
    expect(stale?.en?.text).toBe('Hello');
    expect(stale?.en?.sourceHash).toBe(hashText(note.body));
    expect(
      translationsAfterEdit({ en: english }, note.title, note.body)?.en?.stale,
    ).toBeFalse();
  });

  it('stores a translated title and marks it stale when that title changes', () => {
    const english = makeTranslation('Hello', 'it', note.body, 10, {
      original: note.title,
      translated: 'Hi',
    });
    expect(english.title).toBe('Hi');
    expect(english.sourceHash).toBe(sourceFingerprint(note.title, note.body));
    expect(translationsAfterEdit({ en: english }, note.title, note.body)?.en?.stale).toBeFalse();
    const renamed = translationsAfterEdit({ en: english }, 'Nuovo titolo', note.body, {
      title: note.title,
      body: note.body,
    });
    expect(renamed?.en?.stale).toBeTrue();
    expect(renamed?.en?.title).toBe('Hi');
    expect(renamed?.en?.text).toBe('Hello');
  });

  it('keeps an older body-only translation until the title itself changes', () => {
    const english = makeTranslation('Hello', 'it', note.body, 10);
    expect(english.title).toBeUndefined();
    const loaded = normalizeTranslations({ en: english }, note.body, note.title);
    expect(loaded?.en?.stale).toBeFalse();
    expect(loaded?.en?.title).toBeUndefined();
    const renamed = translationsAfterEdit({ en: english }, 'Nuovo titolo', note.body, {
      title: note.title,
      body: note.body,
    });
    expect(renamed?.en?.stale).toBeTrue();
    expect(renamed?.en?.text).toBe('Hello');
  });

  it('loads a translation map and recomputes stale from the current body', () => {
    const saved = normalizeTranslations(
      {
        en: {
          text: 'Hello',
          sourceLang: 'it',
          sourceHash: hashText('old'),
          createdAt: 4,
          stale: false,
        },
        nope: { text: 'skip' },
      },
      note.body,
    );
    expect(saved?.en?.stale).toBeTrue();
    expect(saved?.en?.text).toBe('Hello');
    expect(Object.keys(saved ?? {})).toEqual(['en']);
    expect(normalizeTranslations(undefined, note.body)).toBeUndefined();
  });

  it('uses the transcription language, then a translation already stored', () => {
    expect(storedSourceLanguage(note)).toBe('it');
    const withTranslation = noteWithTranslation(
      { ...note, language: undefined },
      'en',
      makeTranslation('Hello', 'it', note.body, 1),
    );
    expect(storedSourceLanguage(withTranslation)).toBe('it');
  });
});
