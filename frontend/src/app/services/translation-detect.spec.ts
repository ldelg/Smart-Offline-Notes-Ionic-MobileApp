import { detectLanguage, resolveSourceLanguage } from './translation-detect';

describe('source language detection', () => {
  it('detects the five app languages from ordinary sentences', () => {
    expect(detectLanguage('The meeting is tomorrow and we have to talk')).toBe('en');
    expect(detectLanguage('Hola, la reunión es mañana y también gracias')).toBe('es');
    expect(detectLanguage('Bonjour, la réunion est demain et merci beaucoup')).toBe('fr');
    expect(detectLanguage('Hallo, das Meeting ist morgen und danke für alles')).toBe('de');
    expect(detectLanguage('Ciao, la riunione è domani e grazie per tutto')).toBe('it');
  });

  it('does not guess when the text is only a few letters', () => {
    expect(detectLanguage('Hi')).toBeNull();
    expect(detectLanguage('OK')).toBeNull();
  });

  it('uses a transcription language until the text changes, then detects again', () => {
    const saved = 'Bonjour, la réunion est demain et merci beaucoup';
    expect(
      resolveSourceLanguage({
        text: saved,
        savedBody: saved,
        noteLanguage: 'french',
        uiLanguage: 'en',
        textHash: 'a',
      }),
    ).toBe('fr');
    expect(
      resolveSourceLanguage({
        text: 'The meeting is tomorrow and we have to talk',
        savedBody: saved,
        noteLanguage: 'french',
        uiLanguage: 'en',
        textHash: 'b',
      }),
    ).toBe('en');
  });

  it('keeps a manual correction until the text changes, and uses the app language when unsure', () => {
    expect(
      resolveSourceLanguage({
        text: 'Hi',
        savedBody: 'Hi',
        uiLanguage: 'it',
        override: 'de',
        overrideHash: 'same',
        textHash: 'same',
      }),
    ).toBe('de');
    expect(
      resolveSourceLanguage({
        text: 'Hi',
        savedBody: 'Hi',
        uiLanguage: 'it',
        override: 'de',
        overrideHash: 'old',
        textHash: 'new',
      }),
    ).toBe('it');
  });
});