import { translationRoute } from './translation-route';

describe('translation pivoting', () => {
  it('uses a direct pack when one exists', () => {
    expect(translationRoute('en', 'es').map((pair) => pair.id)).toEqual(['enes']);
    expect(translationRoute('de', 'en').map((pair) => pair.id)).toEqual(['deen']);
    expect(translationRoute('it', 'en').map((pair) => pair.id)).toEqual(['iten']);
  });

  it('pivots pairs without a direct model through English', () => {
    expect(translationRoute('es', 'it').map((pair) => pair.id)).toEqual(['esen', 'enit']);
    expect(translationRoute('fr', 'de').map((pair) => pair.id)).toEqual(['fren', 'ende']);
    expect(translationRoute('it', 'es').map((pair) => pair.id)).toEqual(['iten', 'enes']);
  });

  it('does not translate a language into itself', () => {
    expect(translationRoute('en', 'en')).toEqual([]);
  });
});
