import { Note } from '../models/note.model';
import {
  hashText,
  makeTranslation,
  normalizeTranslations,
  noteWithTranslation,
  noteWithoutTranslation,
  storedSourceLanguage,
  translationsAfterBodyEdit,
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
    const stale = translationsAfterBodyEdit({ en: english }, 'Testo nuovo');
    expect(stale?.en?.stale).toBeTrue();
    expect(stale?.en?.text).toBe('Hello');
    expect(stale?.en?.sourceHash).toBe(hashText(note.body));
    expect(translationsAfterBodyEdit({ en: english }, note.body)?.en?.stale).toBeFalse();
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
